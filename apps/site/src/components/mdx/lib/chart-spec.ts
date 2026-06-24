// apps/site/src/components/mdx/lib/chart-spec.ts
/**
 * Pure normalizer: khazana's small declarative <Chart> API -> a plain,
 * Plot-agnostic options object. No DOM, no Plot import — testable offline.
 * The island (Chart.tsx) maps `marks` onto real Observable Plot marks.
 */

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
}

const MARK_TYPE: Record<ChartMark, NormalizedMark["type"]> = {
  line: "line",
  bar: "barY",
  area: "areaY",
  dot: "dot",
};

const distinctSorted = (rows: ReadonlyArray<Record<string, unknown>>, key: string): string[] =>
  [...new Set(rows.map((r) => String(r[key])))].sort();

export function normalizeChartSpec(props: ChartProps): NormalizedChartSpec {
  const { data, mark, x, y, series, height = 320, grid = false, caption } = props;
  if (!data || data.length === 0) throw new Error("Chart: `data` must be a non-empty array");
  if (!(mark in MARK_TYPE)) throw new Error(`Chart: unknown mark "${mark}"`);

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

  return {
    marks,
    height,
    grid,
    caption,
    color,
    style: {
      fontFamily:
        'var(--font-mono, "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace)',
      background: "transparent",
      color: "var(--ink-dim)",
      fontSize: "var(--t-xs, 0.75rem)",
    },
  };
}
