import type { FeedItem } from "./feed-item.js";

/**
 * Shared maker (Workshop) contract. Lives in @khazana/core because BOTH curate
 * (the keep-decision floor) and the site (the Workshop ranking signal) must
 * agree on ONE definition of "is this a buildable maker item" — no duplication.
 *
 * Two distinct signals live here:
 *   - `isMakerCandidate` — REGISTRY-FREE keep-decision used by curate to relax
 *     the read-time floor for maker items. Coarse on purpose (curate has no
 *     source registry to consult).
 *   - `makerScore` — the source-anchored RANKING signal the Workshop uses to
 *     pick + order builds (needs registry-derived `MakerSets`).
 */

/**
 * The HARD maker channels — sources that DECLARE one of these (in the registry)
 * are makers by intent. NOTE: `ai-projects` is a *browse* channel for the
 * Workshop UI but deliberately NOT a hard maker channel here: lots of "ai-projects"
 * tagged items are research/essays, so we don't grant the hard-source bonus on it
 * (a real AI build still earns its place via the PURE allowlist or a title build
 * signal). `ideas` is an ESSAY channel and is intentionally absent — it must never
 * pull an item into the Workshop on its own.
 */
export const HARD_MAKER_CHANNELS = new Set(["diy", "3d-printing", "iot", "embedded"]);

/** Maker browse channels the Workshop UI filters by (display order). */
export const WORKSHOP_BROWSE_CHANNELS = [
  "diy",
  "3d-printing",
  "iot",
  "embedded",
  "ai-projects",
] as const;

/**
 * HANDS-ON maker sources — build blogs whose posts are (near-)always real
 * hands-on projects. A SHORT item from one of these is genuine maker signal on
 * its OWN (no title keyword required), so `selectIdeas` lets sub-5-min items from
 * these onto the Workshop board directly. This is the looser "mostly signal"
 * Workshop the founder wants, without re-admitting industry/news.
 */
export const HANDS_ON_MAKER_SOURCES = new Set<string>([
  "hackaday",
  "hackaday-io",
  "hackaday-home-automation",
  "adafruit-blog",
  "adafruit-blog-2",
  "sparkfun-blog",
  "make-magazine",
  "hackster-io-blog",
  "instructables-3d-printing",
  "prusa-blog",
  "prusa-blog-2",
  "arduino-blog",
  "arduino-blog-2",
  "raspberry-pi-blog",
  "random-nerd-tutorials",
  "espressif-blog",
  "pimoroni-blog",
  "bambulab-blog",
  "tindie-blog",
  "bald-engineer",
  "big-mess-o-wires",
  "voltlog",
  "notes-and-volts",
  "jeff-geerling-blog",
  "recantha-pi-pod",
  "bantam-tools-blog",
  "partsnotincluded",
  "diy-photography",
  "predictable-designs",
  "electronics-lab",
  "opensource-ecology",
  "r-3dprinting",
  "r-functionalprint",
  "r-diyelectronics",
  "r-raspberry-pi",
  "r-homeautomation",
  "r-iot",
  "r-embedded",
]);

/**
 * MAKER INDUSTRY / NEWS sources — they cover the maker world (and earn the full
 * +3 source bonus in `makerScore`) but publish news, product announcements, and
 * roundups, not hands-on builds. A SHORT item from one of these still needs a
 * genuine `titleBuildSignal` to reach the Workshop board (see `selectIdeas`).
 */
export const MAKER_INDUSTRY_SOURCES = new Set<string>([
  "cnx-software-blog",
  "linuxgizmos-blog",
  "3dprintingindustry",
  "3dprintingmedia",
  "voxelmatters",
  "all3dp",
  "digikey-tech-forum",
  "low-tech-magazine",
  "hardwarebee",
  "ieee-spectrum-diy",
  "toms-hardware-all",
  "makezine-maker-news",
  "raspberrypi-news",
  "magpi-magazine",
  "robohub",
]);

/**
 * Source ids that publish (near-)exclusively buildable hardware/maker content —
 * the UNION of the hands-on build blogs and the maker industry/news sources.
 * Hand-curated — a strong, deterministic positive signal independent of the noisy
 * per-item LLM channel tags. Membership grants the largest single score bonus
 * (+3 in `makerScore`); the hands-on vs industry SPLIT only affects the short-item
 * Workshop rule, never the score.
 */
export const PURE_MAKER_ALLOWLIST = new Set<string>([
  ...HANDS_ON_MAKER_SOURCES,
  ...MAKER_INDUSTRY_SOURCES,
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
export const HARDWARE_SIGNAL =
  /\b(?:DIY|3D[- ]?print(?:ed|ing|er)?s?|PCB|solder(?:ing|ed)?|breadboard|Arduino|Raspberry[- ]?Pi|ESP32|ESP8266|STM32|microcontroller|firmware|enclosure|schematic|servo|teardown|laser[- ]?cut|CNC|filament|gcode|breakout[- ]?board|GPIO|I2C|SPI|home[- ]?(?:automation|assistant)|self[- ]?host(?:ed|ing)?)\b/i;

/**
 * WEAK generic-build vocabulary — verbs like "build"/"made"/"how-to" that ALSO
 * appear all over op-eds ("Building the Intelligence Community", "How stock
 * options made him a millionaire"). These count ONLY when corroborated by a maker
 * context (a hard maker tag, an ai-projects tag, or a maker source) — never on
 * their own. `make` is matched only as a whole word, so it never hits "marketing".
 */
export const WEAK_BUILD_SIGNAL =
  /\b(?:build|built|builds|building|makes?|making|made|CAD|wiring|sensor|robot|how[- ]?to|tutorial|project|kit|hack|mod|flash(?:ing)?|retrofit)\b/i;

/** Essay/think-piece channels — domination by these signals an op-ed, not a build. */
export const THINK_PIECE_CHANNELS = new Set([
  "politics",
  "history",
  "geopolitics",
  "finance",
  "ideas",
]);

/** Inclusion threshold — at/above this, an item is a Workshop-worthy build. */
export const MAKER_THRESHOLD = 3;

/**
 * Relaxed read-time floor (minutes) for MAKER items only. The Workshop is "mostly
 * signal", so short 3–5 min maker tutorials are welcome there — curate keeps them
 * when `isMakerCandidate` is true, even though the Feed's sacred floor stays at
 * MIN_READ_MINUTES (5). Items below this are still rejected outright.
 */
export const MAKER_MIN_READ_MINUTES = 3;

/**
 * The registry-derived source sets the maker scorer needs. Passing these in
 * keeps `makerScore` PURE and unit-testable (no fs in the hot path). The site
 * builds them once per page from the source registry; curate has no registry, so
 * it uses `isMakerCandidate` instead of `makerScore` for its keep decision.
 */
export interface MakerSets {
  /** Hand-curated source ids that are (near-)exclusively buildable maker content. */
  pure: Set<string>;
  /** Source ids whose declared registry channels intersect the hard maker set. */
  hard: Set<string>;
  /** Source ids that look like makers but pollute the board with theory/industry. */
  exclude: Set<string>;
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
 * Strength of the TITLE build signal: a strong hardware tell counts on its own;
 * a weak generic-build verb counts ONLY when the item already sits in a maker
 * context (hard tag / ai-projects / maker source) so op-eds that merely use the
 * word "build" don't qualify.
 */
export function titleBuildSignal(item: FeedItem, sets: MakerSets): boolean {
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

/**
 * REGISTRY-FREE keep-decision: is this item plausibly a maker item, using only
 * the static PURE allowlist + the item's own topic tags? Curate has no source
 * registry, so this is the signal it uses to RELAX the read-time floor (down to
 * MAKER_MIN_READ_MINUTES) for short maker tutorials. Intentionally coarse — the
 * fine-grained, source-anchored `makerScore` still gates the Workshop board.
 *
 * True if `source ∈ PURE_MAKER_ALLOWLIST` OR `topics` intersects HARD_MAKER_CHANNELS.
 */
export function isMakerCandidate(item: FeedItem): boolean {
  if (PURE_MAKER_ALLOWLIST.has(item.source)) return true;
  return item.topics.some((t) => HARD_MAKER_CHANNELS.has(t));
}
