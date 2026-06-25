import type { FeedItem } from "@khazana/core";
import type { TasteProfile } from "./taste.js";

export interface RankOpts {
  now: string;
  halfLifeDays?: number;
}

export const DEFAULT_RANK_OPTS = { halfLifeDays: 7 } as const;

export const W_RECENCY = 1;
export const W_TRUST = 1;
export const W_METRICS = 1;
export const W_CLUSTER = 0.5;
export const W_AFFINITY = 6;
/**
 * Bonus for items that carry real full text (vs. summary-/link-only). The
 * founder wants to read articles in-app, not be linked out; this clearly ranks
 * full-text items above otherwise-equal summary-only ones.
 */
export const W_FULLTEXT = 1.5;

/** Min plain-text length of `body` for an item to count as having full text. */
const MIN_FULLTEXT_CHARS = 800;

const MS_PER_DAY = 86_400_000;

/** Approx plain-text length of an item's body (strips HTML tags cheaply). */
function bodyTextLength(body: string | undefined): number {
  if (!body) return 0;
  return body
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** Whether an item carries real full text rather than a summary / bare link. */
export function hasFullText(item: FeedItem): boolean {
  return bodyTextLength(item.body) > MIN_FULLTEXT_CHARS;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function rankItems(items: FeedItem[], profile: TasteProfile, opts: RankOpts): FeedItem[] {
  const halfLifeDays = opts.halfLifeDays ?? DEFAULT_RANK_OPTS.halfLifeDays;
  const nowMs = Date.parse(opts.now);

  const clusterSizes = new Map<string, number>();
  for (const it of items) {
    if (it.clusterId) clusterSizes.set(it.clusterId, (clusterSizes.get(it.clusterId) ?? 0) + 1);
  }

  const scored = items.map((it) => {
    const ageDays = (nowMs - Date.parse(it.publishedAt)) / MS_PER_DAY;
    const recency = Math.exp((-Math.LN2 * Math.max(ageDays, 0)) / halfLifeDays);
    const trust = it.trustScore ?? 0.5;
    const rawMetric = (it.metrics?.score ?? 0) + (it.metrics?.comments ?? 0);
    const metrics = Math.log10(1 + Math.max(rawMetric, 0)) / 5; // ~[0,1] for typical volumes
    const clusterSize = it.clusterId ? clusterSizes.get(it.clusterId) ?? 1 : 1;
    const clusterBoost = Math.log10(1 + (clusterSize - 1));

    const fullText = hasFullText(it) ? 1 : 0;

    let score =
      W_RECENCY * recency +
      W_TRUST * trust +
      W_METRICS * metrics +
      W_CLUSTER * clusterBoost +
      W_FULLTEXT * fullText;

    if (profile.ready) {
      const topicAffinity = mean(it.topics.map((t) => profile.topics[t] ?? 0));
      const entityAffinity = mean(it.entities.map((e) => profile.entities[e] ?? 0));
      score += W_AFFINITY * (topicAffinity + entityAffinity);
    }

    return { ...it, tasteScore: score };
  });

  return scored.sort((a, b) => b.tasteScore - a.tasteScore);
}
