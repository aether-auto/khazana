// apps/site/src/components/mdx/lib/code-walkthrough.ts
// Pure logic for CodeWalkthrough — line-range clamping + step navigation.
// Extracted so the stepping math is unit-tested independently of Astro/DOM.

export interface WalkthroughStep {
  /** [start, end] 1-based, inclusive line range to highlight. */
  lines: [number, number];
  /** The narration shown while this step is active. */
  note: string;
}

/** A step whose range has been validated + clamped to the code's line count. */
export interface NormalizedStep {
  /** 1-based inclusive start line, clamped to [1, lineCount]. */
  start: number;
  /** 1-based inclusive end line, clamped to [start, lineCount]. */
  end: number;
  note: string;
}

/** Split source into physical lines. A trailing newline does NOT add a blank
 *  final line (matches how Shiki renders `.line` spans). */
export function splitLines(code: string): string[] {
  const normalized = code.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  // Drop a single trailing empty line produced by a final newline.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Count physical lines in the code block. */
export function countLines(code: string): number {
  return splitLines(code).length;
}

/**
 * Clamp a step's [start, end] into the valid 1..lineCount range and guarantee
 * start <= end. Out-of-range or inverted ranges never throw — they degrade to a
 * sensible in-bounds window so a mis-authored step still highlights *something*.
 */
export function normalizeStep(step: WalkthroughStep, lineCount: number): NormalizedStep {
  const max = Math.max(1, lineCount);
  const rawStart = Math.trunc(step.lines[0]);
  const rawEnd = Math.trunc(step.lines[1]);
  let start = clamp(rawStart, 1, max);
  let end = clamp(rawEnd, 1, max);
  if (start > end) [start, end] = [end, start];
  return { start, end, note: step.note };
}

/** Normalize every step against the code's real line count. */
export function normalizeSteps(steps: WalkthroughStep[], lineCount: number): NormalizedStep[] {
  return steps.map((s) => normalizeStep(s, lineCount));
}

/**
 * Advance the active step index. `dir` is -1 (prev) or +1 (next). The index is
 * clamped to [0, count-1] — no wraparound (prev at step 0 stays at 0; next at the
 * last step stays put), which keeps the prev/next buttons' disabled state honest.
 */
export function stepIndex(current: number, dir: number, count: number): number {
  if (count <= 0) return 0;
  return clamp(current + dir, 0, count - 1);
}

/** True when a given 1-based line number falls within a normalized step. */
export function lineInStep(line: number, step: NormalizedStep): boolean {
  return line >= step.start && line <= step.end;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
