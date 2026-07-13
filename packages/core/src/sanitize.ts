import type { FeedItem } from "./feed-item.js";

/**
 * Structural "does this look dangerous" check — a dependency-free defense-in-depth
 * boundary check usable anywhere (`@khazana/core` has no sanitize-html). It does
 * NOT clean anything and it does NOT flag benign leaked markup (a stray
 * `<figure>`/`<img>` is ugly, not dangerous); it only detects active-content
 * vectors that must never reach a `set:html` render sink. The real allowlist
 * sanitization lives in `@khazana/ingest` (`sanitizeArticleHtml` /
 * `sanitizeFeedItemContent`); this is the last-line guard that DROPS anything
 * that still smells unsafe after that ran (or never ran).
 */
const UNSAFE_MARKUP_PATTERNS: readonly RegExp[] = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*form\b/i,
  /<\s*style\b/i,
  /<\s*link\b/i,
  /<\s*meta\b/i,
  /<\s*base\b/i,
  /<\s*svg\b/i,
  // Inline event handlers: on…= (onerror, onclick, onload, …)
  /\son\w+\s*=/i,
  // javascript:/vbscript: URIs and data: HTML payloads
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
];

/** True when the string contains active-content markup that must never render. */
export function containsUnsafeMarkup(value: string | undefined | null): boolean {
  if (!value) return false;
  return UNSAFE_MARKUP_PATTERNS.some((re) => re.test(value));
}

/**
 * Which renderable fields of a FeedItem still carry unsafe markup. Empty array
 * ⇒ the item is safe to persist/render. `summary` and `body` are the only fields
 * ever written to a `set:html` sink (body) or shown as excerpt text (summary).
 */
export function feedItemUnsafeReasons(item: FeedItem): string[] {
  const reasons: string[] = [];
  if (containsUnsafeMarkup(item.summary)) reasons.push("summary contains unsafe markup");
  if (containsUnsafeMarkup(item.body)) reasons.push("body contains unsafe markup");
  return reasons;
}

export interface DroppedFeedItem {
  item: FeedItem;
  reasons: string[];
}

export interface FeedItemPartition {
  safe: FeedItem[];
  dropped: DroppedFeedItem[];
}

/**
 * Split a feed into items safe to ship and items to DROP because they still
 * contain unsafe markup after sanitization. This is the "compiler" safety net —
 * wire it at every seam that produces a committed/consumed feed file (ingest's
 * `writeFeed`, curate's `writeCuratedFeed`) so a single bad item is excluded
 * rather than failing the whole build.
 */
export function partitionSafeFeedItems(items: FeedItem[]): FeedItemPartition {
  const safe: FeedItem[] = [];
  const dropped: DroppedFeedItem[] = [];
  for (const item of items) {
    const reasons = feedItemUnsafeReasons(item);
    if (reasons.length === 0) safe.push(item);
    else dropped.push({ item, reasons });
  }
  return { safe, dropped };
}
