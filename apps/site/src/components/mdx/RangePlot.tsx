// apps/site/src/components/mdx/RangePlot.tsx
import { useState } from "react";
import {
  layoutRangePlot,
  formatRangeValue,
  type RangeDatum,
} from "./lib/rangeplot-scale.js";
import "./mdx.css";
import "./RangePlot.css";

export interface RangePlotProps {
  data: RangeDatum[];
  caption?: string;
  /** unit suffix appended to the readout values, e.g. "ms", "%". */
  unit?: string;
}

// Fixed SVG coordinate width; the panel scales it to fit via viewBox (100%).
const VIEW_W = 720;
const LABEL_GUTTER = 180;
const RIGHT_PAD = 24;
const TOP_PAD = 26;
const ROW_STEP = 40;

/**
 * Dot-plus-range plot — a hairline low→high range with an amber mid dot per
 * category (CI / min–max / IQR). The honest alternative to bars-with-error-caps:
 * the range is drawn to scale and the point estimate is a dot, not an implied
 * "value" at the bar top. All geometry comes from the pure, unit-tested
 * `layoutRangePlot`.
 *
 * Interaction: hover/focus a category → its exact low·mid·high (and n, if given)
 * surface in a stable readout strip and the row lifts. SSR / no-JS fallback is a
 * semantic list. Reduced-motion: no transitions, end state rendered.
 */
export default function RangePlot({ data, caption, unit }: RangePlotProps) {
  const layout = layoutRangePlot(data, {
    width: VIEW_W,
    labelGutter: LABEL_GUTTER,
    rightPad: RIGHT_PAD,
    topPad: TOP_PAD,
    rowStep: ROW_STEP,
  });
  const [active, setActive] = useState<number | null>(null);

  const suffix = unit ? ` ${unit}` : "";
  const fmt = (v: number) => `${formatRangeValue(v)}${suffix}`;
  const activeRow = active != null ? layout.rows[active] : null;

  return (
    <figure className="mdx-figure mdx-figure--wide rp">
      <div className="mdx-panel rp-panel">
        <svg
          className="rp-svg"
          viewBox={`0 0 ${VIEW_W} ${layout.height + 24}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `Range plot: ${caption}` : "Dot-and-range plot"}
        >
          {/* ── value axis ticks (below the rows) ──────────────────────────── */}
          {layout.ticks.map((t) => (
            <g key={`tick-${t.value}`} className="rp-tick" aria-hidden="true">
              <line x1={t.x} y1={TOP_PAD - 6} x2={t.x} y2={layout.axisY} />
              <text x={t.x} y={layout.axisY + 16} textAnchor="middle" className="rp-tick-label">
                {formatRangeValue(t.value)}
              </text>
            </g>
          ))}

          {/* ── category rows ──────────────────────────────────────────────── */}
          {layout.rows.map((r, i) => {
            const isActive = active === i;
            return (
              <g
                key={`row-${r.label}-${i}`}
                className={isActive ? "rp-row rp-row--active" : "rp-row"}
                tabIndex={0}
                role="button"
                aria-label={`${r.label}: ${formatRangeValue(r.low)} to ${formatRangeValue(r.high)}${unit ? " " + unit : ""}, mid ${formatRangeValue(r.mid)}${r.n != null ? `, n=${r.n}` : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((c) => (c === i ? null : c))}
              >
                {/* full-row transparent hit-target */}
                <rect
                  className="rp-hit"
                  x={0}
                  y={r.y - ROW_STEP / 2}
                  width={VIEW_W}
                  height={ROW_STEP}
                />
                {/* category label in the left gutter */}
                <text x={LABEL_GUTTER - 14} y={r.y + 4} textAnchor="end" className="rp-cat">
                  {r.label}
                </text>
                {/* the range: hairline with end caps */}
                <line className="rp-range" x1={r.xLow} y1={r.y} x2={r.xHigh} y2={r.y} />
                <line className="rp-cap" x1={r.xLow} y1={r.y - 5} x2={r.xLow} y2={r.y + 5} />
                <line className="rp-cap" x1={r.xHigh} y1={r.y - 5} x2={r.xHigh} y2={r.y + 5} />
                {/* the mid dot (the point estimate) */}
                <circle className="rp-mid" cx={r.xMid} cy={r.y} r={isActive ? 5.5 : 4.5} />
              </g>
            );
          })}

          {/* ── stable readout strip (no layout shift) ─────────────────────── */}
          {activeRow ? (
            <text x={VIEW_W / 2} y={layout.height + 12} textAnchor="middle" className="rp-readout">
              <tspan className="rp-readout-cat">{activeRow.label}</tspan>
              <tspan className="rp-readout-sep">  ·  </tspan>
              <tspan className="rp-readout-val">{fmt(activeRow.low)}</tspan>
              <tspan className="rp-readout-sep"> — </tspan>
              <tspan className="rp-readout-mid">{fmt(activeRow.mid)}</tspan>
              <tspan className="rp-readout-sep"> — </tspan>
              <tspan className="rp-readout-val">{fmt(activeRow.high)}</tspan>
              {activeRow.n != null ? (
                <tspan className="rp-readout-n">   n={activeRow.n}</tspan>
              ) : null}
            </text>
          ) : (
            <text
              x={VIEW_W / 2}
              y={layout.height + 12}
              textAnchor="middle"
              className="rp-readout rp-readout--hint"
            >
              hover a category for exact bounds
            </text>
          )}
        </svg>

        {/* SSR / no-JS fallback: a semantic low–mid–high list. */}
        <ul className="rp-fallback">
          {layout.rows.map((r, i) => (
            <li key={`f-${i}`}>
              <span className="rp-fallback-cat">{r.label}</span>{" "}
              <span className="mdx-label">range</span> {fmt(r.low)} – {fmt(r.high)}
              {", "}
              <span className="mdx-label">mid</span> {fmt(r.mid)}
              {r.n != null ? <span className="rp-fallback-n"> (n={r.n})</span> : null}
            </li>
          ))}
        </ul>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

export type { RangeDatum };
