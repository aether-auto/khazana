// apps/site/src/components/mdx/lib/scatter-spec.ts
/**
 * Pure normalizer for <Scatter>: khazana's small declarative scatter API → a
 * plain, Plot-agnostic options object. No DOM, no Plot import — testable
 * offline. The island (Scatter.tsx) maps these onto real Observable Plot marks
 * (`dot` + optional `linearRegressionY`). Mirrors chart-spec.ts's shape.
 */

import { humanizeLabel } from "./chart-spec.js";

export type ScatterFit = "linear" | "none";

export interface ScatterProps {
  /** Row-oriented data. */
  data: ReadonlyArray<Record<string, unknown>>;
  /** Field name for the x channel. */
  x: string;
  /** Field name for the y channel. */
  y: string;
  /** Optional field mapped to dot radius (quantitative). */
  size?: string;
  /** Optional field mapped to dot color (categorical or quantitative). */
  color?: string;
  /** Draw a linear fit line (default "none"). */
  fit?: ScatterFit;
  /** Caption rendered in the figcaption. */
  caption?: string;
  /** Human-readable x-axis label (auto-derived from `x` if omitted). */
  xLabel?: string;
  /** Human-readable y-axis label (auto-derived from `y` if omitted). */
  yLabel?: string;
  /** Pixel height (default 340). */
  height?: number;
}

export interface NormalizedScatterSpec {
  /** dot channel options (x, y, r?, stroke?, tip). */
  dotOptions: Record<string, unknown>;
  /** when true, add a Plot.linearRegressionY overlay in --accent-dim. */
  fit: boolean;
  height: number;
  caption?: string;
  xLabel: string;
  yLabel: string;
  /** categorical color scale, present only when `color` splits into <= many series. */
  color?: { field: string };
  /** the shared Plot style object (token-driven, matches Chart). */
  style: { fontFamily: string; background: string; color: string; fontSize: string };
}

const FIT_LINE_STROKE = "var(--accent-dim)";
const DOT_STROKE = "var(--accent)";

export function normalizeScatterSpec(props: ScatterProps): NormalizedScatterSpec {
  const { data, x, y, size, color, xLabel, yLabel, caption, height = 340 } = props;
  if (!data || data.length === 0) {
    throw new Error("Scatter: `data` must be a non-empty array");
  }
  if (!x || !y) throw new Error("Scatter: `x` and `y` field names are required");

  const fit = props.fit === "linear";

  // Hollow amber dots on the --rule grid; fill:"none" keeps them sparse/legible.
  const dotOptions: Record<string, unknown> = {
    x,
    y,
    r: size ?? 3.5,
    fill: "none",
    stroke: color ?? DOT_STROKE,
    strokeWidth: 1.5,
    tip: true,
  };

  return {
    dotOptions,
    fit,
    height,
    caption,
    xLabel: xLabel ?? humanizeLabel(x),
    yLabel: yLabel ?? humanizeLabel(y),
    color: color ? { field: color } : undefined,
    style: {
      fontFamily:
        'var(--font-mono, "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace)',
      background: "transparent",
      color: "var(--ink-dim)",
      fontSize: "var(--t-xs, 0.75rem)",
    },
  };
}

/** Stroke color for the linear fit overlay (token-driven). */
export const SCATTER_FIT_STROKE = FIT_LINE_STROKE;

/**
 * Build the stable aria-label / fallback summary for a scatter, describing the
 * relationship and any extra encodings. Pure — reused by the a11y label and the
 * no-JS fallback text so they never drift.
 */
export function scatterSummary(props: ScatterProps): string {
  const parts = [
    "scatter plot",
    `of ${props.yLabel ?? humanizeLabel(props.y)} vs ${props.xLabel ?? humanizeLabel(props.x)}`,
  ];
  if (props.size) parts.push(`sized by ${humanizeLabel(props.size)}`);
  if (props.color) parts.push(`colored by ${humanizeLabel(props.color)}`);
  if (props.fit === "linear") parts.push("with a linear fit");
  parts.push(`— ${props.data.length} points`);
  if (props.caption) parts.push(`(${props.caption})`);
  return parts.join(" ");
}
