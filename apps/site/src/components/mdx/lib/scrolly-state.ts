// apps/site/src/components/mdx/lib/scrolly-state.ts
/** Pure helpers for <Scrolly> active-step bookkeeping. No DOM. */

export function clampStepIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  return index;
}

/**
 * Returns the clamped active step index when `count > 0`, or `null` when the
 * steps array is empty.  Callers that get `null` must render a safe fallback
 * rather than indexing into the steps array.
 */
export function safeActiveStep(active: number, count: number): number | null {
  if (count <= 0) return null;
  return clampStepIndex(active, count);
}

export interface ResolveArgs {
  /** index reported by scrollama onStepEnter */
  entered: number;
  count: number;
  /** previously active index, used as a NaN fallback */
  current: number;
}

export function resolveActiveStep({ entered, count, current }: ResolveArgs): number {
  if (Number.isNaN(entered)) return clampStepIndex(current, count);
  return clampStepIndex(entered, count);
}
