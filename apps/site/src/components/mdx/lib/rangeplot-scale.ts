// apps/site/src/components/mdx/lib/rangeplot-scale.ts
/**
 * Pure deterministic layout for <RangePlot> — a dot-plus-range plot (CI /
 * min–max / IQR per category), the honest alternative to bars-with-error-caps.
 * No DOM, no dep: all geometry is unit-tested here so the island is a thin
 * renderer. The SVG uses a fixed abstract width and scales to `width:100%`.
 */

export interface RangeDatum {
  label: string;
  low: number;
  mid: number;
  high: number;
  /** optional sample size, surfaced in the readout. */
  n?: number;
}

/** A laid-out category row: a horizontal hairline range with a mid dot. */
export interface RangeRow extends RangeDatum {
  /** y baseline of this row (center of the range line). */
  y: number;
  /** x of the low bound. */
  xLow: number;
  /** x of the mid dot. */
  xMid: number;
  /** x of the high bound. */
  xHigh: number;
}

export interface RangeTick {
  value: number;
  x: number;
}

export interface RangeLayout {
  rows: RangeRow[];
  ticks: RangeTick[];
  width: number;
  height: number;
  /** left edge of the plotting area (after the label gutter). */
  plotLeft: number;
  /** right edge of the plotting area. */
  plotRight: number;
  /** numeric domain min/max mapped to plotLeft/plotRight. */
  domainMin: number;
  domainMax: number;
  /** vertical distance between category rows. */
  rowStep: number;
  /** y of the value axis (below the rows). */
  axisY: number;
}

export interface RangeOpts {
  width?: number;
  /** left gutter reserved for category labels. */
  labelGutter?: number;
  /** right inset. */
  rightPad?: number;
  /** top inset above the first row. */
  topPad?: number;
  /** vertical space per category row. */
  rowStep?: number;
}

const DEFAULTS = {
  width: 720,
  labelGutter: 180,
  rightPad: 24,
  topPad: 26,
  rowStep: 40,
} as const;

/** Map a value onto the horizontal plotting band. */
export function projectX(
  value: number,
  domainMin: number,
  domainMax: number,
  plotLeft: number,
  plotRight: number,
): number {
  if (domainMax === domainMin) return (plotLeft + plotRight) / 2;
  const frac = (value - domainMin) / (domainMax - domainMin);
  return plotLeft + frac * (plotRight - plotLeft);
}

/**
 * "Nice" evenly-spaced tick values across [min, max] with roughly `target`
 * ticks, rounded to a 1/2/5×10^k step. Returns the tick values (endpoints
 * always covered by the padded domain, not necessarily emitted as ticks).
 */
export function niceTicks(min: number, max: number, target: number = 5): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const rawStep = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) {
    // guard against fp drift accumulating a spurious extra tick
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks.length > 0 ? ticks : [min, max];
}

export function layoutRangePlot(
  data: ReadonlyArray<RangeDatum>,
  opts: RangeOpts = {},
): RangeLayout {
  if (!data || data.length === 0) throw new Error("RangePlot: needs at least one datum");
  const width = opts.width ?? DEFAULTS.width;
  const labelGutter = opts.labelGutter ?? DEFAULTS.labelGutter;
  const rightPad = opts.rightPad ?? DEFAULTS.rightPad;
  const topPad = opts.topPad ?? DEFAULTS.topPad;
  const rowStep = opts.rowStep ?? DEFAULTS.rowStep;

  for (const d of data) {
    if (![d.low, d.mid, d.high].every(Number.isFinite)) {
      throw new Error("RangePlot: low/mid/high must be finite numbers");
    }
    if (d.low > d.high) {
      throw new Error(`RangePlot: low must be ≤ high for "${d.label}"`);
    }
  }

  const lows = data.map((d) => d.low);
  const highs = data.map((d) => d.high);
  const rawMin = Math.min(...lows);
  const rawMax = Math.max(...highs);
  // Pad the domain by 6% each side so extreme bounds don't kiss the edges.
  const pad = rawMax === rawMin ? Math.abs(rawMin) || 1 : (rawMax - rawMin) * 0.06;
  const domainMin = rawMin - pad;
  const domainMax = rawMax + pad;

  const plotLeft = labelGutter;
  const plotRight = width - rightPad;

  const rows: RangeRow[] = data.map((d, i) => {
    const y = topPad + i * rowStep + rowStep / 2;
    return {
      ...d,
      y,
      xLow: projectX(d.low, domainMin, domainMax, plotLeft, plotRight),
      xMid: projectX(d.mid, domainMin, domainMax, plotLeft, plotRight),
      xHigh: projectX(d.high, domainMin, domainMax, plotLeft, plotRight),
    };
  });

  const axisY = topPad + data.length * rowStep + 4;
  const height = axisY + 30;

  const ticks: RangeTick[] = niceTicks(rawMin, rawMax).map((value) => ({
    value,
    x: projectX(value, domainMin, domainMax, plotLeft, plotRight),
  }));

  return {
    rows,
    ticks,
    width,
    height,
    plotLeft,
    plotRight,
    domainMin,
    domainMax,
    rowStep,
    axisY,
  };
}

/** Format a value for the tick axis / readout, trimming needless decimals. */
export function formatRangeValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  return v.toFixed(abs < 1 ? 3 : abs < 10 ? 2 : 1);
}
