import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FeedItemSchema, type FeedItem } from "@khazana/core";
import { readTimeFromHtml } from "./read-time.js";

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
