// Derives a genuine, grounded excerpt from a build item's raw HTML body — the
// same "never invented" contract as reads/lib/build-reads.ts's excerptOf, but
// stripping sanitized feed-item HTML rather than MDX. Used by BuildCard's
// hover/focus reveal: a real opening line of the actual source content, never
// a paraphrase or placeholder. Empty/absent bodies yield an empty excerpt, and
// the card simply renders no reveal panel — we never fabricate one.
const EXCERPT_TARGET = 160;

/** Strip HTML tags and collapse whitespace, matching read-time.ts's own approach. */
function stripHtmlProse(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The opening line(s) of the real prose, truncated at a sentence boundary when
 * one falls in a reasonable range, else at a word boundary — never mid-word.
 * Bodies shorter than the target return in full, no ellipsis. Empty/undefined
 * input returns "".
 */
export function excerptFromHtml(html: string | undefined): string {
  if (!html) return "";
  const prose = stripHtmlProse(html);
  if (prose === "") return "";
  if (prose.length <= EXCERPT_TARGET) return prose;

  const window = prose.slice(0, EXCERPT_TARGET + 1);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  // Prefer a sentence break, but only if it isn't so early the excerpt reads
  // as a fragment (e.g. an abbreviation's stray period near the start).
  if (sentenceEnd > EXCERPT_TARGET * 0.4) return window.slice(0, sentenceEnd + 1).trim();

  const wordBoundary = window.slice(0, EXCERPT_TARGET).lastIndexOf(" ");
  const cut = wordBoundary > 0 ? wordBoundary : EXCERPT_TARGET;
  return `${window.slice(0, cut).trim()}…`;
}
