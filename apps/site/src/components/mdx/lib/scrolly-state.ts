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

/**
 * The single scrollama trigger offset (fraction from the top of the viewport)
 * that drives BOTH the sticky-chart swap and the active-prose highlight. Sharing
 * one threshold is what keeps them in lockstep: the step crossing this line is
 * simultaneously the chart shown and the prose highlighted. Centered (~0.5) so
 * the active prose sits beside the vertically-centered sticky graphic.
 */
export const STEP_TRIGGER_OFFSET = 0.5;

/**
 * Whether step `i` is the active step. The component uses this ONE predicate for
 * both `<Chart>` selection and the `--active` prose class, so the prose can never
 * lag the chart — they read the same resolved index.
 */
export function isActiveStep(i: number, active: number): boolean {
  return i === active;
}

/**
 * Resolve the active step PURELY from each step's current viewport-relative top
 * (`getBoundingClientRect().top`), the viewport height, and the trigger offset.
 *
 * Why this exists: <Scrolly> hydrates LATE (`client:visible`, ~2500px down), so
 * scrollama sets up its observers mid-scroll and only fires `onStepEnter` on
 * later threshold CROSSINGS — `active` then freezes wherever it landed at
 * hydration (the round-1/round-2 FAIL: stuck on step 0 scrolling in, or step 2
 * scrolling past). This resolver is position-based: it returns the correct active
 * step for ANY scroll position, so re-running it on scroll/resize can never
 * freeze. The active step is the LAST step whose top has reached/passed the
 * trigger line (`offset * viewportH` from the top of the viewport); before any
 * step reaches the line it is step 0.
 */
export function activeStepFromScroll(
  tops: ReadonlyArray<number>,
  viewportH: number,
  offset: number,
): number {
  if (tops.length === 0) return 0;
  const line = offset * viewportH;
  let active = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i]! <= line) active = i;
  }
  return active;
}
