/**
 * YouTube channel video DISCOVERY — the "what's new" half of the first-class
 * YouTube source (metadata/credibility is `youtube-meta.ts` / `youtube-enrich.ts`).
 *
 * Every seeded youtube `SourceEntry.url` points at the legacy
 * `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` RSS endpoint. That
 * endpoint now 404s for the vast majority of channels (confirmed empirically),
 * so the generic RSS fetch in `fetchers/build-source.ts` silently yields zero
 * items for ~90-95% of youtube sources. `yt-dlp --flat-playlist` against the
 * same channel's `/videos` tab works fine on the exact same channels, so this
 * module routes discovery through yt-dlp instead — gated on
 * `ALLOW_DIRECT_YOUTUBE=1` + a yt-dlp binary on PATH (see `youtube.ts`), with
 * an RSS fallback preserved for local/dev environments without either.
 *
 * yt-dlp runs as a subprocess (bypasses the HTTP `PerHostLimiter`), and a bulk
 * run touches up to ~208 youtube sources, so every invocation is paced through
 * the SAME shared, process-wide `YtDlpGate` used by transcript + metadata
 * fetching (`sharedYtDlpGateInstance()`) — concurrency 1 + a minimum gap
 * between subprocess launches — so this doesn't multiply the shared-Actions-IP
 * ban risk beyond what transcripts/metadata already accept.
 *
 * `--flat-playlist` intentionally does NOT resolve a per-video `-J` metadata
 * call here (that would add up to N subprocesses per channel on top of the one
 * listing call — far too many across ~208 sources). `publishedAt` is therefore
 * seeded from `ctx.now` (first-seen time) rather than the real upload date;
 * richer metadata (real upload date, view/like counts, subscriber floor) is
 * layered on afterward by the existing `fetchYouTubeVideoMeta` +
 * `enrichYouTubeItem` downstream enrich step, which already fetches one `-J`
 * per video it processes.
 */

import { execFile } from "node:child_process";
import {
  FeedItemSchema,
  makeFeedItemId,
  type FeedItem,
  type FetchContext,
  type SourceEntry,
} from "@khazana/core";
import { sharedYtDlpGateInstance, type YtDlpGate } from "./youtube.js";

/**
 * Default number of most-recent uploads to discover per channel per run. Kept
 * small on purpose: this is a discovery poll (not a backfill), and a small N
 * keeps subprocess volume + noise down across a ~208-channel run. Configurable
 * via `YT_DLP_DISCOVERY_LIMIT` for tuning without a code change.
 *
 * Lowered 5 → 3 after a live `feed-refresh` run crashed the whole ingest
 * process (undici parser `AssertionError` inside Node's HTTP client, thrown
 * asynchronously from a socket event — no try/catch stops it). Root cause:
 * this discovery poll went from ~0 usable YouTube items (the legacy
 * videos.xml RSS endpoint 404s for ~90-95% of channels) to up to
 * `208 channels * limit` new items in one run, each of which is then run
 * through `enrichContent`'s YouTube branch. 3 trims the worst-case burst by
 * 40% without materially hurting freshness (a discovery poll running 2x/day
 * only needs to catch a channel's last few uploads).
 */
export const DEFAULT_YT_DLP_DISCOVERY_LIMIT = 3;

/** Resolve the per-channel discovery limit from env, falling back to the default. */
export function ytDlpDiscoveryLimit(): number {
  const raw = Number(process.env["YT_DLP_DISCOVERY_LIMIT"]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_YT_DLP_DISCOVERY_LIMIT;
}

/**
 * Extract the `channel_id` query param from a registry youtube URL — every
 * seeded entry is the legacy
 * `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` form. Returns
 * null (never throws) when the URL doesn't carry one, so callers can fail
 * soft rather than dereference a missing id.
 */
export function extractYouTubeChannelId(url: string): string | null {
  const m = url.match(/[?&]channel_id=([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

/**
 * Build the yt-dlp arg list for a lean channel-videos listing: flat (no
 * per-video resolution), capped at `limit` uploads, printing exactly
 * `<id>\t<title>` per line so stdout is trivial to parse. Exported for tests.
 */
export function buildYtDlpDiscoveryArgs(channelId: string, limit: number): string[] {
  return [
    "--flat-playlist",
    "--playlist-end",
    String(limit),
    "--print",
    "%(id)s\t%(title)s",
    "--no-warnings",
    "--",
    `https://www.youtube.com/channel/${channelId}/videos`,
  ];
}

/** One discovered video: id + title. Rows with `NA` in either field are dropped. */
export interface DiscoveredVideo {
  id: string;
  title: string;
}

/**
 * Parse yt-dlp's `--print "%(id)s\t%(title)s"` stdout into rows. Pure/offline.
 * Blank lines are skipped; `NA` (yt-dlp's "field unavailable" sentinel — e.g. a
 * deleted/private video in the flat listing) in either column drops the row.
 */
export function parseYtDlpDiscoveryOutput(stdout: string): DiscoveredVideo[] {
  const out: DiscoveredVideo[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tab = trimmed.indexOf("\t");
    if (tab === -1) continue;
    const id = trimmed.slice(0, tab).trim();
    const title = trimmed.slice(tab + 1).trim();
    if (!id || !title || id === "NA" || title === "NA") continue;
    out.push({ id, title });
  }
  return out;
}

/** Runs yt-dlp with the given args and resolves with stdout. Injectable for tests. */
export type DiscoveryExecRunner = (args: readonly string[]) => Promise<string>;

/**
 * Default runner: spawn yt-dlp, capture stdout. Resolves "" on any failure
 * (missing binary, network, ban, timeout) — never throws — matching every
 * other yt-dlp runner in this package (`youtube.ts`, `youtube-meta.ts`).
 */
const defaultDiscoveryRunner: DiscoveryExecRunner = (args) =>
  new Promise((resolve) => {
    execFile(
      "yt-dlp",
      [...args],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => resolve(err ? "" : stdout),
    );
  });

/** Injectable dependencies for `fetchYouTubeChannelVideos` (all default to real impls). */
export interface FetchYouTubeChannelVideosDeps {
  /** The yt-dlp stdout runner (defaults to a real spawned subprocess). */
  run?: DiscoveryExecRunner;
  /** The shared process-wide pacing gate (defaults to `sharedYtDlpGateInstance()`). */
  gate?: YtDlpGate;
  /** Per-channel discovery cap (defaults to `ytDlpDiscoveryLimit()`). */
  limit?: number;
}

/**
 * Discover a youtube channel's most recent uploads via `yt-dlp --flat-playlist`
 * and map them to valid `FeedItem`s. This is the `Source.fetch` implementation
 * for youtube entries once ALLOW_DIRECT_YOUTUBE + yt-dlp are both available
 * (see `fetchers/build-source.ts`).
 *
 * Fails soft — returns `[]` — when the channel id can't be extracted from the
 * registry URL, when the subprocess throws/times out, or when stdout is empty;
 * never throws. The existing ingest retry/caching handles a soft-failed source
 * exactly like any other empty-result fetch.
 */
export async function fetchYouTubeChannelVideos(
  entry: SourceEntry,
  ctx: FetchContext,
  deps: FetchYouTubeChannelVideosDeps = {},
): Promise<FeedItem[]> {
  const channelId = extractYouTubeChannelId(entry.url);
  if (!channelId) return [];

  const run = deps.run ?? defaultDiscoveryRunner;
  const gate = deps.gate ?? sharedYtDlpGateInstance();
  const limit = deps.limit ?? ytDlpDiscoveryLimit();
  const args = buildYtDlpDiscoveryArgs(channelId, limit);

  let stdout: string;
  try {
    stdout = await gate.run(() => run(args));
  } catch {
    return [];
  }
  if (!stdout) return [];

  const videos = parseYtDlpDiscoveryOutput(stdout);
  const out: FeedItem[] = [];
  for (const v of videos) {
    const url = `https://www.youtube.com/watch?v=${v.id}`;
    const parsed = FeedItemSchema.safeParse({
      id: makeFeedItemId(entry.type, url),
      source: entry.id,
      sourceType: entry.type,
      url,
      title: v.title,
      // No date from --flat-playlist (prints NA) — first-seen time; the
      // downstream enrich step (`fetchYouTubeVideoMeta`) supplies the real
      // upload date if/when it runs. See module doc for why we don't resolve
      // per-video metadata in this hot discovery path.
      publishedAt: ctx.now,
      fetchedAt: ctx.now,
      topics: entry.channels,
      entities: [],
      summary: "",
      media: [],
      trustScore: entry.trustScore,
      kind: "video",
    });
    if (parsed.success) out.push(parsed.data);
  }
  return ctx.limit ? out.slice(0, ctx.limit) : out;
}
