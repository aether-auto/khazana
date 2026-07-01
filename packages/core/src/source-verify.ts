/**
 * Source self-healing: the pure strike + status reducer.
 *
 * The ingestion layer emits one classified `SourceFetchResult` per source
 * (`@khazana/ingest` `fetch-result.ts`). This module turns a stream of those
 * outcomes into persisted registry state: a real strike counter, a transient-
 * vs-permanent distinction, and auto-disable — WITHOUT ever touching the
 * network. All IO (moved-feed rediscovery, the registry write) lives in the
 * consuming pipeline; this file is a deterministic reducer so it is fully
 * unit-testable. The clock is injected via `now`.
 *
 * Policy:
 *   success   → reset strikes, set lastOkAt, clear lastError,
 *               status = itemCount>0 ? "active" : "dormant"
 *   transient → record lastError, DO NOT strike, status = "failing"
 *               (a 429/5xx/timeout must never march a live source toward death)
 *   permanent → strike +1, record lastError, status = "failing";
 *               at consecutiveFailures >= DISABLE_THRESHOLD → status "disabled",
 *               enabled = false (unless rediscovery repairs it first — the
 *               reducer only FLAGS `shouldAttemptRediscovery`; the IO wrapper
 *               does the probe and calls `applyRediscovery`).
 */

import type { Registry, SourceEntry, SourceLastError } from "./registry.js";

/** Permanent strikes required before a source is auto-disabled. */
export const DISABLE_THRESHOLD = 3;

/**
 * Structural input for the reducer — the shape of `@khazana/ingest`'s
 * `SourceFetchResult`. Defined here (not imported) so `@khazana/core` stays
 * free of an ingest dependency; ingest's concrete type satisfies it.
 */
export interface FetchOutcome {
  sourceId: string;
  ok: boolean;
  httpStatus?: number;
  /** "ok" | "dns" | "timeout" | "http-4xx" | "http-5xx" | "not-a-feed" | "network" */
  errorKind: string;
  itemCount: number;
  finalUrl?: string;
}

export interface ReconcileOpts {
  /** Injected clock (ISO string). */
  now: string;
  /** Override the permanent-strike disable threshold (default DISABLE_THRESHOLD). */
  disableThreshold?: number;
}

/** A permanent failure = a dead/moved feed: DNS, not-a-feed, or HTTP 404/410. */
export function isPermanentOutcome(r: FetchOutcome): boolean {
  if (r.ok) return false;
  if (r.errorKind === "dns" || r.errorKind === "not-a-feed") return true;
  if (r.errorKind === "http-4xx") return r.httpStatus === 404 || r.httpStatus === 410;
  return false;
}

/**
 * The reducer's per-source output: an updated entry plus an ephemeral
 * `shouldAttemptRediscovery` flag the IO wrapper reads (and strips before
 * persisting). The flag is set exactly when a permanent strike is about to
 * cross the disable threshold — the last chance to repair a moved feed.
 */
export interface AppliedEntry extends SourceEntry {
  /** Present+true only when the pipeline should probe for a moved feed before disabling. */
  shouldAttemptRediscovery?: boolean;
}

/**
 * Pure reducer: fold one fetch outcome into a source entry. Never mutates the
 * input. Returns the updated entry (with an optional rediscovery flag).
 */
export function applyFetchResult(
  entry: SourceEntry,
  result: FetchOutcome,
  opts: ReconcileOpts,
): AppliedEntry {
  const now = opts.now;
  const threshold = opts.disableThreshold ?? DISABLE_THRESHOLD;
  const prior = entry.consecutiveFailures ?? 0;

  // ── Success ──
  if (result.ok) {
    const { lastError: _drop, ...rest } = entry;
    return {
      ...rest,
      lastFetchedAt: now,
      lastOkAt: now,
      consecutiveFailures: 0,
      status: result.itemCount > 0 ? "active" : "dormant",
    };
  }

  const lastError: SourceLastError = {
    kind: isPermanentOutcome(result) ? "permanent" : "transient",
    ...(result.httpStatus !== undefined ? { code: result.httpStatus } : {}),
    at: now,
  };

  // ── Transient failure: record, but never strike or disable. ──
  if (!isPermanentOutcome(result)) {
    return {
      ...entry,
      lastFetchedAt: now,
      consecutiveFailures: prior,
      lastError,
      status: "failing",
    };
  }

  // ── Permanent failure: strike. ──
  const consecutiveFailures = prior + 1;
  const reachedThreshold = consecutiveFailures >= threshold;
  const next: AppliedEntry = {
    ...entry,
    lastFetchedAt: now,
    consecutiveFailures,
    lastError,
    status: reachedThreshold ? "disabled" : "failing",
    ...(reachedThreshold ? { enabled: false } : {}),
  };
  if (reachedThreshold) next.shouldAttemptRediscovery = true;
  return next;
}

/**
 * Apply a successful rediscovery: a moved feed was found at `resolvedUrl`.
 * Resets strikes, clears the error, re-enables, and records the repaired URL.
 * Pure; the network probe happens in the IO wrapper before this is called.
 */
export function applyRediscovery(entry: SourceEntry, resolvedUrl: string, opts: ReconcileOpts): SourceEntry {
  const { lastError: _drop, ...rest } = entry;
  return {
    ...rest,
    enabled: true,
    consecutiveFailures: 0,
    status: "active",
    resolvedUrl,
    lastOkAt: opts.now,
  };
}

/** Human-readable record of what reconcile changed, for logging. */
export interface ReconcileAction {
  id: string;
  action: "disable" | "recover" | "strike" | "flag-transient";
  reason: string;
}

export interface ReconcileResult {
  registry: Registry;
  actions: ReconcileAction[];
  /** Entries the pipeline should attempt to rediscover (moved-feed repair) before disabling. */
  rediscover: SourceEntry[];
}

/**
 * Batch reducer: fold a run's fetch outcomes into the registry. Pure — never
 * mutates the input. Sources with no matching result are returned untouched.
 * Emits `actions` (for logging) and `rediscover` (entries whose disable the
 * IO layer may still avert by finding a moved feed).
 */
export function reconcileRegistry(
  registry: Registry,
  results: readonly FetchOutcome[],
  opts: ReconcileOpts,
): ReconcileResult {
  const byId = new Map(results.map((r) => [r.sourceId, r]));
  const actions: ReconcileAction[] = [];
  const rediscover: SourceEntry[] = [];

  const sources = registry.sources.map((entry) => {
    const result = byId.get(entry.id);
    if (!result) return entry;

    const applied = applyFetchResult(entry, result, opts);
    const { shouldAttemptRediscovery, ...persisted } = applied;

    if (shouldAttemptRediscovery) rediscover.push(persisted);

    if (result.ok) {
      if ((entry.consecutiveFailures ?? 0) > 0 || entry.status === "failing" || entry.status === "disabled") {
        actions.push({ id: entry.id, action: "recover", reason: "successful fetch reset strikes" });
      }
    } else if (persisted.status === "disabled") {
      actions.push({ id: entry.id, action: "disable", reason: `permanent failures>=${opts.disableThreshold ?? DISABLE_THRESHOLD}` });
    } else if (persisted.lastError?.kind === "permanent") {
      actions.push({ id: entry.id, action: "strike", reason: `permanent failure (${persisted.consecutiveFailures})` });
    } else {
      actions.push({ id: entry.id, action: "flag-transient", reason: "transient failure, no strike" });
    }

    return persisted;
  });

  return { registry: { ...registry, sources }, actions, rediscover };
}
