import type { Registry, SourceEntry } from "@khazana/core";

export const DISABLE_AFTER = 5;
export const STALE_DAYS = 30;

export interface PruneAction {
  id: string;
  action: "disable" | "flag-stale";
  reason: string;
}

const DAY_MS = 86_400_000;

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
    if (s.failureCount >= disableAfter) {
      actions.push({ id: s.id, action: "disable", reason: `failures>=${disableAfter}` });
      return { ...s, enabled: false };
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
