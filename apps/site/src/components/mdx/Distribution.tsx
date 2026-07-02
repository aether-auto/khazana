// apps/site/src/components/mdx/Distribution.tsx
//
// A histogram / density plot with an optional overlaid reference line — the
// amber `--accent` marker that IS the argument (a mean, threshold, cutoff). A
// thin wrapper over Observable Plot's `rectY`+`binX` (histogram) or `density`.
// No new dep. Mirrors Chart.tsx: ResizeObserver + IntersectionObserver measure,
// re-plot on width change, terminal-token styling, width:100% responsiveness.
//
// SSR / no-JS fallback (never blank): a real bin table (range → count) computed
// by the same pure binning the chart uses, so counts agree with the rendered
// bars. Kept visually-hidden after hydration but always in the a11y tree.
//
// Hover a bin → Plot's native tip shows count + range. No animation is required,
// so the component is trivially reduced-motion-safe (the marker line and bars
// are static in every mode).
import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import {
  buildDistributionSpec,
  type DistributionProps,
  type DistributionSpec,
} from "./lib/distribution-spec.js";
import "./mdx.css";
import "./Distribution.css";

export type { DistributionProps, DistMarker } from "./lib/distribution-spec.js";

/** A short numeric formatter for the SSR bin table + tips. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * `Plot.binX({y:"count"}, {...})` puts the x channel + style options in the
 * second arg. Plot's `BinXInputs` TS type omits mark-style keys (fill/stroke/…),
 * so we build them as an untyped bag and cast — the same escape hatch Chart.tsx
 * uses for its axis option records. Runtime-valid; the cast only quiets TS.
 */
function binXCount(value: string, thresholds: number, style: Record<string, unknown>) {
  return Plot.binX(
    { y: "count" },
    { x: value, thresholds, ...style } as Parameters<typeof Plot.binX>[1],
  );
}

function buildMarks(spec: DistributionSpec, data: DistributionProps["data"], value: string) {
  const marks: Plot.Markish[] = [];
  marks.push(Plot.ruleY([0], { stroke: "var(--rule)" }));

  if (spec.markType === "density") {
    marks.push(
      Plot.areaY(
        data,
        binXCount(value, spec.binCount, {
          fill: "var(--accent)",
          fillOpacity: 0.1,
          curve: "basis",
        }),
      ),
    );
    marks.push(
      Plot.lineY(
        data,
        binXCount(value, spec.binCount, {
          stroke: "var(--accent)",
          strokeWidth: 1.75,
          curve: "basis",
        }),
      ),
    );
  } else {
    marks.push(
      Plot.rectY(
        data,
        binXCount(value, spec.binCount, {
          fill: "var(--accent)",
          fillOpacity: 0.22,
          stroke: "var(--accent)",
          strokeWidth: 1,
          insetLeft: 0.5,
          insetRight: 0.5,
          tip: true,
        }),
      ),
    );
  }

  // Reference markers: the amber threshold line(s) that carry the argument.
  for (const m of spec.markers) {
    marks.push(Plot.ruleX([m.at], { stroke: "var(--accent)", strokeWidth: 1.5, strokeDasharray: "3 3" }));
    marks.push(
      Plot.text([m], {
        x: (d: { at: number }) => d.at,
        text: (d: { label: string }) => d.label,
        frameAnchor: "top",
        dy: 4,
        dx: 4,
        textAnchor: "start",
        fill: "var(--accent)",
        fontSize: 11,
      }),
    );
  }
  return marks;
}

export default function Distribution(props: DistributionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  const spec = buildDistributionSpec(props);

  const ariaLabel = [
    `${spec.markType === "density" ? "density" : "histogram"} of ${spec.valueLabel}`,
    `— ${spec.values.length} values across ${spec.binCount} bins`,
    spec.markers.length ? `, marked at ${spec.markers.map((m) => m.label).join(", ")}` : "",
    spec.caption ? ` (${spec.caption})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Measure — identical strategy to Chart.tsx.
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

  // Re-plot on width change.
  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;

    const chart = Plot.plot({
      width,
      height: spec.height,
      marginLeft: 44,
      marginBottom: 34,
      style: spec.style,
      grid: false,
      x: { tickSize: 0, label: spec.valueLabel },
      y: { tickSize: 0, label: "count", tickFormat: (d: number) => String(d) },
      marks: buildMarks(spec, props.data, props.value),
    });
    el.replaceChildren(chart);
    return () => chart.remove();
  }, [width, spec, props.data, props.value]);

  return (
    <figure className="mdx-figure mdx-figure--wide mdx-dist">
      <div className="mdx-panel dist-panel">
        <div ref={ref} className="dist-host" role="img" aria-label={ariaLabel} />
        <div className="dist-fallback" aria-hidden="true">
          <span className="mdx-label">
            {spec.markType === "density" ? "density" : "histogram"}
          </span>
          : {spec.valueLabel} — {spec.values.length} values, {spec.binCount} bins
          {spec.markers.length
            ? `, marker(s) at ${spec.markers.map((m) => `${m.label} ${fmt(m.at)}`).join(", ")}`
            : ""}
          <table className="dist-fallback__table">
            <thead>
              <tr>
                <th>range</th>
                <th>count</th>
              </tr>
            </thead>
            <tbody>
              {spec.bins.map((b, i) => (
                <tr key={i}>
                  <td>
                    {fmt(b.x0)}–{fmt(b.x1)}
                  </td>
                  <td>{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {spec.caption ? <figcaption className="mdx-caption">{spec.caption}</figcaption> : null}
    </figure>
  );
}
