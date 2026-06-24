// apps/site/src/components/mdx/Timeline.tsx
import { useState } from "react";
import { buildTimelineScale, type TimelineEvent } from "./lib/timeline-scale.js";
import "./mdx.css";
import "./Timeline.css";

export interface TimelineProps {
  events: TimelineEvent[];
  caption?: string;
}

const VIEW_W = 1000;
const VIEW_H = 120;
const AXIS_Y = 70;

/**
 * Horizontal SVG timeline. Pure scale from buildTimelineScale; hover/focus a
 * marker to reveal its detail. SSR fallback is a semantic ordered list so the
 * content is fully legible with no JS.
 */
export default function Timeline({ events, caption }: TimelineProps) {
  const { points, ticks } = buildTimelineScale(events, VIEW_W);
  const [active, setActive] = useState<number | null>(null);

  return (
    <figure className="mdx-figure mdx-figure--wide tl">
      <div className="mdx-panel tl-panel">
        <svg
          className="tl-svg"
          viewBox={`0 -10 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Timeline"
        >
          <line className="tl-axis" x1={0} y1={AXIS_Y} x2={VIEW_W} y2={AXIS_Y} />
          {ticks.map((t) => (
            <g key={t.year} className="tl-tick">
              <line x1={t.x} y1={AXIS_Y - 4} x2={t.x} y2={AXIS_Y + 4} />
              <text x={t.x} y={AXIS_Y + 20} className="tl-tick-label">{t.year}</text>
            </g>
          ))}
          {points.map((p, i) => (
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
              <line x1={p.x} y1={AXIS_Y} x2={p.x} y2={28} className="tl-stem" />
              <circle cx={p.x} cy={28} r={5} className="tl-dot" />
              <text x={p.x} y={18} className="tl-label">{p.label}</text>
              {active === i && p.detail ? (
                <text x={p.x} y={AXIS_Y + 40} className="tl-detail">{p.detail}</text>
              ) : null}
            </g>
          ))}
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
