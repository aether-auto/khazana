// apps/site/src/components/mdx/Chart.tsx
import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import {
  normalizeChartSpec,
  coerceNumericX,
  type ChartProps,
  type NormalizedMark,
} from "./lib/chart-spec.js";
import "./mdx.css";
import "./Chart.css";

function buildMark(m: NormalizedMark, data: ChartProps["data"]) {
  switch (m.type) {
    case "ruleY":
      return Plot.ruleY([0], { stroke: "var(--rule)" });
    case "line":
      return Plot.line(data, { ...m.options, strokeWidth: 2 });
    case "areaY":
      return Plot.areaY(data, { ...m.options, fillOpacity: 0.12 });
    case "barY":
      return Plot.barY(data, { ...m.options, insetLeft: 1, insetRight: 1 });
    case "dot":
      return Plot.dot(data, { ...m.options, r: 3 });
  }
}

/**
 * Responsive Observable Plot chart, styled with khazana tokens.
 * SSR fallback: figure + caption + a hidden data summary so no-JS readers and
 * the build get real content; the live plot mounts on hydration.
 */
export default function Chart(props: ChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // Re-normalize whenever width changes so the rotation heuristic can use the
  // actual container pixel width (the spec is pure and cheap to recompute).
  const spec = normalizeChartSpec(props, width > 0 ? width : undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;

    // ── x-axis options ────────────────────────────────────────────────────────
    // For categorical bar charts with long labels, rotate ticks to prevent
    // overlap. Numeric-x charts (line/area/dot) use the plain defaults.
    const xOptions: Record<string, unknown> = { tickSize: 0, label: null };
    if (spec.xTickRotate !== undefined) {
      xOptions.tickRotate = spec.xTickRotate;
    }

    // Coerce numeric-string x values to real Numbers so Observable Plot does
    // not emit its "strings that appear to be numbers" ⚠ warning glyph.
    // Categorical x values ("10%", "bet max (all-in)") pass through unchanged.
    const plotData = coerceNumericX(props.data, props.x);

    const chart = Plot.plot({
      width,
      height: spec.height,
      marginLeft: 48,
      // Grow bottom margin to accommodate rotated tick labels when needed.
      marginBottom: spec.xMarginBottom ?? 32,
      style: spec.style,
      grid: spec.grid,
      x: xOptions,
      // Explicit tickFormat ensures negative values render with a minus sign
      // (some environments / fonts substitute a Unicode minus that is very
      // low-contrast; the explicit format forces an ASCII hyphen-minus).
      y: { tickSize: 0, label: null, tickFormat: (d: number) => String(d) },
      color: spec.color ? { type: "categorical", ...spec.color, legend: !!props.series } : undefined,
      marks: spec.marks.map((m) => buildMark(m, plotData)),
    });
    el.replaceChildren(chart);
    return () => chart.remove();
  }, [width, spec, props.data, props.series]);

  return (
    <figure className="mdx-figure mdx-figure--wide">
      <div className="mdx-panel chart-panel">
        <div ref={ref} className="chart-host" aria-hidden="true" />
        {/* SSR/no-JS fallback summary (hidden once hydrated host has content) */}
        <div className="chart-fallback">
          <span className="mdx-label">chart</span>: {props.mark} of {props.y} by {props.x}
          {props.series ? ` (${props.series})` : ""} — {props.data.length} points
        </div>
      </div>
      {spec.caption ? <figcaption className="mdx-caption">{spec.caption}</figcaption> : null}
    </figure>
  );
}
