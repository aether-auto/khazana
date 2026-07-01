/**
 * YouTube enrichment — the pure glue between metadata (`youtube-meta.ts`) and
 * credibility (`@khazana/core` `youtubeCredibility`). Given a `FeedItem` and the
 * video's `YouTubeVideoMeta`, it:
 *
 *   - stamps the engagement signals onto `metrics` (score = view_count,
 *     comments left untouched — YouTube's `like_count` rides in `trustScore`
 *     via credibility, and `view_count` is the natural ranking "score"),
 *   - computes the deterministic `youtubeCredibility` and writes it to the
 *     item's `trustScore` (0..1), and
 *   - fills `author` with the channel name when missing.
 *
 * Pure — no network, no LLM, no clock unless injected. The metadata FETCH is the
 * side-effecting part (in `youtube-meta.ts`); this file just folds a fetched meta
 * into an item, so it is fully unit-testable. Callers (the enrich pipeline) do:
 *
 *     const meta = await fetchYouTubeVideoMeta(id, { gate, cache });
 *     if (meta) enrichYouTubeItem(item, meta);
 */

import { youtubeCredibility } from "@khazana/core";
import type { YouTubeVideoMeta } from "./youtube-meta.js";

/** The mutable subset of a FeedItem this enricher writes. */
export interface YouTubeEnrichable {
  author?: string;
  metrics?: { score?: number; comments?: number };
  trustScore?: number;
}

export interface EnrichYouTubeOpts {
  /** Reference clock (ms) for the recency signal. Defaults to Date.now(). */
  nowMs?: number;
  /**
   * The channel's seed/registry trust, used as a floor so a curator-vetted
   * channel is never dragged below its rating by one quiet video.
   */
  seedTrust?: number;
}

/**
 * Fold a video's metadata into a feed item: engagement metrics + a deterministic
 * credibility-derived `trustScore`. Mutates and returns the item. Never throws.
 */
export function enrichYouTubeItem<T extends YouTubeEnrichable>(
  item: T,
  meta: YouTubeVideoMeta,
  opts: EnrichYouTubeOpts = {},
): T {
  const cred = youtubeCredibility(
    {
      subscriberCount: meta.subscriberCount,
      viewCount: meta.viewCount,
      likeCount: meta.likeCount,
      durationSec: meta.durationSec,
      uploadDate: meta.uploadDate,
    },
    { nowMs: opts.nowMs },
  );

  // Engagement onto metrics: view_count is the natural ranking magnitude.
  if (meta.viewCount !== undefined) {
    item.metrics = { ...(item.metrics ?? {}), score: meta.viewCount };
  }

  // Credibility → item trustScore, floored by the channel's seed trust.
  const floor = opts.seedTrust ?? 0;
  item.trustScore = clamp01(Math.max(cred.score, floor));

  if (!item.author && meta.channel) item.author = meta.channel;

  return item;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
