// apps/site/src/components/mdx/lib/sankey-layout.ts
/**
 * Pure pre/post processing for <Sankey> — a flow / allocation diagram (where a
 * budget / energy / population / force goes). All the non-visual work lives here
 * so the island stays a thin d3-sankey renderer:
 *
 *  - validate the input is a well-formed DAG (unique node ids, links reference
 *    existing nodes, positive finite values, no self-loops, no cycles);
 *  - map author-friendly string node ids onto the 0-based indices d3-sankey
 *    expects, and resolve them back afterwards;
 *  - drive the d3-sankey layout inside a fixed abstract viewBox (the SVG scales
 *    to width:100%), returning plain serialisable geometry (no d3 objects);
 *  - compute the grand total and each flow's share of it for the hover readout
 *    and the SSR fallback.
 *
 * The one d3-sankey call is isolated in `computeSankey`; everything it needs is
 * prepared and everything it returns is flattened here, and every branch is
 * unit-tested.
 */
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
  type SankeyGraph,
} from "d3-sankey";

// ── public author-facing shapes ──────────────────────────────────────────────

export interface SankeyNodeInput {
  /** stable id referenced by links (author-friendly string). */
  id: string;
  /** display label; falls back to `id` when omitted. */
  label?: string;
}

export interface SankeyLinkInput {
  /** source node id (must exist in `nodes`). */
  source: string;
  /** target node id (must exist in `nodes`). */
  target: string;
  /** flow magnitude — must be a positive finite number. */
  value: number;
}

// ── laid-out (serialisable) geometry ─────────────────────────────────────────

export interface LaidOutNode {
  id: string;
  label: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** total flow through the node (max of in/out sums, from d3-sankey). */
  value: number;
  /** which side of the diagram the label should sit on. */
  labelSide: "left" | "right";
  /** x anchor for the label text. */
  labelX: number;
  /** y anchor (vertical centre of the node) for the label text. */
  labelY: number;
}

export interface LaidOutLink {
  source: string;
  target: string;
  sourceLabel: string;
  targetLabel: string;
  value: number;
  /** value as a share of the grand total, in [0, 1]. */
  share: number;
  /** the horizontal-sankey SVG path `d` string. */
  path: string;
  /** stroke width proportional to value (d3-sankey link.width). */
  width: number;
}

export interface SankeyLayout {
  nodes: LaidOutNode[];
  links: LaidOutLink[];
  /** grand total = sum of all link values. */
  total: number;
  /** abstract viewBox width (SVG scales to 100%). */
  width: number;
  /** abstract viewBox height (grows with node count). */
  height: number;
}

export interface SankeyOpts {
  width?: number;
  height?: number;
  /** width of the node rectangles. */
  nodeWidth?: number;
  /** vertical gap between nodes in a column. */
  nodePadding?: number;
  /** inner padding of the layout extent. */
  pad?: number;
}

const DEFAULTS = {
  width: 720,
  height: 420,
  nodeWidth: 14,
  nodePadding: 16,
  pad: 8,
} as const;

/**
 * Format a flow / node value for the readout & fallback, trimming needless
 * decimals (mirrors RangePlot's formatter for a consistent instrument voice).
 */
export function formatFlowValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  return v.toFixed(abs < 1 ? 3 : abs < 10 ? 2 : 1);
}

/** Format a 0..1 share as a percentage string, e.g. 0.1234 → "12.3%". */
export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct === 0) return "0%";
  if (pct >= 99.95) return "100%";
  return `${pct.toFixed(pct < 10 ? 1 : 1)}%`;
}

/**
 * Validate the author's graph and build the id→index map d3-sankey needs.
 * Throws a precise, author-actionable error on any malformed input. Detects
 * cycles with an iterative DFS over the resolved edge list so a bad DAG never
 * reaches d3-sankey (which would otherwise loop / mislay).
 */
export function validateSankeyInput(
  nodes: ReadonlyArray<SankeyNodeInput>,
  links: ReadonlyArray<SankeyLinkInput>,
): { idToIndex: Map<string, number>; labelOf: (id: string) => string } {
  if (!nodes || nodes.length === 0) {
    throw new Error("Sankey: needs at least one node");
  }
  if (!links || links.length === 0) {
    throw new Error("Sankey: needs at least one link");
  }

  const idToIndex = new Map<string, number>();
  const labelMap = new Map<string, string>();
  nodes.forEach((n, i) => {
    if (!n.id) throw new Error(`Sankey: node at position ${i} is missing an id`);
    if (idToIndex.has(n.id)) throw new Error(`Sankey: duplicate node id "${n.id}"`);
    idToIndex.set(n.id, i);
    labelMap.set(n.id, n.label ?? n.id);
  });

  // adjacency for cycle detection (source index → target indices)
  const adj: number[][] = nodes.map(() => []);
  for (const l of links) {
    if (!idToIndex.has(l.source)) {
      throw new Error(`Sankey: link references unknown source "${l.source}"`);
    }
    if (!idToIndex.has(l.target)) {
      throw new Error(`Sankey: link references unknown target "${l.target}"`);
    }
    if (l.source === l.target) {
      throw new Error(`Sankey: self-loop on node "${l.source}" is not allowed`);
    }
    if (!Number.isFinite(l.value) || l.value <= 0) {
      throw new Error(
        `Sankey: link ${l.source}→${l.target} must have a positive finite value (got ${l.value})`,
      );
    }
    adj[idToIndex.get(l.source)!]!.push(idToIndex.get(l.target)!);
  }

  detectCycle(adj);

  return { idToIndex, labelOf: (id: string) => labelMap.get(id) ?? id };
}

/** Iterative 3-colour DFS; throws if the directed graph contains a cycle. */
function detectCycle(adj: ReadonlyArray<ReadonlyArray<number>>): void {
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const color = new Array<number>(adj.length).fill(WHITE);
  for (let start = 0; start < adj.length; start++) {
    if (color[start] !== WHITE) continue;
    // stack frames carry the next child index to visit
    const stack: Array<{ node: number; i: number }> = [{ node: start, i: 0 }];
    color[start] = GREY;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const children = adj[frame.node]!;
      if (frame.i < children.length) {
        const next = children[frame.i++]!;
        if (color[next] === GREY) {
          throw new Error("Sankey: the flow graph must be acyclic (a cycle was found)");
        }
        if (color[next] === WHITE) {
          color[next] = GREY;
          stack.push({ node: next, i: 0 });
        }
      } else {
        color[frame.node] = BLACK;
        stack.pop();
      }
    }
  }
}

/**
 * Run the d3-sankey layout and flatten it to plain serialisable geometry.
 * This is the ONLY function that touches d3-sankey; keep it thin.
 */
export function layoutSankey(
  nodes: ReadonlyArray<SankeyNodeInput>,
  links: ReadonlyArray<SankeyLinkInput>,
  opts: SankeyOpts = {},
): SankeyLayout {
  const { idToIndex, labelOf } = validateSankeyInput(nodes, links);

  const width = opts.width ?? DEFAULTS.width;
  const height = opts.height ?? DEFAULTS.height;
  const nodeWidth = opts.nodeWidth ?? DEFAULTS.nodeWidth;
  const nodePadding = opts.nodePadding ?? DEFAULTS.nodePadding;
  const pad = opts.pad ?? DEFAULTS.pad;

  const total = links.reduce((s, l) => s + l.value, 0);

  // d3-sankey mutates its inputs, so hand it fresh objects keyed by index.
  type N = { id: string };
  type L = { source: number; target: number; value: number };
  const graphInput: { nodes: N[]; links: L[] } = {
    nodes: nodes.map((n) => ({ id: n.id })),
    links: links.map((l) => ({
      source: idToIndex.get(l.source)!,
      target: idToIndex.get(l.target)!,
      value: l.value,
    })),
  };

  const generator = d3Sankey<N, L>()
    .nodeWidth(nodeWidth)
    .nodePadding(nodePadding)
    .nodeAlign(sankeyJustify)
    .extent([
      [pad, pad],
      [width - pad, height - pad],
    ]);

  const graph = generator(graphInput) as SankeyGraph<N, L>;
  const linkPath = sankeyLinkHorizontal<N, L>();

  const midX = width / 2;
  const laidNodes: LaidOutNode[] = graph.nodes.map((node) => {
    const x0 = node.x0 ?? 0;
    const x1 = node.x1 ?? 0;
    const y0 = node.y0 ?? 0;
    const y1 = node.y1 ?? 0;
    // label sits outside the node, on whichever side has room; source-side
    // nodes (left half) label to the right of their rect, sinks to the left.
    const side: "left" | "right" = x0 < midX ? "right" : "left";
    return {
      id: node.id,
      label: labelOf(node.id),
      x0,
      x1,
      y0,
      y1,
      value: node.value ?? 0,
      labelSide: side,
      labelX: side === "right" ? x1 + 6 : x0 - 6,
      labelY: (y0 + y1) / 2,
    };
  });

  // After layout d3-sankey replaces the numeric source/target indices with node
  // object references; resolve either shape back to the author's string id.
  const nodeIdAt = (index: number): string => nodes[index]?.id ?? String(index);
  const resolveEnd = (end: number | string | { id?: string }): string => {
    if (typeof end === "number") return nodeIdAt(end);
    if (typeof end === "string") return end;
    return end.id ?? "";
  };

  const laidLinks: LaidOutLink[] = graph.links.map((link) => {
    const srcId = resolveEnd(link.source as number | string | { id?: string });
    const tgtId = resolveEnd(link.target as number | string | { id?: string });
    return {
      source: srcId,
      target: tgtId,
      sourceLabel: labelOf(srcId),
      targetLabel: labelOf(tgtId),
      value: link.value,
      share: total > 0 ? link.value / total : 0,
      path: linkPath(link) ?? "",
      width: Math.max(1, link.width ?? 1),
    };
  });

  return { nodes: laidNodes, links: laidLinks, total, width, height };
}
