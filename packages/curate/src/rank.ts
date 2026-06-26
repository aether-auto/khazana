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
/**
 * Partial content credit for video/audio items that have no transcript. A
 * YouTube video or podcast episode is substantive even without extracted text,
 * so they should not take the same flat zero as a bare link. Tuned so that a
 * fresh, trusted video item lands inside the visible top ~50 without leapfrogging
 * genuinely high-value full-text articles (W_MEDIA < W_FULLTEXT).
 */
export const W_MEDIA = 0.9;

/**
 * Heavy weight for the read-time quality term. Tuned so that read time is the
 * dominant ordering signal: a 15-min item clearly beats an otherwise-equal
 * 3-min or 45-min item even at max trust/recency. Total read-time contribution
 * ranges 0–W_READTIME; other base terms each contribute ~0–1.5.
 */
export const W_READTIME = 3;

/**
 * Peak of the read-time Gaussian curve (minutes). The curve rewards items
 * closest to this target length the most and falls off symmetrically on both
 * sides. Named constant so tests and downstream code reference the same value.
 */
export const READ_TIME_PEAK_MIN = 15;

/**
 * Hard reject: items whose rendered read time is below this threshold are
 * dropped from curated output entirely, BEFORE ranking. This removes bare-link
 * items (0 min), short summaries, and transcript-less videos (0 min) in one
 * single filter — no separate video flag needed.
 */
export const MIN_READ_MINUTES = 5;

/** Words-per-minute used for FeedItem.body read-time estimation. Matches apps/site's FEED_WPM. */
const FEED_WPM = 225;

/**
 * Standard deviation of the Gaussian read-time curve (minutes). σ=10 gives a
 * natural hump: items 10 min away from the 15-min peak score ≈0.61 of max,
 * while items 30+ min away approach 0. This rewards the 8–22 min band heavily.
 */
const READ_TIME_SIGMA = 10;

/** Min plain-text length of `body` for an item to count as having full text. */
const MIN_FULLTEXT_CHARS = 800;

// ── Diversity floor constants ─────────────────────────────────────────────────
/**
 * Number of items that form the bento/featured region at the head of the feed.
 * The diversity floor NEVER promotes items into this region — featured slots
 * require a ≥7-min read gate (enforced in apps/site) that transcript-less
 * media items cannot satisfy. Promotions are injected AFTER this offset.
 */
export const FEATURED_SIZE = 10;
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

const MS_PER_DAY = 86_400_000;

/** Approx plain-text length of an item's body (strips HTML tags cheaply). */
function bodyTextLength(body: string | undefined): number {
  if (!body) return 0;
  return body
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/**
 * Estimate rendered read time (whole minutes, can be 0) from a FeedItem's body.
 * Strips HTML, counts whitespace-delimited words, divides by FEED_WPM (225).
 * Returns 0 for items with no body — this is intentional: 0-min items are
 * caught by the MIN_READ_MINUTES filter before they reach the ranker.
 */
export function readTimeMinutes(item: FeedItem): number {
  if (!item.body) return 0;
  const text = item.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") return 0;
  const words = text.split(/\s+/).length;
  return Math.round(words / FEED_WPM);
}

/**
 * Gaussian read-time quality score in [0, 1] peaked at READ_TIME_PEAK_MIN (15).
 * Formula: exp(-((minutes - PEAK)^2) / (2 * σ^2))
 *
 * Shape with σ=10:
 *   2 min → 0.02   5 min → 0.61   8 min → 0.82
 *  15 min → 1.00  25 min → 0.61  45 min → 0.01
 *
 * This rewards the 8–22 min band heavily and gently discounts both very short
 * reads (≤5 min) and very long ones (≥40 min).
 */
export function readTimeScore(minutes: number): number {
  const diff = minutes - READ_TIME_PEAK_MIN;
  return Math.exp(-(diff * diff) / (2 * READ_TIME_SIGMA * READ_TIME_SIGMA));
}

/** Whether an item carries real full text rather than a summary / bare link. */
export function hasFullText(item: FeedItem): boolean {
  return bodyTextLength(item.body) > MIN_FULLTEXT_CHARS;
}

/** Whether an item is a media-only video or audio item (no transcript/full text). */
function isTranscriptlessMedia(item: FeedItem): boolean {
  if (hasFullText(item)) return false;
  return item.kind === "video" || item.kind === "audio";
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

    // Full-text or partial media credit — mutually exclusive, no double-counting.
    const contentCredit = hasFullText(it) ? W_FULLTEXT : isTranscriptlessMedia(it) ? W_MEDIA : 0;

    // Read-time quality term: Gaussian peaked at READ_TIME_PEAK_MIN (15 min).
    // Items that survived the MIN_READ_MINUTES filter have ≥5 min read time,
    // so this term always contributes positively; 0-min items are filtered
    // upstream and never reach the ranker.
    const rtScore = readTimeScore(readTimeMinutes(it));

    let score =
      W_RECENCY * recency +
      W_TRUST * trust +
      W_METRICS * metrics +
      W_CLUSTER * clusterBoost +
      contentCredit +
      W_READTIME * rtScore;

    if (profile.ready) {
      const topicAffinity = mean(it.topics.map((t) => profile.topics[t] ?? 0));
      const entityAffinity = mean(it.entities.map((e) => profile.entities[e] ?? 0));
      score += W_AFFINITY * (topicAffinity + entityAffinity);
    }

    return { ...it, tasteScore: score };
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
