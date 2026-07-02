// apps/site/src/components/mdx/lib/slopegraph-scale.ts
/**
 * Pure deterministic layout for <Slopegraph> — a Tufte two-column before/after
 * ranking plot. No DOM, no Plot import: all geometry is unit-tested here so the
 * island is a thin renderer. The SVG uses a fixed abstract coordinate width and
 * scales to `width:100%` via viewBox, exactly like Timeline/Diagram.
 */

export interface SlopeDatum {
  label: string;
  before: number;
  after: number;
}

/** A laid-out slope: the two endpoints plus the direction the value moved. */
export interface SlopeRow extends SlopeDatum {
  /** left endpoint (before column). */
  x1: number;
  y1: number;
  /** right endpoint (after column). */
  x2: number;
  y2: number;
  /** "up" (after > before), "down" (after < before), "flat" (equal). */
  dir: "up" | "down" | "flat";
}

export interface SlopeLayout {
  rows: SlopeRow[];
  /** abstract coordinate width/height for the viewBox. */
  width: number;
  height: number;
  /** x of the left (before) column of endpoints. */
  x1: number;
  /** x of the right (after) column of endpoints. */
  x2: number;
  /** y of the top of the plotting band (where the max value sits). */
  top: number;
  /** y of the bottom of the plotting band (where the min value sits). */
  bottom: number;
  /** the numeric min across all before/after values (maps to `bottom`). */
  min: number;
  /** the numeric max across all before/after values (maps to `top`). */
  max: number;
}

export interface SlopeOpts {
  width?: number;
  /** total abstract height. */
  height?: number;
  /** horizontal inset for the two endpoint columns (px from each edge). */
  colInset?: number;
  /** vertical padding above/below the value band. */
  vPad?: number;
}

const DEFAULTS = {
  width: 720,
  height: 460,
  colInset: 150,
  vPad: 40,
} as const;

/**
 * Project a value onto the vertical band. Higher value → higher on screen
 * (smaller y). A degenerate (all-equal) range maps everything to the vertical
 * center so lines stay on-canvas instead of dividing by zero.
 */
export function projectValue(
  value: number,
  min: number,
  max: number,
  top: number,
  bottom: number,
): number {
  if (max === min) return (top + bottom) / 2;
  const frac = (value - min) / (max - min);
  return bottom - frac * (bottom - top);
}

export function slopeDirection(before: number, after: number): "up" | "down" | "flat" {
  if (after > before) return "up";
  if (after < before) return "down";
  return "flat";
}

export function layoutSlopegraph(
  data: ReadonlyArray<SlopeDatum>,
  opts: SlopeOpts = {},
): SlopeLayout {
  if (!data || data.length === 0) throw new Error("Slopegraph: needs at least one datum");
  const width = opts.width ?? DEFAULTS.width;
  const height = opts.height ?? DEFAULTS.height;
  const colInset = opts.colInset ?? DEFAULTS.colInset;
  const vPad = opts.vPad ?? DEFAULTS.vPad;

  const values = data.flatMap((d) => [d.before, d.after]);
  for (const v of values) {
    if (!Number.isFinite(v)) throw new Error("Slopegraph: before/after must be finite numbers");
  }
  const min = Math.min(...values);
  const max = Math.max(...values);

  const x1 = colInset;
  const x2 = width - colInset;
  const top = vPad;
  const bottom = height - vPad;

  const rows: SlopeRow[] = data.map((d) => ({
    ...d,
    x1,
    x2,
    y1: projectValue(d.before, min, max, top, bottom),
    y2: projectValue(d.after, min, max, top, bottom),
    dir: slopeDirection(d.before, d.after),
  }));

  return { rows, width, height, x1, x2, top, bottom, min, max };
}

/**
 * De-collide a column of label y-positions so stacked labels never overlap.
 * Greedy: sort by desired y, then push each label down to at least `minGap`
 * below the previous one. Returns adjusted y-values parallel to the input
 * (input order preserved). Pure — used for both the before and after gutters.
 */
export function deCollideColumn(ys: ReadonlyArray<number>, minGap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(ys.length);
  let last = -Infinity;
  for (const { y, i } of order) {
    const placed = Math.max(y, last + minGap);
    out[i] = placed;
    last = placed;
  }
  return out;
}

/** Format a numeric value for the endpoint readout, trimming needless decimals. */
export function formatSlopeValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) < 10 ? 2 : 1);
}
