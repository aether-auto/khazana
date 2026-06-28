// apps/site/src/components/mdx/lib/chart-spec.ts
/**
 * Pure normalizer: khazana's small declarative <Chart> API -> a plain,
 * Plot-agnostic options object. No DOM, no Plot import — testable offline.
 * The island (Chart.tsx) maps `marks` onto real Observable Plot marks.
 */

// ── Categorical-label helpers ────────────────────────────────────────────────

/**
 * If every x value in `data` is a string that parses as a finite number,
 * returns a new array with those x fields coerced to `Number`.  Otherwise
 * returns the original array unchanged.  Never mutates the caller's data.
 *
 * This eliminates Observable Plot's "strings that appear to be numbers"
 * warning (⚠ glyph) for charts like the Benford leading-digit chart where
 * MDX authors write `{ digit: "1" }` instead of `{ digit: 1 }`.
 *
 * Only the x channel is touched; y and series values are left as-is.
 * Categorical x values ("10%", "bet max (all-in)") are never coerced because
 * at least one of them fails `isFinite(Number(v))`, making `isCategoricalX`
 * return true, and this function returns the original array immediately.
 */
export function coerceNumericX(
  data: ReadonlyArray<Record<string, unknown>>,
  xKey: string,
): ReadonlyArray<Record<string, unknown>> {
  if (data.length === 0) return data;
  // Use the existing categorical check: if any x is non-numeric, bail out.
  if (isCategoricalX(data, xKey)) return data;
  // All x values parse as finite numbers — coerce only if at least one is a string.
  const anyString = data.some((row) => typeof row[xKey] === "string");
  if (!anyString) return data;
  return data.map((row) => ({ ...row, [xKey]: Number(row[xKey]) }));
}

/**
 * Returns true when the x values are categorical strings (i.e. cannot be
 * parsed as finite numbers). Used to decide whether tick labels need rotation.
 * Numeric-x charts (line, area, dot with year/fraction axes) are unaffected.
 */
export function isCategoricalX(
  data: ReadonlyArray<Record<string, unknown>>,
  xKey: string,
): boolean {
  if (data.length === 0) return false;
  // A single non-finite numeric value is enough to classify as categorical.
  return data.some((row) => {
    const v = row[xKey];
    if (v === null || v === undefined) return false;
    return !isFinite(Number(v));
  });
}

/**
 * Given the distinct categorical x-label strings and the available pixel
 * width, returns whether the labels would overlap if rendered horizontally.
 *
 * Observable Plot center-anchors each tick label.  The usable x-span is
 * `widthPx − MARGIN_LEFT − MARGIN_RIGHT`, so the slot each label occupies is
 * that span divided by the number of distinct values.  A label overlaps its
 * neighbour when the label width (chars × CHAR_PX) exceeds the slot — but
 * because each label is centered on its tick, the effective collision happens
 * at half-label overlap on each side, so we compare against slotPx directly.
 *
 * Constants match Chart.tsx: marginLeft = 48, marginRight ≈ 20.
 */
export function shouldRotateXLabels(
  labels: ReadonlyArray<string>,
  widthPx: number,
): boolean {
  if (labels.length === 0) return false;
  const CHAR_PX = 7;       // approximate char width in the mono label font
  const MARGIN_LEFT = 48;  // must mirror Chart.tsx marginLeft
  const MARGIN_RIGHT = 20; // Plot default right margin approximation
  const plotWidthPx = Math.max(0, widthPx - MARGIN_LEFT - MARGIN_RIGHT);
  const avgLabelPx =
    (labels.reduce((s, l) => s + l.length, 0) / labels.length) * CHAR_PX;
  const slotPx = plotWidthPx / labels.length;
  return avgLabelPx > slotPx;
}

/**
 * Returns the pixel margin-bottom to allocate when tick labels are rotated
 * by `rotateDeg` degrees.  Approximates `maxLabelPx * sin(|deg|)` + 8 px
 * padding, clamped to [32, 80].
 */
export function rotatedMarginBottom(
  labels: ReadonlyArray<string>,
  rotateDeg: number,
): number {
  const CHAR_PX = 7;
  const maxLabelPx = Math.max(...labels.map((l) => l.length * CHAR_PX));
  const sinA = Math.abs(Math.sin((rotateDeg * Math.PI) / 180));
  return Math.min(80, Math.max(32, Math.round(maxLabelPx * sinA + 8)));
}

/** khazana series palette as CSS custom-property references (token-driven). */
export const KHAZANA_SERIES = [
  "var(--accent)",
  "var(--editorial)",
  "var(--good)",
  "var(--ink-dim)",
] as const;

export type ChartMark = "line" | "bar" | "area" | "dot";

export interface ChartProps {
  /** Row-oriented data. */
  data: ReadonlyArray<Record<string, unknown>>;
  /** Mark family. */
  mark: ChartMark;
  /** Field name for the x channel. */
  x: string;
  /** Field name for the y channel. */
  y: string;
  /** Optional field that splits data into colored series. */
  series?: string;
  /** Pixel height (default 320). */
  height?: number;
  /** Show gridlines (default false — terminal aesthetic prefers axes only). */
  grid?: boolean;
  /** Caption rendered in the figcaption. */
  caption?: string;
}

export interface NormalizedMark {
  type: "line" | "barY" | "areaY" | "dot" | "ruleY";
  options: Record<string, unknown>;
}

export interface NormalizedChartSpec {
  marks: NormalizedMark[];
  height: number;
  grid: boolean;
  caption?: string;
  color?: { domain: string[]; range: string[] };
  style: { fontFamily: string; background: string; color: string; fontSize: string };
  /** Present and > 0 when categorical x-labels need to be rotated. */
  xTickRotate?: number;
  /** Pixel margin-bottom to use when xTickRotate is set. */
  xMarginBottom?: number;
  /** True when x values are categorical strings (non-numeric). */
  xCategorical: boolean;
}

const MARK_TYPE: Record<ChartMark, NormalizedMark["type"]> = {
  line: "line",
  bar: "barY",
  area: "areaY",
  dot: "dot",
};

// Accept Plot-native aliases used in some MDX content (e.g. "barY" → "bar").
// This avoids a hard throw on valid authoring intent; it is NOT a change to
// the public ChartMark type, just a runtime leniency.
const MARK_ALIASES: Partial<Record<string, ChartMark>> = {
  barY: "bar",
  areaY: "area",
};

const distinctSorted = (rows: ReadonlyArray<Record<string, unknown>>, key: string): string[] =>
  [...new Set(rows.map((r) => String(r[key])))].sort();

// Fallback width used in normalizeChartSpec when no pixel width is supplied
// (e.g. during SSR or tests). The chart island will recompute at render time
// if it supplies a real width via the optional `widthPx` parameter.
const FALLBACK_WIDTH_PX = 400;

// Rotation angle applied to categorical x-tick labels when overlap is detected.
const TICK_ROTATE_DEG = -22;

export function normalizeChartSpec(
  props: ChartProps,
  widthPx: number = FALLBACK_WIDTH_PX,
): NormalizedChartSpec {
  const { data, x, y, series, height = 320, grid = false, caption } = props;
  // Resolve Plot-native aliases (e.g. "barY" → "bar") from MDX content.
  const mark: ChartMark = MARK_ALIASES[props.mark as string] ?? (props.mark as ChartMark);
  if (!data || data.length === 0) throw new Error("Chart: `data` must be a non-empty array");
  if (!(mark in MARK_TYPE)) throw new Error(`Chart: unknown mark "${props.mark}"`);

  const baseOptions: Record<string, unknown> = { x, y, tip: true };
  let color: NormalizedChartSpec["color"];

  if (series) {
    const domain = distinctSorted(data, series);
    const range = KHAZANA_SERIES.slice(0, Math.max(domain.length, 1)).map(String);
    color = { domain, range };
    baseOptions.stroke = series;
    baseOptions.fill = series;
  } else {
    baseOptions.stroke = String(KHAZANA_SERIES[0]);
    baseOptions.fill = String(KHAZANA_SERIES[0]);
  }

  const marks: NormalizedMark[] = [
    { type: "ruleY", options: { y: 0 } }, // hairline baseline
    { type: MARK_TYPE[mark], options: baseOptions },
  ];

  // ── Categorical x-axis label rotation ─────────────────────────────────────
  const xCategorical = isCategoricalX(data, x);
  let xTickRotate: number | undefined;
  let xMarginBottom: number | undefined;

  if (xCategorical) {
    const labels = distinctSorted(data, x);
    if (shouldRotateXLabels(labels, widthPx)) {
      xTickRotate = TICK_ROTATE_DEG;
      xMarginBottom = rotatedMarginBottom(labels, TICK_ROTATE_DEG);
    }
  }

  return {
    marks,
    height,
    grid,
    caption,
    color,
    xCategorical,
    xTickRotate,
    xMarginBottom,
    style: {
      fontFamily:
        'var(--font-mono, "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace)',
      background: "transparent",
      color: "var(--ink-dim)",
      fontSize: "var(--t-xs, 0.75rem)",
    },
  };
}
