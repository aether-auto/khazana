// apps/site/src/components/mdx/Sankey.tsx
import { useState } from "react";
import {
  layoutSankey,
  formatFlowValue,
  formatShare,
  type SankeyNodeInput,
  type SankeyLinkInput,
} from "./lib/sankey-layout.js";
import "./mdx.css";
import "./Sankey.css";

export interface SankeyProps {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
  caption?: string;
  /** unit suffix appended to flow values in the readout + fallback, e.g. "$M", "TWh". */
  unit?: string;
}

// Fixed abstract coordinate space; the SVG scales to width:100% via viewBox.
const VIEW_W = 720;
const VIEW_H = 420;

/**
 * Sankey flow / allocation diagram — where a budget / energy / population / force
 * goes. Translucent amber flows on `--bg-inset`; mono node labels in
 * `--ink-label`. All the DAG validation, id→index mapping, totals, per-flow
 * shares and the d3-sankey layout live in the pure, unit-tested `sankey-layout`
 * — this island is a thin renderer.
 *
 * Interaction: hover / focus a flow → its exact value + share of the grand total
 * surface in a stable readout strip; the flow lifts to full opacity while the
 * rest dim. SSR / no-JS fallback is a semantic `source → target: value (unit)`
 * flow list (never blank). Reduced-motion: no transitions, end state rendered.
 * The viewBox scales, so there is never a 360px overflow; below 640px the SVG is
 * hidden and the full-size flow list shown (labels never collide).
 */
export default function Sankey({ nodes, links, caption, unit }: SankeyProps) {
  const layout = layoutSankey(nodes, links, { width: VIEW_W, height: VIEW_H });
  const [active, setActive] = useState<number | null>(null);

  const suffix = unit ? ` ${unit}` : "";
  const fmt = (v: number) => `${formatFlowValue(v)}${suffix}`;
  const activeLink = active != null ? layout.links[active] : null;

  return (
    <figure className="mdx-figure mdx-figure--wide sk">
      <div className="mdx-panel sk-panel">
        <svg
          className="sk-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H + 30}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={caption ? `Flow diagram: ${caption}` : "Sankey flow diagram"}
        >
          {/* ── flows (drawn first, under the nodes) ─────────────────────────── */}
          <g className="sk-links" fill="none">
            {layout.links.map((l, i) => {
              const isActive = active === i;
              const dimmed = active != null && !isActive;
              return (
                <path
                  key={`link-${l.source}-${l.target}-${i}`}
                  className={
                    isActive
                      ? "sk-link sk-link--active"
                      : dimmed
                        ? "sk-link sk-link--dim"
                        : "sk-link"
                  }
                  d={l.path}
                  strokeWidth={l.width}
                  tabIndex={0}
                  role="button"
                  aria-label={`${l.sourceLabel} to ${l.targetLabel}: ${fmt(l.value)}, ${formatShare(l.share)} of total`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((c) => (c === i ? null : c))}
                />
              );
            })}
          </g>

          {/* ── nodes + labels ───────────────────────────────────────────────── */}
          <g className="sk-nodes">
            {layout.nodes.map((n) => (
              <g key={`node-${n.id}`} className="sk-node">
                <rect
                  className="sk-node-rect"
                  x={n.x0}
                  y={n.y0}
                  width={Math.max(1, n.x1 - n.x0)}
                  height={Math.max(1, n.y1 - n.y0)}
                />
                <text
                  className="sk-node-label"
                  x={n.labelX}
                  y={n.labelY}
                  dy="0.32em"
                  textAnchor={n.labelSide === "right" ? "start" : "end"}
                >
                  {n.label}
                </text>
              </g>
            ))}
          </g>

          {/* ── stable readout strip (no layout shift) ───────────────────────── */}
          {activeLink ? (
            <text x={VIEW_W / 2} y={VIEW_H + 18} textAnchor="middle" className="sk-readout">
              <tspan className="sk-readout-node">{activeLink.sourceLabel}</tspan>
              <tspan className="sk-readout-arrow"> → </tspan>
              <tspan className="sk-readout-node">{activeLink.targetLabel}</tspan>
              <tspan className="sk-readout-sep">  ·  </tspan>
              <tspan className="sk-readout-val">{fmt(activeLink.value)}</tspan>
              <tspan className="sk-readout-sep">  ·  </tspan>
              <tspan className="sk-readout-pct">{formatShare(activeLink.share)}</tspan>
              <tspan className="sk-readout-of"> of total</tspan>
            </text>
          ) : (
            <text
              x={VIEW_W / 2}
              y={VIEW_H + 18}
              textAnchor="middle"
              className="sk-readout sk-readout--hint"
            >
              hover a flow for its value &amp; share of {fmt(layout.total)}
            </text>
          )}
        </svg>

        {/* SSR / no-JS fallback: a semantic source → target: value (unit) list. */}
        <ul className="sk-fallback">
          <li className="sk-fallback-total">
            <span className="mdx-label">total</span> {fmt(layout.total)}
          </li>
          {layout.links.map((l, i) => (
            <li key={`f-${i}`}>
              <span className="sk-fallback-node">{l.sourceLabel}</span>
              {" → "}
              <span className="sk-fallback-node">{l.targetLabel}</span>
              {": "}
              <span className="sk-fallback-val">{fmt(l.value)}</span>{" "}
              <span className="sk-fallback-pct">({formatShare(l.share)})</span>
            </li>
          ))}
        </ul>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

export type { SankeyNodeInput, SankeyLinkInput };
