import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FeedItemSchema, type FeedItem } from "@khazana/core";
import { readTimeFromHtml } from "./read-time.js";
import { extractYouTubeId, isYouTubeShort } from "./media.js";

const WORKSHOP_CHANNELS = new Set([
  "ideas",
  "diy",
  "3d-printing",
  "iot",
  "embedded",
  "ai-projects",
]);

/**
 * Load the curated feed from the pipeline-generated `curated.json`
 * (gitignored, produced by `khazana ingest && khazana curate`). When it is
 * absent the feed renders an honest empty state — never fake sample items.
 * Each item is validated with FeedItemSchema; invalid items are dropped
 * (never crash the build). Curated order is preserved.
 */
export function loadCurated(dataDir: string): FeedItem[] {
  const path = join(dataDir, "curated.json");
  if (!existsSync(path)) return [];
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const entry of raw) {
    const parsed = FeedItemSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Items whose `topics` include the channel. `null`/empty channel → all items. */
export function filterByChannel(items: FeedItem[], channel: string | null): FeedItem[] {
  if (!channel) return items;
  return items.filter((it) => it.topics.includes(channel));
}

/**
 * Drop YouTube Shorts from the feed entirely. Shorts (vertical sub-60s clips)
 * are not "best signal" — they're excluded from the bento, the media rails, AND
 * the register tail. Applied ONCE on the full curated list at page level so every
 * downstream selector (featured gate, rails, register) sees a Shorts-free feed.
 * Rank order is preserved.
 */
export function dropShorts(items: FeedItem[]): FeedItem[] {
  return items.filter((it) => !isYouTubeShort(it.url));
}

/**
 * Patterns that mark a "video" item as clearly NON-editorial raw footage rather
 * than signal — e.g. MIT-OCW lab clips ("Pool Testing Video 1 (No Audio)",
 * "River Testing Video"). Deliberately CONSERVATIVE: each pattern targets the
 * specific raw-clip tell ("(no audio)" anywhere; a "<X> testing video" title),
 * so real content that merely mentions a pool/river/test is never dropped.
 */
const JUNK_VIDEO_TITLE = [
  /\(no audio\)/i, // raw clip with the audio stripped — never a real read
  /\btesting video\b/i, // "Pool Testing Video", "River Testing Video" — lab footage
];

/**
 * Drop clearly non-content "video" items (raw lab clips) from the feed. Only
 * `kind === "video"` items are inspected; every other kind passes untouched.
 * Applied ONCE on the full curated list (like `dropShorts`) so junk is gone from
 * the bento, both rails, AND the register. Rank order is preserved.
 */
export function dropJunkVideos(items: FeedItem[]): FeedItem[] {
  return items.filter(
    (it) => it.kind !== "video" || !JUNK_VIDEO_TITLE.some((re) => re.test(it.title)),
  );
}

/**
 * Diversity selector shared by both rails: walk the ranked, already-filtered
 * `pool` and take at most ONE item per `source`, in rank order. This makes a
 * rail span distinct channels/shows — Tifo, Mark Felton, Steve Mould… — instead
 * of stacking several clips from one channel.
 *
 * `limit` is a CAP, not a quota: if there are only a handful of distinct sources
 * the rail is simply that many distinct cards (we never pad a big rail with
 * near-duplicate clips). The one exception is a BACK-FILL when distinct sources
 * fall *just short* of the limit (within `BACKFILL_SLACK`) — there we top the
 * rail off with the next-best remaining items so a nearly-fillable rail isn't
 * left one or two cards short. Rank order is preserved throughout.
 */
const BACKFILL_SLACK = 2;

function pickOnePerSource(pool: FeedItem[], limit: number): FeedItem[] {
  const out: FeedItem[] = [];
  const seen = new Set<string>();
  // Pass 1 — one per distinct source, rank order.
  for (const it of pool) {
    if (out.length >= limit) break;
    if (seen.has(it.source)) continue;
    seen.add(it.source);
    out.push(it);
  }
  // Pass 2 — back-fill only when distinct sources nearly filled the rail (within
  // BACKFILL_SLACK of the cap) AND there's more in the pool to draw from. This
  // tops off a near-full rail without padding a sparse one with duplicates.
  if (out.length < limit && limit - out.length <= BACKFILL_SLACK && out.length < pool.length) {
    const chosen = new Set(out);
    for (const it of pool) {
      if (out.length >= limit) break;
      if (!chosen.has(it)) out.push(it);
    }
  }
  return out;
}

/**
 * Select the top-ranked **video** items for the WATCH rail. Only items that
 * yield a usable YouTube thumbnail (a resolvable `?v=`/`youtu.be` id) are
 * included — a `video` kind with no extractable id has no tile to show, so it's
 * skipped rather than rendered as a broken card. Shorts are assumed already
 * removed by `dropShorts`, but extractYouTubeId returns null for them anyway, so
 * this is doubly safe. At most ONE card per source (channel) for diversity; rank
 * order is preserved; capped at `limit`.
 */
export function selectWatchRail(items: FeedItem[], limit = 12): FeedItem[] {
  const videos = items.filter((it) => it.kind === "video" && extractYouTubeId(it.url) !== null);
  return pickOnePerSource(videos, limit);
}

/**
 * Select the top-ranked **audio** items for the LISTEN rail. At most ONE card
 * per source (show) for diversity; rank order is preserved; capped at `limit`.
 * (Audio cards render a typographic tile — the pipeline currently carries no
 * cover art — so there's no thumbnail gate here.)
 */
export function selectListenRail(items: FeedItem[], limit = 10): FeedItem[] {
  const audio = items.filter((it) => it.kind === "audio");
  return pickOnePerSource(audio, limit);
}

/** Workshop selector: kind=idea OR any buildable-channel topic. */
export function selectIdeas(items: FeedItem[]): FeedItem[] {
  return items.filter(
    (it) => it.kind === "idea" || it.topics.some((t) => WORKSHOP_CHANNELS.has(t)),
  );
}

/** First `n` item titles, for the shell ticker. */
export function tickerTitles(items: FeedItem[], n: number): string[] {
  return items.slice(0, n).map((it) => it.title);
}

/**
 * Split a ranked feed into a small FEATURED showcase + the remaining tail.
 *
 * `curated.json` is already rank-ordered (best first), so the featured set is
 * simply the top `count` items — the freshest/highest-resonance catch. We keep
 * curated order within the featured set (it drives the bento prominence) and the
 * tail stays in rank order for the paginated register below. Pure + ordered so
 * SSR and any client re-render agree.
 *
 * @param count number of items to promote to the featured bento (default 10)
 */
export function splitFeatured(
  items: FeedItem[],
  count = 10,
): { featured: FeedItem[]; rest: FeedItem[] } {
  const n = Math.max(0, Math.min(count, items.length));
  return { featured: items.slice(0, n), rest: items.slice(n) };
}

/**
 * Minimum rendered-on-khazana read time (minutes) to qualify for the featured
 * bento. Applies to ALL content types identically — a YouTube video whose
 * transcript renders to ≥7 min is just as eligible as an article of the same
 * length; a short article is not eligible, exactly like a short clip. Items
 * with no full-text body (link-only / no transcript) have read time ~1 min and
 * inherently fail the gate.
 */
export const FEATURE_MIN_MINUTES = 7;

/**
 * Like `splitFeatured`, but with a content-agnostic HARD GATE: only items
 * whose rendered body produces a reading time of ≥ FEATURE_MIN_MINUTES appear
 * in the featured bento. The check is purely on `readTimeFromHtml(body)` with
 * no branch on `kind` or `sourceType` — a video with a long transcript is
 * featurable; a link-only stub is not.
 *
 * Items failing the gate fall through to the `rest` tail (register) where
 * their media affordances (thumbnail, play glyph, etc.) are still shown.
 * The bento may be smaller than `count` when too few qualifying items exist —
 * we never pad with short items. Rank order is preserved in both arrays.
 */
export function splitFeaturedGated(
  items: FeedItem[],
  count = 10,
): { featured: FeedItem[]; rest: FeedItem[] } {
  const featured: FeedItem[] = [];
  const rest: FeedItem[] = [];

  for (const it of items) {
    if (featured.length < count && it.body && readTimeFromHtml(it.body) >= FEATURE_MIN_MINUTES) {
      featured.push(it);
    } else {
      rest.push(it);
    }
  }

  return { featured, rest };
}
