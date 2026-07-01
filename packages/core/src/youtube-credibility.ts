import { z } from "zod";

/**
 * Deterministic YouTube credibility scoring — the founder's core ask.
 *
 * Podcasts publish almost NO public engagement signal; YouTube publishes a rich,
 * measurable one on every video: subscriber scale (`channel_follower_count`),
 * reach (`view_count`), audience assent (`like_count`), and freshness/format
 * (`upload_date`, `duration`, `live_status`). This module turns those measurable
 * signals into a 0..1 credibility score with NAMED factors and a plain-English
 * rationale — mirroring Sources' `assessTrust` in spirit (honest signals, not a
 * black box).
 *
 * This is the DETERMINISTIC half. The tone/professionalism judgment on titles &
 * descriptions is a Sonnet cloud appraisal (see `youtubeCredibilityBrief`), which
 * this file deliberately does NOT perform — no LLM call anywhere here.
 */

// ---------------------------------------------------------------------------
// Input — the measurable signals a single `yt-dlp -J` yields per video.
// ---------------------------------------------------------------------------

/**
 * The subset of `YouTubeVideoMeta` credibility scoring reads. Kept as its own
 * zod schema (structural, not an ingest import) so `@khazana/core` stays free of
 * an ingest dependency; ingest's `YouTubeVideoMeta` satisfies it.
 */
export const YouTubeCredibilitySignalsSchema = z.object({
  /** Subscribers — `channel_follower_count`. The scale signal. */
  subscriberCount: z.number().nonnegative().optional(),
  /** Views on this video — `view_count`. The reach signal. */
  viewCount: z.number().nonnegative().optional(),
  /** Likes on this video — `like_count`. The assent signal. */
  likeCount: z.number().nonnegative().optional(),
  /** Duration in seconds — `duration`. Sub-60s ⇒ a Short (down-weighted). */
  durationSec: z.number().nonnegative().optional(),
  /** Upload date `YYYYMMDD` (yt-dlp's `upload_date`), for recency. */
  uploadDate: z.string().optional(),
});
export type YouTubeCredibilitySignals = z.infer<typeof YouTubeCredibilitySignalsSchema>;

// ---------------------------------------------------------------------------
// Output — score + named factors + rationale (mirrors assessTrust's shape).
// ---------------------------------------------------------------------------

export type CredibilityPolarity = "positive" | "neutral" | "caution";

export interface CredibilityFactor {
  /** Short machine-stable name, e.g. "subscriber-scale". */
  key: string;
  /** Human label, e.g. "subscriber scale". */
  label: string;
  /** Plain-English detail with the raw numbers. */
  detail: string;
  /** This factor's contribution to the final score, in [0,1]. */
  value: number;
  polarity: CredibilityPolarity;
}

export interface YouTubeCredibility {
  /** Final blended credibility in [0,1]. */
  score: number;
  factors: CredibilityFactor[];
  /** One plain-English sentence synthesizing the factors. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Sub-scores — each pure, each in [0,1].
// ---------------------------------------------------------------------------

/**
 * Subscriber scale, log-scaled so the curve is meaningful across the whole
 * creator spectrum rather than saturating instantly. 0 subs → 0; ~10M subs → 1.
 * log10(subs) mapped from [3 (1k), 7 (10M)] onto [0,1].
 */
export function subscriberScaleScore(subs: number | undefined): number {
  if (!subs || subs <= 0) return 0;
  const log = Math.log10(subs);
  return clamp01((log - 3) / (7 - 3));
}

/**
 * Engagement = like/view ratio, normalized. A healthy YouTube like:view ratio is
 * ~2-6%; we map [0, 8%] → [0,1] and clamp. Missing likes/views → 0.
 * This is the single hardest signal to fake and the one podcasts entirely lack.
 */
export function engagementScore(likes: number | undefined, views: number | undefined): number {
  if (!likes || !views || views <= 0) return 0;
  const ratio = likes / views;
  return clamp01(ratio / 0.08);
}

/**
 * Reach-vs-scale: does this video's view_count actually reach a real audience
 * relative to the channel's subscriber base? A channel with 1M subs whose videos
 * get 500 views is suspect; one whose videos routinely clear its sub count is
 * healthy. Maps views/subs from [0, 1.0] → [0,1] (a video reaching its whole
 * subscriber base scores full). No subs or no views → neutral 0.5 (unknown).
 */
export function reachScore(views: number | undefined, subs: number | undefined): number {
  if (!views || views <= 0) return 0;
  if (!subs || subs <= 0) return 0.5; // reach known, scale unknown → neutral
  return clamp01(views / subs);
}

/**
 * Recency from `upload_date` (YYYYMMDD) vs a reference `now` (ms). A source that
 * still publishes is more credible as a *live* source. Decays linearly over
 * `halfYearsToZero` (default: ~2 years) since the last upload. Unknown/unparsable
 * date → neutral 0.5.
 */
export function recencyScore(uploadDate: string | undefined, nowMs: number, yearsToZero = 2): number {
  const t = parseUploadDate(uploadDate);
  if (t === null) return 0.5;
  const ageMs = nowMs - t;
  if (ageMs <= 0) return 1;
  const spanMs = yearsToZero * 365 * 24 * 60 * 60 * 1000;
  return clamp01(1 - ageMs / spanMs);
}

/** Parse a `YYYYMMDD` upload_date to epoch ms (UTC midnight), or null. */
export function parseUploadDate(d: string | undefined): number | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(4, 6));
  const day = Number(d.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day);
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------------------
// Blend — weighted mean of the sub-scores into the headline credibility.
// ---------------------------------------------------------------------------

/** Relative weights of each signal in the blended score (sum need not be 1). */
export const CREDIBILITY_WEIGHTS = {
  subscriber: 0.35,
  engagement: 0.3,
  reach: 0.2,
  recency: 0.15,
} as const;

/** A sub-60s video is a Short; Shorts are lower-signal for a curation surface. */
const SHORT_PENALTY = 0.85;

export interface CredibilityOpts {
  /** Reference clock (ms) for recency. Defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Score a single video's measurable signals into a 0..1 credibility with named
 * factors and a plain-English rationale. Pure + deterministic; guards every
 * missing field so it never throws. NO LLM, NO network.
 */
export function youtubeCredibility(
  raw: YouTubeCredibilitySignals,
  opts: CredibilityOpts = {},
): YouTubeCredibility {
  const s = YouTubeCredibilitySignalsSchema.parse(raw);
  const nowMs = opts.nowMs ?? Date.now();

  const sub = subscriberScaleScore(s.subscriberCount);
  const eng = engagementScore(s.likeCount, s.viewCount);
  const reach = reachScore(s.viewCount, s.subscriberCount);
  const rec = recencyScore(s.uploadDate, nowMs);

  const factors: CredibilityFactor[] = [
    {
      key: "subscriber-scale",
      label: "subscriber scale",
      detail: s.subscriberCount
        ? `${fmt(s.subscriberCount)} subscribers (log-scaled)`
        : "subscriber count unknown",
      value: sub,
      polarity: sub >= 0.5 ? "positive" : sub > 0 ? "neutral" : "caution",
    },
    {
      key: "engagement",
      label: "engagement (like/view)",
      detail:
        s.likeCount && s.viewCount
          ? `${fmt(s.likeCount)} likes on ${fmt(s.viewCount)} views (${pct(s.likeCount / s.viewCount)})`
          : "likes or views unknown",
      value: eng,
      polarity: eng >= 0.4 ? "positive" : eng > 0 ? "neutral" : "caution",
    },
    {
      key: "reach",
      label: "reach vs subscriber base",
      detail:
        s.viewCount && s.subscriberCount
          ? `${fmt(s.viewCount)} views vs ${fmt(s.subscriberCount)} subs (${pct(s.viewCount / s.subscriberCount)})`
          : "reach vs scale unknown",
      value: reach,
      polarity: reach >= 0.5 ? "positive" : "neutral",
    },
    {
      key: "recency",
      label: "recency",
      detail: s.uploadDate ? `last upload ${fmtDate(s.uploadDate)}` : "upload date unknown",
      value: rec,
      polarity: rec >= 0.5 ? "positive" : "caution",
    },
  ];

  let score =
    (sub * CREDIBILITY_WEIGHTS.subscriber +
      eng * CREDIBILITY_WEIGHTS.engagement +
      reach * CREDIBILITY_WEIGHTS.reach +
      rec * CREDIBILITY_WEIGHTS.recency) /
    (CREDIBILITY_WEIGHTS.subscriber +
      CREDIBILITY_WEIGHTS.engagement +
      CREDIBILITY_WEIGHTS.reach +
      CREDIBILITY_WEIGHTS.recency);

  // A Short (<60s) is lower-signal for a long-form curation surface.
  const isShort = s.durationSec !== undefined && s.durationSec > 0 && s.durationSec < 60;
  if (isShort) {
    score *= SHORT_PENALTY;
    factors.push({
      key: "short",
      label: "format",
      detail: `${s.durationSec}s — a Short (down-weighted)`,
      value: SHORT_PENALTY,
      polarity: "caution",
    });
  }

  return { score: clamp01(score), factors, rationale: synthesize(score, factors) };
}

/** One plain-English sentence in the founder's voice. */
function synthesize(score: number, factors: CredibilityFactor[]): string {
  const band = score >= 0.7 ? "high-trust" : score >= 0.45 ? "credible" : "provisional";
  const positives = factors.filter((f) => f.polarity === "positive").map((f) => f.label);
  const cautions = factors.filter((f) => f.polarity === "caution").map((f) => f.label);
  const lead =
    positives.length > 0
      ? `strong ${positives.join(", ")}`
      : "thin measurable signal";
  const tail = cautions.length > 0 ? `; watch ${cautions.join(", ")}` : "";
  return `${band} YouTube channel — ${lead}${tail}.`;
}

// ---------------------------------------------------------------------------
// Registry trust wiring — map a per-video (or aggregated) credibility onto a
// registry trustScore for a YouTube source.
// ---------------------------------------------------------------------------

/**
 * Blend a computed credibility into a registry trustScore for a YouTube source.
 * YouTube's signals are strong and measurable, so we lean on the computed score
 * but keep any hand-authored seed trust as a floor (a curator-vetted channel is
 * never dragged *below* its seed rating by a single quiet video). Returns a
 * value in [0,1] rounded to 2 dp for stable diffs.
 */
export function youtubeTrustScore(
  credibility: number,
  seedTrust: number | undefined,
): number {
  const floor = seedTrust ?? 0;
  const blended = Math.max(credibility, floor * 0.9 + credibility * 0.1, floor);
  return Math.round(clamp01(blended) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cloud-appraisal seam — build the raw-signal brief for Sonnet's tone judgment.
// ---------------------------------------------------------------------------

/**
 * Assemble the raw signals + deterministic verdict a Sonnet appraiser reads to
 * judge tone/professionalism (titles, descriptions). This is the SEAM: it packs
 * the measurable half so the cloud step never re-derives it — but it calls NO
 * LLM. The `title`/`description` are handed through verbatim for the tone call.
 */
export interface YouTubeCredibilityBrief {
  channel: string;
  channelId: string;
  title: string;
  description: string;
  signals: YouTubeCredibilitySignals;
  deterministic: YouTubeCredibility;
}

export function youtubeCredibilityBrief(input: {
  channel: string;
  channelId: string;
  title: string;
  description: string;
  signals: YouTubeCredibilitySignals;
  nowMs?: number;
}): YouTubeCredibilityBrief {
  return {
    channel: input.channel,
    channelId: input.channelId,
    title: input.title,
    description: input.description,
    signals: input.signals,
    deterministic: youtubeCredibility(input.signals, { nowMs: input.nowMs }),
  };
}

// ---------------------------------------------------------------------------
// Small formatting helpers.
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtDate(d: string): string {
  if (!/^\d{8}$/.test(d)) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
