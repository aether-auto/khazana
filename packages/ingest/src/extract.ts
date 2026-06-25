import { Readability } from "@mozilla/readability";
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
  if (!content) return null;

  const sanitized = sanitizeArticleHtml(content);
  if (!sanitized) return null;

  const text = (textContent ?? "").replace(/\s+/g, " ").trim();
  return { html: sanitized, text };
}
