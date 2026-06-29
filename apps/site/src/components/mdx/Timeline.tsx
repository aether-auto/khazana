// apps/site/src/components/mdx/Timeline.tsx
import { useState } from "react";
import { layoutTimeline, type TimelineEvent } from "./lib/timeline-scale.js";
import "./mdx.css";
import "./Timeline.css";

export interface TimelineProps {
  events: TimelineEvent[];
  caption?: string;
}

// Fixed SVG coordinate width; the panel scales it to fit via viewBox. Height is
// computed per-instance by layoutTimeline so the figure is sized to its content
// (no dead vertical void) and the axis lift adapts to the number of label rows.
const VIEW_W = 1000;
const ROW_STEP = 26;
const GUTTER = 18;
const CHAR_PX = 6.6;

/**
 * Instrument-style horizontal timeline. All geometry comes from the pure,
 * unit-tested `layoutTimeline`, which picks one of two readable modes:
 *
 *   sequence     — few/clustered events laid out evenly with the real elapsed
 *                  gap written between them ("+17 hr"). The axis reports the
 *                  gap as a number instead of stretching it into whitespace.
 *   proportional — true time-x with a compressed (broken) axis so dense modern
 *                  clusters spread out and read instead of piling at one edge.
 *
 * Labels stack into de-collided rows with leader lines; hovering/focusing a
 * node reveals its detail in a stable readout strip (no layout shift). The SSR
 * / no-JS fallback is a semantic ordered list.
 */
export default function Timeline({ events, caption }: TimelineProps) {
  const layout = layoutTimeline(events, {
    width: VIEW_W,
    charPx: CHAR_PX,
    rowStep: ROW_STEP,
    gutter: GUTTER,
  });
  const { mode, nodes, ticks, gaps, breaks, axisY, height } = layout;
  const [active, setActive] = useState<number | null>(null);

  const activeNode = active != null ? nodes[active] : null;
  // Reserve the readout strip's height always, so revealing detail never shifts
  // the layout. It sits just below the axis/date band.
  const readoutY = axisY + 46;

  return (
    <figure className="mdx-figure mdx-figure--wide tl">
      <div className={`mdx-panel tl-panel tl-panel--${mode}`}>
        <svg
          className="tl-svg"
          viewBox={`0 0 ${VIEW_W} ${height + 30}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `Timeline: ${caption}` : "Timeline"}
        >
          <defs>
            <linearGradient id="tl-axis-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--tl-axis-fade)" />
              <stop offset="0.06" stopColor="var(--tl-axis)" />
              <stop offset="0.94" stopColor="var(--tl-axis)" />
              <stop offset="1" stopColor="var(--tl-axis-fade)" />
            </linearGradient>
          </defs>

          {/* ── the axis line ───────────────────────────────────────────── */}
          <line className="tl-axis" x1={0} y1={axisY} x2={VIEW_W} y2={axisY} />

          {/* ── broken-axis marks where a dead span was compressed ────────── */}
          {breaks.map((b, i) => (
            <g key={`brk-${i}`} className="tl-break" aria-hidden="true">
              <rect x={b.x - 7} y={axisY - 7} width={14} height={14} className="tl-break-mask" />
              <line x1={b.x - 5} y1={axisY - 6} x2={b.x - 1} y2={axisY + 6} className="tl-break-slash" />
              <line x1={b.x + 1} y1={axisY - 6} x2={b.x + 5} y2={axisY + 6} className="tl-break-slash" />
            </g>
          ))}

          {/* ── proportional: adaptive year ticks below the axis ──────────── */}
          {mode === "proportional" &&
            ticks.map((t) => (
              <g key={`tick-${t.year}`} className="tl-tick" aria-hidden="true">
                <line x1={t.x} y1={axisY} x2={t.x} y2={axisY + 6} />
                <text x={t.x} y={axisY + 20} textAnchor="middle" className="tl-tick-label">
                  {t.year}
                </text>
              </g>
            ))}

          {/* ── sequence: elapsed-gap chips between nodes ─────────────────── */}
          {mode === "sequence" &&
            gaps.map((g, i) => (
              <g key={`gap-${i}`} className="tl-gap" aria-hidden="true">
                {/* a small bracket on the axis spanning the gap's reach */}
                <line x1={g.x - 14} y1={axisY} x2={g.x + 14} y2={axisY} className="tl-gap-rule" />
                <text x={g.x} y={axisY + 36} textAnchor="middle" className="tl-gap-label">
                  {g.label}
                </text>
              </g>
            ))}

          {/* ── nodes: dot + leader stem + staggered label + date stamp ───── */}
          {nodes.map((node, i) => {
            const dotY = axisY;
            const labelY = axisY - 16 - node.row * ROW_STEP;
            const isActive = active === i;
            return (
              <g
                key={`${node.t}-${i}`}
                className={isActive ? "tl-node tl-node--active" : "tl-node"}
                tabIndex={0}
                role="button"
                aria-label={`${node.dateLabel}: ${node.label}${node.detail ? `. ${node.detail}` : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? null : cur))}
              >
                {/* generous transparent hit-target for pointer + focus */}
                <rect
                  className="tl-hit"
                  x={node.x - 22}
                  y={labelY - 14}
                  width={44}
                  height={dotY - labelY + 30}
                />
                {/* leader stem from the axis up to the lifted label row */}
                <line
                  className="tl-stem"
                  x1={node.x}
                  y1={dotY}
                  x2={node.x}
                  y2={labelY + 4}
                />
                {/* the event label, anchored to dodge the panel edges */}
                <text x={node.x} y={labelY} textAnchor={node.anchor} className="tl-label">
                  {node.label}
                </text>
                {/* the node marker on the axis */}
                <circle className="tl-dot-halo" cx={node.x} cy={dotY} r={9} />
                <circle className="tl-dot" cx={node.x} cy={dotY} r={isActive ? 6 : 4.5} />
                {/* compact date stamp below the axis (sequence mode only —
                    proportional mode reads its dates off the year ticks) */}
                {mode === "sequence" ? (
                  <text x={node.x} y={axisY + 18} textAnchor={node.anchor} className="tl-date">
                    {node.dateLabel}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* ── stable detail readout (no layout shift) ───────────────────── */}
          {activeNode ? (
            <text x={VIEW_W / 2} y={readoutY + 14} textAnchor="middle" className="tl-readout">
              <tspan className="tl-readout-date">{activeNode.dateLabel}</tspan>
              <tspan className="tl-readout-sep"> · </tspan>
              <tspan className="tl-readout-text">{activeNode.detail ?? activeNode.label}</tspan>
            </text>
          ) : (
            <text x={VIEW_W / 2} y={readoutY + 14} textAnchor="middle" className="tl-readout tl-readout--hint">
              {mode === "sequence" ? "hover a moment for detail" : "hover an event for detail"}
            </text>
          )}
        </svg>

        {/* SSR / no-JS fallback */}
        <ol className="tl-fallback">
          {nodes.map((node, i) => (
            <li key={`f-${i}`}>
              <span className="mdx-label">{node.dateLabel}</span> {node.label}
              {node.detail ? <span className="tl-fallback-detail"> — {node.detail}</span> : null}
            </li>
          ))}
        </ol>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
