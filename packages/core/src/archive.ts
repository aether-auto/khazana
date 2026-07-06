/**
 * Rolling feed archive — the "treasury" that lets the Feed retain a ~2-week
 * corpus of past stories instead of resetting to whatever the latest ingest
 * snapshot happens to hold.
 *
 * The committed `data/feed/archive.json` is a SMALL, display-only projection of
 * FeedItems seen within the last `ARCHIVE_WINDOW_DAYS`, deduped by `id`. It stores
 * only the fields the Feed surfaces (no full `body`) so the committed file stays
 * bounded. `mergeIntoArchive` is the pure, deterministic decision layer: given the
 * existing archive, a fresh curated snapshot, and "now", it produces the next
 * archive. All I/O lives in `scripts/update-archive.mts`.
 *
 * Aging policy (documented): an item is kept when its `publishedAt` is within the
 * window. Items with no/invalid `publishedAt` fall back to `fetchedAt` for aging;
 * items with neither a usable `publishedAt` nor `fetchedAt` are DROPPED (we can't
 * date them, so we can't keep them in a time-bounded archive).
 */
import type { FeedItem } from "./feed-item.js";
import { cleanSummary } from "./summary.js";

/** The rolling archive window, in days (keep items published within this span). */
export const ARCHIVE_WINDOW_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/**
 * The best usable timestamp (epoch ms) for aging/sorting an item: prefer
 * `publishedAt`, fall back to `fetchedAt`, else `null` (undatable → dropped).
 */
function itemTimeMs(item: FeedItem): number | null {
  const p = Date.parse(item.publishedAt);
  if (!Number.isNaN(p)) return p;
  const f = Date.parse(item.fetchedAt);
  if (!Number.isNaN(f)) return f;
  return null;
}

/**
 * Project a FeedItem down to the small, display-only shape the archive stores:
 * exactly the fields the Feed surfaces, with the summary trimmed to a teaser and
 * the full `body` dropped. The result still satisfies `FeedItemSchema` (body is
 * optional; topics/entities/media default to []).
 */
export function toArchiveItem(item: FeedItem): FeedItem {
  const out: FeedItem = {
    id: item.id,
    source: item.source,
    sourceType: item.sourceType,
    url: item.url,
    title: item.title,
    summary: cleanSummary(item.summary ?? ""),
    topics: item.topics ?? [],
    entities: item.entities ?? [],
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    media: item.media ?? [],
    kind: item.kind,
  };
  if (item.tasteScore !== undefined) out.tasteScore = item.tasteScore;
  if (item.trustScore !== undefined) out.trustScore = item.trustScore;
  if (item.clusterId !== undefined) out.clusterId = item.clusterId;
  return out;
}

/**
 * Merge a fresh curated snapshot into the existing archive and return the next
 * archive:
 *
 *  - UNION by `id`; the FRESH item wins on conflict (so an updated `tasteScore`,
 *    retitle, etc. replaces the stale copy).
 *  - DROP any item older than `now - windowDays` (by `publishedAt`, falling back
 *    to `fetchedAt`); items with no usable timestamp are dropped.
 *  - SORT newest-first.
 *  - TEASER-trim every surviving item via `toArchiveItem` (drops `body`).
 *
 * Pure + deterministic. If `nowISO` is unparseable it fails OPEN on aging (keeps
 * every datable item) so a bad clock never silently empties the archive.
 */
export function mergeIntoArchive(
  existing: readonly FeedItem[],
  fresh: readonly FeedItem[],
  nowISO: string,
  windowDays: number = ARCHIVE_WINDOW_DAYS,
): FeedItem[] {
  const nowMs = Date.parse(nowISO);
  const window = Math.max(0, windowDays);
  const cutoff = Number.isNaN(nowMs) ? null : nowMs - window * MS_PER_DAY;

  // Union by id — fresh overwrites existing on conflict.
  const byId = new Map<string, FeedItem>();
  for (const it of existing) byId.set(it.id, it);
  for (const it of fresh) byId.set(it.id, it);

  const kept: Array<{ item: FeedItem; t: number }> = [];
  for (const it of byId.values()) {
    const t = itemTimeMs(it);
    if (t === null) continue; // undatable → cannot keep in a time-bounded archive
    if (cutoff !== null && t < cutoff) continue; // older than the window → drop
    kept.push({ item: toArchiveItem(it), t });
  }

  kept.sort((a, b) => b.t - a.t); // newest-first
  return kept.map((k) => k.item);
}
