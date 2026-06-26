import type { FetchFn } from "./fetchers/build-source.js";
import { withRetry } from "./retry.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Realistic browser UA so YouTube serves the full watch page. */
const YOUTUBE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Added to the transcript base URL to request clean JSON output. */
const JSON3_SUFFIX = "&fmt=json3";

/**
 * Minimum character count that separates a "real transcript" from a
 * description blurb. Below this we fall back to description-only mode.
 */
const MIN_TRANSCRIPT_CHARS = 300;

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

/** Wrap transcript plain text into simple paragraph HTML for `body`. */
export function transcriptToHtml(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return `<p>${t}</p>`;
}

/**
 * Result from `fetchYouTubeTranscript` — tells the caller whether the body is
 * a real transcript or a short description-only fallback.
 */
export type TranscriptResult =
  | { kind: "transcript"; text: string }
  | { kind: "description-fallback"; text: string }
  | { kind: "none" };

/**
 * Fetch a real YouTube transcript for `videoId` using the watch-page method:
 *
 * 1. Fetch `https://www.youtube.com/watch?v={id}` with a browser UA.
 * 2. Extract `ytInitialPlayerResponse` from the page JS.
 * 3. Read `captions.playerCaptionsTracklistRenderer.captionTracks[]` and pick
 *    an English track (or the first available).
 * 4. Fetch the track's `baseUrl` with `&fmt=json3` for clean JSON; fall back
 *    to parsing the XML timedtext if JSON fails.
 *
 * Returns a `TranscriptResult` so the caller can flag description-only items.
 * Never throws — any error yields `{ kind: "none" }`.
 */
export async function fetchYouTubeTranscriptResult(
  videoId: string,
  fetchFn: FetchFn,
): Promise<TranscriptResult> {
  if (!videoId) return { kind: "none" };

  try {
    // Step 1: fetch the watch page with a realistic browser UA.
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await withRetry((attempt) =>
      fetchFn(pageUrl, {
        headers: {
          "User-Agent": YOUTUBE_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          // Signal we accept gzip so the response isn't a stub.
          "Accept-Encoding": attempt === 1 ? "gzip, deflate, br" : "identity",
        },
      })
    );
    if (!pageRes.ok) return { kind: "none" };
    const html = await pageRes.text();

    // Detect hard consent / login walls where the ENTIRE page is a redirect.
    // Note: accounts.google.com appears as a sign-in link in every normal watch
    // page — only bail when the page is actually redirecting (consent wall).
    if (
      html.includes("consent.youtube.com") ||
      html.startsWith("<!DOCTYPE html><html lang=\"en\"><head><meta http-equiv=\"refresh\"")
    ) {
      return { kind: "none" };
    }

    // Step 2: parse ytInitialPlayerResponse from the page.
    const playerResponse = extractPlayerResponse(html);
    if (!playerResponse) return { kind: "none" };

    // Step 3: pick the best caption track.
    const tracks =
      playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = pickCaptionTrack(tracks);
    if (!track?.baseUrl) return { kind: "none" };

    // Step 4a: try json3 format (cleaner than XML).
    const json3Url = `${track.baseUrl}${JSON3_SUFFIX}`;
    const json3Res = await withRetry(() => fetchFn(json3Url, { headers: { "User-Agent": YOUTUBE_UA } }));
    if (json3Res.ok) {
      const json3Text = await json3Res.text();
      const parsed = parseTranscriptJson3(json3Text);
      if (parsed.length >= MIN_TRANSCRIPT_CHARS) return { kind: "transcript", text: parsed };
    }

    // Step 4b: fall back to XML timedtext parsing.
    const xmlRes = await withRetry(() => fetchFn(track.baseUrl, { headers: { "User-Agent": YOUTUBE_UA } }));
    if (xmlRes.ok) {
      const xmlText = await xmlRes.text();
      const parsed = parseTranscriptXml(xmlText);
      if (parsed.length >= MIN_TRANSCRIPT_CHARS) return { kind: "transcript", text: parsed };
    }

    return { kind: "none" };
  } catch {
    return { kind: "none" };
  }
}

/**
 * Legacy shim — returns plain transcript text or "" for the enrichContent layer.
 * Callers that need to distinguish real-transcript vs description-fallback should
 * use `fetchYouTubeTranscriptResult` directly.
 *
 * @deprecated Use fetchYouTubeTranscriptResult + enrichContent integration below.
 */
export async function fetchYouTubeTranscript(videoId: string, fetchFn: FetchFn): Promise<string> {
  const result = await fetchYouTubeTranscriptResult(videoId, fetchFn);
  return result.kind === "transcript" ? result.text : "";
}
