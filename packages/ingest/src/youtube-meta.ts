/**
 * YouTube video metadata extraction — the "data getting" half of the first-class
 * YouTube source. One `yt-dlp -J <videoId>` yields, in a SINGLE request, every
 * signal the founder wants and that podcasts cannot offer:
 *
 *   - channel, channel_id, channel_url
 *   - channel_follower_count  (SUBSCRIBERS — the scale signal)
 *   - view_count              (reach)
 *   - like_count              (assent; the hardest signal to fake)
 *   - duration, upload_date   (format + freshness)
 *   - subtitles / automatic_captions availability (transcript feasibility)
 *
 * `parseYtDlpJson` is PURE (offline over a `-J` JSON object) so it is fully
 * unit-testable against a captured fixture — no network. `fetchYouTubeVideoMeta`
 * is the paced, cached side-effect wrapper: it reuses the same `YtDlpGate`
 * (concurrency 1 + min-gap) and the same on-disk cache pattern as the transcript
 * path, keyed by video id, so a video's metadata is fetched at most once.
 *
 * $0: no paid YouTube Data API — every field below is present in `yt-dlp -J`,
 * confirmed against a real capture (`__fixtures__/yt-dlp-3b1b.json`).
 */

import { execFile } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import type { YtDlpDeps } from "./youtube.js";
import { CacheStats, DiskCache } from "./cache/disk.js";
import { cacheBaseDir } from "./cache/store.js";
import { urlKey } from "./cache/keys.js";

// ---------------------------------------------------------------------------
// Typed metadata shape (zod — the cross-subsystem contract).
// ---------------------------------------------------------------------------

export const YouTubeVideoMetaSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  description: z.string().default(""),
  channel: z.string(),
  channelId: z.string(),
  channelUrl: z.string().optional(),
  /** channel_follower_count — subscribers. Absent when yt-dlp can't read it. */
  subscriberCount: z.number().int().nonnegative().optional(),
  /** view_count on this video. */
  viewCount: z.number().int().nonnegative().optional(),
  /** like_count on this video. */
  likeCount: z.number().int().nonnegative().optional(),
  /** Duration in seconds. */
  durationSec: z.number().nonnegative().optional(),
  /** yt-dlp upload_date, `YYYYMMDD`. */
  uploadDate: z.string().optional(),
  /** true when the video carries manual OR automatic captions (transcript feasible). */
  hasCaptions: z.boolean().default(false),
  /** true when the video has manual (human) English subtitles. */
  hasManualCaptions: z.boolean().default(false),
});
export type YouTubeVideoMeta = z.infer<typeof YouTubeVideoMetaSchema>;

// ---------------------------------------------------------------------------
// Pure parse of a `yt-dlp -J` JSON object.
// ---------------------------------------------------------------------------

/** The `-J` fields we read. Everything optional — yt-dlp output drifts. */
interface YtDlpInfo {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  channel?: unknown;
  uploader?: unknown;
  channel_id?: unknown;
  channel_url?: unknown;
  uploader_url?: unknown;
  channel_follower_count?: unknown;
  view_count?: unknown;
  like_count?: unknown;
  duration?: unknown;
  upload_date?: unknown;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Does the captions map contain an English track? */
function hasEnglish(map: Record<string, unknown> | undefined): boolean {
  if (!map) return false;
  return Object.keys(map).some((k) => k.toLowerCase().startsWith("en"));
}

/**
 * Parse a `yt-dlp -J` object (already `JSON.parse`d) into `YouTubeVideoMeta`.
 * Pure/offline. Returns null when the object lacks the minimum identity fields
 * (id + a channel) — a malformed dump degrades to "no metadata", never a throw.
 */
export function parseYtDlpJson(info: unknown): YouTubeVideoMeta | null {
  if (!info || typeof info !== "object") return null;
  const d = info as YtDlpInfo;

  const videoId = str(d.id);
  const channel = str(d.channel) ?? str(d.uploader);
  const channelId = str(d.channel_id);
  const title = str(d.title);
  if (!videoId || !channel || !channelId || !title) return null;

  const manual = hasEnglish(d.subtitles);
  const auto = hasEnglish(d.automatic_captions);

  const parsed = YouTubeVideoMetaSchema.safeParse({
    videoId,
    title,
    description: str(d.description) ?? "",
    channel,
    channelId,
    channelUrl: str(d.channel_url) ?? str(d.uploader_url),
    subscriberCount: num(d.channel_follower_count),
    viewCount: num(d.view_count),
    likeCount: num(d.like_count),
    durationSec: num(d.duration),
    uploadDate: str(d.upload_date),
    hasCaptions: manual || auto,
    hasManualCaptions: manual,
  });
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Paced + cached side-effect wrapper.
// ---------------------------------------------------------------------------

/** Run `yt-dlp -J` for one video and return its stdout JSON string. Injectable. */
export type MetaExecRunner = (videoId: string) => Promise<string>;

/**
 * Default runner: `yt-dlp -J --skip-download --no-warnings <id>` capturing
 * stdout. Resolves "" on any failure (yt-dlp missing, network, ban) — never
 * throws. Paced by the caller via the shared `YtDlpGate`.
 */
const defaultMetaRunner: MetaExecRunner = (videoId) =>
  new Promise((resolve) => {
    execFile(
      "yt-dlp",
      ["-J", "--skip-download", "--no-warnings", "--", videoId],
      { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => resolve(err ? "" : stdout),
    );
  });

/** A minimal cache surface (matches `DiskCache<CachedVideoMeta>`), injectable for tests. */
export interface VideoMetaCache {
  get(key: string): { meta: unknown } | undefined;
  set(key: string, value: { meta: unknown }): void;
}

export interface FetchMetaDeps extends Pick<YtDlpDeps, "gate"> {
  /** The `yt-dlp -J` runner (defaults to a real spawned subprocess). */
  run?: MetaExecRunner;
  /** Per-video-id metadata cache (defaults to none → always fetch). */
  cache?: VideoMetaCache;
}

/**
 * Fetch + cache one video's metadata. Paced through the shared `YtDlpGate`
 * (concurrency 1 + min-gap) exactly like the transcript path, so a bulk run
 * stays polite from the shared Actions IP. On a cache hit no subprocess spawns.
 * Returns null on any failure. Never throws.
 */
export async function fetchYouTubeVideoMeta(
  videoId: string,
  deps: FetchMetaDeps = {},
): Promise<YouTubeVideoMeta | null> {
  if (!videoId) return null;
  const run = deps.run ?? defaultMetaRunner;

  if (deps.cache) {
    const hit = deps.cache.get(videoId);
    if (hit) {
      const parsed = YouTubeVideoMetaSchema.safeParse(hit.meta);
      if (parsed.success) return parsed.data;
      // Stale/invalid cached shape → fall through and re-fetch.
    }
  }

  const exec = async (): Promise<YouTubeVideoMeta | null> => {
    const json = await run(videoId);
    if (!json) return null;
    let obj: unknown;
    try {
      obj = JSON.parse(json);
    } catch {
      return null;
    }
    return parseYtDlpJson(obj);
  };

  // Pace through the gate when one is supplied (production passes the shared gate).
  const meta = deps.gate ? await deps.gate.run(exec) : await exec();

  if (meta && deps.cache) deps.cache.set(videoId, { meta });
  return meta;
}

// ---------------------------------------------------------------------------
// Self-contained on-disk metadata cache (keyed by video id).
// ---------------------------------------------------------------------------

/** Persisted per-video metadata (the wrapper shape the DiskCache validates). */
export const CachedVideoMetaSchema = z.object({
  meta: YouTubeVideoMetaSchema,
  fetchedAt: z.string().optional(),
});

/**
 * A persistent `VideoMetaCache` under `<cacheBaseDir>/youtube-meta/`, keyed by a
 * hash of the video id, reusing the shared DiskCache pattern. Metadata is cheap
 * to store and — for older videos — effectively static, so this is the
 * highest-value cache for the metadata path: a video's `-J` is spawned once.
 */
export function makeVideoMetaCache(baseDir: string = cacheBaseDir()): VideoMetaCache {
  const disk = new DiskCache(
    join(baseDir, "youtube-meta"),
    CachedVideoMetaSchema,
    new CacheStats(),
  );
  return {
    get(videoId) {
      const hit = disk.get(urlKey(videoId));
      return hit ? { meta: hit.meta } : undefined;
    },
    set(videoId, value) {
      const parsed = YouTubeVideoMetaSchema.safeParse(value.meta);
      if (parsed.success) {
        disk.set(urlKey(videoId), { meta: parsed.data, fetchedAt: new Date().toISOString() });
      }
    },
  };
}
