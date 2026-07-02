// apps/site/src/components/mdx/Diagram.tsx
import { useState } from "react";
import {
  layoutDiagram,
  polylinePath,
  type DiagramNode,
  type DiagramEdge,
  type EdgeKind,
} from "./lib/diagram-layout.js";
import "./mdx.css";
import "./Diagram.css";

export interface DiagramProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  caption?: string;
  /**
   * When true (default), hovering/focusing a node dims the rest of the graph and
   * highlights that node's incident edges. Set false for a purely static figure
   * (still fully labeled — the no-JS render is identical either way).
   */
  highlightOnHover?: boolean;
}

// Fixed abstract→SVG scale. The component scales the resulting viewBox to
// width:100% via `preserveAspectRatio`, so a wide graph shrinks to fit 360px
// (never widening the page) and grows on desktop — same as Timeline/Map.
const LAYOUT_OPTS = {} as const;

// Arrowhead marker geometry (drawn once in <defs>, oriented per-edge).
const ARROW = 7;

/**
 * Node-edge architecture / flow diagram — the core teardown knowledge-carrier.
 *
 * The author supplies node coordinates in an abstract grid (NO layout engine:
 * deterministic, offline, reviewable). All geometry — box sizing, label
 * wrapping, orthogonal (manhattan) edge routing, label anchors, and the
 * content-fitted viewBox — comes from the pure, unit-tested `layoutDiagram`, so
 * this component is a thin renderer.
 *
 * Interaction: hover/focus a node → the rest dims and that node's edges light in
 * `--accent` (gated by `highlightOnHover`). Edge `kind` picks a distinct stroke
 * (data solid / control dashed / async dotted). The SSR / no-JS fallback is a
 * fully-labeled static SVG plus a semantic node/edge list — every node, edge,
 * and label is visible without JS and in reduced-motion.
 */
export default function Diagram({ nodes, edges, caption, highlightOnHover = true }: DiagramProps) {
  const layout = layoutDiagram(nodes, edges, LAYOUT_OPTS);
  const [active, setActive] = useState<string | null>(null);

  // An edge is "lit" when the active node is one of its endpoints.
  const edgeLit = (e: { from: string; to: string }): boolean =>
    active != null && (e.from === active || e.to === active);

  const dimmed = highlightOnHover && active != null;

  return (
    <figure className="mdx-figure mdx-figure--wide dg">
      <div className="mdx-panel dg-panel">
        <svg
          className={dimmed ? "dg-svg dg-svg--dimmed" : "dg-svg"}
          viewBox={layout.viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `Diagram: ${caption}` : "Architecture diagram"}
        >
          <defs>
            {/* One arrowhead per edge-kind color state, oriented via marker. */}
            <marker
              id="dg-arrow"
              markerWidth={ARROW}
              markerHeight={ARROW}
              refX={ARROW - 1}
              refY={ARROW / 2}
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d={`M0,0 L${ARROW},${ARROW / 2} L0,${ARROW} z`} className="dg-arrowhead" />
            </marker>
            <marker
              id="dg-arrow-lit"
              markerWidth={ARROW}
              markerHeight={ARROW}
              refX={ARROW - 1}
              refY={ARROW / 2}
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d={`M0,0 L${ARROW},${ARROW / 2} L0,${ARROW} z`} className="dg-arrowhead dg-arrowhead--lit" />
            </marker>
          </defs>

          {/* ── edges (drawn first, under the boxes) ─────────────────────────── */}
          <g className="dg-edges">
            {layout.edges.map((e, i) => {
              const lit = edgeLit(e);
              return (
                <g
                  key={`e-${e.from}-${e.to}-${i}`}
                  className={`dg-edge dg-edge--${e.kind}${lit ? " dg-edge--lit" : ""}`}
                  aria-hidden="true"
                >
                  <path
                    className="dg-edge-line"
                    d={polylinePath(e.points)}
                    fill="none"
                    markerEnd={`url(#${lit ? "dg-arrow-lit" : "dg-arrow"})`}
                  />
                  {e.label ? (
                    <g className="dg-edge-labelwrap">
                      {/* label backing plate so the mono label reads over lines */}
                      <rect
                        className="dg-edge-labelbg"
                        x={e.labelAt.x - labelHalfW(e.label)}
                        y={e.labelAt.y - 9}
                        width={labelHalfW(e.label) * 2}
                        height={18}
                        rx={2}
                      />
                      <text
                        className="dg-edge-label"
                        x={e.labelAt.x}
                        y={e.labelAt.y + 3.5}
                        textAnchor="middle"
                      >
                        {e.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* ── nodes ────────────────────────────────────────────────────────── */}
          <g className="dg-nodes">
            {layout.nodes.map((n) => {
              const isActive = active === n.id;
              return (
                <g
                  key={`n-${n.id}`}
                  className={`dg-node dg-node--${n.kind}${isActive ? " dg-node--active" : ""}`}
                  tabIndex={highlightOnHover ? 0 : -1}
                  role={highlightOnHover ? "button" : "img"}
                  aria-label={n.lines.join(" ")}
                  onMouseEnter={highlightOnHover ? () => setActive(n.id) : undefined}
                  onMouseLeave={
                    highlightOnHover ? () => setActive((c) => (c === n.id ? null : c)) : undefined
                  }
                  onFocus={highlightOnHover ? () => setActive(n.id) : undefined}
                  onBlur={highlightOnHover ? () => setActive((c) => (c === n.id ? null : c)) : undefined}
                >
                  <rect
                    className="dg-node-box"
                    x={n.x}
                    y={n.y}
                    width={n.width}
                    height={n.height}
                    rx={4}
                  />
                  <text className="dg-node-label" x={n.cx} y={labelTop(n.y, n.height, n.lines.length)} textAnchor="middle">
                    {n.lines.map((line, li) => (
                      <tspan key={li} x={n.cx} dy={li === 0 ? 0 : 18}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* SSR / no-JS fallback: a semantic, fully-labeled node + edge list.
            Hidden on capable viewports (the SVG carries it) but always present
            in the DOM so the figure is never blank without JS. */}
        <div className="dg-fallback">
          <p className="mdx-label">Nodes</p>
          <ul className="dg-fallback-nodes">
            {layout.nodes.map((n) => (
              <li key={`fn-${n.id}`}>{n.lines.join(" ")}</li>
            ))}
          </ul>
          {layout.edges.length > 0 ? (
            <>
              <p className="mdx-label">Connections</p>
              <ul className="dg-fallback-edges">
                {layout.edges.map((e, i) => (
                  <li key={`fe-${i}`}>
                    <span className="dg-fallback-from">{nodeLabel(layout.nodes, e.from)}</span>
                    <span className={`dg-fallback-arrow dg-fallback-arrow--${e.kind}`}> → </span>
                    <span className="dg-fallback-to">{nodeLabel(layout.nodes, e.to)}</span>
                    {e.label ? <span className="dg-fallback-edgelabel"> ({e.label})</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

// Approx mono glyph width for the edge-label backing plate (px per char ≈ 6.4 at
// the label font size). Purely visual sizing; the value never overflows because
// it tracks the rendered text.
function labelHalfW(label: string): number {
  return Math.max(10, (label.length * 6.4) / 2 + 5);
}

// Vertical baseline for the first label line so the (multi-line) block is
// centered in the node box.
function labelTop(y: number, h: number, lineCount: number): number {
  const blockH = lineCount * 18;
  return y + (h - blockH) / 2 + 13;
}

function nodeLabel(nodes: { id: string; lines: string[] }[], id: string): string {
  return nodes.find((n) => n.id === id)?.lines.join(" ") ?? id;
}

export type { DiagramNode, DiagramEdge, EdgeKind };
