// apps/site/src/components/mdx/Scatter.tsx
import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import {
  normalizeScatterSpec,
  scatterSummary,
  SCATTER_FIT_STROKE,
  type ScatterProps,
} from "./lib/scatter-spec.js";
import "./mdx.css";
import "./Scatter.css";

/**
 * Responsive Observable Plot scatter, styled with khazana tokens. Shows an x/y
 * relationship with optional `size`/`color` encodings and an optional linear
 * `fit` line. Mirrors <Chart>'s render/SSR/responsive machinery exactly:
 * ResizeObserver + IntersectionObserver drive a width-aware Plot.plot() redraw;
 * a visually-hidden `.chart-fallback` keeps a text summary in the a11y tree for
 * no-JS / SSR / pre-hydration (the "never blank" invariant).
 *
 * Aesthetic: sparse hollow amber dots on a `--rule` grid; the fit line (when
 * requested) is drawn in `--accent-dim` so it reads as a derived trend, not a
 * competing series. Hovering a point reveals its row values via Plot's `tip`.
 */
export default function Scatter(props: ScatterProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  const spec = normalizeScatterSpec(props);
  const ariaLabel = scatterSummary(props);

  // ── responsive measurement (identical strategy to Chart.tsx) ────────────────
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width || el.offsetWidth;
      if (w > 0) setWidth(Math.round(w));
    };

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w));
      else measure();
    });
    ro.observe(el);

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) measure();
      },
      { threshold: 0 },
    );
    io.observe(el);

    measure();
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // ── draw / redraw whenever width or data changes ────────────────────────────
  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;

    const data = props.data as Plot.Data;

    const marks: Plot.Markish[] = [
      Plot.ruleY([0], { stroke: "var(--rule)" }),
      Plot.dot(data, spec.dotOptions),
    ];
    if (spec.fit) {
      // Linear regression trend line, drawn under the dots' hue in accent-dim.
      marks.unshift(
        Plot.linearRegressionY(data, {
          x: props.x,
          y: props.y,
          stroke: SCATTER_FIT_STROKE,
          strokeWidth: 1.5,
          fillOpacity: 0.06,
        }),
      );
    }

    const plot = Plot.plot({
      width,
      height: spec.height,
      marginLeft: 48,
      marginBottom: 36,
      style: spec.style,
      grid: true,
      x: { tickSize: 0, label: spec.xLabel },
      y: { tickSize: 0, label: spec.yLabel, tickFormat: (d: number) => String(d) },
      color: spec.color ? { legend: true } : undefined,
      marks,
    });
    el.replaceChildren(plot);
    return () => plot.remove();
  }, [width, spec, props.data, props.x, props.y]);

  return (
    <figure className="mdx-figure mdx-figure--wide">
      <div className="mdx-panel chart-panel scatter-panel">
        <div ref={ref} className="chart-host" role="img" aria-label={ariaLabel} />
        {/* visually-hidden after hydration (Scatter.css); non-blank SSR text */}
        <div className="chart-fallback" aria-hidden="true">
          <span className="mdx-label">scatter</span>: {spec.yLabel} vs {spec.xLabel}
          {props.size ? ` · sized by ${props.size}` : ""}
          {props.color ? ` · colored by ${props.color}` : ""}
          {spec.fit ? " · linear fit" : ""} — {props.data.length} points
        </div>
      </div>
      {spec.caption ? <figcaption className="mdx-caption">{spec.caption}</figcaption> : null}
    </figure>
  );
}

export type { ScatterProps };
