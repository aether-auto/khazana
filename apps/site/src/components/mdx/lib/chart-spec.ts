// apps/site/src/components/mdx/lib/chart-spec.ts
/**
 * Pure normalizer: khazana's small declarative <Chart> API -> a plain,
 * Plot-agnostic options object. No DOM, no Plot import — testable offline.
 * The island (Chart.tsx) maps `marks` onto real Observable Plot marks.
 */

// ── coerceNumericX ────────────────────────────────────────────────────────────

/**
 * If every x value in `data` is a string that parses as a finite number,
 * returns a new array with those x fields coerced to `Number`.  Otherwise
 * returns the original array unchanged.  Never mutates the caller's data.
 *
 * Eliminates Observable Plot's "strings that appear to be numbers" ⚠ warning.
 */
export function coerceNumericX(
  data: ReadonlyArray<Record<string, unknown>>,
  xKey: string,
): ReadonlyArray<Record<string, unknown>> {
  if (data.length === 0) return data;
  if (isCategoricalX(data, xKey)) return data;
  const anyString = data.some((row) => typeof row[xKey] === "string");
  if (!anyString) return data;
  return data.map((row) => ({ ...row, [xKey]: Number(row[xKey]) }));
}

/**
 * Returns true when the x values are categorical strings (i.e. cannot be
 * parsed as finite numbers). Used to decide whether tick labels need rotation.
 */
export function isCategoricalX(
  data: ReadonlyArray<Record<string, unknown>>,
  xKey: string,
): boolean {
  if (data.length === 0) return false;
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
 * Constants match Chart.tsx: marginLeft = 48, marginRight ≈ 20.
 */
export function shouldRotateXLabels(
  labels: ReadonlyArray<string>,
  widthPx: number,
): boolean {
  if (labels.length === 0) return false;
  const CHAR_PX = 7;
  const MARGIN_LEFT = 48;
  const MARGIN_RIGHT = 20;
  const plotWidthPx = Math.max(0, widthPx - MARGIN_LEFT - MARGIN_RIGHT);
  const avgLabelPx =
    (labels.reduce((s, l) => s + l.length, 0) / labels.length) * CHAR_PX;
  const slotPx = plotWidthPx / labels.length;
  return avgLabelPx > slotPx;
}

/**
 * Returns the pixel margin-bottom to allocate when tick labels are rotated
 * by `rotateDeg` degrees, clamped to [32, 80].
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

/**
 * Converts a camelCase or snake_case field name into a human-readable label.
 * "fpRate" → "fp rate", "growth_rate" → "growth rate", "f" → "f".
 */
export function humanizeLabel(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
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
  /** Human-readable x-axis label (auto-derived from `x` field name if omitted). */
  xLabel?: string;
  /** Human-readable y-axis label (auto-derived from `y` field name if omitted). */
  yLabel?: string;
  /**
   * Force the y-axis to include zero.  Defaults to true for `bar`, false for
   * `line`/`area`/`dot`.  Pass `true` on comparison charts (Benford) to avoid
   * a truncated baseline that overstates deviation.
   */
  yZero?: boolean;
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
  /** Explicit x domain order when categorical — numeric-aware sorted unique values. */
  xDomain?: string[];
  /** Axis title for the x channel. */
  xLabel: string;
  /** Axis title for the y channel. */
  yLabel: string;
  /** Whether to force the y domain to include 0. */
  yZero: boolean;
}

const MARK_TYPE: Record<ChartMark, NormalizedMark["type"]> = {
  line: "line",
  bar: "barY",
  area: "areaY",
  dot: "dot",
};

// Marks that should NOT be filled — fill buries data under an opaque polygon.
// `area` is intentionally absent: it gets a low-opacity fill applied in Chart.tsx.
const NO_FILL_MARKS: ReadonlySet<ChartMark> = new Set(["line", "dot"]);

// Accept Plot-native aliases used in some MDX content (e.g. "barY" → "bar").
const MARK_ALIASES: Partial<Record<string, ChartMark>> = {
  barY: "bar",
  areaY: "area",
};

// Sort with numeric awareness: "10%" < "25%" < "100%", "bet min" < "kelly" (locale).
const distinctSorted = (rows: ReadonlyArray<Record<string, unknown>>, key: string): string[] =>
  [...new Set(rows.map((r) => String(r[key])))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

const FALLBACK_WIDTH_PX = 400;
const TICK_ROTATE_DEG = -22;

export function normalizeChartSpec(
  props: ChartProps,
  widthPx: number = FALLBACK_WIDTH_PX,
): NormalizedChartSpec {
  const { data, x, y, series, height = 320, grid = false, caption, xLabel, yLabel } = props;
  const mark: ChartMark = MARK_ALIASES[props.mark as string] ?? (props.mark as ChartMark);
  if (!data || data.length === 0) throw new Error("Chart: `data` must be a non-empty array");
  if (!(mark in MARK_TYPE)) throw new Error(`Chart: unknown mark "${props.mark}"`);

  // ── Fill/stroke assignment ────────────────────────────────────────────────
  // line + dot: fill="none" → pure stroke, no opaque polygon floods the data.
  // area + bar: keep fill for visual mass; Chart.tsx applies low fillOpacity.
  const noFill = NO_FILL_MARKS.has(mark);

  const baseOptions: Record<string, unknown> = { x, y, tip: true };
  let color: NormalizedChartSpec["color"];

  if (series) {
    const domain = distinctSorted(data, series);
    const range = KHAZANA_SERIES.slice(0, Math.max(domain.length, 1)).map(String);
    color = { domain, range };
    baseOptions.stroke = series;
    baseOptions.fill = noFill ? "none" : series;
  } else {
    baseOptions.stroke = String(KHAZANA_SERIES[0]);
    baseOptions.fill = noFill ? "none" : String(KHAZANA_SERIES[0]);
  }

  const marks: NormalizedMark[] = [
    { type: "ruleY", options: { y: 0 } }, // hairline baseline
    { type: MARK_TYPE[mark], options: baseOptions },
  ];

  // ── Categorical x-axis label rotation ─────────────────────────────────────
  const xCategorical = isCategoricalX(data, x);
  let xTickRotate: number | undefined;
  let xMarginBottom: number | undefined;

  let xDomain: string[] | undefined;
  if (xCategorical) {
    const labels = distinctSorted(data, x);
    xDomain = labels;
    if (shouldRotateXLabels(labels, widthPx)) {
      xTickRotate = TICK_ROTATE_DEG;
      xMarginBottom = rotatedMarginBottom(labels, TICK_ROTATE_DEG);
    }
  }

  // ── Axis labels ───────────────────────────────────────────────────────────
  const resolvedXLabel = xLabel ?? humanizeLabel(x);
  const resolvedYLabel = yLabel ?? humanizeLabel(y);

  // ── y-zero ────────────────────────────────────────────────────────────────
  // Bars include 0 by default (comparison baseline). Line/area/dot leave the
  // domain auto so valleys and negative values display at full resolution.
  const yZero = props.yZero ?? (mark === "bar");

  return {
    marks,
    height,
    grid,
    caption,
    color,
    xCategorical,
    xDomain,
    xTickRotate,
    xMarginBottom,
    xLabel: resolvedXLabel,
    yLabel: resolvedYLabel,
    yZero,
    style: {
      fontFamily:
        'var(--font-mono, "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace)',
      background: "transparent",
      color: "var(--ink-dim)",
      fontSize: "var(--t-xs, 0.75rem)",
    },
  };
}
