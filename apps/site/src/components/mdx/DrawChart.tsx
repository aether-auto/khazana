// apps/site/src/components/mdx/DrawChart.tsx
// DRAW-ON-SCROLL line chart (art-direction §5): each stroke draws itself as the
// figure enters the viewport. Built on the pure `draw-path` helpers (tested) so
// the geometry is verifiable and the island stays a thin shell.
//
// MULTI-SERIES: pass `series` to draw several trajectories on ONE shared scale
// (so divergence is visible — e.g. one path climbing while another round-trips
// to the floor), with a legend + axis labels. Single-series `data` still works
// (it is normalized into a one-element series internally).
//
// The reveal uses an IntersectionObserver to flip a class once — no per-frame JS,
// no scroll listener; the actual draw is a single composited stroke-dashoffset
// CSS transition. Under reduced-motion / no-JS the paths render fully drawn
// immediately (the figure is the data, never gated behind motion).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  makeScalesMulti,
  linePath,
  areaPath,
  pathLength,
  axisTicks,
  type Box,
  type Series,
} from "./lib/draw-path.js";
import type { Point } from "./lib/model-curve.js";
import "./mdx.css";
import "./DrawChart.css";

export interface DrawChartProps {
  /** single-series points (backward-compatible). */
  data?: Point[];
  /** multiple named series, drawn on one shared scale with a legend. */
  series?: Series[];
  caption?: string;
  /** y-axis unit for the screen-reader label. */
  unit?: string;
  /** axis titles (in-plot, terminal-quiet). */
  xLabel?: string;
  yLabel?: string;
  /** draw on a log y-scale (useful when a series collapses toward 0). */
  logY?: boolean;
  /** draw duration in ms (skipped under reduced-motion). */
  duration?: number;
}

const BOX: Box = { width: 640, height: 300, padX: 44, padY: 28 };

/** Normalize the two authoring shapes into a single non-empty series list. */
function toSeries(props: DrawChartProps): Series[] {
  if (props.series && props.series.length > 0) return props.series;
  const data = props.data ?? [];
  return [{ id: "series-0", label: props.yLabel ?? "value", points: data }];
}

/**
 * For a log y-scale, map each y to log10 while keeping the original value for
 * the axis label. A series that collapses to ~0 would be -Infinity under log,
 * so we floor at a small epsilon (the "round-trips to nothing" path bottoms out
 * at the chart floor rather than disappearing).
 */
const LOG_FLOOR = 1e-3;
function logTransform(series: Series[]): { series: Series[]; toLabel: (v: number) => number } {
  const lg = (v: number) => Math.log10(Math.max(LOG_FLOOR, v));
  const mapped = series.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ x: p.x, y: lg(p.y) })),
  }));
  // axis labels show the un-logged value (rounded for legibility).
  const toLabel = (v: number) => {
    const real = 10 ** v;
    return real >= 10 ? Math.round(real) : Math.round(real * 100) / 100;
  };
  return { series: mapped, toLabel };
}

export default function DrawChart(props: DrawChartProps) {
  const { caption, unit = "", xLabel, yLabel, logY = false, duration = 1400 } = props;
  const ref = useRef<HTMLElement | null>(null);
  // FAIL-SAFE default: the chart renders FULLY DRAWN. The draw-on-scroll is a
  // pure progressive enhancement — only an effect that actually runs may arm the
  // "undrawn" start state and animate it in. If JS never hydrates (or throws),
  // `drawn` stays true and the figure is fully visible — never a blank chart.
  const [drawn, setDrawn] = useState(true);
  // Has the client effect taken control? Until it has, we never emit the
  // hidden (offset = len) state, so SSR / failed-hydration shows the full line.
  const [armed, setArmed] = useState(false);

  const { series, paths, xTicks, yTicks } = useMemo(() => {
    const series = toSeries(props);
    const { series: scaleSeries, toLabel } = logY
      ? logTransform(series)
      : { series, toLabel: (v: number) => Math.round(v * 100) / 100 };
    const scales = makeScalesMulti(scaleSeries, BOX);
    const baseline = BOX.height - BOX.padY;
    const paths = scaleSeries.map((s, i) => ({
      id: s.id,
      label: s.label,
      d: linePath(s.points, scales),
      // only the FIRST series gets the faint area underlay (avoids opaque overlap).
      area: i === 0 ? areaPath(s.points, scales, baseline) : "",
      len: pathLength(s.points, scales),
    }));
    const { xMin, xMax, yMin, yMax } = scales.domain;
    const xTicks = axisTicks(xMin, xMax, 5, scales.x).map((t) => ({
      ...t,
      value: Math.round(t.value * 100) / 100,
    }));
    const yTicks = axisTicks(yMin, yMax, 4, scales.y).map((t) => ({
      ...t,
      value: toLabel(t.value),
    }));
    return { series, paths, xTicks, yTicks };
  }, [props.data, props.series, props.yLabel, logY]);

  const multi = series.length > 1;
  const pointCount = series.reduce((n, s) => n + s.points.length, 0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window) || !ref.current) {
      setDrawn(true); // show fully drawn immediately (no animation)
      return;
    }
    const el = ref.current;
    // Arm the animation: start from undrawn, then draw in when scrolled into view.
    setDrawn(false);
    setArmed(true);
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setDrawn(true);
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const label = multi
    ? `Line chart comparing ${series.length} series: ${series.map((s) => s.label).join(", ")}${unit ? ` (${unit})` : ""}.`
    : `Line chart of ${pointCount} points${unit ? ` (${unit})` : ""}.`;

  return (
    <figure className="mdx-figure mdx-figure--wide dchart" ref={ref}>
      <div className="mdx-panel dchart-panel paper">
        <svg
          className="dchart-svg"
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          role="img"
          aria-label={label}
        >
          {/* axes: hairline ticks + value labels (in-plot, terminal-quiet) */}
          <g className="dchart-axes">
            {yTicks.map((t) => (
              <g key={`y${t.value}`}>
                <line className="dchart-grid" x1={BOX.padX} y1={t.pos} x2={BOX.width - BOX.padX} y2={t.pos} />
                <text className="dchart-tick dchart-tick--y" x={BOX.padX - 6} y={t.pos}>
                  {t.value}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={`x${t.value}`} className="dchart-tick dchart-tick--x" x={t.pos} y={BOX.height - BOX.padY + 16}>
                {t.value}
              </text>
            ))}
            {yLabel ? (
              <text className="dchart-axis-title dchart-axis-title--y" transform={`translate(12 ${BOX.height / 2}) rotate(-90)`}>
                {yLabel}
              </text>
            ) : null}
            {xLabel ? (
              <text className="dchart-axis-title dchart-axis-title--x" x={BOX.width / 2} y={BOX.height - 2}>
                {xLabel}
              </text>
            ) : null}
          </g>
          {paths.map((p) => {
            // Only honour the undrawn start once the client has armed it.
            const offset = armed && !drawn ? p.len : 0;
            return (
              <g key={p.id} className="dchart-series">
                {p.area ? (
                  <path className={drawn ? "dchart-area is-drawn" : "dchart-area"} d={p.area} />
                ) : null}
                <path
                  className={drawn ? "dchart-line is-drawn" : "dchart-line"}
                  d={p.d}
                  style={{
                    strokeDasharray: p.len,
                    strokeDashoffset: offset,
                    transition: `stroke-dashoffset ${duration}ms cubic-bezier(0.2,0.7,0.2,1)`,
                  }}
                />
              </g>
            );
          })}
        </svg>
        {multi ? (
          <ul className="dchart-legend" aria-hidden="true">
            {series.map((s) => (
              <li key={s.id} className="dchart-legend-item">
                <span className="dchart-legend-swatch" />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
