// apps/site/src/components/mdx/lib/timeline-scale.ts
/** Pure deterministic time-scale for <Timeline>. No DOM, no `now` dependency. */

export interface TimelineEvent {
  /** ISO date (YYYY-MM-DD or full ISO). */
  date: string;
  label: string;
  detail?: string;
}

export interface TimelinePoint extends TimelineEvent {
  /** x in [0, width]. */
  x: number;
  /** epoch ms, for stable keys/sorting. */
  t: number;
}

export interface TimelineTick {
  year: number;
  x: number;
}

export interface TimelineScale {
  points: TimelinePoint[];
  ticks: TimelineTick[];
  width: number;
}

/** Input to deCollideLabels: a point's x position and its rendered label width. */
export interface LabeledPoint {
  x: number;
  /** Estimated rendered width of this label in pixels. */
  labelPx: number;
}

// ── niceYearTicks ─────────────────────────────────────────────────────────────

/**
 * Returns an array of year integers at a "nice" step that keeps the total
 * count at or below `targetCount` (default 7).  Steps are chosen from the
 * sequence {1, 2, 5, 10, 20, 25, 50, 100, 200, 500} — the same set that
 * d3-scale's `tickIncrement` uses for linear data.
 *
 * For a same-year span (minYear === maxYear) the result is just [minYear].
 * For a sub-2-year span the step is always 1 so adjacent years are shown.
 */
export function niceYearTicks(
  minYear: number,
  maxYear: number,
  targetCount: number = 7,
): number[] {
  if (minYear === maxYear) return [minYear];
  const span = maxYear - minYear;
  const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  // Pick the smallest step that produces ≤ targetCount ticks.
  let step = 1;
  for (const s of STEPS) {
    // Number of multiples of s that lie within [minYear, maxYear]:
    const first = Math.ceil(minYear / s) * s;
    const count = Math.floor((maxYear - first) / s) + 1;
    if (count <= targetCount) {
      step = s;
      break;
    }
  }
  // Emit all multiples of step within [minYear, maxYear].
  const first = Math.ceil(minYear / step) * step;
  const ticks: number[] = [];
  for (let y = first; y <= maxYear; y += step) {
    ticks.push(y);
  }
  // Edge-case: if the step landed no ticks inside the range (e.g. step=100
  // but span=40), fall back to just the bounding years.
  if (ticks.length === 0) return [minYear, maxYear];
  return ticks;
}

// ── labelAnchor ───────────────────────────────────────────────────────────────

/**
 * Returns the SVG `text-anchor` value that keeps a label from clipping either
 * panel edge.  The decision is purely geometric:
 *
 * - If the label's right edge (x + labelPx) would exceed `width`, anchor
 *   `"end"` so the label extends leftward from the point.
 * - If the label's left half (x − labelPx/2) would go below 0 when
 *   centered, anchor `"start"` so it extends rightward from the point.
 * - Otherwise anchor `"middle"`.
 *
 * "Left zone" and "right zone" are derived purely from `labelPx` and the
 * actual panel `width`, so the threshold automatically adjusts as label
 * lengths vary rather than relying on magic percentage constants.
 */
export function labelAnchor(
  x: number,
  width: number,
  labelPx: number,
): "start" | "middle" | "end" {
  if (x + labelPx > width) return "end";
  if (x - labelPx / 2 < 0) return "start";
  return "middle";
}

// ── deCollideLabels ───────────────────────────────────────────────────────────

/**
 * Greedy de-collision for SVG timeline labels.  Given an array of
 * `LabeledPoint` values (already sorted ascending by x), assigns each label
 * to the lowest row whose last-placed label's right edge (x + labelPx) does
 * not overlap this label's left edge (x).
 *
 * Returns an array of row indices (0-based) parallel to the input array.
 * Row 0 is the baseline row; higher rows are drawn at an increasing y offset
 * in Timeline.tsx so labels never visually overlap.
 */
export function deCollideLabels(points: ReadonlyArray<LabeledPoint>): number[] {
  if (points.length === 0) return [];
  // rowRight[r] = the rightmost x reached by the last label placed in row r.
  const rowRight: number[] = [];
  const result: number[] = [];
  for (const pt of points) {
    // Find the lowest row where this label fits.
    let placed = false;
    for (let r = 0; r < rowRight.length; r++) {
      if ((rowRight[r] ?? 0) <= pt.x) {
        result.push(r);
        rowRight[r] = pt.x + pt.labelPx;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Open a new row.
      result.push(rowRight.length);
      rowRight.push(pt.x + pt.labelPx);
    }
  }
  return result;
}

// ── buildTimelineScale ────────────────────────────────────────────────────────

function parse(date: string): number {
  const t = Date.parse(date);
  if (Number.isNaN(t)) throw new Error(`Timeline: unparseable date "${date}"`);
  return t;
}

export function buildTimelineScale(events: ReadonlyArray<TimelineEvent>, width: number): TimelineScale {
  if (!events || events.length === 0) throw new Error("Timeline: needs at least one event");
  const parsed = events
    .map((e) => ({ ...e, t: parse(e.date) }))
    .sort((a, b) => a.t - b.t);

  const min = parsed[0].t;
  const max = parsed[parsed.length - 1].t;
  const span = max - min;
  const n = parsed.length;

  // ── span===0 fix: spread points evenly instead of piling at x=0 ──────────
  const project = (t: number, i: number): number => {
    if (span === 0) {
      // Single event → x=0; multiple same-instant events → evenly spaced.
      return n === 1 ? 0 : ((i + 1) / (n + 1)) * width;
    }
    return ((t - min) / span) * width;
  };

  const points: TimelinePoint[] = parsed.map((e, i) => ({ ...e, x: project(e.t, i) }));

  // ── Adaptive year ticks (no label spam on long spans) ────────────────────
  const startYear = new Date(min).getUTCFullYear();
  const endYear = new Date(max).getUTCFullYear();
  const tickYears = niceYearTicks(startYear, endYear);

  const ticks: TimelineTick[] = tickYears.map((y) => {
    const t = Date.UTC(y, 0, 1);
    // Clamp to [min, max] then project onto the timeline.
    const tClamped = Math.min(Math.max(t, min), max);
    const x = span === 0 ? width / 2 : ((tClamped - min) / span) * width;
    return { year: y, x };
  });

  return { points, ticks, width };
}
