// apps/site/src/components/mdx/lib/stepper-index.ts
// Pure index / navigation math for <Stepper> — extracted for testability.
// No DOM, no React: just the arithmetic that decides which step is visible and
// how prev/next move through the sequence. Keeping this pure means the island
// stays a thin shell and the tricky boundary logic is unit-tested.

/** A Stepper display mode. */
export type StepperMode = "reveal" | "tabs" | "all";

/**
 * Clamp an arbitrary index into a valid [0, length-1] range.
 * Returns 0 for an empty sequence (callers guard on length separately, but this
 * keeps the return type a plain number so downstream indexing never yields
 * `undefined`).
 */
export function clampStepIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const i = Math.trunc(index);
  if (i < 0) return 0;
  if (i > length - 1) return length - 1;
  return i;
}

/**
 * The next index when the reader advances, clamped at the last step (no wrap).
 * prev/next are deliberately non-wrapping: a step sequence is linear, and
 * silently looping to step 1 from the last step would disorient the reader.
 */
export function nextStepIndex(current: number, length: number): number {
  return clampStepIndex(current + 1, length);
}

/** The previous index, clamped at the first step (no wrap). */
export function prevStepIndex(current: number, length: number): number {
  return clampStepIndex(current - 1, length);
}

/** Whether the "prev" control should be enabled at this position. */
export function canGoPrev(current: number, length: number): boolean {
  return length > 0 && clampStepIndex(current, length) > 0;
}

/** Whether the "next" control should be enabled at this position. */
export function canGoNext(current: number, length: number): boolean {
  return length > 0 && clampStepIndex(current, length) < length - 1;
}

/**
 * A human 1-based label for a step number ("01", "02", … "10", "11").
 * Zero-padded to at least two digits so the amber number rail stays aligned.
 */
export function stepNumberLabel(i: number): string {
  const n = i + 1;
  return n < 10 ? `0${n}` : String(n);
}
