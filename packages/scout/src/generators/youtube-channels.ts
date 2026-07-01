/**
 * YouTube channel discovery — the "source finding" half of first-class YouTube.
 *
 * YouTube is a BETTER discovery surface than podcasts because every channel
 * exposes measurable credibility (subscribers, views, like-ratio) that we can
 * rank on — podcasts give us almost nothing. This generator surfaces high-quality
 * NEW channels two ways:
 *
 *   (a) mineCuratedChannels — channels behind our already-curated `kind:"video"`
 *       items. If our best reads keep coming from a channel we don't yet track as
 *       a first-party source, that channel is a strong candidate. Pure over
 *       `curated.json` + a per-video metadata map (no network here; the metadata
 *       FETCH is the caller's, via ingest's `fetchYouTubeVideoMeta`).
 *
 *   (b) parseYtSearchResults — parse `yt-dlp ytsearchN:"<query>"` output
 *       (newline-delimited `-J` JSON, one per line) into channel candidates. The
 *       query construction (`buildYtSearchQueries`) is pure + unit-tested; the
 *       LIVE search run is the orchestrator's (a single paced yt-dlp call).
 *
 * Both dedup against the registry BY CHANNEL ID (every channel shares the
 * `youtube.com` domain, so the domain-based deduper is useless here) and rank by
 * the deterministic `@khazana/core` `youtubeCredibility` score. YouTube's strong
 * signals justify a higher auto-add confidence than blind domain candidates.
 */

import {
  youtubeCredibility,
  youtubeTrustScore,
  type CandidateSource,
  type FeedItem,
  type Registry,
  type SourceEntry,
  type YouTubeCredibilitySignals,
} from "@khazana/core";

// ---------------------------------------------------------------------------
// Channel identity + registry dedup (by channel id, not domain).
// ---------------------------------------------------------------------------

/** Extract a `UC…` channel id from any YouTube URL form (feed, channel, watch). */
export function youTubeChannelId(url: string): string | null {
  const m =
    url.match(/[?&]channel_id=(UC[A-Za-z0-9_-]{22})/) ??
    url.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
  return m?.[1] ?? null;
}

/** The set of channel ids already tracked as registry YouTube sources. */
export function registryChannelIds(registry: Registry): Set<string> {
  const set = new Set<string>();
  for (const s of registry.sources) {
    if (s.type !== "youtube") continue;
    const id = youTubeChannelId(s.url) ?? (s.resolvedUrl ? youTubeChannelId(s.resolvedUrl) : null);
    if (id) set.add(id);
  }
  return set;
}

/** The canonical channel feed URL (what we'd register as a new source). */
export function channelFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/** The channel watch/home URL (the candidate's human `url`). */
export function channelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

// ---------------------------------------------------------------------------
// The per-channel signal the ranker consumes.
// ---------------------------------------------------------------------------

/** The minimum a discovered channel carries so we can score + register it. */
export interface DiscoveredChannel {
  channelId: string;
  channel: string;
  /** Best-known credibility signals (from the channel's most-engaged video). */
  signals: YouTubeCredibilitySignals;
  /** Provenance strings for the appraiser brief. */
  evidence: string[];
  /** How many distinct videos/hits pointed at this channel. */
  seenCount: number;
}

// ---------------------------------------------------------------------------
// (a) Mine channels behind curated video items.
// ---------------------------------------------------------------------------

/** A per-video metadata lookup (keyed by video id) — supplied by the caller. */
export type VideoMetaLookup = (videoId: string) => YouTubeChannelMeta | undefined;

/** The channel-relevant slice of a resolved video's metadata. */
export interface YouTubeChannelMeta {
  channelId: string;
  channel: string;
  subscriberCount?: number;
  viewCount?: number;
  likeCount?: number;
  durationSec?: number;
  uploadDate?: string;
}

/** Extract the 11-char video id from a watch/youtu.be/embed/shorts URL. */
export function videoIdOf(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

export interface MineChannelsOpts {
  /** Only mine items at/above this tasteScore. Default 0. */
  minTasteScore?: number;
}

/**
 * Mine the channels behind curated `sourceType:"youtube"` items. For each video
 * item, resolve its metadata (via the caller-supplied lookup — usually populated
 * from ingest's `fetchYouTubeVideoMeta`), collect the channel, and keep the
 * highest-engagement video's signals per channel. Drops channels already in the
 * registry. Pure — no network.
 */
export function mineCuratedChannels(
  curated: FeedItem[],
  registry: Registry,
  lookup: VideoMetaLookup,
  opts: MineChannelsOpts = {},
): DiscoveredChannel[] {
  const minTaste = opts.minTasteScore ?? 0;
  const known = registryChannelIds(registry);
  const byChannel = new Map<string, DiscoveredChannel>();

  for (const item of curated) {
    if (item.sourceType !== "youtube") continue;
    if ((item.tasteScore ?? 0) < minTaste) continue;
    const vid = videoIdOf(item.url);
    if (!vid) continue;
    const meta = lookup(vid);
    if (!meta || !meta.channelId || known.has(meta.channelId)) continue;

    const signals: YouTubeCredibilitySignals = {
      subscriberCount: meta.subscriberCount,
      viewCount: meta.viewCount,
      likeCount: meta.likeCount,
      durationSec: meta.durationSec,
      uploadDate: meta.uploadDate,
    };
    const ev = `curated video "${item.title}" (${meta.viewCount ?? "?"} views)`;

    const existing = byChannel.get(meta.channelId);
    if (!existing) {
      byChannel.set(meta.channelId, {
        channelId: meta.channelId,
        channel: meta.channel,
        signals,
        evidence: [ev],
        seenCount: 1,
      });
    } else {
      existing.seenCount += 1;
      existing.evidence.push(ev);
      // Keep the higher-view video's signals (its engagement is the strongest cue).
      if ((signals.viewCount ?? 0) > (existing.signals.viewCount ?? 0)) existing.signals = signals;
    }
  }

  return [...byChannel.values()];
}

// ---------------------------------------------------------------------------
// (b) ytsearch query construction + result parsing.
// ---------------------------------------------------------------------------

export interface YtSearchOpts {
  /** Results per query. Default 10. */
  perQuery?: number;
}

/**
 * Build `yt-dlp` search arguments from founder channel-topics. Each topic → one
 * `ytsearchN:"<topic> channel"` term. The returned `args` are ready to hand to a
 * paced `yt-dlp -J` run (the orchestrator's job); `--flat-playlist` keeps it to
 * one request per topic. Pure.
 */
export function buildYtSearchArgs(topics: string[], opts: YtSearchOpts = {}): string[] {
  const n = opts.perQuery ?? 10;
  const terms = topics
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `ytsearch${n}:${t}`);
  return ["-J", "--flat-playlist", "--skip-download", "--no-warnings", ...terms];
}

/** The channel-topic search strings for a set of khazana channels. */
export function buildYtSearchQueries(channels: string[]): string[] {
  return channels.map((c) => `${c.replace(/-/g, " ")} explained`);
}

/**
 * Parse `yt-dlp -J` search output into `DiscoveredChannel`s. yt-dlp emits either
 * one JSON object per line (newline-delimited) or a single playlist object with
 * `entries[]`; we accept both. Each entry contributes its channel; the
 * per-channel signals come from the best entry we see. Drops registry channels.
 * Pure/offline.
 */
export function parseYtSearchResults(
  stdout: string,
  registry: Registry,
): DiscoveredChannel[] {
  const known = registryChannelIds(registry);
  const byChannel = new Map<string, DiscoveredChannel>();

  for (const obj of iterJson(stdout)) {
    const entries = Array.isArray((obj as { entries?: unknown }).entries)
      ? ((obj as { entries: unknown[] }).entries)
      : [obj];
    for (const raw of entries) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const channelId = str(e["channel_id"]) ?? str(e["uploader_id"]);
      const channel = str(e["channel"]) ?? str(e["uploader"]);
      if (!channelId || !channelId.startsWith("UC") || !channel || known.has(channelId)) continue;

      const signals: YouTubeCredibilitySignals = {
        subscriberCount: num(e["channel_follower_count"]),
        viewCount: num(e["view_count"]),
        likeCount: num(e["like_count"]),
        durationSec: num(e["duration"]),
        uploadDate: str(e["upload_date"]),
      };
      const ev = `ytsearch hit: "${str(e["title"]) ?? channel}"`;

      const existing = byChannel.get(channelId);
      if (!existing) {
        byChannel.set(channelId, { channelId, channel, signals, evidence: [ev], seenCount: 1 });
      } else {
        existing.seenCount += 1;
        existing.evidence.push(ev);
        if ((signals.viewCount ?? 0) > (existing.signals.viewCount ?? 0)) existing.signals = signals;
      }
    }
  }
  return [...byChannel.values()];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Iterate JSON objects from ndjson OR a single JSON blob. */
function* iterJson(stdout: string): Iterable<unknown> {
  const trimmed = stdout.trim();
  if (!trimmed) return;
  // Try whole-string parse first (single object / array).
  try {
    const whole = JSON.parse(trimmed);
    if (Array.isArray(whole)) {
      yield* whole;
    } else {
      yield whole;
    }
    return;
  } catch {
    // Fall through to line-by-line (ndjson).
  }
  for (const line of trimmed.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      yield JSON.parse(l);
    } catch {
      // skip malformed lines
    }
  }
}

// ---------------------------------------------------------------------------
// Rank + convert to CandidateSource[].
// ---------------------------------------------------------------------------

export interface RankChannelsOpts {
  /** Reference clock (ms) for the credibility recency signal. */
  nowMs?: number;
  /** Drop channels scoring below this credibility. Default 0.35. */
  minScore?: number;
  /** Max candidates to emit (highest credibility first). Default 100. */
  limit?: number;
  /** Which discovery lane produced these (for provenance). */
  via?: "youtube-channel" | "youtube-search";
}

/**
 * Rank discovered channels by their deterministic credibility score and convert
 * to `CandidateSource[]` (feed URL = channel_id feed; evidence carries the
 * engagement numbers the appraiser reads). Highest-credibility first. Pure.
 */
export function rankChannels(
  channels: DiscoveredChannel[],
  opts: RankChannelsOpts = {},
): CandidateSource[] {
  const minScore = opts.minScore ?? 0.35;
  const limit = opts.limit ?? 100;
  const via = opts.via ?? "youtube-channel";

  const scored = channels
    .map((ch) => {
      const cred = youtubeCredibility(ch.signals, { nowMs: opts.nowMs });
      return { ch, cred };
    })
    .filter(({ cred }) => cred.score >= minScore)
    .sort((a, b) => b.cred.score - a.cred.score || a.ch.channelId.localeCompare(b.ch.channelId))
    .slice(0, limit);

  return scored.map(({ ch, cred }) => ({
    url: channelUrl(ch.channelId),
    feedUrl: channelFeedUrl(ch.channelId),
    discoveredVia: via,
    evidence: [
      `${ch.channel} — credibility ${cred.score.toFixed(2)}: ${cred.rationale}`,
      ...ch.evidence.slice(0, 4),
    ],
    seenCount: ch.seenCount,
  }));
}

// ---------------------------------------------------------------------------
// Top-level: discover from curated + parsed search, dedup + rank together.
// ---------------------------------------------------------------------------

export interface DiscoverYouTubeInput {
  registry: Registry;
  /** Curated feed items (for channel-mining). */
  curated?: FeedItem[];
  /** Per-video metadata lookup for the curated miner. */
  metaLookup?: VideoMetaLookup;
  /** Raw `yt-dlp` search stdout to parse (the orchestrator runs the live search). */
  searchStdout?: string;
}

export interface DiscoverYouTubeOpts extends RankChannelsOpts {
  mine?: MineChannelsOpts;
}

/**
 * Run both YouTube discovery lanes, merge by channel id (summing seenCount,
 * unioning evidence, keeping the strongest signals), rank by credibility, and
 * emit ranked `CandidateSource[]`. Pure — the metadata + search FETCHES are the
 * caller's; this folds their outputs. `via` is recorded per source lane.
 */
export function discoverYouTubeChannels(
  input: DiscoverYouTubeInput,
  opts: DiscoverYouTubeOpts = {},
): CandidateSource[] {
  const merged = new Map<string, DiscoveredChannel>();
  const add = (ch: DiscoveredChannel) => {
    const existing = merged.get(ch.channelId);
    if (!existing) {
      merged.set(ch.channelId, { ...ch, evidence: [...ch.evidence] });
      return;
    }
    existing.seenCount += ch.seenCount;
    existing.evidence.push(...ch.evidence);
    if ((ch.signals.viewCount ?? 0) > (existing.signals.viewCount ?? 0)) existing.signals = ch.signals;
  };

  if (input.curated?.length && input.metaLookup) {
    for (const ch of mineCuratedChannels(input.curated, input.registry, input.metaLookup, opts.mine))
      add(ch);
  }
  if (input.searchStdout) {
    for (const ch of parseYtSearchResults(input.searchStdout, input.registry)) add(ch);
  }

  return rankChannels([...merged.values()], opts);
}

// ---------------------------------------------------------------------------
// Registry trust wiring — reflect YouTube's measurable credibility on the
// registry's youtube sources.
// ---------------------------------------------------------------------------

/**
 * Credibility signals per channel id, keyed by `UC…` — usually built by the
 * caller from ingest metadata over each channel's most-engaged recent video.
 */
export type ChannelSignalMap = Map<string, YouTubeCredibilitySignals>;

export interface ApplyTrustOpts {
  nowMs?: number;
}

/**
 * Recompute `trustScore` for the registry's YouTube sources from measurable
 * credibility. For each youtube entry whose channel id has fresh signals, blend
 * `youtubeCredibility` into the stored trust via `youtubeTrustScore` (seed trust
 * as a floor). Non-youtube and unmatched entries are returned untouched. Pure —
 * the metadata fetch is the caller's; this just folds it. Returns the updated
 * registry and a per-source change log.
 */
export function applyYouTubeTrust(
  registry: Registry,
  signals: ChannelSignalMap,
  opts: ApplyTrustOpts = {},
): { registry: Registry; changed: Array<{ id: string; from: number; to: number }> } {
  const changed: Array<{ id: string; from: number; to: number }> = [];
  const sources: SourceEntry[] = registry.sources.map((s) => {
    if (s.type !== "youtube") return s;
    const id = youTubeChannelId(s.url) ?? (s.resolvedUrl ? youTubeChannelId(s.resolvedUrl) : null);
    if (!id) return s;
    const sig = signals.get(id);
    if (!sig) return s;
    const cred = youtubeCredibility(sig, { nowMs: opts.nowMs });
    const to = youtubeTrustScore(cred.score, s.trustScore);
    if (to !== s.trustScore) changed.push({ id: s.id, from: s.trustScore, to });
    return { ...s, trustScore: to };
  });
  return { registry: { ...registry, sources }, changed };
}
