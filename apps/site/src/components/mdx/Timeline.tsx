// apps/site/src/components/mdx/Timeline.tsx
import { useState } from "react";
import { buildTimelineScale, deCollideLabels, labelAnchor, type TimelineEvent } from "./lib/timeline-scale.js";
import "./mdx.css";
import "./Timeline.css";

export interface TimelineProps {
  events: TimelineEvent[];
  caption?: string;
}

const VIEW_W = 1000;
// AXIS_Y is fixed; labels above it are stacked upward by ROW_STEP per row.
// VIEW_H_BASE is the minimum viewBox height when there is only one label row.
const AXIS_Y = 80;
const VIEW_H_BASE = 130;
// Vertical gap between label rows (px in SVG coordinate space).
const ROW_STEP = 28;
// Approximate character width for mono label font at --t-xs (0.75rem ≈ 12px).
const CHAR_PX = 6.5;

/**
 * Horizontal SVG timeline. Pure scale from buildTimelineScale; hover/focus a
 * marker to reveal its detail. Labels are de-collided vertically so closely
 * spaced events never overlap. SSR fallback is a semantic ordered list.
 */
export default function Timeline({ events, caption }: TimelineProps) {
  const { points, ticks } = buildTimelineScale(events, VIEW_W);
  const [active, setActive] = useState<number | null>(null);

  // Assign each label to a row so no two in the same row overlap.
  const labeledPts = points.map((p) => ({ x: p.x, labelPx: p.label.length * CHAR_PX }));
  const rows = deCollideLabels(labeledPts);
  const maxRow = rows.reduce((m, r) => Math.max(m, r), 0);

  // Expand the viewBox upward to fit all rows.
  const viewH = VIEW_H_BASE + maxRow * ROW_STEP;
  // y of the topmost label row (row 0 is closest to axis, higher rows go up).
  const labelBaseY = AXIS_Y - 16; // row-0 label y (above the dot)

  return (
    <figure className="mdx-figure mdx-figure--wide tl">
      <div className="mdx-panel tl-panel">
        <svg
          className="tl-svg"
          viewBox={`0 ${-(maxRow * ROW_STEP + 10)} ${VIEW_W} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Timeline"
        >
          <line className="tl-axis" x1={0} y1={AXIS_Y} x2={VIEW_W} y2={AXIS_Y} />
          {ticks.map((t) => {
            // Year labels are 4 chars wide ("1900", "2013", …).
            const tickLabelPx = 4 * CHAR_PX;
            const tickAnchor = labelAnchor(t.x, VIEW_W, tickLabelPx);
            return (
              <g key={t.year} className="tl-tick">
                <line x1={t.x} y1={AXIS_Y - 4} x2={t.x} y2={AXIS_Y + 4} />
                <text
                  x={t.x}
                  y={AXIS_Y + 20}
                  textAnchor={tickAnchor}
                  className="tl-tick-label"
                >
                  {t.year}
                </text>
              </g>
            );
          })}
          {points.map((p, i) => {
            const row = rows[i] ?? 0;
            // Each row lifts the dot and label up by ROW_STEP from the previous.
            const dotY = AXIS_Y - 14 - row * ROW_STEP;
            const labelY = dotY - 8;
            const labelPx = p.label.length * CHAR_PX;
            const anchor = labelAnchor(p.x, VIEW_W, labelPx);
            return (
              <g
                key={`${p.t}-${i}`}
                className={active === i ? "tl-pt tl-pt--active" : "tl-pt"}
                tabIndex={0}
                role="button"
                aria-label={`${p.date}: ${p.label}${p.detail ? `. ${p.detail}` : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {/* Stem from axis to dot — lengthens naturally for higher rows. */}
                <line x1={p.x} y1={AXIS_Y} x2={p.x} y2={dotY} className="tl-stem" />
                <circle cx={p.x} cy={dotY} r={active === i ? 7 : 5} className="tl-dot" />
                <text x={p.x} y={labelY} textAnchor={anchor} className="tl-label">
                  {p.label}
                </text>
                {active === i && p.detail ? (
                  <text x={p.x} y={AXIS_Y + 44} className="tl-detail">{p.detail}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {/* SSR / no-JS fallback */}
        <ol className="tl-fallback">
          {points.map((p, i) => (
            <li key={`f-${i}`}>
              <span className="mdx-label">{p.date}</span> {p.label}
              {p.detail ? <span className="tl-fallback-detail"> — {p.detail}</span> : null}
            </li>
          ))}
        </ol>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
