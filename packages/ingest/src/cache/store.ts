/**
 * Concrete ingest caches. Three content-addressed namespaces under one base dir
 * (default `.cache/ingest/`, gitignored, override with INGEST_CACHE_DIR):
 *
 *   - http/       — conditional-GET validators per feed URL (ETag/Last-Modified)
 *   - transcripts/ — resolved transcript text per episode + which tier produced it
 *   - fulltext/   — extracted article body per article URL
 *
 * Every persisted shape is a zod schema so a stale on-disk format from an older
 * version degrades to a cache miss (see DiskCache) instead of corrupting output.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CacheStats, DiskCache } from "./disk.js";

/** Conditional-GET validators persisted per feed URL. */
export const HttpMetaSchema = z.object({
  url: z.string(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  fetchedAt: z.string(),
});
export type HttpMeta = z.infer<typeof HttpMetaSchema>;

/** A resolved transcript + the tier that produced it (never re-resolved). */
export const CachedTranscriptSchema = z.object({
  /** The episode key input (enclosure URL or guid) for debugging. */
  ref: z.string(),
  /** Which resolution tier produced this. */
  tier: z.enum(["rss-tag", "podcastindex", "youtube", "whisper"]),
  /** Sanitized HTML prose body, or "" when we resolved to "no transcript". */
  body: z.string(),
  fetchedAt: z.string(),
});
export type CachedTranscript = z.infer<typeof CachedTranscriptSchema>;

/**
 * Parsed feed items per feed URL, kept alongside the HTTP validators so a `304
 * Not Modified` response can reuse the last run's items without re-parsing.
 * Stored as opaque JSON (the FeedItem shape is validated downstream anyway).
 */
export const CachedFeedItemsSchema = z.object({
  url: z.string(),
  items: z.array(z.unknown()),
  fetchedAt: z.string(),
});
export type CachedFeedItems = z.infer<typeof CachedFeedItemsSchema>;

/** Extracted full-text article body per article URL. */
export const CachedFullTextSchema = z.object({
  url: z.string(),
  /** Extraction method that won (mirrors ExtractMethod). */
  method: z.string(),
  /** Sanitized article HTML. */
  html: z.string(),
  fetchedAt: z.string(),
});
export type CachedFullText = z.infer<typeof CachedFullTextSchema>;

/** Resolve the cache base directory (env-overridable). */
export function cacheBaseDir(): string {
  return process.env["INGEST_CACHE_DIR"] ?? join(process.cwd(), ".cache", "ingest");
}

/**
 * The bundle of caches threaded through a run, sharing one stats counter so the
 * run summary can report a single hit/miss total across all three namespaces.
 */
export interface IngestCaches {
  http: DiskCache<HttpMeta>;
  feedItems: DiskCache<CachedFeedItems>;
  transcripts: DiskCache<CachedTranscript>;
  fulltext: DiskCache<CachedFullText>;
  stats: CacheStats;
}

/**
 * Ephemeral caches under a fresh temp dir. Used as the default when a caller
 * doesn't inject a persistent cache (e.g. a standalone `enrichContent` call or
 * a unit test) so the shared on-disk cache is never touched implicitly and
 * calls don't leak state into each other.
 */
export function ephemeralCaches(): IngestCaches {
  return makeCaches(mkdtempSync(join(tmpdir(), "khazana-ingest-cache-")));
}

/** Build the concrete caches under `baseDir` (defaults to `cacheBaseDir()`). */
export function makeCaches(baseDir: string = cacheBaseDir()): IngestCaches {
  const stats = new CacheStats();
  return {
    http: new DiskCache(join(baseDir, "http"), HttpMetaSchema, stats),
    feedItems: new DiskCache(join(baseDir, "feed-items"), CachedFeedItemsSchema, stats),
    transcripts: new DiskCache(join(baseDir, "transcripts"), CachedTranscriptSchema, stats),
    fulltext: new DiskCache(join(baseDir, "fulltext"), CachedFullTextSchema, stats),
    stats,
  };
}
