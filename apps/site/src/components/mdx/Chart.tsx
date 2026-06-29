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
      // strokeWidth 2 + fill:"none" (set in spec) → clean stroke, no flood-fill.
      return Plot.line(data, { ...m.options, strokeWidth: 2 });
    case "areaY":
      // Very low fillOpacity (8%) so the tinted band doesn't bury the data.
      // Multi-series: each series gets its own tinted band; strokes read clearly.
      return Plot.areaY(data, { ...m.options, fillOpacity: 0.08, strokeWidth: 1.5 });
    case "barY":
      return Plot.barY(data, { ...m.options, insetLeft: 1, insetRight: 1 });
    case "dot":
      // Hollow dot: fill:"none" from spec, stroke only.
      return Plot.dot(data, { ...m.options, r: 3, strokeWidth: 1.5 });
  }
}

/**
 * Responsive Observable Plot chart, styled with khazana tokens.
 *
 * Accessibility: the chart host carries role="img" + a descriptive aria-label
 * so screen readers get a text summary of the chart.  The `.chart-fallback` is
 * kept visually hidden (not display:none) so AT also sees the raw data
 * description at all times (pre- and post-hydration).
 */
export default function Chart(props: ChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // Re-normalize whenever width changes (rotation heuristic needs real width).
  const spec = normalizeChartSpec(props, width > 0 ? width : undefined);

  // Stable aria-label summarising the chart for AT.
  const ariaLabel = [
    `${props.mark} chart`,
    props.series
      ? `of ${props.y} by ${props.x} split by ${props.series}`
      : `of ${props.y} by ${props.x}`,
    `—`,
    `${props.data.length} data points`,
    spec.caption ? `(${spec.caption})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // contentRect is zero while the element is hidden; fall back to offsetWidth
      // (layout box) which is non-zero for display-block elements even when
      // off-screen, as long as the element is not display:none.
      const w = el.getBoundingClientRect().width || el.offsetWidth;
      if (w > 0) setWidth(Math.round(w));
    };

    // ResizeObserver: re-draw whenever the container is resized.
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w));
      else measure(); // contentRect reported 0 — try layout width
    });
    ro.observe(el);

    // IntersectionObserver: trigger a measurement the first time the chart
    // enters the viewport (handles Scrolly panes that are initially hidden).
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) measure();
      },
      { threshold: 0 },
    );
    io.observe(el);

    // Eager initial measurement (chart may already be visible on mount).
    measure();

    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;

    // ── x-axis options ────────────────────────────────────────────────────────
    const xOptions: Record<string, unknown> = {
      tickSize: 0,
      label: spec.xLabel,
    };
    if (spec.xTickRotate !== undefined) {
      xOptions.tickRotate = spec.xTickRotate;
    }
    // Enforce numeric-aware categorical order computed in normalizeChartSpec.
    if (spec.xDomain !== undefined) {
      xOptions.domain = spec.xDomain;
    }

    // Coerce numeric-string x values so Plot doesn't emit its ⚠ warning glyph.
    const plotData = coerceNumericX(props.data, props.x);

    const chart = Plot.plot({
      width,
      height: spec.height,
      marginLeft: 48,
      marginBottom: spec.xMarginBottom ?? 32,
      style: spec.style,
      grid: spec.grid,
      x: xOptions,
      y: {
        tickSize: 0,
        label: spec.yLabel,
        // Explicit tickFormat forces ASCII hyphen-minus for negative values.
        tickFormat: (d: number) => String(d),
        // For bar/comparison charts, include 0 in the domain without capping
        // the upper bound — Plot extends to fit data automatically.
        ...(spec.yZero ? { zero: true } : {}),
      },
      color: spec.color
        ? { type: "categorical", ...spec.color, legend: !!props.series }
        : undefined,
      marks: spec.marks.map((m) => buildMark(m, plotData)),
    });
    el.replaceChildren(chart);
    return () => chart.remove();
  }, [width, spec, props.data, props.series]);

  return (
    <figure className="mdx-figure mdx-figure--wide">
      <div className="mdx-panel chart-panel">
        {/*
          role="img" + aria-label: the hydrated SVG chart is visible to AT.
          Not aria-hidden — the chart host IS the primary content for sighted users
          and must be announced as an image with a description.
        */}
        <div
          ref={ref}
          className="chart-host"
          role="img"
          aria-label={ariaLabel}
        />
        {/*
          .chart-fallback is visually hidden (not display:none) so it stays in
          the a11y tree.  It's also aria-hidden here because the role="img" +
          aria-label on the host already provides the AT-facing description —
          this fallback is a belt-and-suspenders text representation for
          no-JS/SSR contexts where the SVG hasn't mounted yet.
          Chart.css handles visual hiding via .chart-fallback after hydration.
        */}
        <div className="chart-fallback" aria-hidden="true">
          <span className="mdx-label">chart</span>: {props.mark} of {props.y} by {props.x}
          {props.series ? ` (${props.series})` : ""} — {props.data.length} points
        </div>
      </div>
      {spec.caption ? <figcaption className="mdx-caption">{spec.caption}</figcaption> : null}
    </figure>
  );
}
