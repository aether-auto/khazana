/**
 * Podcast transcript discovery — an ordered tier chain that prefers PUBLISHED
 * transcripts over local transcription. It stops at the first success:
 *
 *   Tier 1  <podcast:transcript> (Podcasting 2.0) tag in the episode's RSS.
 *           We already fetched the feed; the parser stashes every tag. We pick
 *           the best (VTT/SRT/JSON over HTML; language-matched) and convert it.
 *   Tier 2  PodcastIndex API (free dev key). Elevated from the old optional path.
 *           Degrades silently with NO key.
 *   Tier 3  YouTube captions — only if the episode maps to a YouTube video.
 *   Tier 4  No transcript → return no body. Whisper is OPT-IN only behind
 *           ALLOW_WHISPER=1 (OFF by default) as the last resort.
 *
 * Every resolved episode (including "no transcript") is cached by a stable
 * episode key so it is NEVER re-resolved — this is what erases the slow
 * Whisper/yt-dlp tail on steady-state runs.
 */

import { createHash } from "node:crypto";
import type { FetchFn } from "../fetchers/build-source.js";
import type { IngestCaches, CachedTranscript } from "../cache/store.js";
import { episodeKey } from "../cache/keys.js";
import {
  parseTranscriptTags,
  selectTranscript,
  transcriptContentToText,
  type TranscriptTag,
} from "./parse.js";
import { cleanPodcastTranscript } from "../podcast.js";
import { isFullTranscript } from "../whisper.js";
import { transcriptToHtml, youTubeVideoId } from "../youtube.js";
import type { TranscriptResult } from "../youtube.js";

/** Which resolution tier produced a transcript (or none). */
export type TranscriptTier = CachedTranscript["tier"] | "none";

export interface ResolveResult {
  tier: TranscriptTier;
  /** Sanitized HTML prose, or "" when no transcript was found. */
  body: string;
  /** True when this result came straight from the on-disk cache. */
  cached: boolean;
}

/** The episode fields the resolver needs (stashed by the RSS parser). */
export interface EpisodeRef {
  /** The episode page/link URL (used for YouTube mapping + PodcastIndex lookup). */
  url: string;
  /** Stable audio enclosure URL (CDN MP3) — primary episode key + Whisper input. */
  enclosureUrl: string | undefined;
  /** Normalized <podcast:transcript> tags from the feed. */
  transcriptTags: TranscriptTag[];
  /** Feed language (BCP-47), used to prefer a matching transcript. */
  feedLanguage: string | undefined;
  /** Episode GUID — fallback episode key when there is no enclosure. */
  guid?: string | undefined;
}

/** Injectable side-effect deps (kept out of the pure tier logic for testing). */
export interface ResolveDeps {
  /** Tier 3: resolve YouTube captions for a video id. */
  youtube?: (videoId: string, fetchFn: FetchFn) => Promise<TranscriptResult>;
  /** Tier 4: local Whisper transcription of an audio URL → sanitized HTML. */
  whisper?: (enclosureUrl: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Tier 1 — <podcast:transcript> RSS tag
// ---------------------------------------------------------------------------

async function tryRssTag(ref: EpisodeRef, fetchFn: FetchFn): Promise<string> {
  const chosen = selectTranscript(ref.transcriptTags, ref.feedLanguage);
  if (!chosen) return "";
  return fetchAndConvert(chosen, fetchFn);
}

/** Fetch a transcript tag's URL and convert to sanitized prose HTML. */
async function fetchAndConvert(tag: TranscriptTag, fetchFn: FetchFn): Promise<string> {
  try {
    const res = await fetchFn(tag.url);
    if (!res.ok) return "";
    const raw = await res.text();
    // Prefer the tag's declared type; the converter also sniffs (e.g. VTT).
    const typeHint = tag.type || guessTypeFromUrl(tag.url);
    const text = transcriptContentToText(raw, typeHint);
    if (!text) return "";
    // Route through the shared prose pipeline (ad-strip + paragraphize).
    const html = cleanPodcastTranscript(text);
    return isFullTranscript(html) ? html : "";
  } catch {
    return "";
  }
}

function guessTypeFromUrl(url: string): string {
  if (/\.vtt(\?|$)/i.test(url)) return "text/vtt";
  if (/\.srt(\?|$)/i.test(url)) return "application/x-subrip";
  if (/\.json(\?|$)/i.test(url)) return "application/json";
  if (/\.html?(\?|$)/i.test(url)) return "text/html";
  return "text/plain";
}

// ---------------------------------------------------------------------------
// Tier 2 — PodcastIndex API (free dev key; degrades silently with no key)
// ---------------------------------------------------------------------------

/**
 * PodcastIndex auth header = sha1(key + secret + unixtime). Returns null when
 * either credential is absent (this tier is then skipped entirely).
 */
function podcastIndexHeaders(): Record<string, string> | null {
  const key = process.env["PODCASTINDEX_API_KEY"] ?? "";
  const secret = process.env["PODCASTINDEX_API_SECRET"] ?? "";
  if (!key || !secret) return null;
  const authDate = String(Math.floor(Date.now() / 1000));
  const hash = createHash("sha1").update(key + secret + authDate).digest("hex");
  return {
    "X-Auth-Key": key,
    "X-Auth-Date": authDate,
    Authorization: hash,
    "User-Agent": "khazana-ingest/1.0",
  };
}

async function tryPodcastIndex(ref: EpisodeRef, fetchFn: FetchFn): Promise<string> {
  const headers = podcastIndexHeaders();
  if (!headers) return ""; // no key → skip silently
  try {
    // 1. Find the episode by its URL to get an episode id.
    const byUrl = await fetchFn(
      `https://api.podcastindex.org/api/1.0/episodes/byurl?url=${encodeURIComponent(ref.url)}&max=1`,
      { headers },
    );
    if (!byUrl.ok) return "";
    const episode = (await byUrl.json() as { episode?: { id?: unknown } }).episode;
    const id = episode?.id;
    if (id === undefined || id === null) return "";

    // 2. Fetch transcript URLs for that episode.
    const byId = await fetchFn(
      `https://api.podcastindex.org/api/1.0/transcripts/byepisodeid?id=${String(id)}`,
      { headers },
    );
    if (!byId.ok) return "";
    const items = (await byId.json() as { items?: Array<{ url?: string; type?: string }> }).items ?? [];
    const tags: TranscriptTag[] = items
      .filter((t): t is { url: string; type?: string } => typeof t.url === "string")
      .map((t) => ({ url: t.url, type: (t.type ?? "").toLowerCase(), language: undefined }));

    // 3. Pick + convert as a tier-1-style transcript.
    const chosen = selectTranscript(tags, ref.feedLanguage);
    if (!chosen) return "";
    return fetchAndConvert(chosen, fetchFn);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Tier 3 — YouTube captions (only when the episode maps to a YouTube video)
// ---------------------------------------------------------------------------

async function tryYouTube(ref: EpisodeRef, fetchFn: FetchFn, deps: ResolveDeps): Promise<string> {
  const videoId = youTubeVideoId(ref.url);
  if (!videoId || !deps.youtube) return "";
  const result = await deps.youtube(videoId, fetchFn);
  return result.kind === "transcript" ? transcriptToHtml(result.text) : "";
}

// ---------------------------------------------------------------------------
// Tier 4 — Whisper (opt-in only, OFF by default)
// ---------------------------------------------------------------------------

/** Whisper is the last-resort, flag-gated tier. OFF unless ALLOW_WHISPER=1. */
export function isWhisperEnabled(): boolean {
  return process.env["ALLOW_WHISPER"] === "1";
}

async function tryWhisper(ref: EpisodeRef, deps: ResolveDeps): Promise<string> {
  if (!isWhisperEnabled() || !ref.enclosureUrl || !deps.whisper) return "";
  return deps.whisper(ref.enclosureUrl);
}

// ---------------------------------------------------------------------------
// Orchestration + cache
// ---------------------------------------------------------------------------

/**
 * Resolve an episode's transcript through the tier chain, caching the outcome
 * (including "no transcript") so an episode is never re-resolved.
 */
export async function resolvePodcastTranscript(
  ref: EpisodeRef,
  fetchFn: FetchFn,
  caches: IngestCaches,
  deps: ResolveDeps,
): Promise<ResolveResult> {
  const key = episodeKey(ref.enclosureUrl, ref.guid);

  // Cache lookup — a cached entry (even an empty-body "none") short-circuits.
  if (key) {
    const cached = caches.transcripts.get(key);
    if (cached) {
      return { tier: cached.body ? cached.tier : "none", body: cached.body, cached: true };
    }
  }

  const result = await runTiers(ref, fetchFn, deps);

  // Persist the outcome (empty body = a resolved "no transcript", still cached).
  if (key) {
    caches.transcripts.set(key, {
      ref: ref.enclosureUrl ?? ref.guid ?? ref.url,
      tier: result.tier === "none" ? "whisper" : result.tier,
      body: result.body,
      fetchedAt: new Date().toISOString(),
    });
  }
  return { ...result, cached: false };
}

/** Run the ordered tiers, stopping at the first non-empty transcript. */
async function runTiers(
  ref: EpisodeRef,
  fetchFn: FetchFn,
  deps: ResolveDeps,
): Promise<{ tier: TranscriptTier; body: string }> {
  const rss = await tryRssTag(ref, fetchFn);
  if (rss) return { tier: "rss-tag", body: rss };

  const pi = await tryPodcastIndex(ref, fetchFn);
  if (pi) return { tier: "podcastindex", body: pi };

  const yt = await tryYouTube(ref, fetchFn, deps);
  if (yt) return { tier: "youtube", body: yt };

  const whisper = await tryWhisper(ref, deps);
  if (whisper) return { tier: "whisper", body: whisper };

  return { tier: "none", body: "" };
}
