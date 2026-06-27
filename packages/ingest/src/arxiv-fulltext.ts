import type { FeedItem } from "@khazana/core";
import type { FetchFn } from "./fetchers/build-source.js";
import { PerHostLimiter } from "./concurrency.js";
import {
  extractArticle,
  extractWithArticleExtractor,
  htmlToText,
  type ExtractedArticle,
} from "./extract.js";

/**
 * arXiv full-text extraction via public HTML mirrors.
 *
 * The RSS feeds (rss.arxiv.org) only carry the *abstract*, which is far under
 * khazana's 5-minute read floor, so every arXiv item is rejected by curate. The
 * full paper, however, is published as clean HTML on free public mirrors:
 *
 *   1. ar5iv (LaTeXML render of the source) — clean, semantic HTML, our primary.
 *   2. arXiv's own native HTML endpoint (arxiv.org/html/<id>) — fallback.
 *
 * We derive those URLs from the abstract/PDF/GUID url, fetch them in order, run
 * the SAME extraction+sanitize pipeline used for articles, and keep the longest
 * clean result. Everything here is best-effort and never throws — a failed
 * mirror falls through to the next, and an empty result lets the caller keep the
 * abstract.
 *
 * $0 / no auth: only public mirrors are touched.
 */

// ---------------------------------------------------------------------------
// Mirror hosts (ordered) + env override
// ---------------------------------------------------------------------------

/** Default ordered mirror host templates. `{id}` is replaced with the bare id. */
const DEFAULT_MIRROR_TEMPLATES = [
  // ar5iv — clean LaTeXML HTML. Both the short alias and the canonical labs host.
  "https://ar5iv.org/abs/{id}",
  "https://ar5iv.labs.arxiv.org/html/{id}",
  // arXiv native HTML render (newer papers only) — fallback.
  "https://arxiv.org/html/{id}",
];

/**
 * Allow operators to override the mirror chain via ARXIV_HTML_MIRRORS — a
 * comma-separated list of templates, each containing `{id}`. Useful if a mirror
 * goes down or a faster one appears. Falls back to the defaults when unset.
 */
function mirrorTemplates(): string[] {
  const raw = (process.env["ARXIV_HTML_MIRRORS"] ?? "").trim();
  if (!raw) return DEFAULT_MIRROR_TEMPLATES;
  const parsed = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.includes("{id}"));
  return parsed.length > 0 ? parsed : DEFAULT_MIRROR_TEMPLATES;
}

// ---------------------------------------------------------------------------
// Per-host rate limiting for mirror fetches
// ---------------------------------------------------------------------------

/**
 * ar5iv (and arXiv) can be slow and dislike bursts; enrichment runs its own
 * pool, so we gate mirror fetches through a dedicated per-host limiter. Knobs:
 *   ARXIV_HOST_MAX_CONCURRENT (default 1), ARXIV_HOST_MIN_GAP_MS (default 1000).
 *
 * Constructed lazily so the env knobs are read on first use (tests can set them
 * after import without ESM hoisting getting in the way).
 */
let _arxivHostLimiter: PerHostLimiter | undefined;
function arxivHostLimiter(): PerHostLimiter {
  if (!_arxivHostLimiter) {
    _arxivHostLimiter = new PerHostLimiter({
      maxConcurrent: parseInt(process.env["ARXIV_HOST_MAX_CONCURRENT"] ?? "", 10) || 1,
      minGapMs: parseInt(process.env["ARXIV_HOST_MIN_GAP_MS"] ?? "", 10) || 1000,
    });
  }
  return _arxivHostLimiter;
}

/** Min plain-text length for a mirror extraction to count as "real full text". */
const MIN_MIRROR_TEXT = 1200;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---------------------------------------------------------------------------
// arxivId — robust bare-id extraction
// ---------------------------------------------------------------------------

/**
 * Extract the bare arXiv id (without any version suffix) from any arXiv-flavored
 * url or GUID. Returns null when the input is not recognizably arXiv.
 *
 * Handles:
 *   - modern abs/pdf urls: https://arxiv.org/abs/2501.01234[v2][/], .../pdf/<id>[.pdf]
 *   - rss.arxiv.org urls and the OAI GUID form: oai:arXiv.org:2501.01234
 *   - old-style category ids: hep-th/9901001[v2]
 *
 * Version suffixes (vN) are always stripped so mirrors resolve to the latest.
 */
export function arxivId(input: string): string | null {
  if (!input) return null;
  let s = input.trim();

  // OAI GUID form: oai:arXiv.org:<id>
  const oai = /(?:^|[:/])oai:arxiv\.org:(.+)$/i.exec(s);
  if (oai?.[1]) s = oai[1];

  // Old-style id: <category>[.<subcat>]/<7-digits>  (e.g. hep-th/9901001, math.AG/0601001)
  const old = /([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?/i.exec(s);
  if (old?.[1]) return old[1].toLowerCase();

  // Modern id: YYMM.NNNNN (4 digit prefix, 4-5 digit suffix), optional vN.
  const modern = /(\d{4}\.\d{4,5})(v\d+)?/.exec(s);
  if (modern?.[1]) return modern[1];

  return null;
}

// ---------------------------------------------------------------------------
// arxivHtmlUrls — ordered mirror list
// ---------------------------------------------------------------------------

/**
 * Derive the ordered list of full-text mirror URLs to try for an arXiv item.
 * Returns [] when the url is not an arXiv item (caller then skips the mirror
 * path entirely).
 */
export function arxivHtmlUrls(itemUrl: string): string[] {
  const id = arxivId(itemUrl);
  if (!id) return [];
  return mirrorTemplates().map((t) => t.replace("{id}", id));
}

// ---------------------------------------------------------------------------
// fetchArxivFullText — try mirrors, extract, return the longest clean result
// ---------------------------------------------------------------------------

/** A candidate extraction together with the mirror url that produced it. */
export interface ArxivFullTextResult {
  /** The mirror url the extracted text came from. */
  mirror: string;
  article: ExtractedArticle;
}

/**
 * Fetch the full paper HTML from arXiv mirrors and extract clean reader-mode
 * content. Tries each mirror in order, stops at the first that yields real full
 * text (>= MIN_MIRROR_TEXT chars), and returns the longest clean candidate seen.
 * Returns null when the item is not arXiv, or when no mirror produced usable
 * full text. Never throws.
 */
export async function fetchArxivFullText(
  item: Pick<FeedItem, "url" | "sourceType">,
  fetchFn: FetchFn,
): Promise<ArxivFullTextResult | null> {
  const urls = arxivHtmlUrls(item.url);
  if (urls.length === 0) return null;

  let best: ArxivFullTextResult | null = null;
  let bestLen = 0;

  for (const mirror of urls) {
    const html = await fetchMirror(mirror, fetchFn);
    if (!html) continue;

    const article = await extractMirrorHtml(html, mirror);
    if (!article) continue;

    if (article.text.length > bestLen) {
      best = { mirror, article };
      bestLen = article.text.length;
    }
    // First mirror with real full text wins — they all render the same paper.
    if (bestLen >= MIN_MIRROR_TEXT) return best;
  }

  return best;
}

/** Fetch one mirror url through the per-host limiter; swallow all errors. */
async function fetchMirror(url: string, fetchFn: FetchFn): Promise<string> {
  try {
    const hostname = new URL(url).hostname;
    return await arxivHostLimiter().run(hostname, async () => {
      const res = await fetchFn(url, { headers: BROWSER_HEADERS });
      if (!res.ok) return "";
      return await res.text();
    });
  } catch {
    return "";
  }
}

/**
 * Run the existing article-extraction pipeline over mirror HTML. Tries
 * Readability first (clean on ar5iv/LaTeXML output), then the second extractor.
 * Returns null when nothing usable came out. Never throws.
 */
async function extractMirrorHtml(html: string, url: string): Promise<ExtractedArticle | null> {
  try {
    const readability = extractArticle(html, url);
    if (readability && readability.text.length >= MIN_MIRROR_TEXT) return readability;

    const extractor = await extractWithArticleExtractor(html, url);
    // Keep whichever is longer (Readability sometimes truncates LaTeXML pages).
    const candidates = [readability, extractor].filter(
      (c): c is ExtractedArticle => c !== null && htmlToText(c.html).length > 0,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  } catch {
    return null;
  }
}
