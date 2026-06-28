// Build-time candidate serialization for the Calibration Bench. PURE +
// deterministic. The page ships ~300 curated items to the rerank island, but
// inlining real article bodies would bloat the payload (9 MB+). Instead each item
// carries a SYNTHETIC body sized so core's read-time / full-text math produces the
// EXACT same verdicts as the real body — keeping the client rerank parity-exact
// (it always scores through `@khazana/core`) while the wire payload stays tiny.
//
// The two invariants the synthetic body must reproduce (core/scoring.ts):
//   • readTimeMinutes(body) === readMin   (Math.round(words / FEED_WPM))
//   • hasFullText(body)     === hasFullText (plain-text length > MIN_FULLTEXT_CHARS)
import {
  readTimeMinutes,
  hasFullText,
  isTranscriptlessMedia,
  FEED_WPM,
  MIN_FULLTEXT_CHARS,
  type FeedItem,
  type ItemKind,
} from "@khazana/core";
import { channelGroup } from "../../observatory/lib/build-analytics.js";
import type { RerankItem } from "./rerank.js";

/** The structural subset of a curated FeedItem the page reads at build time. */
export interface CuratedInput {
  id: string;
  title: string;
  topics: string[];
  entities: string[];
  publishedAt: string;
  trustScore?: number;
  metrics?: { score?: number; comments?: number };
  clusterId?: string;
  kind: ItemKind;
  source: string;
  url: string;
  body?: string;
}

// Read-time counts WORDS; full-text counts plain-text CHARS. The two are coupled
// through the body, so to hit an arbitrary (readMin, hasFullText) pair we control
// them independently: a SHORT one-char token keeps char length low for a given
// word count (so a many-word / non-full-text body stays under MIN_FULLTEXT_CHARS),
// and ONE long pad word raises char length past the threshold when full text IS
// wanted — without disturbing the rounded minute.
const WORD_TOKEN = "w"; // one char + one space ≈ 2 chars/word → 225 words ≈ 450 chars (< 800)
const PAD_CHAR = "x";

/**
 * Build a synthetic body whose core read-time === `readMin` and whose core
 * full-text verdict === `wantsFullText`. Media items (no transcript) get an empty
 * body so `isTranscriptlessMedia` keys off the item's kind downstream.
 *
 * Strategy:
 *   • `readMin` words of a fixed token → readTimeMinutes rounds to exactly readMin
 *     (words = readMin × FEED_WPM, and round(readMin×225 / 225) === readMin).
 *   • If full text is wanted but those words don't reach MIN_FULLTEXT_CHARS, append
 *     ONE long padding word (no extra word boundary impact on the rounded minute,
 *     since a single extra token at high word counts can't shift the rounding, and
 *     at low counts we size the pad token itself, not the count).
 */
export function syntheticBody(
  readMin: number,
  wantsFullText: boolean,
  isMedia: boolean,
): string {
  if (isMedia) return ""; // transcript-less media — no body, keeps readMin 0
  if (readMin <= 0 && !wantsFullText) return "";

  // `readMin × FEED_WPM` words round-trip to exactly `readMin` minutes.
  const wordCount = Math.max(readMin * FEED_WPM, wantsFullText ? 1 : 0);
  // Build the word body. We append ONE padding word to carry full-text length so
  // the word COUNT only rises by 1 — at any readMin the rounded minute is stable
  // because the pad word's effect (±1 word) is far inside FEED_WPM's rounding band.
  const words: string[] = [];
  const baseWords = wantsFullText ? Math.max(wordCount - 1, 0) : wordCount;
  for (let i = 0; i < baseWords; i++) words.push(WORD_TOKEN);

  if (wantsFullText) {
    // The body's plain-text length must exceed MIN_FULLTEXT_CHARS. Compute the
    // current length (words joined by single spaces) and size ONE pad word to
    // close the gap, so chars > threshold while words stays baseWords + 1.
    const joinedLen = words.length > 0 ? words.join(" ").length : 0;
    // +1 for the space before the pad word; target a comfortable margin over the
    // threshold so rounding/whitespace handling can't leave us a char short.
    const needed = MIN_FULLTEXT_CHARS + 64 - joinedLen;
    const padLen = Math.max(needed, 1);
    words.push(PAD_CHAR.repeat(padLen));
  }

  return words.join(" ");
}

/** Map an item to its primary channel (first topic) with a stable fallback. */
function primaryChannel(topics: string[]): string {
  return topics[0] ?? "tech";
}

/**
 * Serialize one curated item into a RerankItem the bench ships to the client:
 * precompute readMin / hasFullText / isMedia via core from the REAL body, then
 * replace the body with a synthetic one of identical scoring weight. `href` is the
 * in-app reader route; `group` is the Observatory channel group for coloring.
 */
export function serializeCandidate(input: CuratedInput, base: string): RerankItem {
  const item = {
    body: input.body,
    kind: input.kind,
  } as unknown as FeedItem;

  const readMin = readTimeMinutes(item);
  const fullText = hasFullText(item);
  const media = isTranscriptlessMedia(item);

  const channel = primaryChannel(input.topics);
  const cleanBase = base.replace(/\/$/, "");

  return {
    id: input.id,
    title: input.title,
    href: `${cleanBase}/item/${input.id}`,
    topics: input.topics,
    entities: input.entities,
    publishedAt: input.publishedAt,
    trustScore: input.trustScore,
    metrics: input.metrics,
    clusterId: input.clusterId,
    kind: input.kind,
    channel,
    group: channelGroup(channel),
    body: syntheticBody(readMin, fullText, media),
    readMin,
    hasFullText: fullText,
    isMedia: media,
  };
}
