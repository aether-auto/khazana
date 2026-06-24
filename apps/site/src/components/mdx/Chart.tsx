// apps/site/src/components/mdx/Chart.tsx
import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import {
  normalizeChartSpec,
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
  const spec = normalizeChartSpec(props);
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

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
    const chart = Plot.plot({
      width,
      height: spec.height,
      marginLeft: 48,
      marginBottom: 32,
      style: spec.style,
      grid: spec.grid,
      x: { tickSize: 0, label: null },
      y: { tickSize: 0, label: null, ...(spec.grid ? {} : {}) },
      color: spec.color ? { type: "categorical", ...spec.color, legend: !!props.series } : undefined,
      marks: spec.marks.map((m) => buildMark(m, props.data)),
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
