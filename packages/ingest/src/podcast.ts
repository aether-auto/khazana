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

/** Turn fetched transcript content (plain text or HTML) into sanitized body HTML. */
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

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    const type = /\.html?(\?|$)/i.test(url) ? "text/html" : "text/plain";
    return transcriptContentToHtml(body, type);
  } catch {
    return "";
  }
}
