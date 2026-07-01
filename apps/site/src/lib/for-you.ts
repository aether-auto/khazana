// The Feed "for you" re-ranker — PURE + deterministic: no DOM, no I/O, no clock.
//
// Personalization is affinity-only. In `@khazana/core`'s `scoreContributions`,
// the ONLY term that depends on the taste profile is `affinity`; every other
// term (recency, trust, metrics, cluster, content, readTime) is profile-
// independent. So for a fixed scoring context (same weights, gaussian,
// clusterSize, now, halfLifeDays):
//
//   forYouTotal(item, profile) === baseScore(item) + affinityDelta(item, profile)
//
// where `baseScore` is the core total computed with a NOT-ready profile (the
// honest quality order the SSR ships), and `affinityDelta` is the exact core
// affinity formula. This is parity BY CONSTRUCTION — the same math the build
// runs — so the client can re-rank the feed shipping only `{id, base, topics,
// entities}` per item (no article bodies, tiny payload). The parity test in
// `for-you.test.ts` locks `base + affinityDelta === scoreContributions(...).total`.
import { RANK_WEIGHTS, type RankProfile } from "@khazana/core";

/**
 * The minimal per-item shape the client ships to re-rank the feed. `base` is the
 * profile-independent core total (recency+trust+metrics+cluster+content+readTime),
 * precomputed at build time; `topics`/`entities` feed the affinity delta.
 */
export interface ForYouItem {
  id: string;
  base: number;
  topics: string[];
  entities: string[];
}

/** Mean of a number array; empty → 0. Matches core's `mean`. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * The affinity term from core `scoreContributions`, isolated: the ONLY part of
 * the score that depends on the profile. Returns 0 when the profile isn't ready.
 *   affinity = w.affinity * (mean(topics→profile.topics) + mean(entities→profile.entities))
 * Unknown topics/entities contribute 0 to their mean (matching core's `?? 0`).
 */
export function affinityDelta(item: ForYouItem, profile: RankProfile): number {
  if (!profile.ready) return 0;
  const topicAffinity = mean(item.topics.map((t) => profile.topics[t] ?? 0));
  const entityAffinity = mean(item.entities.map((e) => profile.entities[e] ?? 0));
  return RANK_WEIGHTS.affinity * (topicAffinity + entityAffinity);
}

/** The full "for you" score: the profile-independent base plus the affinity delta. */
export function forYouScore(item: ForYouItem, profile: RankProfile): number {
  return item.base + affinityDelta(item, profile);
}

/**
 * Ids sorted by `forYouScore` desc, with an `id.localeCompare` tiebreak for a
 * total, deterministic order (matches rerank.ts). When the profile isn't ready
 * the affinity delta is 0 for every item, so this is a pure base-desc order —
 * but the island still leaves the SSR DOM untouched in that case (it never calls
 * this), so the honest quality fallback is a strict no-op.
 */
export function forYouOrder(items: ForYouItem[], profile: RankProfile): string[] {
  return [...items]
    .map((it) => ({ id: it.id, score: forYouScore(it, profile) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((it) => it.id);
}
