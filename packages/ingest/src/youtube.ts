import type { FetchFn } from "./fetchers/build-source.js";

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
 * Fetch a YouTube transcript via the free, key-less timedtext endpoint and
 * return it as plain text. Resilient: any failure / missing transcript yields
 * "" so the caller keeps the RSS description. Never throws.
 */
export async function fetchYouTubeTranscript(videoId: string, fetchFn: FetchFn): Promise<string> {
  if (!videoId) return "";
  // Try English variants first, then an unlabelled fetch (auto-captions).
  const urls = [
    `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`,
    `https://www.youtube.com/api/timedtext?lang=en-US&v=${videoId}`,
    `https://www.youtube.com/api/timedtext?v=${videoId}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) continue;
      const xml = await res.text();
      const text = parseTranscriptXml(xml);
      if (text.length > 0) return text;
    } catch {
      // try next variant
    }
  }
  return "";
}
