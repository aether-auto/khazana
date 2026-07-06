// Pure predicate behind the /reads "new since your last visit" marker. Only
// the client (reads/index.astro's page script) ever touches localStorage or
// the clock; this module never does either, so it's trivially unit-testable
// and the storage key lives in exactly one place.
//
// Key follows the site's existing `khz.<surface>.<thing>` convention (see
// scripts/feed-register.ts's `khz.feed.view`, feed-personalize.ts's
// `khz.feed.ranking`) rather than the older `khz-*` dash style still used by
// the site-gate — dot-style is what every OTHER per-surface client-state key
// uses, so this stays consistent with the newer, more common convention.
export const READS_LAST_VISIT_KEY = "khz.reads.lastVisit";

/**
 * Does a read count as "new" against a stored last-visit timestamp?
 * - `lastVisit === null` (no baseline yet — a visitor's very first visit, or
 *   storage unavailable/cleared) → nothing is marked new. The site's other
 *   localStorage-gated affordances stay quiet with no baseline too; a fresh
 *   visitor flagging the ENTIRE collection as "new" would be noise, not signal.
 * - Otherwise: new iff `publishedAt` is STRICTLY after `lastVisit`.
 * - Malformed timestamps on either side fail closed (`false`) — never throw,
 *   never falsely flag everything.
 */
export function isNewSinceVisit(publishedAt: string, lastVisit: string | null): boolean {
  if (!lastVisit) return false;
  const published = Date.parse(publishedAt);
  const visited = Date.parse(lastVisit);
  if (Number.isNaN(published) || Number.isNaN(visited)) return false;
  return published > visited;
}
