import {
  RANK_WEIGHTS,
  GAUSSIAN_DEFAULTS,
  scoreContributions,
  hasFullText,
  readTimeMinutes,
  readTimeScore,
  MIN_READ_MINUTES,
  FEATURED_SIZE,
  type FeedItem,
} from "@khazana/core";
import type { TasteProfile } from "./taste.js";

// ── Re-exports ────────────────────────────────────────────────────────────────
// The scoring math now lives in @khazana/core so the build pipeline and the
// browser client share ONE implementation. We re-export the constants and pure
// helpers under their original curate names so downstream imports (and the
// existing rank.test.ts) keep working unchanged.
export { hasFullText, readTimeMinutes, readTimeScore, MIN_READ_MINUTES, FEATURED_SIZE };

export const W_RECENCY = RANK_WEIGHTS.recency;
export const W_TRUST = RANK_WEIGHTS.trust;
export const W_METRICS = RANK_WEIGHTS.metrics;
export const W_CLUSTER = RANK_WEIGHTS.cluster;
export const W_AFFINITY = RANK_WEIGHTS.affinity;
export const W_FULLTEXT = RANK_WEIGHTS.fullText;
export const W_MEDIA = RANK_WEIGHTS.media;
export const W_READTIME = RANK_WEIGHTS.readTime;
export const READ_TIME_PEAK_MIN = GAUSSIAN_DEFAULTS.peakMin;

export interface RankOpts {
  now: string;
  halfLifeDays?: number;
}

export const DEFAULT_RANK_OPTS = { halfLifeDays: 7 } as const;

// ── Diversity floor constants ─────────────────────────────────────────────────
/**
 * Size of the "visible scrollable list" we guarantee diversity within.
 * Covers the first list page (~40 items) after the bento. Total positions
 * considered = FEATURED_SIZE + DIVERSITY_WINDOW, but promotions land only in
 * [FEATURED_SIZE, FEATURED_SIZE + DIVERSITY_WINDOW).
 */
export const DIVERSITY_WINDOW = 50;
/** Minimum number of `video` items guaranteed within the list window. */
export const DIVERSITY_MIN_VIDEO = 2;
/** Minimum number of `audio` items guaranteed within the list window. */
export const DIVERSITY_MIN_AUDIO = 2;

export function rankItems(items: FeedItem[], profile: TasteProfile, opts: RankOpts): FeedItem[] {
  const halfLifeDays = opts.halfLifeDays ?? DEFAULT_RANK_OPTS.halfLifeDays;

  const clusterSizes = new Map<string, number>();
  for (const it of items) {
    if (it.clusterId) clusterSizes.set(it.clusterId, (clusterSizes.get(it.clusterId) ?? 0) + 1);
  }

  const scored = items.map((it) => {
    const clusterSize = it.clusterId ? clusterSizes.get(it.clusterId) ?? 1 : 1;
    const { total } = scoreContributions(it, {
      weights: RANK_WEIGHTS,
      gaussian: GAUSSIAN_DEFAULTS,
      clusterSize,
      now: opts.now,
      profile,
      halfLifeDays,
    });
    return { ...it, tasteScore: total };
  });

  return scored.sort((a, b) => b.tasteScore - a.tasteScore);
}

/**
 * Post-sort diversity pass that guarantees a minimum presence of video and
 * audio items within the scrollable list region of the feed.
 *
 * The feed has two regions:
 *   [0, FEATURED_SIZE)           — bento/featured; requires ≥7-min read gate
 *                                  (enforced in apps/site). Never touched here.
 *   [FEATURED_SIZE, listEnd)     — scrollable list; this is where we promote.
 *
 * "listEnd" = FEATURED_SIZE + DIVERSITY_WINDOW (capped to array length).
 * Promotions are injected at the TAIL of the list window, never near the head,
 * so the score ordering of genuinely high-ranking items is undisturbed.
 *
 * Algorithm: for each under-represented kind, collect the highest-scoring
 * buried candidates (outside listEnd), remove them all at once (highest index
 * first to avoid shifting), then re-insert in score order at the tail of the
 * list window.
 */
export function applyDiversityFloor(items: FeedItem[]): FeedItem[] {
  if (items.length === 0) return items;

  const result = [...items];
  // The list region starts after the featured bento slots.
  const listStart = Math.min(FEATURED_SIZE, result.length);
  const listEnd = Math.min(listStart + DIVERSITY_WINDOW, result.length);

  // Count current representation in the list region for each media kind.
  const needs: Array<{ kind: "video" | "audio"; min: number }> = [
    { kind: "video", min: DIVERSITY_MIN_VIDEO },
    { kind: "audio", min: DIVERSITY_MIN_AUDIO },
  ];

  for (const { kind, min } of needs) {
    const countInList = result.slice(listStart, listEnd).filter((it) => it.kind === kind).length;
    const deficit = min - countInList;
    if (deficit <= 0) continue;

    // Collect buried candidates (outside the list window), highest score first.
    const candidates = result
      .slice(listEnd)
      .filter((it) => it.kind === kind)
      .sort((a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0));

    const toPromote = candidates.slice(0, deficit);
    if (toPromote.length === 0) continue;

    // Remove all candidates from their buried positions first (highest index
    // first so earlier removals don't shift later indices).
    const buriedIndices = toPromote
      .map((c) => result.findIndex((it, idx) => idx >= listEnd && it === c))
      .filter((idx) => idx !== -1)
      .sort((a, b) => b - a); // descending: remove from end first

    for (const idx of buriedIndices) {
      result.splice(idx, 1);
    }

    // Re-insert in score order at the tail of the list window.
    // After the removals, listEnd is effectively reduced by the number of
    // removals — insert to fill those tail slots back up to the original listEnd.
    for (let i = 0; i < toPromote.length; i++) {
      const insertAt = listEnd - toPromote.length + i;
      result.splice(insertAt, 0, toPromote[i]!);
    }
  }

  return result;
}
