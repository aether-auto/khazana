import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FeedItemSchema,
  RegistrySchema,
  HARD_MAKER_CHANNELS,
  PURE_MAKER_ALLOWLIST,
  HANDS_ON_MAKER_SOURCES,
  MAKER_EXCLUDE,
  MAKER_THRESHOLD,
  makerScore,
  titleBuildSignal,
  cleanSummary,
  type MakerSets,
  type FeedItem,
} from "@khazana/core";
import { readTimeFromHtml } from "./read-time.js";
import { extractYouTubeId, isYouTubeShort } from "./media.js";
import { filterItems } from "./filter/index.js";

// The maker (Workshop) vocabulary, source sets, scorer, and threshold now live
// in @khazana/core (shared with curate). Re-export the ones the Workshop page /
// tests import from this module so existing call sites stay stable.
export {
  PURE_MAKER_ALLOWLIST,
  HANDS_ON_MAKER_SOURCES,
  MAKER_EXCLUDE,
  WORKSHOP_BROWSE_CHANNELS,
  MAKER_THRESHOLD,
  makerScore,
  type MakerSets,
} from "@khazana/core";

// The feed-summary teaser clamp (`cleanSummary` + `SUMMARY_MAX_CHARS`) now lives in
// @khazana/core so the committed feed archive and the site apply the SAME trim.
// Re-exported here so existing call sites (`import … from "./feed.js"`) stay stable.
export { cleanSummary, SUMMARY_MAX_CHARS } from "@khazana/core";

/**
 * Load the curated feed from the pipeline-generated `curated.json`
 * (gitignored, produced by `khazana ingest && khazana curate`). When it is
 * absent the feed renders an honest empty state — never fake sample items.
 * Each item is validated with FeedItemSchema; invalid items are dropped
 * (never crash the build). Curated order is preserved. Summaries are clamped to
 * a short teaser (see `cleanSummary`) — the raw body/read-time is untouched.
 */
export function loadCurated(dataDir: string): FeedItem[] {
  const path = join(dataDir, "curated.json");
  if (!existsSync(path)) return [];
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const entry of raw) {
    const parsed = FeedItemSchema.safeParse(entry);
    if (parsed.success) out.push({ ...parsed.data, summary: cleanSummary(parsed.data.summary) });
  }
  return out;
}

/**
 * Load the committed rolling feed archive (`archive.json`) — the ~2-week corpus
 * of past stories the daily pipeline commits (see `scripts/update-archive.mts`).
 * Same contract as `loadCurated`: absent file → empty array; each item validated
 * with FeedItemSchema (invalid dropped); summaries clamped to a teaser. The
 * archive stores no `body`, so archived items carry only what the Feed surfaces.
 */
export function loadArchive(dataDir: string): FeedItem[] {
  const path = join(dataDir, "archive.json");
  if (!existsSync(path)) return [];
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const entry of raw) {
    const parsed = FeedItemSchema.safeParse(entry);
    if (parsed.success) out.push({ ...parsed.data, summary: cleanSummary(parsed.data.summary) });
  }
  return out;
}

/**
 * The Feed's corpus: the UNION of the committed archive (DEPTH — past ~2 weeks)
 * and the fresh curated snapshot (RECENCY — this run's ingest), deduped by `id`.
 *
 * The FRESH curated item wins on conflict and keeps its rank position (curated
 * order first), so the featured bento / rails — which draw from the top of the
 * list — are unchanged. Archive-only items (older stories no longer in the latest
 * snapshot) are appended after, landing in the register/firehose tail so past
 * stories persist instead of vanishing when ingest churns.
 *
 * Degrades exactly to today's behavior when the archive is absent/empty: it
 * simply returns `loadCurated(dataDir)`.
 */
export function loadFeed(dataDir: string): FeedItem[] {
  const fresh = loadCurated(dataDir);
  const archive = loadArchive(dataDir);
  if (archive.length === 0) return fresh;
  const seen = new Set(fresh.map((it) => it.id));
  const archiveOnly = archive.filter((it) => !seen.has(it.id));
  return [...fresh, ...archiveOnly];
}

/** Items whose `topics` include the channel. `null`/empty channel → all items. */
export function filterByChannel(items: FeedItem[], channel: string | null): FeedItem[] {
  return filterItems(items, (it) => it.topics, channel ? [channel] : []);
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

/**
 * Bucket a ranked feed into per-channel Maps. Each item is assigned to its
 * PRIMARY topic (first entry in `topics`). Items with no topics are skipped.
 * Rank order within each bucket is preserved.
 *
 * This feeds the category-browse rows on the feed page — callers can filter
 * to channels with enough items (e.g. ≥ 3) before rendering rails.
 */
export function bucketByChannel(items: FeedItem[]): Map<string, FeedItem[]> {
  const map = new Map<string, FeedItem[]>();
  for (const it of items) {
    const primary = it.topics[0];
    if (!primary) continue;
    const bucket = map.get(primary);
    if (bucket) {
      bucket.push(it);
    } else {
      map.set(primary, [it]);
    }
  }
  return map;
}

/**
 * Build the maker-source sets from the source registry. Reads the live
 * `sources.json` if present, else falls back to the tracked `sources.seed.json`.
 * Build-time only (SSR), so fs reads are fine. Degrades gracefully to empty sets
 * if neither file exists or the JSON is unparseable — the page still builds, the
 * scorer just leans on the PURE allowlist + content signal alone.
 *
 * @param repoDataDir absolute path to the repo `data/` root (parent of `data/feed`)
 */
export function loadMakerSets(repoDataDir: string): MakerSets {
  const hard = new Set<string>();
  const livePath = join(repoDataDir, "sources.json");
  const seedPath = join(repoDataDir, "sources.seed.json");
  const path = existsSync(livePath) ? livePath : seedPath;
  if (existsSync(path)) {
    try {
      const parsed = RegistrySchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
      if (parsed.success) {
        for (const src of parsed.data.sources) {
          if (src.channels.some((c) => HARD_MAKER_CHANNELS.has(c))) hard.add(src.id);
        }
      }
    } catch {
      // Unparseable registry — degrade to PURE allowlist + content signal only.
    }
  }
  return { pure: PURE_MAKER_ALLOWLIST, hard, exclude: MAKER_EXCLUDE };
}

/**
 * Directed Workshop selector: keep only genuinely BUILDABLE maker items (DIY,
 * 3D-printing, IoT, embedded, buildable AI-projects), NOT feed essays/op-eds.
 *
 * Replaces the old loose "kind=idea OR any maker-channel tag" filter, which
 * trusted a single noisy LLM channel tag and let the `ideas` essay channel pull
 * in ~116 think-pieces. This scores each item with `makerScore` and includes only
 * those at/above `MAKER_THRESHOLD`. Sorted by score desc, tiebreak `tasteScore`
 * desc. Pure — pass `sets` from `loadMakerSets`.
 *
 * SHORT-ITEM GUARD (curate now keeps 3–5 min maker items so they can reach the
 * Workshop): an item whose RENDERED read time is below MIN_FEED_MINUTES (5) only
 * qualifies if it sits in a genuine maker BUILD context — either it comes from a
 * HANDS-ON build source (`HANDS_ON_MAKER_SOURCES`, where a short post is real
 * maker signal on its own, even with a keyword-free title like "Prusament PLA
 * High Speed" or "LEAP"), OR it carries a `titleBuildSignal`. This keeps the
 * Workshop loose ("mostly signal") while keeping maker INDUSTRY/NEWS product
 * announcements ("$449 CHUWI laptop") — which score ≥3 on the source bonus but
 * come from non-hands-on sources with no build title — off the board. Items
 * ≥5 min keep the plain `score >= MAKER_THRESHOLD` rule unchanged.
 */
export function selectIdeas(items: FeedItem[], sets: MakerSets): FeedItem[] {
  return items
    .map((item) => ({ item, score: makerScore(item, sets) }))
    .filter(({ item, score }) => {
      if (score < MAKER_THRESHOLD) return false;
      // Short items (sub-Feed-floor) must sit in a build context: a hands-on
      // maker source, or a genuine build tell in the title.
      if (readTimeFromHtml(item.body) < MIN_FEED_MINUTES) {
        return HANDS_ON_MAKER_SOURCES.has(item.source) || titleBuildSignal(item, sets);
      }
      return true;
    })
    .sort((a, b) => b.score - a.score || (b.item.tasteScore ?? 0) - (a.item.tasteScore ?? 0))
    .map(({ item }) => item);
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

/** Minimum read time (minutes) for an item to appear in a category browse row. */
export const CATEGORY_MIN_MINUTES = 5;

/**
 * The SACRED Feed floor (minutes). Curate now keeps short (3–5 min) maker items
 * in `curated.json` so they can reach the Workshop — but the Feed must remain a
 * ≥5-min surface. This guard is applied ONCE on the full curated list (before
 * splitting into bento / rails / register) so EVERY Feed surface — including the
 * register/firehose, which has no read-time gate of its own — drops sub-5-min
 * items. Bare-link / no-body items follow existing behavior (they have no body to
 * measure and have always reached the register), so only items WITH a body that
 * renders below this floor are removed. The Workshop reads the unfiltered curated
 * list directly, so its relaxed maker items are unaffected.
 */
export const MIN_FEED_MINUTES = 5;

/**
 * Drop items whose rendered body reads below MIN_FEED_MINUTES from the Feed.
 * No-body items (bare links, transcript-less video/audio) are KEPT — matching the
 * Feed's long-standing behavior; the floor only removes short full-text items that
 * curate's relaxed maker floor newly admits to `curated.json`. Rank order preserved.
 *
 * @param readMinutesOf optional precomputed read-time accessor. Callers that
 * already computed each item's read time once (the Feed page does, keyed by
 * id) can pass it here so this gate re-parses no HTML. Defaults to computing
 * straight from `readTimeFromHtml(item.body)`, preserving prior behavior for
 * callers that don't have a precomputed value (e.g. tests).
 */
export function dropBelowFeedFloor(
  items: FeedItem[],
  readMinutesOf: (item: FeedItem) => number = (it) => readTimeFromHtml(it.body),
): FeedItem[] {
  return items.filter((it) => !it.body || readMinutesOf(it) >= MIN_FEED_MINUTES);
}

/**
 * The featured-bento eligibility gate, shared by `splitFeaturedGated` and
 * `selectBalancedBento` so the two selectors can never disagree on WHICH
 * items are allowed into the hero — only on how they're ordered/interleaved.
 * Content-agnostic: a video with a long transcript is exactly as featurable
 * as an article of equal length; a link-only stub or a short item is not.
 */
function isFeatureEligible(
  it: FeedItem,
  readMinutesOf: (item: FeedItem) => number,
): boolean {
  return Boolean(it.body) && readMinutesOf(it) >= FEATURE_MIN_MINUTES;
}

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
 *
 * @param readMinutesOf optional precomputed read-time accessor — see
 * `dropBelowFeedFloor`'s doc for why/how the Feed page supplies this instead
 * of letting the gate re-parse each item's body.
 */
export function splitFeaturedGated(
  items: FeedItem[],
  count = 10,
  readMinutesOf: (item: FeedItem) => number = (it) => readTimeFromHtml(it.body),
): { featured: FeedItem[]; rest: FeedItem[] } {
  const featured: FeedItem[] = [];
  const rest: FeedItem[] = [];

  for (const it of items) {
    if (featured.length < count && isFeatureEligible(it, readMinutesOf)) {
      featured.push(it);
    } else {
      rest.push(it);
    }
  }

  return { featured, rest };
}

// ── Channel-balanced bento (selectBalancedBento) ──────────────────────────────
//
// Ground truth this fixes: the curated feed is ~337 items, but the pure-rank
// bento (`splitFeaturedGated`) let high-volume channels (tech/ai) crowd out
// healthy-sized but lower-scoring channels — e.g. history's ~68 items (≈20%
// of the corpus) rarely cracked the top 30 and got relegated entirely to the
// below-the-fold "browse by topic" rails. `selectBalancedBento` reshapes
// WHICH eligible items land in the hero, without ever touching eligibility
// itself or WITHIN-channel ordering.

/**
 * Maximum share of the hero bento a single channel may occupy, as a fraction
 * of `count`. Applies to the channel's TOTAL presence (the single hero
 * feature slot + its mosaic-body picks combined) — without this cap a
 * dominant channel would fill nearly the whole mosaic on pure rank alone.
 * 0.34 ≈ "no more than about a third of the hero," tuned to comfortably beat
 * a single high-volume channel's natural share of a ~337-item corpus while
 * still leaving most of the bento to be filled by its own best items.
 */
export const BENTO_CHANNEL_CAP_RATIO = 0.34;

/**
 * The minimum number of hero slots a channel is structurally guaranteed once
 * it has at least this many eligible items AND `count` is at least the
 * number of distinct channels present in the eligible pool. Not enforced by
 * a standalone check — it falls out of `selectBalancedBento`'s "always give
 * the next slot to whichever channel currently has the FEWEST bento picks"
 * scheduler: every channel with eligible content gets a turn before any
 * channel gets a second one, so nobody with real signal is shut out.
 */
export const BENTO_CHANNEL_FLOOR = 1;

/**
 * Select the top `count` items for the Feed's hero bento, BALANCED across
 * channels instead of pure global rank — so under-represented channels
 * (history, geopolitics, geography, quantum, diy…) surface in the showcase
 * instead of being crowded out by high-volume channels (tech, ai).
 *
 * Semantics:
 *  - Eligibility is IDENTICAL to `splitFeaturedGated` (`isFeatureEligible`):
 *    an item must have a body rendering to ≥ FEATURE_MIN_MINUTES. Nothing
 *    ineligible is ever promoted for diversity's sake.
 *  - The single HERO FEATURE slot (bento index 0, rendered full-width by
 *    `assignBento`) is always the top-ranked eligible item overall — exactly
 *    what `splitFeaturedGated` picked before. Balancing only reshapes the
 *    mosaic BODY beneath it.
 *  - The body is filled by a fair round-robin scheduler over
 *    `bucketByChannel` of the remaining eligible pool (each bucket is already
 *    rank-sorted): at every step, the slot goes to whichever channel
 *    currently has the FEWEST bento picks so far (ties broken by the order
 *    each channel's best item appears in the global ranking), taking that
 *    channel's next-best UNUSED item. This guarantees every channel with
 *    eligible content gets a turn before any channel gets a second pick,
 *    while leftover budget still favors higher-quality/volume channels once
 *    every channel has had an equal share.
 *  - `BENTO_CHANNEL_CAP_RATIO` bounds a channel's TOTAL share (feature +
 *    body). The scheduler only offers slots to under-cap channels; a
 *    channel at its cap is skipped in favor of any other channel with
 *    content left.
 *  - Cap relaxation is the LAST resort: if every channel with remaining
 *    items is already at cap (too little diversity to fill `count` any
 *    other way), the scheduler keeps going — still fair, least-filled-first
 *    — rather than leaving the hero short. `count` is honored whenever
 *    enough eligible items exist; diversity is best-effort, never at the
 *    cost of an emptier hero.
 *  - Within a channel, items are always taken in rank order — only the
 *    CROSS-channel interleaving changes, so per-channel quality is untouched.
 *  - Pure and deterministic: same input → same output.
 *
 * @param readMinutesOf optional precomputed read-time accessor (see
 * `dropBelowFeedFloor`) — pass the Feed page's precomputed map so this never
 * re-parses a body's HTML.
 * @param opts.channelCapRatio override for `BENTO_CHANNEL_CAP_RATIO` (tests).
 */
export function selectBalancedBento(
  items: FeedItem[],
  count: number,
  readMinutesOf: (item: FeedItem) => number = (it) => readTimeFromHtml(it.body),
  opts: { channelCapRatio?: number } = {},
): FeedItem[] {
  const eligible = items.filter((it) => isFeatureEligible(it, readMinutesOf));
  const n = Math.max(0, Math.min(count, eligible.length));
  if (n === 0) return [];

  const feature = eligible[0]!;
  const pool = eligible.slice(1);
  if (n === 1 || pool.length === 0) return eligible.slice(0, n);

  const bodyTarget = n - 1;
  const capRatio = opts.channelCapRatio ?? BENTO_CHANNEL_CAP_RATIO;
  const cap = Math.max(1, Math.round(count * capRatio));

  // Each bucket is rank-sorted (bucketByChannel preserves `pool`'s order);
  // Map insertion order = the order each channel's best item first appears
  // in the global ranking — used only as the tie-break below.
  const buckets = bucketByChannel(pool);
  const channelOrder = [...buckets.keys()];
  const channelRank = new Map(channelOrder.map((ch, i) => [ch, i]));
  const pointer = new Map(channelOrder.map((ch) => [ch, 0]));
  const picks = new Map<string, number>();
  const featureChannel = feature.topics[0];
  if (featureChannel) picks.set(featureChannel, 1);

  const remaining = (ch: string) => buckets.get(ch)!.length - (pointer.get(ch) ?? 0);
  const body: FeedItem[] = [];

  while (body.length < bodyTarget) {
    let candidates = channelOrder.filter((ch) => remaining(ch) > 0 && (picks.get(ch) ?? 0) < cap);
    if (candidates.length === 0) {
      // No under-cap channel has content left — relax the cap so `count` can
      // still be honored (see doc above). Still fair: least-filled first.
      candidates = channelOrder.filter((ch) => remaining(ch) > 0);
    }
    if (candidates.length === 0) break; // pool truly exhausted

    candidates.sort((a, b) => {
      const byPicks = (picks.get(a) ?? 0) - (picks.get(b) ?? 0);
      return byPicks !== 0 ? byPicks : channelRank.get(a)! - channelRank.get(b)!;
    });
    const ch = candidates[0]!;
    const idx = pointer.get(ch)!;
    const chosen = buckets.get(ch)![idx]!;
    pointer.set(ch, idx + 1);
    picks.set(ch, (picks.get(ch) ?? 0) + 1);
    body.push(chosen);
  }

  return [feature, ...body];
}
