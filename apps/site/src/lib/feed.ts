import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FeedItemSchema, RegistrySchema, type FeedItem } from "@khazana/core";
import { readTimeFromHtml } from "./read-time.js";
import { extractYouTubeId, isYouTubeShort } from "./media.js";

/**
 * The HARD maker channels — sources that DECLARE one of these (in the registry)
 * are makers by intent. NOTE: `ai-projects` is a *browse* channel for the
 * Workshop UI but deliberately NOT a hard maker channel here: lots of "ai-projects"
 * tagged items are research/essays, so we don't grant the hard-source bonus on it
 * (a real AI build still earns its place via the PURE allowlist or a title build
 * signal). `ideas` is an ESSAY channel and is intentionally absent — it must never
 * pull an item into the Workshop on its own.
 */
const HARD_MAKER_CHANNELS = new Set(["diy", "3d-printing", "iot", "embedded"]);

/** Maker browse channels the Workshop UI filters by (display order). */
export const WORKSHOP_BROWSE_CHANNELS = [
  "diy",
  "3d-printing",
  "iot",
  "embedded",
  "ai-projects",
] as const;

/**
 * Source ids that publish (near-)exclusively buildable hardware/maker content.
 * Hand-curated — a strong, deterministic positive signal independent of the noisy
 * per-item LLM channel tags. Membership grants the largest single score bonus.
 */
export const PURE_MAKER_ALLOWLIST = new Set<string>([
  "hackaday",
  "hackaday-io",
  "hackaday-home-automation",
  "adafruit-blog",
  "sparkfun-blog",
  "make-magazine",
  "hackster-io-blog",
  "instructables-3d-printing",
  "all3dp",
  "prusa-blog",
  "3dprintingindustry",
  "3dprintingmedia",
  "voxelmatters",
  "arduino-blog",
  "raspberry-pi-blog",
  "random-nerd-tutorials",
  "espressif-blog",
  "digikey-tech-forum",
  "cnx-software-blog",
  "linuxgizmos-blog",
  "low-tech-magazine",
  "r-3dprinting",
  "r-functionalprint",
  "r-diyelectronics",
  "r-raspberry-pi",
  "r-homeautomation",
  "r-iot",
  "r-embedded",
]);

/**
 * Source ids that DECLARE a maker channel (so they look like makers) but in
 * practice publish CS-theory / industry / AI-research — pure board pollution.
 * Items from these are forced below threshold UNLESS the TITLE carries a genuine
 * build signal (which is still counted, never zeroed — so a real hands-on build
 * from one of these can earn its way back).
 */
export const MAKER_EXCLUDE = new Set<string>([
  "ieee-spectrum-tech",
  "matklad-blog",
  "ryg-blog",
  "sigarch-blog",
  "servethehome",
  "regehr-embedded-academia",
]);

/**
 * STRONG hardware/maker vocabulary — physical-build tells that are buildable on
 * their own (an "ESP32 …" or "3D-printed …" title is unambiguously a maker
 * project). Word-boundaried + case-insensitive. This signal alone is worth the
 * full title bonus.
 */
const HARDWARE_SIGNAL =
  /\b(?:DIY|3D[- ]?print(?:ed|ing|er)?s?|PCB|solder(?:ing|ed)?|breadboard|Arduino|Raspberry[- ]?Pi|ESP32|ESP8266|STM32|microcontroller|firmware|enclosure|schematic|servo|teardown|laser[- ]?cut|CNC|filament|gcode|breakout[- ]?board|GPIO|I2C|SPI|home[- ]?(?:automation|assistant)|self[- ]?host(?:ed|ing)?)\b/i;

/**
 * WEAK generic-build vocabulary — verbs like "build"/"made"/"how-to" that ALSO
 * appear all over op-eds ("Building the Intelligence Community", "How stock
 * options made him a millionaire"). These count ONLY when corroborated by a maker
 * context (a hard maker tag, an ai-projects tag, or a maker source) — never on
 * their own. `make` is matched only as a whole word, so it never hits "marketing".
 */
const WEAK_BUILD_SIGNAL =
  /\b(?:build|built|builds|building|makes?|making|made|CAD|wiring|sensor|robot|how[- ]?to|tutorial|project|kit|hack|mod|flash(?:ing)?|retrofit)\b/i;

/** Essay/think-piece channels — domination by these signals an op-ed, not a build. */
const THINK_PIECE_CHANNELS = new Set(["politics", "history", "geopolitics", "finance", "ideas"]);

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
 * The registry-derived source sets the maker scorer needs. Passing these in
 * keeps `makerScore` / `selectIdeas` PURE and unit-testable (no fs in the hot
 * path). Build them once per page with `loadMakerSets(repoDataDir)`.
 */
export interface MakerSets {
  /** Hand-curated source ids that are (near-)exclusively buildable maker content. */
  pure: Set<string>;
  /** Source ids whose declared registry channels intersect the hard maker set. */
  hard: Set<string>;
  /** Source ids that look like makers but pollute the board with theory/industry. */
  exclude: Set<string>;
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

/** Does the item have a maker context — a hard maker tag or a maker source? */
function hasMakerContext(item: FeedItem, sets: MakerSets): boolean {
  return (
    item.topics.some((t) => HARD_MAKER_CHANNELS.has(t) || t === "ai-projects") ||
    sets.pure.has(item.source) ||
    sets.hard.has(item.source)
  );
}

/**
 * Strength of the TITLE build signal (0 = none): a strong hardware tell counts on
 * its own; a weak generic-build verb counts ONLY when the item already sits in a
 * maker context (hard tag / ai-projects / maker source) so op-eds that merely use
 * the word "build" don't qualify.
 */
function titleBuildSignal(item: FeedItem, sets: MakerSets): boolean {
  if (HARDWARE_SIGNAL.test(item.title)) return true;
  return WEAK_BUILD_SIGNAL.test(item.title) && hasMakerContext(item, sets);
}

/**
 * Does the item carry an essay/think-piece signature? True when its topics are
 * DOMINATED by think-piece channels (politics/history/geopolitics/finance/ideas)
 * AND it has no hard maker channel tag and no title build signal — i.e. it's an
 * op-ed, not a build.
 */
function isThinkPiece(item: FeedItem, sets: MakerSets): boolean {
  const topics = item.topics;
  if (topics.length === 0) return false;
  const thinky = topics.filter((t) => THINK_PIECE_CHANNELS.has(t)).length;
  const hasHardTag = topics.some((t) => HARD_MAKER_CHANNELS.has(t));
  return thinky > topics.length / 2 && !hasHardTag && !titleBuildSignal(item, sets);
}

/**
 * Deterministic, $0, no-LLM **buildability score** for a feed item. Higher =
 * more clearly a buildable maker project. The scoring model (see the Workshop
 * spec):
 *
 *   +3  source ∈ PURE_MAKER_ALLOWLIST          (exclusively-maker source)
 *   +1  source ∈ HARD_MAKER_SOURCES            (declares a hard maker channel)
 *   +2  TITLE build signal · +1 SUMMARY build signal
 *   +3  kind === "idea"                         (a synthesized buildable idea)
 *   −5  source ∈ EXCLUDE                        (theory/industry pollution)
 *   −3  think-piece penalty                     (op-ed signature)
 *
 * The EXCLUDE penalty and the title/summary content signal are INDEPENDENT —
 * an excluded source with a genuine hands-on build title still gets the +2, so a
 * real build can (rarely) climb back, but a false maker tag alone cannot.
 */
export function makerScore(item: FeedItem, sets: MakerSets): number {
  let score = 0;
  if (sets.pure.has(item.source)) score += 3;
  if (sets.hard.has(item.source)) score += 1;
  if (titleBuildSignal(item, sets)) score += 2;
  // Summary signal is weak corroboration only — a strong hardware term in the
  // summary (rare on its own without the title) nudges the score by +1.
  if (item.summary && HARDWARE_SIGNAL.test(item.summary)) score += 1;
  if (item.kind === "idea") score += 3;
  if (sets.exclude.has(item.source)) score -= 5;
  if (isThinkPiece(item, sets)) score -= 3;
  return score;
}

/** Inclusion threshold — at/above this, an item is a Workshop-worthy build. */
export const MAKER_THRESHOLD = 3;

/**
 * Directed Workshop selector: keep only genuinely BUILDABLE maker items (DIY,
 * 3D-printing, IoT, embedded, buildable AI-projects), NOT feed essays/op-eds.
 *
 * Replaces the old loose "kind=idea OR any maker-channel tag" filter, which
 * trusted a single noisy LLM channel tag and let the `ideas` essay channel pull
 * in ~116 think-pieces. This scores each item with `makerScore` and includes only
 * those at/above `MAKER_THRESHOLD`. Sorted by score desc, tiebreak `tasteScore`
 * desc. Pure — pass `sets` from `loadMakerSets`.
 */
export function selectIdeas(items: FeedItem[], sets: MakerSets): FeedItem[] {
  return items
    .map((item) => ({ item, score: makerScore(item, sets) }))
    .filter(({ score }) => score >= MAKER_THRESHOLD)
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
