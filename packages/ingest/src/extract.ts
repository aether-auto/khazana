import { Readability } from "@mozilla/readability";
import { extractFromHtml as articleExtractorFromHtml } from "@extractus/article-extractor";
import { parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";

export interface ExtractedArticle {
  /** Sanitized, render-ready article HTML (the `body` contract). */
  html: string;
  /** Plain-text rendering of the article, used for length/quality checks. */
  text: string;
}

// Tags we keep for reader-mode rendering. Everything else (script/style/iframe/
// form/etc.) is dropped by sanitize-html since it isn't on this allowlist.
const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "img", "a", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "em", "strong", "i", "b", "sup", "sub", "span", "abbr",
];

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title"],
    abbr: ["title"],
  },
  // Only http(s) links/images; no javascript:/data: vectors.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  // Force external links to be safe to render.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
  // Drop content of disallowed structural tags entirely rather than unwrapping.
  nonTextTags: ["script", "style", "textarea", "noscript", "iframe"],
};

/** Sanitize an arbitrary HTML fragment down to the reader-mode allowlist. */
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTS).trim();
}

/** Collapse an HTML fragment to plain text for length / quality checks. */
export function htmlToText(html: string): string {
  // sanitize-html with no allowed tags strips markup but keeps text + entities.
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

/** Build an ExtractedArticle from raw content HTML, or null if it sanitizes empty. */
function toExtracted(contentHtml: string | null | undefined, textHint?: string | null): ExtractedArticle | null {
  if (!contentHtml) return null;
  const sanitized = sanitizeArticleHtml(contentHtml);
  if (!sanitized) return null;
  const text = (textHint ?? "").replace(/\s+/g, " ").trim() || htmlToText(sanitized);
  return { html: sanitized, text };
}

/**
 * Extract the main article content from a full HTML page.
 *
 * Uses @mozilla/readability over a lightweight linkedom DOM (no jsdom), then
 * sanitizes the result. Returns null when the page has no recoverable article
 * (readability fails, or the extracted content is empty after sanitizing) so
 * callers can fall back to the RSS summary.
 *
 * Pure with respect to the network: takes an HTML string, does no fetching.
 */
export function extractArticle(html: string, url: string): ExtractedArticle | null {
  if (!html || !html.trim()) return null;
  let content: string | null | undefined;
  let textContent: string | null | undefined;
  try {
    // linkedom's document is structurally compatible with what Readability needs.
    const { document } = parseHTML(html, { location: { href: url } } as never);
    const article = new Readability(document as never).parse();
    content = article?.content;
    textContent = article?.textContent;
  } catch {
    return null;
  }
  return toExtracted(content, textContent);
}

/**
 * Second-pass extractor: @extractus/article-extractor over the same HTML.
 *
 * Heuristics differ from Readability, so this recovers articles Readability
 * misses (or truncates). Operates purely on the passed HTML — no network. Always
 * resolves; returns null on any failure or empty result.
 */
export async function extractWithArticleExtractor(
  html: string,
  url: string,
): Promise<ExtractedArticle | null> {
  if (!html || !html.trim()) return null;
  try {
    const article = await articleExtractorFromHtml(html, url);
    return toExtracted(article?.content);
  } catch {
    return null;
  }
}

/**
 * Find an AMP version of the page via <link rel="amphtml">, returned as an
 * absolute URL. AMP pages are stripped-down and Readability-friendly, so they
 * often yield clean full text when the canonical page does not.
 */
export function findAmpUrl(html: string, baseUrl: string): string | null {
  if (!html) return null;
  try {
    const { document } = parseHTML(html, { location: { href: baseUrl } } as never);
    const link = document.querySelector('link[rel~="amphtml"]') as { getAttribute(n: string): string | null } | null;
    const href = link?.getAttribute("href")?.trim();
    if (!href) return null;
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Last-resort text source: page metadata (og:description / twitter:description /
 * meta description / JSON-LD articleBody). Wrapped in a single <p> so it renders.
 * Better than a bare link, though shorter than true full text.
 */
export function extractMetaText(html: string, url: string): ExtractedArticle | null {
  if (!html || !html.trim()) return null;
  try {
    const { document } = parseHTML(html, { location: { href: url } } as never);
    const pick = (sel: string, attr = "content"): string => {
      const el = document.querySelector(sel) as { getAttribute(n: string): string | null } | null;
      return (el?.getAttribute(attr) ?? "").trim();
    };

    // Prefer JSON-LD articleBody (usually the longest), then meta descriptions.
    let best = "";
    for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      const raw = (node as { textContent?: string }).textContent;
      if (!raw) continue;
      try {
        const body = findArticleBody(JSON.parse(raw));
        if (body && body.length > best.length) best = body;
      } catch {
        // ignore malformed JSON-LD blocks
      }
    }
    for (const sel of [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]) {
      const v = pick(sel);
      if (v.length > best.length) best = v;
    }

    const text = best.replace(/\s+/g, " ").trim();
    if (!text) return null;
    return toExtracted(`<p>${escapeHtml(text)}</p>`, text);
  } catch {
    return null;
  }
}

/** Recursively search parsed JSON-LD for an `articleBody` string. */
function findArticleBody(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findArticleBody(n);
      if (found) return found;
    }
    return null;
  }
  const rec = node as Record<string, unknown>;
  if (typeof rec.articleBody === "string" && rec.articleBody.trim()) return rec.articleBody;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage"]) {
    const found = findArticleBody(rec[key]);
    if (found) return found;
  }
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
