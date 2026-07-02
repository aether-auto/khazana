// apps/site/src/components/mdx/lib/gantt-scale.ts
/**
 * Pure deterministic layout for <GanttStrip> — a compact build-timeline strip
 * mapping each task to a horizontal bar between `start` and `end`. No DOM, no
 * dep: all geometry is unit-tested here so the island is a thin renderer. The
 * SVG uses a fixed abstract coordinate box and scales to `width:100%` via
 * viewBox, exactly like Timeline / Slopegraph. Content-fitted: the box height
 * grows with the number of task lanes so there is never a dead vertical void.
 */

/** A build phase: a labelled span on a shared numeric axis (day or hr). */
export interface GanttTask {
  label: string;
  /** span start, in `unit`s (inclusive left edge of the bar). */
  start: number;
  /** span end, in `unit`s (right edge of the bar). end >= start. */
  end: number;
  /** optional note surfaced on hover/focus. Plain string (serializable). */
  note?: string;
}

/** The axis unit — drives how a duration is spelled ("3 days" vs "3 hr"). */
export type GanttUnit = "day" | "hr";

/** A laid-out lane: the bar rectangle plus its duration + row geometry. */
export interface GanttLane extends GanttTask {
  /** left edge x (abstract coords). */
  x: number;
  /** bar width (abstract coords) — floored so a zero-length task is still visible. */
  w: number;
  /** top y of this lane's row (abstract coords). */
  y: number;
  /** duration in `unit`s (end - start). */
  duration: number;
  /** pre-formatted duration string, e.g. "3 days" / "6 hr". */
  durationLabel: string;
}

export interface GanttLayout {
  lanes: GanttLane[];
  /** abstract coordinate width for the viewBox. */
  width: number;
  /** content-sized abstract height for the viewBox (grows with lane count). */
  height: number;
  /** x where the bar track begins (right of the label gutter). */
  trackX: number;
  /** width of the bar track (width - trackX - right pad). */
  trackW: number;
  /** the axis min (smallest start). */
  min: number;
  /** the axis max (largest end). */
  max: number;
  /** height of one lane row (bar band + gap). */
  rowStep: number;
}

export interface GanttOpts {
  /** abstract coordinate width. Default 720. */
  width?: number;
  /** x inset for the label gutter (bars start here). Default 168. */
  labelGutter?: number;
  /** right padding after the track. Default 24. */
  rightPad?: number;
  /** top padding (axis header sits here). Default 30. */
  topPad?: number;
  /** bottom padding. Default 14. */
  bottomPad?: number;
  /** vertical size of one lane row. Default 34. */
  rowStep?: number;
  /** minimum rendered bar width so a zero-duration task stays visible. Default 3. */
  minBarW?: number;
}

const DEFAULTS = {
  width: 720,
  labelGutter: 168,
  rightPad: 24,
  topPad: 30,
  bottomPad: 14,
  rowStep: 34,
  minBarW: 3,
} as const;

/**
 * Spell a duration for the readout. Whole numbers stay whole ("3 days"); a
 * fractional value keeps up to one decimal ("1.5 hr"). Singular "day" for
 * exactly 1 day; "hr" is invariant. A negative/NaN duration clamps to 0.
 */
export function formatDuration(duration: number, unit: GanttUnit): string {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const n = Number.isInteger(d) ? String(d) : d.toFixed(1);
  if (unit === "hr") return `${n} hr`;
  return `${n} ${d === 1 ? "day" : "days"}`;
}

/**
 * Project a value on the [min, max] axis onto the bar track [trackX, trackX+trackW].
 * A degenerate (zero-span) axis maps everything to the track start so bars stay
 * on-canvas instead of dividing by zero.
 */
export function projectTime(
  value: number,
  min: number,
  max: number,
  trackX: number,
  trackW: number,
): number {
  if (max === min) return trackX;
  const frac = (value - min) / (max - min);
  return trackX + frac * trackW;
}

/**
 * Lay out every task into a stacked lane. Deterministic, DOM-free. Tasks keep
 * their author order (top-to-bottom = source order — the natural build sequence).
 * The axis spans the min start .. max end across all tasks. Height is
 * content-sized: topPad + n*rowStep + bottomPad, so the figure is exactly as
 * tall as the lanes it draws.
 */
export function layoutGantt(
  tasks: ReadonlyArray<GanttTask>,
  unit: GanttUnit,
  opts: GanttOpts = {},
): GanttLayout {
  if (!tasks || tasks.length === 0) throw new Error("GanttStrip: needs at least one task");
  const width = opts.width ?? DEFAULTS.width;
  const labelGutter = opts.labelGutter ?? DEFAULTS.labelGutter;
  const rightPad = opts.rightPad ?? DEFAULTS.rightPad;
  const topPad = opts.topPad ?? DEFAULTS.topPad;
  const bottomPad = opts.bottomPad ?? DEFAULTS.bottomPad;
  const rowStep = opts.rowStep ?? DEFAULTS.rowStep;
  const minBarW = opts.minBarW ?? DEFAULTS.minBarW;

  for (const t of tasks) {
    if (!Number.isFinite(t.start) || !Number.isFinite(t.end)) {
      throw new Error("GanttStrip: task start/end must be finite numbers");
    }
    if (t.end < t.start) {
      throw new Error(`GanttStrip: task "${t.label}" has end < start`);
    }
  }

  const min = Math.min(...tasks.map((t) => t.start));
  const max = Math.max(...tasks.map((t) => t.end));

  const trackX = labelGutter;
  const trackW = Math.max(1, width - labelGutter - rightPad);

  const lanes: GanttLane[] = tasks.map((t, i) => {
    const x = projectTime(t.start, min, max, trackX, trackW);
    const xEnd = projectTime(t.end, min, max, trackX, trackW);
    const w = Math.max(minBarW, xEnd - x);
    const duration = t.end - t.start;
    return {
      ...t,
      x,
      w,
      y: topPad + i * rowStep,
      duration,
      durationLabel: formatDuration(duration, unit),
    };
  });

  const height = topPad + tasks.length * rowStep + bottomPad;

  return { lanes, width, height, trackX, trackW, min, max, rowStep };
}
