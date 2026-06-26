import { Readability } from "@mozilla/readability";
import { extractFromHtml as articleExtractorFromHtml } from "@extractus/article-extractor";
import { parseHTML } from "linkedom";
import sanitizeHtml from "sanitize-html";

// ---------------------------------------------------------------------------
// Boilerplate heuristics (class/id patterns → drop whole element)
// ---------------------------------------------------------------------------

/** Case-insensitive patterns that identify navigation / chrome elements. */
const BOILERPLATE_CLASS_PATTERNS = [
  /\bnav(igation|bar|menu|drawer|toggle)?\b/i,
  /\bmenu\b/i,
  /\bheader\b/i,
  /\bfooter\b/i,
  /\bsidebar\b/i,
  /\bshare\b/i,
  /\bsocial(-\w+)?\b/i,
  /\bsubscribe\b/i,
  /\bnewsletter\b/i,
  /\bcookie(s|-notice|-banner|-consent)?\b/i,
  /\bconsent\b/i,
  /\bbreadcrumb\b/i,
  /\bpaginat\b/i,
  /\brelated(-\w+)?\b/i,
  /\brecirc\b/i,
  /\bpromo\b/i,
  /\bsignup\b/i,
  /\bmasthead\b/i,
  /\bskip(-\w+)?\b/i,
  /\bsite-nav\b/i,
  /\btoc\b/i,
];

const BOILERPLATE_ROLE_VALUES = new Set([
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
]);

/** Text patterns for standalone boilerplate anchor text (whole-word, case-insensitive). */
const STANDALONE_LINK_TEXTS = [
  /^skip\s+to\s+(content|main|navigation|article)$/i,
  /^sign[\s-]?in$/i,
  /^log[\s-]?in$/i,
  /^subscribe(d)?$/i,
  /^newsletter$/i,
  /^share$/i,
  /^menu$/i,
  /^home$/i,
];

/**
 * Min text length (chars, excluding markup) a paragraph / block needs to be
 * considered "real prose" rather than a caption or label.
 */
const PROSE_MIN_LEN = 140;

/** Link-text-to-total-text ratio above which a leading block is considered boilerplate. */
const LINK_DENSITY_THRESHOLD = 0.6;

/**
 * Strip navigation, social-share, cookie, subscribe, and related-posts
 * boilerplate from an already-sanitized HTML fragment.
 *
 * Operates as a post-processing step after sanitize-html has already removed
 * dangerous elements; it receives the sanitized fragment, not raw page HTML.
 *
 * Strategy (surgical — prose lists are intentionally preserved):
 *  1. Wrap fragment in a linkedom document, walk top-level elements.
 *  2. Drop elements whose class/id matches known boilerplate patterns.
 *  3. Drop elements with ARIA roles that are pure site-chrome.
 *  4. While no real prose paragraph has been seen yet, also remove:
 *     a. Standalone anchor elements whose text matches skip-to / sign-in / etc.
 *     b. Leading ul/ol/div blocks that are link-dense (link ratio ≥ threshold)
 *        before the first paragraph with real prose (> PROSE_MIN_LEN chars).
 *  5. Remove trailing ul/ol blocks that are 100% links and come after the last
 *     real prose paragraph (related-posts / recirc pattern).
 *  6. Collapse runs of blank nodes; trim leading/trailing whitespace.
 */
export function stripBoilerplate(html: string): string {
  if (!html || !html.trim()) return "";

  const { document } = parseHTML(`<body>${html}</body>`);
  // linkedom returns its own types; cast through unknown for strict TS.
  const body = document.querySelector("body") as unknown as LinkedomBody;

  // --- Pass 1: drop class/id/role boilerplate anywhere in the tree ---
  const allElements = Array.from(body.querySelectorAll("*")) as LinkedomEl[];
  for (const el of allElements) {
    if (isBoilerplateElement(el)) el.remove();
  }

  // --- Pass 2: leading-block analysis on top-level children ---
  const firstProseIdx = findFirstProseIndex(body);

  // Remove leading dense-link blocks and standalone boilerplate anchors
  // that appear before the first real prose paragraph.
  const topChildren = Array.from(body.childNodes) as LinkedomNode[];

  for (let i = 0; i < topChildren.length && i < firstProseIdx; i++) {
    const node = topChildren[i]!;
    if (node.nodeType === 3 /* TEXT_NODE */) continue; // keep raw text (rare)
    const tag = (node.tagName ?? "").toLowerCase();

    // Standalone skip/sign-in/subscribe/menu anchors
    if (tag === "a") {
      const text = (node.textContent ?? "").trim();
      if (STANDALONE_LINK_TEXTS.some((re) => re.test(text))) {
        node.remove();
        continue;
      }
    }

    // Link-dense leading blocks (ul, ol, div, nav, p)
    if (["ul", "ol", "div", "nav", "p"].includes(tag) && isLinkDense(node)) {
      node.remove();
    }
  }

  // --- Pass 3: trailing related-posts pure-link list ---
  const lastProseIdx = findLastProseIndex(body);
  const topChildrenAfter = Array.from(body.childNodes) as LinkedomNode[];
  let sawProseFromEnd = false;
  for (let i = topChildrenAfter.length - 1; i >= 0; i--) {
    if (i <= lastProseIdx) { sawProseFromEnd = true; }
    if (!sawProseFromEnd) {
      const node = topChildrenAfter[i]!;
      const tag = (node.tagName ?? "").toLowerCase();
      if (["ul", "ol"].includes(tag) && isPureLinkList(node)) node.remove();
    }
  }

  return (body.innerHTML as string).trim();
}

// ---------------------------------------------------------------------------
// Helpers for stripBoilerplate — typed via local interfaces so we don't
// conflict with the global DOM `ChildNode` interface.
// ---------------------------------------------------------------------------

/** Minimal interface for a linkedom element (cast from querySelectorAll result). */
interface LinkedomEl {
  tagName: string;
  textContent: string | null;
  getAttribute(n: string): string | null;
  querySelectorAll(s: string): ArrayLike<{ textContent: string | null }>;
  remove(): void;
}

/** Minimal interface for a linkedom body element. */
interface LinkedomBody extends LinkedomEl {
  childNodes: ArrayLike<LinkedomNode>;
  innerHTML: string;
}

/** Minimal interface for a linkedom child node (may be text or element). */
interface LinkedomNode {
  nodeType: number;
  tagName?: string;
  textContent: string | null;
  getAttribute(n: string): string | null;
  querySelectorAll(s: string): ArrayLike<{ textContent: string | null }>;
  remove(): void;
}

function isBoilerplateElement(el: LinkedomEl): boolean {
  const tag = (el.tagName ?? "").toLowerCase();
  // Never strip inline / content-level tags — they cannot be boilerplate roots
  const CONTENT_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote",
    "pre", "code", "img", "figure", "figcaption", "table", "thead",
    "tbody", "tr", "th", "td", "em", "strong", "i", "b", "span",
    "abbr", "sup", "sub", "br", "hr", "a",
  ]);
  if (CONTENT_TAGS.has(tag)) return false;

  // Structural elements: check ARIA role, then class/id
  const role = (el.getAttribute("role") ?? "").toLowerCase();
  if (BOILERPLATE_ROLE_VALUES.has(role)) return true;

  const cls = (el.getAttribute("class") ?? "").toLowerCase();
  const id = (el.getAttribute("id") ?? "").toLowerCase();
  return BOILERPLATE_CLASS_PATTERNS.some((re) => re.test(`${cls} ${id}`));
}

/**
 * Return the index of the first top-level child that is a real prose block
 * (> PROSE_MIN_LEN chars of text). Returns childNodes.length when none found.
 */
function findFirstProseIndex(body: LinkedomBody): number {
  const children = Array.from(body.childNodes);
  const PROSE_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"]);
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    if (PROSE_TAGS.has((node.tagName ?? "").toLowerCase())) {
      if ((node.textContent ?? "").replace(/\s+/g, " ").trim().length >= PROSE_MIN_LEN) return i;
    }
  }
  return children.length;
}

/**
 * Return the index of the last top-level child that is a real prose block.
 * Used to identify where trailing boilerplate begins.
 */
function findLastProseIndex(body: LinkedomBody): number {
  const children = Array.from(body.childNodes);
  const PROSE_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"]);
  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i]!;
    if (PROSE_TAGS.has((node.tagName ?? "").toLowerCase())) {
      if ((node.textContent ?? "").replace(/\s+/g, " ").trim().length >= PROSE_MIN_LEN) return i;
    }
  }
  return 0;
}

/**
 * True when the ratio of link-text to total-text meets or exceeds the threshold.
 * A link-dense block before any real prose is almost certainly site navigation.
 */
function isLinkDense(node: LinkedomNode): boolean {
  const totalText = (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
  if (totalText === 0) return true;
  const links = Array.from(node.querySelectorAll("a"));
  if (links.length < 2) return false; // a single link is fine
  const linkText = links.reduce(
    (acc, a) => acc + (a.textContent ?? "").replace(/\s+/g, " ").trim().length, 0,
  );
  return linkText / totalText >= LINK_DENSITY_THRESHOLD;
}

/**
 * True when a ul/ol is almost entirely composed of link text (≥90%) — the
 * classic related-posts / recirc pattern at the end of articles.
 */
function isPureLinkList(node: LinkedomNode): boolean {
  const totalText = (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
  if (totalText === 0) return true;
  const links = Array.from(node.querySelectorAll("a"));
  if (links.length === 0) return false;
  const linkText = links.reduce(
    (acc, a) => acc + (a.textContent ?? "").replace(/\s+/g, " ").trim().length, 0,
  );
  return linkText / totalText >= 0.9;
}

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

/**
 * Sanitize an arbitrary HTML fragment down to the reader-mode allowlist, then
 * strip navigation/chrome boilerplate from the result.
 */
export function sanitizeArticleHtml(html: string): string {
  const sanitized = sanitizeHtml(html, SANITIZE_OPTS).trim();
  return stripBoilerplate(sanitized);
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
