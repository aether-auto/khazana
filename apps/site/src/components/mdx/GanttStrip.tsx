// apps/site/src/components/mdx/GanttStrip.tsx
//
// A compact build-timeline strip: task → duration. "How long each phase took."
// Hand-rolled SVG (no dep). All geometry comes from the pure, unit-tested
// `layoutGantt`, so this is a thin renderer. The SVG uses a fixed abstract
// coordinate box and scales to `width:100%` via viewBox — content-fitted (the
// box height grows with lane count), so it never overflows 360px.
//
// It's a React island (client:visible) SOLELY for the hover/focus readout — a
// task's duration + note surfaces on interaction. This mirrors Slopegraph /
// Timeline (island for the hover readout, static SSR list otherwise). The bars,
// labels, and durations are ALL present in the static SVG, so nothing is gated
// behind JS except the transient popover text; and the semantic <ul> fallback
// carries every task + duration + note without any script.
//
// Fallbacks (never blank):
//   • SSR / no-JS → the SVG renders fully (bars + inline durations) AND a
//     semantic labelled list (task — duration — note) shows below it; both are
//     readable without JS.
//   • prefers-reduced-motion → no transitions (handled in CSS); the end state
//     (all bars drawn) is the only state, so nothing animates.
import { useState } from "react";
import { layoutGantt, type GanttTask, type GanttUnit } from "./lib/gantt-scale.js";
import "./mdx.css";
import "./GanttStrip.css";

export interface GanttStripProps {
  /** The build phases — each a labelled span on a shared numeric axis. */
  tasks: GanttTask[];
  /** Axis unit: "day" (default) or "hr" — drives how durations are spelled. */
  unit?: GanttUnit;
  /** Editorial caption (Fraunces, shared .mdx-caption). */
  caption?: string;
}

// Fixed SVG coordinate box; the panel scales it to fit via viewBox (width:100%).
const VIEW_W = 720;
const BAR_H = 16; // bar thickness (abstract coords)

export default function GanttStrip({ tasks, unit = "day", caption }: GanttStripProps) {
  const layout = layoutGantt(tasks, unit, { width: VIEW_W });
  const { lanes, height, trackX, trackW, rowStep } = layout;
  const [active, setActive] = useState<number | null>(null);

  const activeLane = active != null ? lanes[active] : null;

  return (
    <figure className="mdx-figure mdx-figure--wide gnt">
      <div className="mdx-panel gnt-panel">
        <svg
          className="gnt-svg"
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `Build timeline: ${caption}` : "Build timeline"}
        >
          {/* ── track backdrop (hairline lanes) ─────────────────────────── */}
          {lanes.map((lane, i) => {
            const laneMidY = lane.y + rowStep / 2;
            return (
              <line
                key={`lane-${i}`}
                className="gnt-lane"
                x1={trackX}
                y1={laneMidY}
                x2={trackX + trackW}
                y2={laneMidY}
                aria-hidden="true"
              />
            );
          })}

          {/* ── bars + labels + inline durations ────────────────────────── */}
          {lanes.map((lane, i) => {
            const barY = lane.y + (rowStep - BAR_H) / 2;
            const isActive = active === i;
            return (
              <g
                key={`task-${lane.label}-${i}`}
                className={isActive ? "gnt-task gnt-task--active" : "gnt-task"}
                tabIndex={0}
                role="button"
                aria-label={`${lane.label}: ${lane.durationLabel}${lane.note ? `. ${lane.note}` : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((c) => (c === i ? null : c))}
              >
                {/* full-width transparent hit-target for the whole row */}
                <rect
                  className="gnt-hit"
                  x={0}
                  y={lane.y}
                  width={VIEW_W}
                  height={rowStep}
                />
                {/* task label in the left gutter */}
                <text
                  className="gnt-task-label"
                  x={trackX - 12}
                  y={lane.y + rowStep / 2 + 4}
                  textAnchor="end"
                >
                  {lane.label}
                </text>
                {/* the amber bar */}
                <rect
                  className="gnt-bar"
                  x={lane.x}
                  y={barY}
                  width={lane.w}
                  height={BAR_H}
                  rx={2}
                />
                {/* inline duration to the right of the bar (always visible) */}
                <text
                  className="gnt-dur"
                  x={lane.x + lane.w + 8}
                  y={lane.y + rowStep / 2 + 4}
                  textAnchor="start"
                >
                  {lane.durationLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {/* stable hover readout (no layout shift — reserved row below the SVG) */}
        <div className="gnt-readout" aria-live="polite">
          {activeLane ? (
            <>
              <span className="gnt-readout-name">{activeLane.label}</span>
              <span className="gnt-readout-sep"> · </span>
              <span className="gnt-readout-dur">{activeLane.durationLabel}</span>
              {activeLane.note ? (
                <>
                  <span className="gnt-readout-sep"> — </span>
                  <span className="gnt-readout-note">{activeLane.note}</span>
                </>
              ) : null}
            </>
          ) : (
            <span className="gnt-readout--hint">hover a phase for duration + note</span>
          )}
        </div>

        {/* SSR / no-JS fallback: a semantic labelled task list. */}
        <ul className="gnt-fallback">
          {lanes.map((lane, i) => (
            <li key={`f-${i}`}>
              <span className="gnt-fallback-name">{lane.label}</span>
              <span className="mdx-label"> {lane.durationLabel}</span>
              {lane.note ? <span className="gnt-fallback-note"> — {lane.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

export type { GanttTask, GanttUnit };
