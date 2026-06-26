import type { FetchFn } from "./fetchers/build-source.js";
import { sanitizeArticleHtml } from "./extract.js";

// ---------------------------------------------------------------------------
// Ad / sponsor detection — two complementary layers:
//
//   1. EXACT TRIGGERS: high-confidence phrases that alone confirm a sponsor
//      block ("this message comes from", "brought to you by", etc.).
//
//   2. DENSITY SCORE: count sponsor signals (known brand names + ad lexicon
//      words) per sentence. A sentence that hits ≥ SPONSOR_DENSITY_THRESHOLD
//      signals without an exact trigger — catches variants like:
//        "No matter your investing goal, life stage, amount to invest or know
//         how you can invest your way with Schwab."
//      (brand "schwab" + lexicon "investing goal", "life stage", "invest" ×2)
// ---------------------------------------------------------------------------

/** Exact-match trigger phrases — any one of these alone flags an ad sentence. */
const AD_EXACT_TRIGGERS: RegExp[] = [
  /this (?:message|episode|podcast) (?:comes|is brought) from/i,
  /support for (?:this|the) (?:podcast|show|program|episode)/i,
  /this episode is (?:sponsored|presented) by/i,
  /brought to you by/i,
  /(?:use|enter) (?:code|promo(?:code)?)\b/i,
  /\bpromo ?code\b/i,
  /terms (?:apply|and conditions apply)/i,
  /slash podcast\b/i,
  /(?:go to|visit) [a-z0-9-]+\.com[/\s]/i,      // "go to schwab.com/podcast"
  /\bpodcast\.com[/\s]/i,
  /\bsponsor(?:ed)? (?:by|content)\b/i,
  /\baffiliate (?:link|disclosure)\b/i,
];

/**
 * Known sponsor brand names. Each entry is a word-boundary-anchored pattern.
 * Matched in combination with ad-lexicon words to compute density.
 * Conservative list — only brands that are actual common podcast sponsors.
 */
const SPONSOR_BRANDS = new Set([
  "schwab", "squarespace", "betterhelp", "expressvpn", "nerdwallet",
  "linkedin", "indeed", "audible", "hellofresh", "blinkist", "masterclass",
  "wix", "shopify", "raycon", "athletic greens", "ag1", "factor",
  "mint mobile", "dollar shave", "bombas", "brooklyn bedding", "casper",
  "helix", "eight sleep", "ritual", "calm", "headspace", "noom",
  "hims", "hers", "roman", "keeps", "quip", "nutrafol", "prose",
  "gusto", "freshbooks", "quickbooks", "notion", "monday", "asana",
  "zocdoc", "teladoc", "peloton", "whoop", "oura", "aura", "nordvpn",
  "surfshark", "cyberghost", "ghostbed", "purple", "dreamcloud",
  "betterment", "wealthfront", "sofi", "creditkarma", "identityguard",
  "lifelock", "aarp", "selectquote", "policygenius", "ladder",
  "babbel", "duolingo", "skillshare", "udemy", "coursera", "brilliant",
  "grammarly", "lastpass", "1password", "dashlane", "airtable",
  "hubspot", "salesforce", "zendesk", "intercom", "typeform",
]);

/**
 * Ad / finance / product lexicon — words that cluster in sponsor reads.
 * Each match adds 1 to the density score. Scored per sentence; threshold
 * determines whether the sentence is treated as an ad block.
 */
const AD_LEXICON_PATTERNS: RegExp[] = [
  /\binvest(?:ing|ment|or|s)?\b/i,
  /\bfinancial (?:planning|advisor|goal|freedom|wellness)\b/i,
  /\blife stage\b/i,
  /\bself.directed\b/i,
  /\bwealth (?:management|building|advisor)\b/i,
  /\bportfolio\b/i,
  /\basset (?:management|allocation|class)\b/i,
  /\bpromo(?:tion)?\b/i,
  /\bdiscount code\b/i,
  /\bexclusive (?:offer|deal|discount)\b/i,
  /\bfree trial\b/i,
  /\bfirst (?:month|order|box|shipment) free\b/i,
  /\b(?:percent|%) off\b/i,
  /\bsave \$?[\d]+\b/i,
  /\bcoupon\b/i,
  /\baffiliate\b/i,
  /\bsponsored\b/i,
  /\badvertisement\b/i,
  /\bself.paced\b/i,
  /\bsubscription (?:plan|box|service)\b/i,
  /\bcheck out [a-z]+\.com\b/i,
  /\blearn more at\b/i,
  /\bsign up (?:at|for|today)\b/i,
  /\bdownload (?:the app|now)\b/i,
  /\bclick the link\b/i,
  /\blink in (?:the )?(?:bio|description|show notes)\b/i,
  /\bshow notes\b/i,
  /\bno (?:commitment|contract) required\b/i,
  /\bcancel anytime\b/i,
  /\binvest your way\b/i,       // "invest your way with Schwab"
  /\bknow how\b/i,              // "know how you can invest"
  /\bamount to invest\b/i,
  /\bno matter your\b/i,        // "no matter your investing goal"
  /\byour (?:financial|investing|retirement)\b/i,
];

/**
 * Minimum density score for a sentence to be flagged as a sponsor block
 * (when no exact trigger phrase is present).
 * Score = (brand matches × 2) + (lexicon matches × 1).
 *
 * Threshold 5: catches ad variants like "No matter your investing goal, life
 * stage, amount to invest or know how you can invest your way with Schwab"
 * (scores 7: schwab×2 + no_matter_your×1 + investing×1 + life_stage×1 +
 * amount_to_invest×1 + invest_your_way×1) while allowing editorial sentences
 * that merely mention a brand + one financial term (scores ≤ 4).
 *
 * Examples of editorial that must survive (score ≤ 4):
 *   "The Charles Schwab report found younger investors prefer ETFs" → 4
 *   "Investors worried about their portfolio's performance" → 2
 */
const SPONSOR_DENSITY_THRESHOLD = 5;

/**
 * Compute the sponsor-signal density score for a sentence.
 * Brand matches count double (more reliable signal than generic ad words).
 */
export function sponsorDensityScore(text: string): number {
  const lower = text.toLowerCase();
  // Count brand hits (×2 each)
  let score = 0;
  for (const brand of SPONSOR_BRANDS) {
    // Word-boundary match: brand must appear as a standalone word
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(lower)) {
      score += 2;
    }
  }
  // Count lexicon hits (×1 each)
  for (const pattern of AD_LEXICON_PATTERNS) {
    if (pattern.test(text)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Return true if the segment text is an ad/sponsor block.
 * Two paths:
 *   - Exact trigger phrase (high-confidence, standalone).
 *   - Density score ≥ SPONSOR_DENSITY_THRESHOLD (catches phrasing variants).
 */
export function isAdSegment(text: string): boolean {
  if (AD_EXACT_TRIGGERS.some((p) => p.test(text))) return true;
  return sponsorDensityScore(text) >= SPONSOR_DENSITY_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Repetition collapse — detects Whisper hallucination loops.
// A loop is defined as the same n-gram (3–7 words) appearing 5+ times
// consecutively in a segment. We keep the first occurrence.
// ---------------------------------------------------------------------------

/**
 * Collapse consecutive n-gram repetition loops in a block of text.
 * Whisper-tiny/base can degenerate on ad/music/silence transitions, emitting
 * the same phrase dozens of times. This collapses those loops to one instance.
 *
 * Algorithm: slide over the text; if a phrase of 3–7 words repeats ≥5 times
 * back-to-back, replace the whole run with a single instance.
 */
export function collapseRepetition(text: string): string {
  // Work token by token to detect runs.
  const words = text.split(/(\s+)/);  // preserves spaces as tokens
  const wordTokens: string[] = [];
  const spaceTokens: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i % 2 === 0) wordTokens.push(words[i] ?? "");
    else spaceTokens.push(words[i] ?? " ");
  }

  // For each ngram size from 3 to 7, collapse runs.
  let result = wordTokens;
  for (let n = 3; n <= 7; n++) {
    result = collapseNgramRuns(result, n, 5);
  }

  // Reassemble with spaces.
  return result.map((w, i) => (i < result.length - 1 ? w + (spaceTokens[i] ?? " ") : w)).join("");
}

function collapseNgramRuns(words: string[], n: number, minRuns: number): string[] {
  if (words.length < n * minRuns) return words;
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    if (i + n > words.length) {
      out.push(...words.slice(i));
      break;
    }
    // Candidate n-gram at position i
    const ngram = words.slice(i, i + n);
    // Count how many times it repeats consecutively
    let count = 1;
    let j = i + n;
    while (j + n <= words.length) {
      const next = words.slice(j, j + n);
      if (ngramEq(ngram, next)) {
        count++;
        j += n;
      } else {
        break;
      }
    }
    if (count >= minRuns) {
      // Collapsed to one occurrence
      out.push(...ngram);
      i = j; // skip the rest of the run
    } else {
      out.push(words[i]!);
      i++;
    }
  }
  return out;
}

function ngramEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.toLowerCase() !== b[i]?.toLowerCase()) return false;
  }
  return true;
}

/**
 * Count how many times an n-gram (sequence of words) repeats in the text.
 * Used for metrics and validation. Returns the maximum repeat count for any
 * n-gram of size `n` in the text.
 */
export function maxNgramRepeatCount(text: string, n: number = 3): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < n) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const key = words.slice(i, i + n).join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

/**
 * Find a `<podcast:transcript url="..." />` URL in a raw RSS `<item>` XML
 * fragment (the Podcasting 2.0 namespace). Prefers text/plain or text/html
 * transcripts; returns the first transcript URL otherwise. Pure/offline.
 */
export function findTranscriptUrl(itemXml: string): string | null {
  if (!itemXml) return null;
  const tags = itemXml.match(/<podcast:transcript\b[^>]*\/?>/g);
  if (!tags) return null;
  const parsed = tags
    .map((tag) => {
      const url = tag.match(/\burl\s*=\s*["']([^"']+)["']/)?.[1];
      const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
      return url ? { url, type: type.toLowerCase() } : null;
    })
    .filter((t): t is { url: string; type: string } => t !== null);
  if (parsed.length === 0) return null;
  const preferred =
    parsed.find((t) => t.type.includes("plain")) ??
    parsed.find((t) => t.type.includes("html")) ??
    parsed[0]!;
  return preferred.url;
}

// ---------------------------------------------------------------------------
// Transcript sanitization helpers
// ---------------------------------------------------------------------------

/** Characters at which to start a new paragraph (soft limit). */
const PARA_BREAK_CHARS = 500;

/**
 * Detect if the content looks like VTT format.
 */
function isVtt(mimeOrFormat: string, raw: string): boolean {
  const m = mimeOrFormat.toLowerCase();
  if (m.includes("vtt") || m.endsWith(".vtt")) return true;
  return raw.trimStart().startsWith("WEBVTT");
}

/**
 * Detect if the content looks like SRT format.
 */
function isSrt(mimeOrFormat: string): boolean {
  const m = mimeOrFormat.toLowerCase();
  return m.includes("srt") || m.endsWith(".srt");
}

/**
 * Detect HTML format.
 */
function isHtml(mimeOrFormat: string): boolean {
  return mimeOrFormat.toLowerCase().includes("html");
}

/**
 * Detect JSON format.
 */
function isJson(mimeOrFormat: string): boolean {
  const m = mimeOrFormat.toLowerCase();
  return m.includes("json") || m.endsWith(".json");
}

/** Represents a single cue of parsed transcript content. */
interface TranscriptCue {
  speaker: string | null;
  text: string;
}

/**
 * Strip inline VTT timing tags like `<00:00:01.234>`, `<c>`, `</c>`, etc.
 * Also handles `<i>`, `<b>`, `<u>`, `<ruby>`, `<rt>` and their closing forms.
 */
function stripVttInlineTags(line: string): string {
  // Strip timing tags: <HH:MM:SS.sss> or <MM:SS.sss>
  return line
    .replace(/<\d{1,2}:\d{2}[:.]\d{2,3}>/g, "")
    // Strip VTT formatting tags and their closing forms
    .replace(/<\/?(?:c|i|b|u|ruby|rt|v\s[^>]*)>/g, "");
}

/**
 * Extract speaker from `<v Speaker Name>text</v>` VTT cue format.
 * Returns `{ speaker, text }` where speaker may be null.
 */
function extractVttSpeaker(line: string): { speaker: string | null; text: string } {
  const m = line.match(/^<v\s+([^>]+)>([\s\S]*)(?:<\/v>)?$/);
  if (m) {
    return {
      speaker: m[1]?.trim() ?? null,
      text: (m[2] ?? "").trim(),
    };
  }
  return { speaker: null, text: line };
}

/**
 * Parse a VTT transcript into an array of cues with optional speaker labels.
 */
function parseVtt(raw: string): TranscriptCue[] {
  const lines = raw.split(/\r?\n/);
  const cues: TranscriptCue[] = [];
  let inCue = false;
  let currentLines: string[] = [];
  let currentSpeaker: string | null = null;

  const flushCue = () => {
    if (currentLines.length > 0) {
      const text = currentLines.join(" ").trim();
      if (text) {
        cues.push({ speaker: currentSpeaker, text });
      }
      currentLines = [];
      currentSpeaker = null;
    }
    inCue = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip WEBVTT header
    if (line.startsWith("WEBVTT")) {
      continue;
    }

    // Skip NOTE blocks
    if (line.startsWith("NOTE")) {
      inCue = false;
      flushCue();
      continue;
    }

    // Empty line: end of cue block
    if (line === "") {
      if (inCue) flushCue();
      continue;
    }

    // Timestamp line: `HH:MM:SS.sss --> ...` or `MM:SS.sss --> ...`
    if (/^\d{1,2}:\d{2}(?::\d{2})?[,.]\d{2,3}\s+-->/.test(line)) {
      // Start of a new cue — flush previous and enter cue mode
      if (inCue) flushCue();
      inCue = true;
      continue;
    }

    // Cue ID line: standalone number or word before a timestamp line
    // (only skip if not in a cue yet — cue text can look like anything)
    if (!inCue && /^\S+$/.test(line)) {
      // Could be a cue identifier — skip it
      continue;
    }

    if (inCue) {
      // Extract speaker first (before stripping VTT tags), then strip inline timing tags
      if (currentLines.length === 0) {
        const { speaker, text: rawText } = extractVttSpeaker(line);
        const text = stripVttInlineTags(rawText);
        currentSpeaker = speaker;
        if (text) currentLines.push(text);
      } else {
        const { speaker: lineSpeaker, text: rawText } = extractVttSpeaker(line);
        const text = stripVttInlineTags(rawText);
        if (lineSpeaker && lineSpeaker !== currentSpeaker) {
          // Speaker changed mid-block — flush current and start new
          flushCue();
          inCue = true;
          currentSpeaker = lineSpeaker;
          if (text) currentLines.push(text);
        } else {
          if (text) currentLines.push(text);
        }
      }
    }
  }
  flushCue();
  return cues;
}

/**
 * Parse a SRT transcript into an array of cues.
 */
function parseSrt(raw: string): TranscriptCue[] {
  const lines = raw.split(/\r?\n/);
  const cues: TranscriptCue[] = [];
  let inCue = false;
  let currentLines: string[] = [];

  const flushCue = () => {
    if (currentLines.length > 0) {
      const text = currentLines.join(" ").trim();
      if (text) {
        // Check for SRT-style speaker prefix "Speaker: text"
        const speakerMatch = text.match(/^([A-Z][A-Za-z\s]+):\s+(.+)$/);
        if (speakerMatch) {
          cues.push({ speaker: speakerMatch[1]?.trim() ?? null, text: speakerMatch[2]?.trim() ?? text });
        } else {
          cues.push({ speaker: null, text });
        }
        currentLines = [];
      }
    }
    inCue = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Empty line: end of cue block
    if (line === "") {
      if (inCue) flushCue();
      continue;
    }

    // Standalone sequence number
    if (/^\d+$/.test(line) && !inCue) {
      continue;
    }

    // SRT timestamp: `00:00:01,000 --> 00:00:04,000`
    if (/^\d{2}:\d{2}:\d{2}[,.]?\d*\s+-->/.test(line)) {
      if (inCue) flushCue();
      inCue = true;
      continue;
    }

    // Strip `{...}` positioning tags
    const cleaned = line.replace(/\{[^}]*\}/g, "").trim();
    if (inCue && cleaned) {
      currentLines.push(cleaned);
    }
  }
  flushCue();
  return cues;
}

/**
 * Parse plain text into transcript cues (treat as paragraphs).
 */
function parsePlainText(raw: string): TranscriptCue[] {
  return raw
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^\d+$/.test(p) && !/-->/.test(p))
    .map((text) => ({ speaker: null, text }));
}

/**
 * Parse JSON transcript format (extracts text fields from various JSON shapes).
 */
function parseJsonTranscript(raw: string): TranscriptCue[] {
  try {
    const data: unknown = JSON.parse(raw);
    const cues: TranscriptCue[] = [];

    // Handle array of objects with text/body/content fields
    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          const text = (obj["text"] ?? obj["body"] ?? obj["content"] ?? "") as string;
          const speaker = (obj["speaker"] ?? obj["name"] ?? null) as string | null;
          if (typeof text === "string" && text.trim()) {
            cues.push({ speaker: typeof speaker === "string" ? speaker : null, text: text.trim() });
          }
        }
      }
    }
    return cues;
  } catch {
    return [];
  }
}

/**
 * Merge cues into prose paragraphs.
 * - Speaker changes always trigger a new paragraph.
 * - Long accumulated text (~PARA_BREAK_CHARS) triggers a new paragraph.
 * - Short adjacent cues are merged with a space (joining logic handles sentence boundaries).
 */
function cuesToHtml(cues: TranscriptCue[]): string {
  if (cues.length === 0) return "";

  const paragraphs: Array<{ speaker: string | null; text: string }> = [];
  let currentSpeaker: string | null = cues[0]?.speaker ?? null;
  let currentText = "";

  const flushParagraph = () => {
    if (currentText.trim()) {
      paragraphs.push({ speaker: currentSpeaker, text: currentText.trim() });
    }
    currentText = "";
  };

  for (const cue of cues) {
    const speakerChanged = cue.speaker !== null && cue.speaker !== currentSpeaker;

    if (speakerChanged) {
      flushParagraph();
      currentSpeaker = cue.speaker;
    }

    // Join cue text: if current text doesn't end with sentence-ending punctuation,
    // and we're merging short cues, just append with a space.
    if (currentText.length > 0) {
      const joiner = /[.!?]$/.test(currentText) ? " " : " ";
      currentText = currentText + joiner + cue.text;
    } else {
      currentText = cue.text;
    }

    // Break paragraph at ~PARA_BREAK_CHARS
    if (currentText.length >= PARA_BREAK_CHARS) {
      flushParagraph();
      currentSpeaker = cue.speaker;
    }
  }
  flushParagraph();

  // Render paragraphs
  const htmlParts = paragraphs.map(({ speaker, text }) => {
    if (speaker) {
      return `<p><strong>${escapeHtml(speaker)}</strong>: ${escapeHtml(text)}</p>`;
    }
    return `<p>${escapeHtml(text)}</p>`;
  });

  const rawHtml = htmlParts.join("");
  return sanitizeArticleHtml(rawHtml);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert raw transcript content (VTT, SRT, plain text, HTML, or JSON) into
 * clean, readable prose HTML suitable for `FeedItem.body`.
 *
 * @param raw - The raw transcript content
 * @param mimeOrFormat - MIME type or file extension hint (e.g., "text/vtt", ".srt")
 */
export function sanitizePodcastTranscript(raw: string, mimeOrFormat: string): string {
  const t = raw.trim();
  if (!t) return "";

  if (isHtml(mimeOrFormat)) {
    return sanitizeArticleHtml(t);
  }

  if (isJson(mimeOrFormat)) {
    const cues = parseJsonTranscript(t);
    if (cues.length > 0) return cuesToHtml(cues);
    // Fall through to plain text if JSON parse gives nothing useful
  }

  if (isVtt(mimeOrFormat, t)) {
    const cues = parseVtt(t);
    return cuesToHtml(cues);
  }

  if (isSrt(mimeOrFormat)) {
    const cues = parseSrt(t);
    return cuesToHtml(cues);
  }

  // Plain text fallback
  const cues = parsePlainText(t);
  return cuesToHtml(cues);
}

/**
 * Strip leading pre-roll ad sentences from the front of a transcript.
 *
 * Podcasts almost always pre-roll an ad before the real content. This function
 * walks forward through sentences until it finds one that is clearly real
 * content (not an ad). Stops conservatively at the first genuine content
 * sentence so it never trims too deep.
 *
 * A sentence is treated as "genuine content" when:
 *   - It is NOT flagged by `isAdSegment()`, AND
 *   - It is longer than MIN_REAL_CONTENT_CHARS (guards against single-word
 *     transitional sentences like "Okay." that appear between a pre-roll and
 *     the real intro), OR it contains a narrative content signal.
 */
const MIN_REAL_CONTENT_CHARS = 40;

/** Phrases that signal genuine narrative / editorial content. */
const NARRATIVE_SIGNALS = /\b(?:today|this week|this episode|this story|last (?:week|month|year)|in \d{4}|we(?:'re)? (?:talking|discussing|exploring|looking)|I'?m (?:here|joined|talking)|welcome to|from (?:NPR|ABC|CBS|BBC|CNN|the new york times|the washington post)|it'?s (?:a story|the story)|it was|they were|she was|he was|the (?:story|question|issue|report|investigation)|heads up|warning|this (?:story|episode) contains|explicit|gun|violence|language)\b/i;

function trimLeadingAds(segments: string[]): string[] {
  // Find the index of the first genuine content sentence.
  let start = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (!isAdSegment(seg)) {
      // This sentence is not an ad — check if it looks like real content.
      if (seg.length >= MIN_REAL_CONTENT_CHARS || NARRATIVE_SIGNALS.test(seg)) {
        start = i;
        break;
      }
      // Very short non-ad sentence (e.g. "Okay.") — could be a transition.
      // Keep looking, but don't trim past it if no more ads follow.
      if (i + 1 >= segments.length || !isAdSegment(segments[i + 1]!)) {
        start = i;
        break;
      }
    }
    // Ad sentence — continue scanning
  }
  return segments.slice(start);
}

/**
 * Clean a raw Whisper (or other ASR) plain-text transcript into readable
 * prose HTML. Three-stage pipeline:
 *
 *   1. **Repetition collapse** — folds Whisper hallucination loops into one
 *      instance before sentence-splitting (preserves boundary integrity).
 *   2. **Ad / sponsor removal** (two layers):
 *      a. Leading pre-roll trim — strip consecutive sponsor sentences from
 *         the front until the first genuine content sentence.
 *      b. Mid-roll strip — drop any ad sentence anywhere in the transcript
 *         (via exact-trigger OR density score) plus its short continuation.
 *   3. **Paragraphize + HTML escape** via `sanitizePodcastTranscript`.
 *
 * This is the entry point for Whisper-generated transcripts; use
 * `sanitizePodcastTranscript` directly for published VTT/SRT/JSON transcripts.
 */
export function cleanPodcastTranscript(rawText: string): string {
  if (!rawText.trim()) return "";

  // 1. Collapse hallucination loops before sentence-splitting.
  const delooped = collapseRepetition(rawText);

  // 2. Split into sentences.
  //    Sentence boundary: period/!/? followed by space and capital, or newline.
  const segments = delooped
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=\n)\s*/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // 2a. Strip leading pre-roll ads.
  const afterLeadTrim = trimLeadingAds(segments);

  // 2b. Mid-roll strip: drop ad sentences + short continuation (≤50 chars).
  //     "Short continuation" catches the product description sentence that
  //     typically follows the ad trigger ("Online therapy is available to
  //     everyone.") without accidentally eating longer editorial sentences.
  const SHORT_COPY_MAX_CHARS = 50;
  const RESUME_STARTERS = /^(?:today|now|let'?s|back|so |as we|welcome back|that said|heads up)\b/i;

  const cleaned: string[] = [];
  let skipNext = false;
  for (const seg of afterLeadTrim) {
    if (skipNext) {
      skipNext = false;
      if (seg.length <= SHORT_COPY_MAX_CHARS && !RESUME_STARTERS.test(seg)) {
        continue; // drop short continuation copy
      }
      // Longer sentence or resume-opener → keep as real content.
    }
    if (isAdSegment(seg)) {
      skipNext = true;
      continue;
    }
    cleaned.push(seg);
  }

  if (cleaned.length === 0) return "";

  // 3. Re-join and pass through the standard sanitizer (plain text path).
  const rejoined = cleaned.join(" ");
  return sanitizePodcastTranscript(rejoined, "text/plain");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Turn fetched transcript content (plain text or HTML) into sanitized body HTML.
 * Delegates to `sanitizePodcastTranscript` for proper format handling.
 */
export function transcriptContentToHtml(content: string, type: string): string {
  const t = content.trim();
  if (!t) return "";
  if (type.toLowerCase().includes("html")) return sanitizeArticleHtml(t);
  // Plain text (incl. SRT/VTT-ish): keep paragraphs, drop cue timing lines.
  const paras = t
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^\d+$/.test(p) && !/-->/.test(p));
  if (paras.length === 0) return "";
  return paras.map((p) => `<p>${escapeText(p)}</p>`).join("");
}

/**
 * Fetch a podcast transcript from a `<podcast:transcript>` URL and return it as
 * sanitized body HTML. Resilient: any failure returns "" so the caller falls
 * back to the episode description. Never throws.
 */
export async function fetchPodcastTranscript(url: string, fetchFn: FetchFn): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetchFn(url);
    if (!res.ok) return "";
    const body = await res.text();
    // Detect format from URL extension and delegate to the full sanitizer.
    let mimeOrFormat = "text/plain";
    if (/\.html?(\?|$)/i.test(url)) mimeOrFormat = "text/html";
    else if (/\.vtt(\?|$)/i.test(url)) mimeOrFormat = "text/vtt";
    else if (/\.srt(\?|$)/i.test(url)) mimeOrFormat = "application/srt";
    else if (/\.json(\?|$)/i.test(url)) mimeOrFormat = "application/json";
    return sanitizePodcastTranscript(body, mimeOrFormat);
  } catch {
    return "";
  }
}
