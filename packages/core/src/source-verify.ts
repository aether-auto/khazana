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
 *               enabled = false, disabledAt = now (unless rediscovery repairs
 *               it first — the reducer only FLAGS `shouldAttemptRediscovery`;
 *               the IO wrapper does the probe and calls `applyRediscovery`).
 *
 * Disable is RECOVERABLE, not a one-way door: `isReprobeEligible` is a pure
 * predicate the ingest layer consults to fold bounded, once-per-window
 * re-probes of disabled sources back into the fetch set (see `runIngest`).
 * When a probe result comes back for an already-`disabled` entry, the reducer
 * takes a distinct branch: success fully re-enables it (a systemic outage —
 * e.g. a whole source type's discovery endpoint 404ing — has ended); any
 * failure (transient or permanent) just restarts the window (`disabledAt =
 * now`) so a still-dead source gets at most one wasted fetch per window, not
 * one per run, and is never left in an un-reprobable limbo.
 */

import type { Registry, SourceEntry, SourceHealthEntry, SourceHealthFile, SourceLastError } from "./registry.js";

/** Permanent strikes required before a source is auto-disabled. */
export const DISABLE_THRESHOLD = 3;

/**
 * How long (ms) a source stays disabled before it's eligible for a single
 * bounded re-probe. 7 days: long enough that an ordinary dead feed's 3-strike
 * disable is almost certainly final (not worth re-fetching every run), short
 * enough that a SYSTEMIC outage — e.g. a whole source type's discovery
 * endpoint 404ing for every entry at once — self-heals within about a week of
 * the upstream fix landing, with no manual registry edit.
 */
export const REPROBE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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
 * True when `entry` should be treated as "disabled by our own auto-disable
 * path" for reprobe purposes — either explicitly (`status === "disabled"`,
 * the normal case) or implicitly: `enabled: false` with NO `status` field at
 * all. Absent `status` is indistinguishable from our own pre-`status`-field
 * auto-disable (e.g. the ~208 youtube sources killed by the `feeds/videos.xml`
 * discovery outage before this field existed — see module header) and from a
 * source a human disabled by hand without ever recording a status. We cannot
 * tell those two apart from the data alone, so — consistent with this
 * module's overall self-healing bias (see the `disabledAt`-missing handling
 * below) — we default to eligible rather than leaving the source stuck
 * disabled forever. A human disable IS still distinguishable (and excluded)
 * when it leaves an explicit non-"disabled" status behind, e.g. `enabled:
 * false, status: "active"` on a source that was previously live.
 */
function isDisabledStatus(entry: Pick<SourceEntry, "status" | "enabled">): boolean {
  if (entry.status === "disabled") return true;
  return entry.status === undefined && entry.enabled === false;
}

/**
 * Pure predicate: is this DISABLED source due for a bounded re-probe?
 *
 * True for entries our OWN auto-disable path killed (`status === "disabled"`)
 * AND for legacy entries disabled before the `status` field existed (`enabled:
 * false`, `status` absent — see `isDisabledStatus`). A source someone turned
 * off by hand that still carries an explicit, different status (e.g. `status:
 * "active"` from when it was last live) is left alone; re-probing it would
 * override a deliberate decision.
 *
 * `disabledAt` missing is treated as already past the window rather than
 * "just disabled" — this matters for entries disabled before this field
 * existed (e.g. the ~208 youtube sources killed in one run by the
 * `feeds/videos.xml` discovery outage): they must become eligible on the very
 * next run once the endpoint recovers, not wait `REPROBE_AFTER_MS` from a
 * timestamp that was never recorded.
 *
 * `now` is the only clock input (deterministic, no `Date.now()` inside).
 */
export function isReprobeEligible(
  entry: SourceEntry,
  now: string,
  reprobeAfterMs: number = REPROBE_AFTER_MS,
): boolean {
  if (entry.enabled) return false;
  if (!isDisabledStatus(entry)) return false;
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) return false; // unparseable clock → fail safe, don't reprobe
  if (!entry.disabledAt) return true;
  const disabledMs = Date.parse(entry.disabledAt);
  if (Number.isNaN(disabledMs)) return true;
  return nowMs - disabledMs >= reprobeAfterMs;
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

  // ── Re-probe of an already-disabled source ──
  // `runIngest` only puts a `status: "disabled"` entry back in the fetch set
  // when `isReprobeEligible` says its bounded window has elapsed, so any
  // result reaching here for one IS that single probe. Handled distinctly
  // from the live-source policy below: success fully re-enables it (the
  // systemic outage is over); ANY failure — transient or permanent — simply
  // restarts the window (`disabledAt: now`) rather than re-striking toward an
  // already-crossed threshold, or (worse) flipping `status` away from
  // "disabled" and stranding the source where `isReprobeEligible` can never
  // find it again.
  if (isDisabledStatus(entry)) {
    if (result.ok) {
      const { lastError: _drop, disabledAt: _drop2, ...rest } = entry;
      return {
        ...rest,
        enabled: true,
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
    return {
      ...entry,
      enabled: false,
      status: "disabled",
      lastFetchedAt: now,
      lastError,
      disabledAt: now,
    };
  }

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
    ...(reachedThreshold ? { enabled: false, disabledAt: now } : {}),
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
  const { lastError: _drop, disabledAt: _drop2, ...rest } = entry;
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
        actions.push({
          id: entry.id,
          action: "recover",
          reason: entry.status === "disabled" ? "re-probe succeeded" : "successful fetch reset strikes",
        });
      }
    } else if (isDisabledStatus(entry)) {
      // Was already disabled before this run's re-probe — its failure just
      // restarted the window, it did not newly cross the strike threshold.
      actions.push({ id: entry.id, action: "disable", reason: "re-probe failed; window reset" });
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

/**
 * The genuinely-optional `SourceEntry` health fields — present only once a
 * source has actually been reconciled at least once. Handled generically
 * below. `enabled` and `failureCount` are NOT in this list: both carry
 * always-present schema defaults (`true` / `0`), so "is it set" can't signal
 * "has this source ever had a health event" the way it can for these — they
 * get their own deviation-from-default check instead (see `extractSourceHealth`).
 */
const OPTIONAL_HEALTH_FIELDS = [
  "status",
  "consecutiveFailures",
  "lastOkAt",
  "lastError",
  "resolvedUrl",
  "disabledAt",
  "lastFetchedAt",
] as const satisfies readonly (keyof SourceEntry)[];

/**
 * Extract the committed-persistence health subset from a (typically just-
 * reconciled) registry. Only sources that carry at least one recorded health
 * signal are included — a pristine, never-touched seed entry needn't appear,
 * which keeps `data/source-health.json` small and its diffs meaningful (only
 * the sources that actually changed state show up). `enabled`/`failureCount`
 * are included only when they deviate from their pristine defaults (`true` /
 * `0`) — otherwise every one of hundreds of untouched seed sources would
 * appear with `enabled: true, failureCount: 0` and swamp the file.
 */
export function extractSourceHealth(registry: Registry): SourceHealthFile {
  const sources: SourceHealthEntry[] = [];
  for (const entry of registry.sources) {
    let health: SourceHealthEntry | undefined;
    for (const field of OPTIONAL_HEALTH_FIELDS) {
      const value = entry[field];
      if (value === undefined) continue;
      health ??= { id: entry.id };
      (health as Record<string, unknown>)[field] = value;
    }
    if (entry.enabled === false) {
      health ??= { id: entry.id };
      health.enabled = false;
    }
    if ((entry.failureCount ?? 0) > 0) {
      health ??= { id: entry.id };
      health.failureCount = entry.failureCount;
    }
    if (health) sources.push(health);
  }
  return { version: 1, sources };
}

/**
 * Layer committed `health` onto a freshly-loaded `base` registry (the seed, or
 * a local `sources.json`). For each id present in `health`, its recorded
 * fields win over whatever the base loaded (health is strictly more recent —
 * it is written by the last reconciled run); entries with no recorded health
 * are returned exactly as the base loaded them. Pure — never mutates either
 * input, matching this module's other reducers.
 */
export function mergeSourceHealth(base: Registry, health: SourceHealthFile): Registry {
  if (health.sources.length === 0) return base;
  const byId = new Map(health.sources.map((h) => [h.id, h]));
  return {
    ...base,
    sources: base.sources.map((entry) => {
      const h = byId.get(entry.id);
      if (!h) return entry;
      const { id: _drop, ...fields } = h;
      return { ...entry, ...fields };
    }),
  };
}
