// apps/site/src/components/mdx/lib/power-flow-layout.ts
//
// Pure, deterministic, zero-DOM layout for the <PowerFlow> government-structure
// diagram. The author supplies typed government institutions + directed
// power-flow edges (straight from `@khazana/core`'s GovernmentStructure) and this
// module turns them into concrete SVG geometry: branch COLUMNS, tier ROWS,
// content-fitted institution boxes, and relation-preserving curved routes.
// Everything spatial lives here so the React component is a thin renderer and all
// the geometry is unit-tested.
//
// Layout model
// ------------
//   • COLUMNS = branches, ordered by the canonical GOV_BRANCHES
//     [executive, legislative, judicial, electoral, other]. A column is rendered
//     ONLY when it holds ≥1 institution — so electoral / other are optional.
//   • ROWS = tiers, ordered by the canonical GOV_TIERS [national, state, local],
//     top → bottom. A row is rendered only when it holds ≥1 institution.
//   • A node sits in its (branch, tier) cell. When several institutions share a
//     cell they are stacked (stable sort by id) with deterministic,
//     non-overlapping vertical offsets; the row/column extents grow to fit.
//   • Edges are relation-preserving quadratic curves bowed perpendicular to the
//     chord. The bow's SIGN is fixed by the endpoints' canonical order and its
//     magnitude grows per additional edge on the same unordered pair, so a
//     reciprocal pair (A→B vs B→A) and cyclic edges get distinct, opposite-side
//     curves (distinct path `d`).
//
// The component scales the resulting content-fitted viewBox to width:100%, so the
// same diagram is legible at 360px (it shrinks) and on desktop (it grows).

import { GOV_BRANCHES, GOV_TIERS } from "@khazana/core";
import type { GovBranch, GovTier, Institution, PowerFlowEdge, PowerRelation } from "@khazana/core";
import { wrapLabel } from "./diagram-layout.js";

// ── input shape (a structural subset of @khazana/core Institution) ───────────

/** The institution fields the layout needs — a subset of the core Institution. */
export type PowerFlowInstitution = Pick<Institution, "id" | "name" | "branch" | "tier">;

// ── laid-out (rendered) shapes ───────────────────────────────────────────────

export interface Rect {
  /** left edge, SVG user units. */
  x: number;
  /** top edge, SVG user units. */
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** An institution placed + sized, with its wrapped label lines. */
export interface PowerFlowNode extends Rect {
  id: string;
  branch: GovBranch;
  tier: GovTier;
  /** center x/y (edge anchor origin). */
  cx: number;
  cy: number;
  /** label split into (already length-fitted) lines. */
  lines: string[];
}

/** A routed power-flow edge: a bowed quadratic curve + its relation + anchors. */
export interface PowerFlowRoute {
  from: string;
  to: string;
  /** the authority relation, passed through UNTOUCHED from the source edge. */
  relation: PowerRelation;
  /** the SVG path `d` — a quadratic curve `M start Q control end`. */
  d: string;
  /** where the relation label sits (the curve's t=0.5 point). */
  labelAt: Point;
  /** the arrowhead tip (the `end` point, on the target's box boundary). */
  tip: Point;
  /** signed lane offset that produced the bow (for tests / debugging). */
  lane: number;
}

/** A rendered branch column: which branch + its center x. */
export interface PowerFlowColumn {
  branch: GovBranch;
  /** column center, SVG user units. */
  x: number;
  /** column box left edge + width (for the column header rule). */
  left: number;
  width: number;
}

/** A rendered tier row: which tier + its center y. */
export interface PowerFlowRow {
  tier: GovTier;
  /** row center, SVG user units. */
  y: number;
  /** row box top edge + height (for the row label). */
  top: number;
  height: number;
}

export interface PowerFlowLayout {
  nodes: PowerFlowNode[];
  edges: PowerFlowRoute[];
  /** the rendered branch columns, in canonical GOV_BRANCHES order. */
  columns: PowerFlowColumn[];
  /** the rendered tier rows, in canonical GOV_TIERS order. */
  rows: PowerFlowRow[];
  /** the tight content viewBox: "minX minY width height". */
  viewBox: string;
  width: number;
  height: number;
}

export interface PowerFlowLayoutOpts {
  /** horizontal gap between adjacent columns, user units. Default 72. */
  colGap?: number;
  /** vertical gap between adjacent rows, user units. Default 64. */
  rowGap?: number;
  /** vertical gap between stacked nodes inside one cell. Default 16. */
  cellGap?: number;
  /** min column width, user units. Default 150. */
  colMinW?: number;
  /** min row height, user units. Default 60. */
  rowMinH?: number;
  /** approx px per label character (mono). Default 8. */
  charPx?: number;
  /** node box vertical basis (single line). Default 40. */
  nodeMinH?: number;
  /** node box horizontal padding (both sides total). Default 26. */
  nodePadX?: number;
  /** max node box width before the label wraps. Default 190. */
  nodeMaxW?: number;
  /** min node box width. Default 96. */
  nodeMinW?: number;
  /** line height inside a node box. Default 18. */
  lineH?: number;
  /** uniform margin around the whole diagram in the viewBox. Default 32. */
  margin?: number;
  /** base perpendicular bow as a fraction of the chord length. Default 0.16. */
  bow?: number;
}

const DEFAULTS = {
  colGap: 72,
  rowGap: 64,
  cellGap: 16,
  colMinW: 150,
  rowMinH: 60,
  charPx: 8,
  nodeMinH: 40,
  nodePadX: 26,
  nodeMaxW: 190,
  nodeMinW: 96,
  lineH: 18,
  margin: 32,
  bow: 0.16,
} as const;

// ── node sizing (content-fitted box from the wrapped label) ──────────────────

/** Size a node box from its wrapped label. Pure. */
export function sizePowerFlowNode(
  label: string,
  o: Pick<Required<PowerFlowLayoutOpts>, "charPx" | "nodePadX" | "nodeMaxW" | "nodeMinW" | "nodeMinH" | "lineH">,
): { width: number; height: number; lines: string[] } {
  const maxTextW = o.nodeMaxW - o.nodePadX;
  const maxChars = Math.max(4, Math.floor(maxTextW / o.charPx));
  const lines = wrapLabel(label, maxChars);
  const widestLine = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const textW = widestLine * o.charPx;
  const width = Math.min(o.nodeMaxW, Math.max(o.nodeMinW, textW + o.nodePadX));
  const height = Math.max(o.nodeMinH, lines.length * o.lineH + (o.nodeMinH - o.lineH));
  return { width, height, lines };
}

// ── quadratic-curve edge routing (relation-preserving, lane-bowed) ───────────

/** The point where the ray from `center` toward `dir` exits an axis-aligned box. */
function boxBoundary(center: Point, halfW: number, halfH: number, dir: Point): Point {
  const adx = Math.abs(dir.x);
  const ady = Math.abs(dir.y);
  // Scale the unit-ish direction until it hits the nearer of the two box faces.
  const sx = adx > 1e-6 ? halfW / adx : Infinity;
  const sy = ady > 1e-6 ? halfH / ady : Infinity;
  const s = Math.min(sx, sy);
  if (!Number.isFinite(s)) return { x: center.x, y: center.y };
  return { x: center.x + dir.x * s, y: center.y + dir.y * s };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── the full layout engine ───────────────────────────────────────────────────

export function layoutPowerFlow(
  institutions: ReadonlyArray<PowerFlowInstitution>,
  edges: ReadonlyArray<PowerFlowEdge>,
  opts: PowerFlowLayoutOpts = {},
): PowerFlowLayout {
  if (!institutions || institutions.length === 0) {
    throw new Error("PowerFlow: needs at least one institution");
  }
  const o = { ...DEFAULTS, ...opts };
  const sizeOpts = {
    charPx: o.charPx,
    nodePadX: o.nodePadX,
    nodeMaxW: o.nodeMaxW,
    nodeMinW: o.nodeMinW,
    nodeMinH: o.nodeMinH,
    lineH: o.lineH,
  };

  // 1. Which branches / tiers are actually present, in canonical order.
  const branchPresent = new Set(institutions.map((i) => i.branch));
  const tierPresent = new Set(institutions.map((i) => i.tier));
  const branches: GovBranch[] = GOV_BRANCHES.filter((b) => branchPresent.has(b));
  const tiers: GovTier[] = GOV_TIERS.filter((t) => tierPresent.has(t));

  // 2. Size every institution up front (deterministic, id-stable per cell).
  interface Sized extends PowerFlowInstitution {
    width: number;
    height: number;
    lines: string[];
  }
  const sized: Sized[] = institutions.map((inst) => {
    const { width, height, lines } = sizePowerFlowNode(inst.name, sizeOpts);
    return { ...inst, width, height, lines };
  });

  // Group by (branch, tier) cell, stable-sorted by id within the cell.
  const cellKey = (b: GovBranch, t: GovTier): string => `${b}|${t}`;
  const cells = new Map<string, Sized[]>();
  for (const s of sized) {
    const key = cellKey(s.branch, s.tier);
    const bucket = cells.get(key);
    if (bucket) bucket.push(s);
    else cells.set(key, [s]);
  }
  for (const bucket of cells.values()) {
    bucket.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  // 3. Column widths = widest node in the column (min colMinW). Column centers
  //    placed left→right with colGap between successive column boxes.
  const colWidth = new Map<GovBranch, number>();
  for (const b of branches) {
    let w = o.colMinW;
    for (const t of tiers) {
      for (const s of cells.get(cellKey(b, t)) ?? []) w = Math.max(w, s.width);
    }
    colWidth.set(b, w);
  }
  const columns: PowerFlowColumn[] = [];
  let cursorX = 0;
  for (const b of branches) {
    const w = colWidth.get(b) ?? o.colMinW;
    const left = cursorX;
    columns.push({ branch: b, x: left + w / 2, width: w, left });
    cursorX = left + w + o.colGap;
  }
  const colCenterX = new Map(columns.map((c) => [c.branch, c.x]));

  // 4. Row heights = tallest cell stack in the row (min rowMinH). Cell stack
  //    height = Σ node heights + cellGap·(k-1). Rows placed top→bottom.
  const cellStackHeight = (b: GovBranch, t: GovTier): number => {
    const bucket = cells.get(cellKey(b, t)) ?? [];
    if (bucket.length === 0) return 0;
    const sum = bucket.reduce((acc, s) => acc + s.height, 0);
    return sum + o.cellGap * (bucket.length - 1);
  };
  const rowHeight = new Map<GovTier, number>();
  for (const t of tiers) {
    let h = o.rowMinH;
    for (const b of branches) h = Math.max(h, cellStackHeight(b, t));
    rowHeight.set(t, h);
  }
  const rows: PowerFlowRow[] = [];
  let cursorY = 0;
  for (const t of tiers) {
    const h = rowHeight.get(t) ?? o.rowMinH;
    const top = cursorY;
    rows.push({ tier: t, y: top + h / 2, height: h, top });
    cursorY = top + h + o.rowGap;
  }
  const rowCenterY = new Map(rows.map((r) => [r.tier, r.y]));

  // 5. Place each node: column center x, cell-stack vertically centered on the
  //    row center, deterministic non-overlapping offsets.
  const nodes: PowerFlowNode[] = [];
  for (const b of branches) {
    const cx = colCenterX.get(b);
    if (cx === undefined) continue;
    for (const t of tiers) {
      const bucket = cells.get(cellKey(b, t));
      if (!bucket || bucket.length === 0) continue;
      const cy = rowCenterY.get(t);
      if (cy === undefined) continue;
      const stackH = cellStackHeight(b, t);
      let top = cy - stackH / 2;
      for (const s of bucket) {
        const nodeCy = top + s.height / 2;
        nodes.push({
          id: s.id,
          branch: s.branch,
          tier: s.tier,
          x: round(cx - s.width / 2),
          y: round(top),
          width: s.width,
          height: s.height,
          cx: round(cx),
          cy: round(nodeCy),
          lines: s.lines,
        });
        top += s.height + o.cellGap;
      }
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 6. Route edges. Unknown endpoints are skipped defensively (a bad ref never
  //    blanks the whole figure). Bow sign fixed by canonical endpoint order;
  //    magnitude grows per additional edge on the same unordered pair so
  //    reciprocal / cyclic edges stay distinct.
  const pairCount = new Map<string, number>();
  const routed: PowerFlowRoute[] = [];
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;

    const from = { x: a.cx, y: a.cy };
    const to = { x: b.cx, y: b.cy };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Canonical (order-independent) chord direction → a stable perpendicular so
    // the bow SIDE depends only on the edge's direction sign, not on which node
    // happens to be `from`.
    const canonicalFwd = e.from < e.to;
    const cdx = canonicalFwd ? dx : -dx;
    const cdy = canonicalFwd ? dy : -dy;
    const perpX = -cdy / dist;
    const perpY = cdx / dist;

    const pairKey = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    const seen = pairCount.get(pairKey) ?? 0;
    pairCount.set(pairKey, seen + 1);
    const sign = canonicalFwd ? 1 : -1;
    const magnitude = o.bow * (1 + seen * 0.7);
    const lane = sign * magnitude;

    // Trim endpoints to the box boundaries so the arrow sits on the target edge.
    const start = boxBoundary(from, a.width / 2, a.height / 2, { x: dx, y: dy });
    const end = boxBoundary(to, b.width / 2, b.height / 2, { x: -dx, y: -dy });

    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const ctrlX = midX + perpX * dist * lane;
    const ctrlY = midY + perpY * dist * lane;

    const d = `M ${round(start.x)} ${round(start.y)} Q ${round(ctrlX)} ${round(ctrlY)} ${round(end.x)} ${round(end.y)}`;
    // Quadratic point at t=0.5 for the label anchor.
    const labelAt: Point = {
      x: round(0.25 * start.x + 0.5 * ctrlX + 0.25 * end.x),
      y: round(0.25 * start.y + 0.5 * ctrlY + 0.25 * end.y),
    };

    routed.push({
      from: e.from,
      to: e.to,
      relation: e.relation,
      d,
      labelAt,
      tip: { x: round(end.x), y: round(end.y) },
      lane: round(lane),
    });
  }

  // 7. Content-fitted viewBox: frame every node box, every column/row extent,
  //    and every routed curve anchor + control-bow, plus a uniform margin.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const n of nodes) {
    extend(n.x, n.y);
    extend(n.x + n.width, n.y + n.height);
  }
  for (const c of columns) {
    extend(c.left, 0);
    extend(c.left + c.width, 0);
  }
  for (const r of rows) {
    extend(0, r.top);
    extend(0, r.top + r.height);
  }
  for (const e of routed) {
    extend(e.labelAt.x, e.labelAt.y);
    extend(e.tip.x, e.tip.y);
  }

  const vbX = minX - o.margin;
  const vbY = minY - o.margin;
  const width = maxX - minX + o.margin * 2;
  const height = maxY - minY + o.margin * 2;

  return {
    nodes,
    edges: routed,
    columns,
    rows,
    viewBox: `${round(vbX)} ${round(vbY)} ${round(width)} ${round(height)}`,
    width: round(width),
    height: round(height),
  };
}
