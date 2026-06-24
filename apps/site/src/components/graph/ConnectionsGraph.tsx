import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
} from "d3";
import type { GraphModel, GraphNode, GraphEdge } from "./lib/build-graph.js";
import "./ConnectionsGraph.css";

interface Props {
  model: GraphModel;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
}
interface SimEdge {
  source: SimNode;
  target: SimNode;
  weight: number;
}

const W = 920;
const H = 600;

// Deterministic phyllotaxis seed: reproducible first positions (no Math.random).
function seedPositions(nodes: GraphNode[]): SimNode[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return nodes.map((n, i) => {
    const r = 16 * Math.sqrt(i + 1);
    const a = i * golden;
    return { ...n, x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a) };
  });
}

export default function ConnectionsGraph({ model }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [positions, setPositions] = useState<SimNode[] | null>(null);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of model.nodes) m.set(n.id, new Set());
    for (const e of model.edges) {
      m.get(e.source)?.add(e.target);
      m.get(e.target)?.add(e.source);
    }
    return m;
  }, [model]);

  useEffect(() => {
    if (model.nodes.length === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const simNodes = seedPositions(model.nodes);
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simEdges: SimEdge[] = model.edges.map((e) => ({
      source: byId.get(e.source)!,
      target: byId.get(e.target)!,
      weight: e.weight,
    }));

    const sim: Simulation<SimNode, undefined> = forceSimulation(simNodes)
      .force("charge", forceManyBody().strength(-180))
      .force(
        "link",
        forceLink<SimNode, SimEdge>(simEdges)
          .id((d) => d.id)
          .distance(70)
          .strength((d) => Math.min(1, d.weight / 4)),
      )
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide(14));

    if (reduced) {
      // Compute a static layout synchronously; no animation.
      sim.stop();
      sim.tick(120);
      setPositions(simNodes.map((n) => ({ ...n })));
    } else {
      sim.on("tick", () => setPositions(simNodes.map((n) => ({ ...n }))));
    }
    return () => {
      sim.stop();
    };
  }, [model]);

  const dim = (id: string): boolean =>
    hover !== null && hover !== id && !neighbors.get(hover)?.has(id);

  const posById = useMemo(
    () => new Map((positions ?? []).map((n) => [n.id, n])),
    [positions],
  );

  return (
    <div className="cg">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="cg-svg"
        role="img"
        aria-label={`Connections graph: ${model.nodes.length} nodes, ${model.edges.length} links`}
      >
        <g className="cg-edges">
          {positions &&
            model.edges.map((e: GraphEdge, i) => {
              const s = posById.get(e.source);
              const t = posById.get(e.target);
              if (!s || !t) return null;
              const faded = hover !== null && hover !== e.source && hover !== e.target;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  className={faded ? "cg-edge cg-edge--dim" : "cg-edge"}
                  strokeWidth={Math.min(2.5, 0.6 + e.weight * 0.5)}
                />
              );
            })}
        </g>
        <g className="cg-nodes">
          {positions &&
            positions.map((n) => (
              <a
                key={n.id}
                href={n.href}
                className="cg-node-link"
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                aria-label={`${n.type === "post" ? "Read" : "Item"}: ${n.label}`}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.type === "post" ? 7 : 5}
                  className={[
                    "cg-node",
                    `cg-node--${n.type}`,
                    dim(n.id) ? "cg-node--dim" : "",
                  ].join(" ")}
                />
                {hover === n.id && (
                  <text x={n.x + 10} y={n.y + 4} className="cg-node-label">
                    {n.label}
                  </text>
                )}
              </a>
            ))}
        </g>
      </svg>

      {/* SSR / no-JS fallback: a real, navigable node list (hidden once the SVG paints). */}
      <ul className="cg-fallback" aria-label="Connections (list)">
        {model.nodes.map((n) => (
          <li key={n.id} className={`cg-fallback-item cg-fallback-item--${n.type}`}>
            <a href={n.href}>{n.label}</a>
            <span className="cg-fallback-deg">{n.degree} links</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
