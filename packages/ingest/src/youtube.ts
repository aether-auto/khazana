import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FetchFn } from "./fetchers/build-source.js";
import { fetchProxyTranscript } from "./youtube-proxy.js";
import { sanitizePodcastTranscript } from "./podcast.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Approximate characters per paragraph when splitting a long transcript
 * into readable prose paragraphs.
 */
const PARAGRAPH_CHARS = 500;

// ---------------------------------------------------------------------------
// Low-level XML helpers (kept for XML timedtext fallback path)
// ---------------------------------------------------------------------------

/** Decode the handful of XML/HTML entities the timedtext feed emits. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;lt;|&lt;/g, "<")
    .replace(/&amp;gt;|&gt;/g, ">")
    .replace(/&amp;|&amp;amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/**
 * Parse the YouTube `timedtext` transcript XML into a single plain-text string.
 * Cues look like `<text start="0" dur="1.5">line</text>`. Pure/offline.
 */
export function parseTranscriptXml(xml: string): string {
  if (!xml) return "";
  const cues: string[] = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1] ?? "";
    // Cue bodies are themselves entity-encoded; strip any stray tags first.
    const line = decodeEntities(raw.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (line) cues.push(line);
  }
  return cues.join(" ").trim();
}

// ---------------------------------------------------------------------------
// json3 timedtext parsing
// ---------------------------------------------------------------------------

/** Shape of a single event in the json3 timedtext format. */
interface Json3Event {
  segs?: Array<{ utf8?: string }>;
}

/**
 * Parse YouTube's `fmt=json3` timedtext JSON into plain text.
 * Each event has a `segs` array with `utf8` text chunks.
 * Pure/offline; returns "" on malformed input.
 */
export function parseTranscriptJson3(json: string): string {
  if (!json) return "";
  try {
    const data = JSON.parse(json) as { events?: Json3Event[] };
    const events = data.events ?? [];
    const cues: string[] = [];
    for (const ev of events) {
      const text = (ev.segs ?? [])
        .map((s) => s.utf8 ?? "")
        .join("")
        .replace(/\n/g, " ")
        .trim();
      if (text && text !== "\n") cues.push(text);
    }
    return cues.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// ytInitialPlayerResponse extraction
// ---------------------------------------------------------------------------

/** A caption track entry from ytInitialPlayerResponse. */
interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

/** Shape of the playerCaptionsTracklistRenderer we care about. */
interface CaptionTracklist {
  captionTracks?: CaptionTrack[];
}

/** Minimal shape of ytInitialPlayerResponse we read. */
interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: CaptionTracklist;
  };
  playabilityStatus?: {
    status?: string;
  };
}

/**
 * Extract the `ytInitialPlayerResponse` JSON object embedded in a YouTube
 * watch-page HTML string. Returns null on any parse failure.
 *
 * YouTube embeds the object as:
 *   var ytInitialPlayerResponse = {...};
 * The JSON value is delimited by the next top-level `};` boundary.
 */
export function extractPlayerResponse(html: string): PlayerResponse | null {
  if (!html) return null;
  const marker = "ytInitialPlayerResponse = ";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;

  // Walk forward to find the balanced closing `}` for the top-level object.
  let depth = 0;
  let i = jsonStart;
  let inString = false;
  let escape = false;

  while (i < html.length) {
    const ch = html[i]!;
    if (escape) {
      escape = false;
    } else if (ch === "\\" && inString) {
      escape = true;
    } else if (ch === '"' && !escape) {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    i++;
  }

  const jsonStr = html.slice(jsonStart, i);
  try {
    return JSON.parse(jsonStr) as PlayerResponse;
  } catch {
    return null;
  }
}

/**
 * Extract the INNERTUBE_API_KEY embedded in a YouTube watch-page HTML string.
 * Returns null if not found.
 */
export function extractInnertubeApiKey(html: string): string | null {
  const m = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

/**
 * Pick the best caption track from a tracklist, preferring English manual
 * captions, then any English-tagged track, then the first track.
 */
export function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  // Prefer English manual captions (kind is absent or "standard").
  const enManual = tracks.find(
    (t) => t.languageCode.startsWith("en") && (!t.kind || t.kind === "asr"),
  );
  if (enManual) return enManual;
  // Any English track (auto-generated asr is fine).
  const en = tracks.find((t) => t.languageCode.startsWith("en"));
  if (en) return en;
  // Fallback to the first available track.
  return tracks[0] ?? null;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Extract the 11-char video id from a watch / youtu.be / embed URL. */
export function youTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Wrap transcript plain text into readable prose HTML for `body`.
 * Splits long text at sentence boundaries into ~PARAGRAPH_CHARS-character paragraphs.
 */
export function transcriptToHtml(text: string): string {
  const t = text.trim();
  if (!t) return "";

  if (t.length <= PARAGRAPH_CHARS) {
    return `<p>${t}</p>`;
  }

  // Split into sentences, then group into ~500-char paragraphs.
  // Sentence boundary: period/exclamation/question followed by space or end.
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const paragraphs: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length + 1 > PARAGRAPH_CHARS) {
      paragraphs.push(current.trim());
      current = sentence;
    } else {
      current = current.length > 0 ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());

  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

/**
 * Result from `fetchYouTubeTranscriptResult` — tells the caller whether the body is
 * a real transcript or nothing was found. The `description-fallback` kind has been
 * removed: if ALL methods fail, return `{ kind: "none" }`.
 */
export type TranscriptResult =
  | { kind: "transcript"; text: string }
  | { kind: "none" };

// ---------------------------------------------------------------------------
// Direct YouTube methods (gated on ALLOW_DIRECT_YOUTUBE=1)
// ---------------------------------------------------------------------------

/**
 * Returns true if the direct YouTube path is enabled.
 * Set ALLOW_DIRECT_YOUTUBE=1 in GitHub Actions or other environments that
 * allow direct youtube.com requests.
 */
export function isDirectYouTubeEnabled(): boolean {
  return process.env["ALLOW_DIRECT_YOUTUBE"] === "1";
}

/**
 * Returns true if a yt-dlp binary is available on PATH.
 * Used to decide whether to attempt yt-dlp transcript extraction.
 */
export function isYtDlpAvailable(): boolean {
  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch transcript via the direct watch-page method (no proxy).
 * ONLY call when ALLOW_DIRECT_YOUTUBE=1.
 * Returns "" on any failure.
 */
export async function fetchDirectYouTubeTranscript(
  videoId: string,
  fetchFn: FetchFn,
): Promise<string> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetchFn(watchUrl, {
      headers: {
        Cookie: "CONSENT=YES+cb; SOCS=CAISNQ",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return "";

    const html = await res.text();
    const playerResponse = extractPlayerResponse(html);
    if (!playerResponse) return "";

    const tracks =
      playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = pickCaptionTrack(tracks);
    if (!track) return "";

    // Try json3 format first
    const json3Res = await fetchFn(`${track.baseUrl}&fmt=json3&hl=en&gl=US`);
    if (json3Res.ok) {
      const json3Text = await json3Res.text();
      const json3Result = parseTranscriptJson3(json3Text);
      if (json3Result) return json3Result;
    }

    // Try srv3 format
    const srv3Res = await fetchFn(`${track.baseUrl}&fmt=srv3&hl=en&gl=US`);
    if (srv3Res.ok) {
      const srv3Text = await srv3Res.text();
      const srv3Result = parseTranscriptJson3(srv3Text);
      if (srv3Result) return srv3Result;
    }

    // Fall back to raw XML
    const xmlRes = await fetchFn(`${track.baseUrl}&hl=en&gl=US`);
    if (xmlRes.ok) {
      const xmlText = await xmlRes.text();
      return parseTranscriptXml(xmlText);
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * Fetch transcript via yt-dlp subprocess.
 * ONLY call when ALLOW_DIRECT_YOUTUBE=1 AND isYtDlpAvailable().
 * Returns "" on any failure.
 */
export async function fetchYtDlpTranscript(videoId: string): Promise<string> {
  const tmpBase = path.join(os.tmpdir(), `khzytdlp-${videoId}`);
  try {
    spawnSync(
      "yt-dlp",
      [
        "--write-auto-sub",
        "--write-sub",
        "--sub-lang", "en",
        "--sub-format", "vtt",
        "--skip-download",
        "--no-warnings",
        "-o", tmpBase,
        "--",
        videoId,
      ],
      { timeout: 60000 },
    );

    // Check primary VTT path, then fallback
    const candidates = [
      `${tmpBase}.en.vtt`,
      `${tmpBase}.en-orig.vtt`,
    ];

    let content = "";
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        content = fs.readFileSync(candidate, "utf8");
        break;
      }
    }

    return content ? sanitizePodcastTranscript(content, "text/vtt") : "";
  } catch {
    return "";
  } finally {
    // Clean up all temp files matching the base pattern
    try {
      const dir = path.dirname(tmpBase);
      const base = path.basename(tmpBase);
      const files = fs.readdirSync(dir).filter((f) => f.startsWith(base));
      for (const f of files) {
        try { fs.unlinkSync(path.join(dir, f)); } catch {}
      }
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Fetch a YouTube transcript via proxy (Invidious → Piped), with optional
 * direct fallback methods gated on ALLOW_DIRECT_YOUTUBE=1.
 *
 * Layer order:
 *   1. Proxy (Invidious → Piped) — always attempted first.
 *   2. Direct watch-page — only when ALLOW_DIRECT_YOUTUBE=1.
 *   3. yt-dlp subprocess — only when ALLOW_DIRECT_YOUTUBE=1 AND yt-dlp is on PATH.
 *
 * Returns a `TranscriptResult`. Never throws.
 */
export async function fetchYouTubeTranscriptResult(
  videoId: string,
  fetchFn: FetchFn,
): Promise<TranscriptResult> {
  if (!videoId) return { kind: "none" };

  // 1. Always try proxy first
  const proxyResult = await fetchProxyTranscript(videoId, fetchFn);
  if (proxyResult.kind === "transcript") return proxyResult;

  // 2-3. Direct methods — only if explicitly enabled (e.g. GitHub Actions)
  if (isDirectYouTubeEnabled()) {
    const direct = await fetchDirectYouTubeTranscript(videoId, fetchFn);
    if (direct) return { kind: "transcript", text: direct };

    if (isYtDlpAvailable()) {
      const ytdlp = await fetchYtDlpTranscript(videoId);
      if (ytdlp) return { kind: "transcript", text: ytdlp };
    }
  }

  return { kind: "none" };
}

/**
 * Legacy shim — returns plain transcript text or "" for the enrichContent layer.
 * Callers that need to distinguish real-transcript vs none should
 * use `fetchYouTubeTranscriptResult` directly.
 *
 * @deprecated Use fetchYouTubeTranscriptResult + enrichContent integration below.
 */
export async function fetchYouTubeTranscript(videoId: string, fetchFn: FetchFn): Promise<string> {
  const result = await fetchYouTubeTranscriptResult(videoId, fetchFn);
  return result.kind === "transcript" ? result.text : "";
}
