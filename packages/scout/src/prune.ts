import { DISABLE_THRESHOLD, type Registry, type SourceEntry } from "@khazana/core";

/**
 * Disable threshold for the *real* strike counter (`consecutiveFailures`),
 * re-exported from the shared core reducer so there is ONE source of truth for
 * "how many permanent failures kill a feed". (The legacy `failureCount` last-run
 * flag is no longer used for pruning.)
 */
export const DISABLE_AFTER = DISABLE_THRESHOLD;
export const STALE_DAYS = 30;

export interface PruneAction {
  id: string;
  action: "disable" | "flag-stale";
  reason: string;
}

const DAY_MS = 86_400_000;

/**
 * Batch prune pass over the registry. Disable logic now keys off the real
 * strike counter (`consecutiveFailures`, maintained by the ingest reconcile
 * step) — NOT the old `failureCount` last-run flag, which never accumulated.
 * The stale check is report-only (flags, does not disable).
 */
export function pruneRegistry(
  registry: Registry,
  opts: { now: string; disableAfter?: number; staleDays?: number },
): { registry: Registry; actions: PruneAction[] } {
  const disableAfter = opts.disableAfter ?? DISABLE_AFTER;
  const staleDays = opts.staleDays ?? STALE_DAYS;
  const nowMs = Date.parse(opts.now);
  const actions: PruneAction[] = [];

  const sources: SourceEntry[] = registry.sources.map((s) => {
    if (!s.enabled) return s;
    if ((s.consecutiveFailures ?? 0) >= disableAfter) {
      actions.push({ id: s.id, action: "disable", reason: `failures>=${disableAfter}` });
      return { ...s, enabled: false, status: "disabled" };
    }
    if (s.lastFetchedAt) {
      const ageDays = (nowMs - Date.parse(s.lastFetchedAt)) / DAY_MS;
      if (ageDays > staleDays) {
        actions.push({ id: s.id, action: "flag-stale", reason: `stale>${staleDays}d` });
      }
    }
    return s;
  });

  return { registry: { ...registry, sources }, actions };
}
