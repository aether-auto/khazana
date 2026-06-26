// apps/site/src/lib/read-time.ts
// Reading-time telemetry for the study header and feed cards. Pure + tested.
// 230 wpm for MDX-prose estimates; 225 wpm for HTML body (FeedItem.body).
// We never report less than 1 minute.

const WORDS_PER_MINUTE = 230;
/** Feed-body wpm: slightly lower than MDX prose to account for HTML density. */
const FEED_WPM = 225;

/** Count words in a block of prose (whitespace-delimited, HTML-naive). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

/** Whole-minute read estimate from a word count (floor 1). */
export function estimateReadMinutes(words: number, wpm = WORDS_PER_MINUTE): number {
  if (words <= 0) return 1;
  return Math.max(1, Math.round(words / wpm));
}

/**
 * Compute reading time (minutes, floor 1) from a sanitized HTML body string
 * (FeedItem.body). Strips tags before counting words — avoids inflating the
 * count with attribute text or tag names. Returns 1 for absent/falsy bodies.
 */
export function readTimeFromHtml(html: string | undefined): number {
  if (!html) return 1;
  // Strip all HTML tags, then collapse whitespace for a clean word count.
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const words = countWords(text);
  return Math.max(1, Math.round(words / FEED_WPM));
}
