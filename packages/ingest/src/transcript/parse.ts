/**
 * Pure transcript parsers — convert published transcript formats to plain text.
 *
 * These are the tier-1 building blocks for podcast transcript discovery: a
 * `<podcast:transcript>` (Podcasting 2.0) tag points at a transcript file whose
 * format is one of VTT / SRT / JSON / HTML / plain text. Every function here is
 * pure and side-effect free so it can be unit tested against real fixture
 * snippets; the network/IO wrapper lives in `resolve.ts`.
 *
 * The output is *plain text* (not HTML). Callers pass it through the existing
 * `cleanPodcastTranscript` / `sanitizePodcastTranscript` prose pipeline to get
 * the final `FeedItem.body` HTML — keeping presentation in one place.
 */

/** The parser family a transcript MIME/type maps to. */
export type TranscriptKind = "vtt" | "srt" | "json" | "html" | "plain";

/** A normalized `<podcast:transcript>` reference. */
export interface TranscriptTag {
  url: string;
  type: string;
  /** BCP-47 language tag if the feed declared one (e.g. "en", "es"). */
  language: string | undefined;
}

/** rss-parser custom-field shape for a `<podcast:transcript>` element. */
interface TranscriptRef {
  $?: { url?: string; type?: string; language?: string };
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/**
 * Map a transcript MIME type (or file-extension hint) to its parser kind.
 * Recognizes the Podcasting 2.0 transcript MIME set:
 *   - text/vtt                → vtt
 *   - application/x-subrip / application/srt / text/srt → srt
 *   - application/json        → json
 *   - text/html               → html
 *   - text/plain (default)    → plain
 */
export function transcriptKindForType(type: string): TranscriptKind {
  const t = type.toLowerCase();
  if (t.includes("vtt")) return "vtt";
  if (t.includes("subrip") || t.includes("srt")) return "srt";
  if (t.includes("json")) return "json";
  if (t.includes("html")) return "html";
  return "plain";
}

// ---------------------------------------------------------------------------
// VTT → plain text
// ---------------------------------------------------------------------------

/** Strip inline VTT timing/formatting tags: `<00:00:01.234>`, `<c>`, `<i>`, … */
function stripVttInline(line: string): string {
  return line
    // Inline cue timestamps: <MM:SS.mmm> or <HH:MM:SS.mmm>
    .replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{2,3}>/g, "")
    .replace(/<\/?(?:c|i|b|u|ruby|rt)(?:\.[^>]*)?>/g, "");
}

/** Strip a `<v Speaker>` voice tag, keeping only the spoken text. */
function stripVttVoice(line: string): string {
  const m = line.match(/^<v\s+[^>]+>([\s\S]*?)(?:<\/v>)?$/);
  return m ? (m[1] ?? "").trim() : line;
}

/**
 * Convert a WebVTT transcript to a single plain-text string.
 * Drops the `WEBVTT` header, `NOTE` blocks, cue identifiers, timestamp lines,
 * and all inline timing/voice tags; joins remaining cue text with spaces.
 */
export function vttToText(raw: string): string {
  if (!raw.trim()) return "";
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let inCue = false;
  let inNote = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("WEBVTT")) continue;
    if (line.startsWith("NOTE")) {
      inNote = true;
      inCue = false;
      continue;
    }
    if (line === "") {
      inNote = false;
      inCue = false;
      continue;
    }
    if (inNote) continue;
    // Timestamp line — the following non-empty lines are cue text.
    if (/^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{2,3}\s+-->/.test(line)) {
      inCue = true;
      continue;
    }
    // A standalone cue identifier appears before a timestamp; skip while not in a cue.
    if (!inCue && /^\S+$/.test(line) && !/-->/.test(line)) continue;
    if (inCue) {
      const text = stripVttInline(stripVttVoice(line)).trim();
      if (text) out.push(text);
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// SRT → plain text
// ---------------------------------------------------------------------------

/**
 * Convert a SubRip (SRT) transcript to plain text. Drops sequence numbers and
 * `00:00:01,000 --> …` timestamp lines; keeps cue text (any inline `{…}`
 * positioning tags removed).
 */
export function srtToText(raw: string): string {
  if (!raw.trim()) return "";
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let inCue = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      inCue = false;
      continue;
    }
    if (/^\d+$/.test(line) && !inCue) continue; // sequence number
    if (/^\d{2}:\d{2}:\d{2}[,.]\d{0,3}\s+-->/.test(line)) {
      inCue = true;
      continue;
    }
    const cleaned = line.replace(/\{[^}]*\}/g, "").trim();
    if (inCue && cleaned) out.push(cleaned);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// JSON (Podcasting 2.0 transcript schema) → plain text
// ---------------------------------------------------------------------------

/**
 * Convert a JSON transcript to plain text. Handles the Podcasting 2.0 schema
 * (`{ version, segments: [{ speaker, startTime, endTime, body }] }`) as well as
 * bare arrays of `{ text | body | content }` objects. Returns "" on parse
 * failure or when no usable text field is found.
 */
export function jsonTranscriptToText(raw: string): string {
  if (!raw.trim()) return "";
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return "";
  }
  const segments: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { segments?: unknown[] })?.segments)
      ? (data as { segments: unknown[] }).segments
      : [];
  const parts: string[] = [];
  for (const seg of segments) {
    if (typeof seg !== "object" || seg === null) continue;
    const obj = seg as Record<string, unknown>;
    const body = obj["body"] ?? obj["text"] ?? obj["content"] ?? "";
    if (typeof body === "string" && body.trim()) parts.push(body.trim());
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// HTML / plain
// ---------------------------------------------------------------------------

/** Strip all tags from an HTML transcript, leaving readable text. */
function htmlToPlain(raw: string): string {
  return raw
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    // Tags between a word and punctuation leave a stray space ("world ." → "world.")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Convert raw transcript content of any supported type to plain text, choosing
 * the parser by MIME/type with a content sniff for VTT (some hosts serve VTT
 * with a generic `application/octet-stream` type).
 */
export function transcriptContentToText(raw: string, type: string): string {
  const t = raw.trim();
  if (!t) return "";
  const kind = transcriptKindForType(type);
  if (kind === "vtt" || t.startsWith("WEBVTT")) return vttToText(t);
  if (kind === "srt") return srtToText(t);
  if (kind === "json") return jsonTranscriptToText(t);
  if (kind === "html") return htmlToPlain(t);
  return t.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// <podcast:transcript> tag selection
// ---------------------------------------------------------------------------

/** Normalize rss-parser custom-field refs into `TranscriptTag[]` (url required). */
export function parseTranscriptTags(refs: TranscriptRef[] | undefined): TranscriptTag[] {
  return (refs ?? [])
    .map((r) => {
      const url = r.$?.url;
      if (!url) return null;
      return {
        url,
        type: (r.$?.type ?? "").toLowerCase(),
        language: r.$?.language ? r.$.language.toLowerCase() : undefined,
      };
    })
    .filter((t): t is TranscriptTag => t !== null);
}

/** Machine-readable formats we prefer over HTML/plain (higher = better). */
const FORMAT_RANK: Record<TranscriptKind, number> = {
  json: 3,
  vtt: 3,
  srt: 3,
  plain: 2,
  html: 1,
};

/**
 * Choose the best `<podcast:transcript>` tag:
 *   1. Prefer machine formats (VTT/SRT/JSON) over plain text over HTML.
 *   2. Within the top format tier, prefer a transcript whose `language` matches
 *      the feed language; otherwise take the first.
 * Returns null when there are no tags.
 */
export function selectTranscript(
  tags: readonly TranscriptTag[],
  feedLanguage: string | undefined,
): TranscriptTag | null {
  if (tags.length === 0) return null;
  const feedLang = feedLanguage?.toLowerCase().split("-")[0];

  let best: TranscriptTag | null = null;
  let bestRank = -1;
  let bestLangMatch = false;

  for (const tag of tags) {
    const rank = FORMAT_RANK[transcriptKindForType(tag.type)];
    const langMatch =
      !!feedLang && !!tag.language && tag.language.split("-")[0] === feedLang;
    // Rank dominates; language is the tie-breaker within a rank.
    const better =
      rank > bestRank || (rank === bestRank && langMatch && !bestLangMatch);
    if (better) {
      best = tag;
      bestRank = rank;
      bestLangMatch = langMatch;
    }
  }
  return best;
}
