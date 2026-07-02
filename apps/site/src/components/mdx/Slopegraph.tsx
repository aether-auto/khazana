// apps/site/src/components/mdx/Slopegraph.tsx
import { useState } from "react";
import {
  layoutSlopegraph,
  deCollideColumn,
  formatSlopeValue,
  type SlopeDatum,
} from "./lib/slopegraph-scale.js";
import "./mdx.css";
import "./Slopegraph.css";

export interface SlopegraphProps {
  data: SlopeDatum[];
  beforeLabel: string;
  afterLabel: string;
  caption?: string;
}

// Fixed SVG coordinate box; the panel scales it to fit via viewBox (width:100%).
const VIEW_W = 720;
const VIEW_H = 460;
const COL_INSET = 150;
const V_PAD = 40;
const LABEL_MIN_GAP = 18;

/**
 * Tufte slopegraph — two columns of before/after values connected by ranking
 * lines. Reordering and convergence ARE the story: risers (up) draw in
 * `--accent` (amber), fallers (down) in `--editorial` (clay), flat in a hairline
 * rule. All geometry comes from the pure, unit-tested `layoutSlopegraph`; label
 * de-collision keeps stacked endpoint labels legible in each gutter.
 *
 * Interaction: hover/focus a slope → it lifts to full strength, the rest dim,
 * and its exact before/after values surface at both endpoints. The SSR / no-JS
 * fallback is a semantic list (label: before → after). Reduced-motion: no
 * transitions, end state rendered.
 */
export default function Slopegraph({ data, beforeLabel, afterLabel, caption }: SlopegraphProps) {
  const layout = layoutSlopegraph(data, {
    width: VIEW_W,
    height: VIEW_H,
    colInset: COL_INSET,
    vPad: V_PAD,
  });
  const [active, setActive] = useState<number | null>(null);

  // De-collide the two label gutters independently so stacked endpoint labels
  // never overlap. Order preserved → parallel to layout.rows.
  const leftYs = deCollideColumn(layout.rows.map((r) => r.y1), LABEL_MIN_GAP);
  const rightYs = deCollideColumn(layout.rows.map((r) => r.y2), LABEL_MIN_GAP);

  const dimmed = active != null;

  return (
    <figure className="mdx-figure mdx-figure--wide sg">
      <div className="mdx-panel sg-panel">
        <svg
          className={dimmed ? "sg-svg sg-svg--dimmed" : "sg-svg"}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `Slopegraph: ${caption}` : "Before/after slopegraph"}
        >
          {/* ── column headers ─────────────────────────────────────────────── */}
          <text x={layout.x1} y={V_PAD - 18} textAnchor="middle" className="sg-col-head">
            {beforeLabel}
          </text>
          <text x={layout.x2} y={V_PAD - 18} textAnchor="middle" className="sg-col-head">
            {afterLabel}
          </text>

          {/* ── the two column rules (hairline axes) ───────────────────────── */}
          <line x1={layout.x1} y1={layout.top} x2={layout.x1} y2={layout.bottom} className="sg-col-rule" />
          <line x1={layout.x2} y1={layout.top} x2={layout.x2} y2={layout.bottom} className="sg-col-rule" />

          {/* ── slopes (drawn first, under labels/dots) ────────────────────── */}
          {layout.rows.map((r, i) => {
            const isActive = active === i;
            return (
              <g
                key={`slope-${r.label}-${i}`}
                className={`sg-slope sg-slope--${r.dir}${isActive ? " sg-slope--active" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`${r.label}: ${beforeLabel} ${formatSlopeValue(r.before)}, ${afterLabel} ${formatSlopeValue(r.after)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((c) => (c === i ? null : c))}
              >
                {/* fat transparent hit-target following the slope */}
                <line className="sg-hit" x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
                <line className="sg-line" x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
                <circle className="sg-dot" cx={r.x1} cy={r.y1} r={isActive ? 4 : 3} />
                <circle className="sg-dot" cx={r.x2} cy={r.y2} r={isActive ? 4 : 3} />
              </g>
            );
          })}

          {/* ── left gutter labels (category + before value) ───────────────── */}
          {layout.rows.map((r, i) => {
            const isActive = active === i;
            return (
              <text
                key={`ll-${i}`}
                x={layout.x1 - 12}
                y={leftYs[i] + 4}
                textAnchor="end"
                className={`sg-endlabel${isActive ? " sg-endlabel--active" : ""}`}
                aria-hidden="true"
              >
                <tspan className="sg-endlabel-name">{r.label}</tspan>
                <tspan className="sg-endlabel-val" dx={8}>
                  {formatSlopeValue(r.before)}
                </tspan>
              </text>
            );
          })}

          {/* ── right gutter labels (after value + category) ───────────────── */}
          {layout.rows.map((r, i) => {
            const isActive = active === i;
            return (
              <text
                key={`rl-${i}`}
                x={layout.x2 + 12}
                y={rightYs[i] + 4}
                textAnchor="start"
                className={`sg-endlabel${isActive ? " sg-endlabel--active" : ""}`}
                aria-hidden="true"
              >
                <tspan className="sg-endlabel-val">{formatSlopeValue(r.after)}</tspan>
                <tspan className="sg-endlabel-name" dx={8}>
                  {r.label}
                </tspan>
              </text>
            );
          })}
        </svg>

        {/* SSR / no-JS fallback: a semantic before→after list. */}
        <ul className="sg-fallback">
          {layout.rows.map((r, i) => (
            <li key={`f-${i}`}>
              <span className="sg-fallback-name">{r.label}</span>
              <span className="mdx-label"> {beforeLabel} </span>
              {formatSlopeValue(r.before)}
              <span className={`sg-fallback-arrow sg-fallback-arrow--${r.dir}`}> → </span>
              <span className="mdx-label">{afterLabel} </span>
              {formatSlopeValue(r.after)}
            </li>
          ))}
        </ul>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

export type { SlopeDatum };
