/**
 * Feed-summary display helpers, shared across subsystems (the site's Feed loader
 * AND the committed feed archive). A raw feed `summary` can be anything from a
 * one-line teaser to an entire post (some RSS sources ship the full body as their
 * `<description>`); rendered verbatim these bloat every surface that embeds them.
 * `cleanSummary` normalizes any raw summary into a short, plain-text teaser.
 *
 * Pure + deterministic so SSR, client re-render, and the archive writer all agree.
 */

/**
 * Max length of a feed-card `summary` for DISPLAY. Some sources (e.g. Pluralistic)
 * ship the entire post as their RSS `<description>`, so raw summaries range from a
 * sentence to ~95k chars. Rendered verbatim they turn feed cards into walls of text
 * and bloat the page (the register JSON embeds every summary). We clamp to a short
 * teaser at load — the full text is always one click away on the source, and Reads
 * carry their own long-form body.
 */
export const SUMMARY_MAX_CHARS = 280;

/**
 * Normalize a raw feed summary into a short plain-text teaser: strip any HTML the
 * source left in the description, decode the few common entities, collapse
 * whitespace, and truncate to ~SUMMARY_MAX_CHARS at a word boundary with an
 * ellipsis. Pure + deterministic so SSR and any client re-render agree.
 */
export function cleanSummary(raw: string, maxChars = SUMMARY_MAX_CHARS): string {
  if (!raw) return "";
  const text = raw
    .replace(/<[^>]*>/g, " ") // drop HTML tags RSS descriptions carry
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_m, e: string) =>
      e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "nbsp" ? " " : "'",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
