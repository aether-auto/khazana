import type { FeedItem } from "./feed-item.js";

/**
 * Shared ranking MATH. This module is the single source of truth for the
 * per-item scoring used by BOTH the build pipeline (`@khazana/curate`) and the
 * browser client — one implementation guarantees parity by construction. It is
 * pure: no I/O, no clock, no globals. Everything time-dependent is passed in via
 * `now`.
 */

export interface RankWeights {
  recency: number;
  trust: number;
  metrics: number;
  cluster: number;
  affinity: number;
  fullText: number;
  media: number;
  readTime: number;
}

/**
 * Default ranking weights. Tuned so read time is the dominant ordering signal
 * (heavy `readTime`) and a ready taste profile can dominate everything (heavy
 * `affinity`). `media` < `fullText`: a transcript-less video gets partial
 * content credit but never leapfrogs a genuine full-text article.
 */
export const RANK_WEIGHTS: Readonly<RankWeights> = Object.freeze({
  recency: 1,
  trust: 1,
  metrics: 1,
  cluster: 0.5,
  affinity: 6,
  fullText: 1.5,
  media: 0.9,
  readTime: 3,
});

export interface GaussianParams {
  /** Peak of the read-time Gaussian (minutes) — the most-rewarded length. */
  peakMin: number;
  /** Standard deviation of the read-time Gaussian (minutes). */
  sigmaMin: number;
}

/**
 * Default read-time curve: peaked at 15 min, σ=10. Reproduces the historical
 * curve exactly (2→0.02, 5→0.61, 15→1.0, 25→0.61).
 */
export const GAUSSIAN_DEFAULTS: Readonly<GaussianParams> = Object.freeze({
  peakMin: 15,
  sigmaMin: 10,
});

/**
 * Hard reject threshold: items whose rendered read time is below this are
 * dropped before ranking (bare links, short summaries, transcript-less media).
 */
export const MIN_READ_MINUTES = 5;

/**
 * Number of items that form the bento/featured region at the head of the feed.
 * The diversity floor never promotes items into this region.
 */
export const FEATURED_SIZE = 10;

/** Words-per-minute used for FeedItem.body read-time estimation. Matches apps/site. */
export const FEED_WPM = 225;

/** Min plain-text length of `body` for an item to count as having full text. */
export const MIN_FULLTEXT_CHARS = 800;

const MS_PER_DAY = 86_400_000;

/** Default recency/affinity decay half-life (days). */
export const DEFAULT_HALF_LIFE_DAYS = 7;

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
 * Returns 0 for items with no body.
 */
export function readTimeMinutes(item: FeedItem): number {
  if (!item.body) return 0;
  const text = item.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") return 0;
  const words = text.split(/\s+/).length;
  return Math.round(words / FEED_WPM);
}

/**
 * Gaussian read-time quality score in [0, 1] peaked at `peakMin`.
 * Formula: exp(-((minutes - peakMin)^2) / (2 * sigmaMin^2)).
 * Defaults (peak 15, σ 10) reproduce the historical curve exactly.
 */
export function readTimeScore(
  minutes: number,
  peakMin: number = GAUSSIAN_DEFAULTS.peakMin,
  sigmaMin: number = GAUSSIAN_DEFAULTS.sigmaMin,
): number {
  const diff = minutes - peakMin;
  return Math.exp(-(diff * diff) / (2 * sigmaMin * sigmaMin));
}

/** Whether an item carries real full text rather than a summary / bare link. */
export function hasFullText(item: FeedItem): boolean {
  return bodyTextLength(item.body) > MIN_FULLTEXT_CHARS;
}

/** Whether an item is a media-only video or audio item (no transcript/full text). */
export function isTranscriptlessMedia(item: FeedItem): boolean {
  if (hasFullText(item)) return false;
  return item.kind === "video" || item.kind === "audio";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Minimal taste profile shape the ranker needs. Kept here (not imported from
 * curate) so core has no upward dependency. `taste-model` produces this exact
 * shape, closing the parity loop.
 */
export interface RankProfile {
  ready: boolean;
  topics: Record<string, number>;
  entities: Record<string, number>;
}

export interface ScoringContext {
  weights: RankWeights;
  gaussian: GaussianParams;
  /** Size of the item's cluster (1 if unclustered). */
  clusterSize: number;
  /** ISO timestamp used as "now" for recency decay. */
  now: string;
  profile: RankProfile;
  /** Recency-decay half-life in days (defaults to 7). */
  halfLifeDays?: number;
}

export interface ScoreBreakdown {
  total: number;
  /**
   * The ADDITIVE amount each term contributes (weight × subscore), so a UI can
   * stack them. `content` folds the mutually-exclusive full-text / media credit.
   */
  contributions: {
    recency: number;
    trust: number;
    metrics: number;
    cluster: number;
    content: number;
    readTime: number;
    affinity: number;
  };
}

/**
 * Compute each additive score contribution for one item. The sum (`total`) is
 * the item's tasteScore. This is the exact per-item math the build pipeline ran
 * inline before extraction — extracted verbatim so the browser can reproduce it.
 */
export function scoreContributions(item: FeedItem, ctx: ScoringContext): ScoreBreakdown {
  const { weights: w, gaussian, clusterSize, profile } = ctx;
  const halfLifeDays = ctx.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const nowMs = Date.parse(ctx.now);

  const ageDays = (nowMs - Date.parse(item.publishedAt)) / MS_PER_DAY;
  const recencySub = Math.exp((-Math.LN2 * Math.max(ageDays, 0)) / halfLifeDays);
  const trustSub = item.trustScore ?? 0.5;
  const rawMetric = (item.metrics?.score ?? 0) + (item.metrics?.comments ?? 0);
  const metricsSub = Math.log10(1 + Math.max(rawMetric, 0)) / 5; // ~[0,1] for typical volumes
  const clusterSub = Math.log10(1 + (clusterSize - 1));

  // Full-text or partial media credit — mutually exclusive, no double-counting.
  const content = hasFullText(item) ? w.fullText : isTranscriptlessMedia(item) ? w.media : 0;

  const rtSub = readTimeScore(readTimeMinutes(item), gaussian.peakMin, gaussian.sigmaMin);

  let affinity = 0;
  if (profile.ready) {
    const topicAffinity = mean(item.topics.map((t) => profile.topics[t] ?? 0));
    const entityAffinity = mean(item.entities.map((e) => profile.entities[e] ?? 0));
    affinity = w.affinity * (topicAffinity + entityAffinity);
  }

  const contributions = {
    recency: w.recency * recencySub,
    trust: w.trust * trustSub,
    metrics: w.metrics * metricsSub,
    cluster: w.cluster * clusterSub,
    content,
    readTime: w.readTime * rtSub,
    affinity,
  };

  const total =
    contributions.recency +
    contributions.trust +
    contributions.metrics +
    contributions.cluster +
    contributions.content +
    contributions.readTime +
    contributions.affinity;

  return { total, contributions };
}
