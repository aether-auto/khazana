// apps/site/src/components/mdx/lib/scrolly-timeline.ts
//
// Pure, DOM-free math for <ScrollyTimeline>. Everything spatial/temporal lives
// here so the component is a thin renderer and the tricky bits (active
// resolution, scrub↔scroll mapping, playhead glide) are unit-tested.
//
// Active resolution is POSITION-BASED, never crossing-event based: the same
// late-hydration freeze that bit <Scrolly> (a `client:visible` island setting up
// IntersectionObservers mid-scroll, then only reacting to SUBSEQUENT crossings)
// would bite this too. Recomputing from live geometry every frame is correct at
// any scroll position and can never get stuck. See fix-drawscrolly-report.md.

/**
 * The active panel index from each panel's CURRENT viewport-relative top
 * (`getBoundingClientRect().top`), the viewport height, and a trigger offset
 * (fraction from the top of the viewport). The active panel is the LAST one
 * whose top has reached/passed the trigger line; before any panel reaches it,
 * index 0.
 */
export function activeIndexFromScroll(
  tops: ReadonlyArray<number>,
  viewportH: number,
  offset: number,
): number {
  if (tops.length === 0) return 0;
  const line = offset * viewportH;
  let active = 0;
  for (let i = 0; i < tops.length; i++) {
    if ((tops[i] ?? Infinity) <= line) active = i;
  }
  return active;
}

/**
 * Continuous 0..1 progress of the reader through the scrolly section, derived
 * from the section's viewport-relative top, its total height, and the viewport
 * height. 0 = the section's top is at/below the viewport top (not started);
 * 1 = scrolled fully past its scrollable range. Used to GLIDE the playhead
 * smoothly between event ticks rather than snapping. Always finite & clamped.
 */
export function sectionProgress(
  sectionTop: number,
  sectionHeight: number,
  viewportH: number,
): number {
  // The section "scrolls" from when its top hits the viewport top until its
  // bottom-minus-one-viewport has passed — a range of (height - viewportH).
  const scrollable = sectionHeight - viewportH;
  if (scrollable <= 0) {
    // Section shorter than the viewport: collapse to a binary-ish progress so
    // the playhead still advances as it moves through, but stays finite.
    return clamp01(-sectionTop / Math.max(sectionHeight, 1));
  }
  return clamp01(-sectionTop / scrollable);
}

/**
 * Maps continuous section progress (0..1) to a fraction along the rail (0..1),
 * gliding linearly between adjacent event ticks. With N ticks the progress axis
 * is split into N-1 equal segments; within a segment the playhead interpolates
 * between that pair of tick fractions. progress 0 → first tick, 1 → last tick,
 * so the playhead spans tick0..tickLast (glued to real events, not the raw rail
 * edges).
 */
export function playheadFraction(
  progress: number,
  tickFractions: ReadonlyArray<number>,
): number {
  const n = tickFractions.length;
  if (n === 0) return 0;
  if (n === 1) return tickFractions[0] ?? 0;
  const p = clamp01(progress);
  const seg = 1 / (n - 1);
  const idx = Math.min(Math.floor(p / seg), n - 2);
  const local = (p - idx * seg) / seg; // 0..1 within this segment
  const a = tickFractions[idx] ?? 0;
  const b = tickFractions[idx + 1] ?? a;
  return a + (b - a) * local;
}

/** Snap a drag fraction along the rail (0..1) to the nearest event index. */
export function fractionToIndex(
  fraction: number,
  tickFractions: ReadonlyArray<number>,
): number {
  if (tickFractions.length === 0) return 0;
  const f = clamp01(fraction);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < tickFractions.length; i++) {
    const d = Math.abs((tickFractions[i] ?? 0) - f);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Map a click/tap x (px) on the rail to the nearest tick's event index. */
export function nearestIndexByX(x: number, tickXs: ReadonlyArray<number>): number {
  if (tickXs.length === 0) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < tickXs.length; i++) {
    const d = Math.abs((tickXs[i] ?? 0) - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * The absolute `window.scrollY` that lands the target panel exactly on the
 * trigger line, given the panel's CURRENT viewport-relative top, the current
 * scrollY, the viewport height, and the trigger offset. Used by the two-way
 * scrubber: clicking/dragging to an event scrolls the page so that event
 * becomes active. Never returns a negative target.
 */
export function indexToScrollY(
  panelTop: number,
  currentScrollY: number,
  viewportH: number,
  offset: number,
): number {
  const line = offset * viewportH;
  const target = currentScrollY + (panelTop - line);
  return Math.max(0, target);
}

/** Clamp an index into [0, count-1]; empty count → 0. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  return index;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
