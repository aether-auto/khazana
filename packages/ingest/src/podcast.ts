import type { FetchFn } from "./fetchers/build-source.js";
import { sanitizeArticleHtml } from "./extract.js";

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
