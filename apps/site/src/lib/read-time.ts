// apps/site/src/lib/read-time.ts
// Reading-time telemetry for the study header. Pure + tested; the layout shows
// it as a single cold instrument line ("12 min read"). 230 wpm is the common
// long-form estimate; we never report less than 1.

const WORDS_PER_MINUTE = 230;

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
