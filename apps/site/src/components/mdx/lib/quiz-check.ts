// apps/site/src/components/mdx/lib/quiz-check.ts
// Pure answer-checking logic for <Quiz> — extracted for testability. No DOM, no
// React. The island renders; this decides right/wrong. Answers are embedded in
// the props (low-stakes comprehension checks, offline-fine) so all the grading
// is client-side and deterministic.

/** The kind of check: a multiple-choice pick or a typed numeric answer. */
export type QuizKind = "mc" | "numeric";

export interface QuizQuestion {
  /** The question text (plain string, reading voice). */
  prompt: string;
  /** For "mc": the ordered answer choices. Ignored for "numeric". */
  choices?: string[];
  /**
   * The correct answer. For "mc" it is the 0-based index into `choices`.
   * For "numeric" it is the expected number (string is coerced).
   */
  answer: number | string;
  /** Shown after the reader answers, right or wrong — the teaching moment. */
  explain: string;
  /** Defaults to "mc" when `choices` is present, else "numeric". */
  kind?: QuizKind;
}

/**
 * Resolve the effective kind of a question. Explicit `kind` wins; otherwise a
 * question with `choices` is multiple-choice and one without is numeric.
 */
export function questionKind(q: QuizQuestion): QuizKind {
  if (q.kind) return q.kind;
  return Array.isArray(q.choices) && q.choices.length > 0 ? "mc" : "numeric";
}

/**
 * Check a multiple-choice selection. `selected` is the 0-based choice index the
 * reader picked; the question's `answer` is the correct index. Non-numeric or
 * out-of-shape answers are treated as never-correct (fail closed).
 */
export function isMultipleChoiceCorrect(q: QuizQuestion, selected: number): boolean {
  const answer = typeof q.answer === "number" ? q.answer : Number(q.answer);
  if (!Number.isFinite(answer)) return false;
  return selected === answer;
}

/**
 * Parse a reader-typed numeric answer. Accepts leading/trailing whitespace,
 * a leading "+"/"-", commas as thousands separators, and a bare decimal.
 * Returns `null` when the input is not a parseable number (so the caller can
 * show "enter a number" rather than mark it wrong).
 */
export function parseNumericInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (cleaned === "" || cleaned === "+" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Check a numeric answer within an absolute tolerance (default: exact, but a
 * tiny epsilon so 0.1+0.2 style float drift never marks a right answer wrong).
 * `value` is the parsed reader input; `q.answer` is the expected number.
 */
export function isNumericCorrect(q: QuizQuestion, value: number, tolerance = 1e-9): boolean {
  const answer = typeof q.answer === "number" ? q.answer : Number(q.answer);
  if (!Number.isFinite(answer) || !Number.isFinite(value)) return false;
  return Math.abs(value - answer) <= tolerance;
}

/**
 * The canonical human-readable correct answer for the no-JS `<details>` fallback
 * and the post-answer readout. For "mc" this is the correct choice's text (with
 * a fallback to its index if choices are missing); for "numeric" the number.
 */
export function correctAnswerText(q: QuizQuestion): string {
  if (questionKind(q) === "mc") {
    const idx = typeof q.answer === "number" ? q.answer : Number(q.answer);
    const choice = Array.isArray(q.choices) ? q.choices[idx] : undefined;
    return choice ?? String(q.answer);
  }
  return String(q.answer);
}
