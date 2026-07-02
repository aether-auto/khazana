// apps/site/src/components/mdx/StateMachine.tsx
//
// A finite state machine you can STEP: states are node boxes, transitions are
// labeled edges, and a "token" sits on the active state. Click a transition — or
// press "step" to walk an author-supplied `sequence` — to move the token through
// the graph (a TCP handshake, a recursive-descent parser, a protocol dance).
//
// ── Rendering core is SHARED with <Diagram> ──────────────────────────────────
// This island does NOT reinvent graph geometry: it imports the pure, unit-tested
// `layoutDiagram` + `polylinePath` from ./lib/diagram-layout.js — the same
// author-positioned coordinate model, box sizing, manhattan edge routing, and
// content-fitted viewBox that <Diagram> uses. States map to DiagramNodes,
// transitions to DiagramEdges (label = the `on` event). Diagram + its lib are
// untouched; we only reuse their exported helpers. All STEPPING logic (token
// position, spent transitions, sequence resolution) lives in the pure, tested
// ./lib/state-machine-step.js.
//
// ── Invariants honored ───────────────────────────────────────────────────────
//  • SSR / no-JS: a fully-labeled static graph PLUS a semantic state/transition
//    list (and, when a `sequence` is given, the ordered walk) — never blank.
//  • reduced-motion / no-JS: the active state is set STATICALLY to `start` and
//    the sequence walk is listed; zero animation.
//  • The active state glows amber; spent transitions dim.
//  • The SVG scales to width:100% so a wide machine shrinks to fit 360px and
//    never widens the page (identical strategy to Diagram/Timeline: below 640px
//    the SVG hides and the semantic list is promoted).
//  • `caption` wraps in .mdx-figure; all props are serializable.
import { useEffect, useState } from "react";
import { layoutDiagram, polylinePath, type DiagramNode, type DiagramEdge } from "./lib/diagram-layout.js";
import {
  type SMState,
  type SMTransition,
  initialStep,
  resolveSequence,
  stepSequence,
  fireTransition,
  outgoing,
  isComplete,
  sequenceStateWalk,
} from "./lib/state-machine-step.js";
import "./mdx.css";
import "./StateMachine.css";

export interface StateMachineProps {
  /** The states (nodes). `x`/`y` are author grid coords (Diagram's model). */
  states: (SMState & { x: number; y: number })[];
  /** The labeled transitions (edges). `on` becomes the edge label. */
  transitions: SMTransition[];
  /** id of the state the token starts on. */
  start: string;
  /**
   * Optional scripted walk: an ordered list of transition refs (numeric index,
   * "from>to", or "from>to:on"). When present, "step" advances this sequence and
   * the fallback lists the walk. When absent, the reader clicks any transition
   * leaving the active state (FREE mode).
   */
  sequence?: string[];
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR → static end state
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function StateMachine({
  states,
  transitions,
  start,
  sequence,
  caption,
}: StateMachineProps) {
  const safeStates = Array.isArray(states) ? states : [];
  const safeTransitions = Array.isArray(transitions) ? transitions : [];

  // Build Diagram inputs from the FSM: states → nodes, transitions → labeled
  // edges. We reuse Diagram's entire layout/routing core via layoutDiagram.
  const nodes: DiagramNode[] = safeStates.map((s) => ({
    id: s.id,
    label: s.label,
    x: s.x,
    y: s.y,
    kind: "default",
  }));
  const edges: DiagramEdge[] = safeTransitions.map((t) => ({
    from: t.from,
    to: t.to,
    label: t.on,
    kind: "data",
  }));

  const resolved = resolveSequence(safeTransitions, sequence);
  const hasSequence = resolved.length > 0;
  const walk = sequenceStateWalk(start, resolved);

  // SSR-safe defaults: reduced (no animation) + token on `start`, nothing spent.
  // This is exactly the no-JS / reduced-motion end state → static markup is never
  // blank and never mid-walk. Effects opt into interactivity only after mount.
  const [reduced, setReduced] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(() => initialStep(start));

  useEffect(() => {
    setReduced(prefersReducedMotion());
    setMounted(true);
  }, []);

  // If start changes (author edit / HMR), reseed the token.
  useEffect(() => {
    setStep(initialStep(start));
  }, [start]);

  // Empty machine → caption-only figure or nothing; never throws.
  if (safeStates.length === 0) {
    return caption ? (
      <figure className="mdx-figure sm">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  const layout = layoutDiagram(nodes, edges, {});
  const interactive = mounted && !reduced;

  // In the static / reduced path the token sits on `start`; interactive path
  // uses the live stepped position.
  const activeState = interactive ? step.activeState : start;
  const spent = interactive ? step.spent : [];
  const fireable = interactive ? outgoing(safeTransitions, activeState) : [];
  const fireableIdx = new Set(fireable.map((t) => t.index));
  const nextSeqIndex = hasSequence && interactive && step.cursor < resolved.length
    ? resolved[step.cursor]!.index
    : -1;
  const complete = isComplete(step, resolved.length);

  const onStep = () => setStep((s) => stepSequence(s, resolved));
  const onReset = () => setStep(initialStep(start));
  const onFire = (index: number) => setStep((s) => fireTransition(s, safeTransitions, index));

  const stateLabel = (id: string): string =>
    safeStates.find((s) => s.id === id)?.label ?? id;

  return (
    <figure className={mounted ? "mdx-figure mdx-figure--wide sm sm--js" : "mdx-figure mdx-figure--wide sm"}>
      <div className="mdx-panel sm-panel">
        <svg
          className="sm-svg"
          viewBox={layout.viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `State machine: ${caption}` : "State machine"}
        >
          <defs>
            <marker
              id="sm-arrow"
              markerWidth={7}
              markerHeight={7}
              refX={6}
              refY={3.5}
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L7,3.5 L0,7 z" className="sm-arrowhead" />
            </marker>
            <marker
              id="sm-arrow-lit"
              markerWidth={7}
              markerHeight={7}
              refX={6}
              refY={3.5}
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L7,3.5 L0,7 z" className="sm-arrowhead sm-arrowhead--lit" />
            </marker>
          </defs>

          {/* ── transitions (edges) ──────────────────────────────────────────── */}
          <g className="sm-edges">
            {layout.edges.map((e, i) => {
              // layoutDiagram preserves input edge order and only skips edges
              // whose endpoints are unknown — but every transition here
              // references a real state, so nothing is skipped and the laid-out
              // edge at position `i` maps 1:1 to safeTransitions[i]. This keeps
              // spent/next/fireable highlighting correct even for duplicate
              // (same from/to/on) transitions.
              const idx = i;
              const isSpent = spent.includes(idx);
              const isNext = idx === nextSeqIndex;
              const isFireable = fireableIdx.has(idx);
              const cls =
                "sm-edge" +
                (isSpent ? " sm-edge--spent" : "") +
                (isNext ? " sm-edge--next" : "") +
                (isFireable ? " sm-edge--fireable" : "");
              return (
                <g key={`e-${e.from}-${e.to}-${i}`} className={cls}>
                  <path
                    className="sm-edge-line"
                    d={polylinePath(e.points)}
                    fill="none"
                    markerEnd={`url(#${isNext || isFireable ? "sm-arrow-lit" : "sm-arrow"})`}
                    // A fireable transition is clickable in the FREE/any path.
                    onClick={interactive && isFireable ? () => onFire(idx) : undefined}
                    style={interactive && isFireable ? { cursor: "pointer" } : undefined}
                  />
                  {/* transparent fat hit-target so thin edges are easy to click */}
                  {interactive && isFireable ? (
                    <path
                      className="sm-edge-hit"
                      d={polylinePath(e.points)}
                      fill="none"
                      onClick={() => onFire(idx)}
                    />
                  ) : null}
                  {e.label ? (
                    <g className="sm-edge-labelwrap">
                      <rect
                        className="sm-edge-labelbg"
                        x={e.labelAt.x - labelHalfW(e.label)}
                        y={e.labelAt.y - 9}
                        width={labelHalfW(e.label) * 2}
                        height={18}
                        rx={2}
                      />
                      <text className="sm-edge-label" x={e.labelAt.x} y={e.labelAt.y + 3.5} textAnchor="middle">
                        {e.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* ── states (nodes) ───────────────────────────────────────────────── */}
          <g className="sm-nodes">
            {layout.nodes.map((n) => {
              const isActive = n.id === activeState;
              const isStart = n.id === start;
              return (
                <g
                  key={`n-${n.id}`}
                  className={
                    "sm-node" +
                    (isActive ? " sm-node--active" : "") +
                    (isStart ? " sm-node--start" : "")
                  }
                  role="img"
                  aria-label={`${n.lines.join(" ")}${isActive ? " (active)" : ""}`}
                >
                  <rect className="sm-node-box" x={n.x} y={n.y} width={n.width} height={n.height} rx={16} />
                  <text
                    className="sm-node-label"
                    x={n.cx}
                    y={labelTop(n.y, n.height, n.lines.length)}
                    textAnchor="middle"
                  >
                    {n.lines.map((line, li) => (
                      <tspan key={li} x={n.cx} dy={li === 0 ? 0 : 18}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {/* the token: an amber dot riding the active state */}
                  {isActive ? (
                    <circle className="sm-token" cx={n.x + n.width - 12} cy={n.y + 12} r={5} aria-hidden="true" />
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── controls: only meaningful once JS is live (sm--js gates display) ── */}
        <div className="sm-controls">
          {hasSequence ? (
            <button type="button" className="sm-btn" onClick={onStep} disabled={complete}>
              {complete ? "Walk complete" : "Step ▸"}
            </button>
          ) : (
            <span className="sm-hint mdx-label">Click a lit transition to advance the token</span>
          )}
          <button type="button" className="sm-btn sm-btn--ghost" onClick={onReset}>
            Reset
          </button>
          <span className="sm-status mdx-label">
            State: <strong>{stateLabel(activeState)}</strong>
          </span>
        </div>

        {/* SSR / no-JS fallback: a fully-labeled semantic list of states and
            transitions, plus the scripted walk when a sequence is given. Always
            in the DOM so the figure is never blank without JS; promoted below
            640px where the SVG would be an illegible smear. */}
        <div className="sm-fallback">
          <p className="mdx-label">States</p>
          <ul className="sm-fallback-states">
            {safeStates.map((s) => (
              <li key={`fs-${s.id}`} className={s.id === start ? "sm-fallback-start" : undefined}>
                {s.label}
                {s.id === start ? <span className="sm-fallback-tag"> (start)</span> : null}
              </li>
            ))}
          </ul>
          {safeTransitions.length > 0 ? (
            <>
              <p className="mdx-label">Transitions</p>
              <ul className="sm-fallback-transitions">
                {safeTransitions.map((t, i) => (
                  <li key={`ft-${i}`}>
                    <span className="sm-fallback-from">{stateLabel(t.from)}</span>
                    <span className="sm-fallback-on"> —{t.on}→ </span>
                    <span className="sm-fallback-to">{stateLabel(t.to)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {hasSequence ? (
            <>
              <p className="mdx-label">Walk</p>
              <ol className="sm-fallback-walk">
                {walk.map((id, i) => (
                  <li key={`fw-${i}`}>{stateLabel(id)}</li>
                ))}
              </ol>
            </>
          ) : null}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

// Approx mono glyph width for the edge-label backing plate (px per char ≈ 6.4 at
// the label font size). Copied from Diagram's private helper (spec: copy minimal
// math rather than edit Diagram); purely visual sizing that tracks the text.
function labelHalfW(label: string): number {
  return Math.max(10, (label.length * 6.4) / 2 + 5);
}

// Vertical baseline for the first label line so the (multi-line) block is
// centered in the node box. Copied minimal math from Diagram's private helper.
function labelTop(y: number, h: number, lineCount: number): number {
  const blockH = lineCount * 18;
  return y + (h - blockH) / 2 + 13;
}

export type { SMState, SMTransition };
