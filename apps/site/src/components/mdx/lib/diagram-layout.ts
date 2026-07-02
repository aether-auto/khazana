// apps/site/src/components/mdx/lib/diagram-layout.ts
//
// Pure, deterministic layout + orthogonal (manhattan) edge routing for the
// <Diagram> node-edge figure. No DOM, no layout-engine dependency: the author
// supplies abstract grid coordinates (x,y) per node and this module turns them
// into a concrete, reviewable SVG geometry (node boxes, edge polylines, label
// anchors, and a content-fitted viewBox). Everything spatial lives here so the
// component is a thin renderer and all the geometry is unit-tested.
//
// Coordinate model
// ----------------
// Author `x`/`y` are positions in an ABSTRACT grid (any units — 0,1,2… or
// 100,200… both work). We multiply by CELL_* to get SVG user units, size each
// node box from its (wrapped/truncated) label, then compute a viewBox that
// tightly frames every node + routed edge with a uniform margin. The component
// scales that viewBox to `width:100%`, so the same diagram is legible at 360px
// (it shrinks) and on desktop (it grows) without ever widening the page.

// ── author-facing input shapes ─────────────────────────────────────────────

/** Optional semantic role of a node — drives its accent tint, purely visual. */
export type NodeKind = "default" | "input" | "output" | "process" | "store" | "decision";

/** Edge semantics → distinct stroke style (solid / dashed / dotted). */
export type EdgeKind = "data" | "control" | "async";

export interface DiagramNode {
  id: string;
  label: string;
  /** abstract grid x (node CENTER). Any consistent unit. */
  x: number;
  /** abstract grid y (node CENTER). Any consistent unit. */
  y: number;
  kind?: NodeKind;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
}

// ── laid-out (rendered) shapes ──────────────────────────────────────────────

export interface Rect {
  /** left edge, SVG user units. */
  x: number;
  /** top edge, SVG user units. */
  y: number;
  width: number;
  height: number;
}

/** A node placed + sized, with its wrapped label lines. */
export interface LaidOutNode extends Rect {
  id: string;
  kind: NodeKind;
  /** center x/y (used as edge anchor origin). */
  cx: number;
  cy: number;
  /** label split into (already length-fitted) lines. */
  lines: string[];
}

export interface Point {
  x: number;
  y: number;
}

/** A routed edge: an orthogonal polyline plus its label anchor. */
export interface LaidOutEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  /** the manhattan polyline, ≥ 2 points; consecutive segments are axis-aligned. */
  points: Point[];
  /** where the edge label sits (midpoint of the longest segment). */
  labelAt: Point;
  /** the arrowhead tip (last point) + the direction it points, for marker rotation. */
  tip: Point;
  /** unit direction of the final segment, so the caller can draw an arrowhead. */
  dir: "up" | "down" | "left" | "right";
}

export interface DiagramLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  /** the tight content viewBox: "minX minY width height". */
  viewBox: string;
  width: number;
  height: number;
}

export interface DiagramLayoutOpts {
  /** SVG user units per abstract grid unit, x. Default 160. */
  cellW?: number;
  /** SVG user units per abstract grid unit, y. Default 96. */
  cellH?: number;
  /** approx px per label character (mono). Default 8. */
  charPx?: number;
  /** node box vertical padding + line height basis. Default 34 (single line). */
  nodeMinH?: number;
  /** node box horizontal padding (both sides total). Default 24. */
  nodePadX?: number;
  /** max node box width in user units before the label wraps. Default 200. */
  nodeMaxW?: number;
  /** min node box width in user units. Default 84. */
  nodeMinW?: number;
  /** line height inside a node box, user units. Default 18. */
  lineH?: number;
  /** uniform margin around the whole diagram in the viewBox. Default 28. */
  margin?: number;
}

const DEFAULTS = {
  cellW: 160,
  cellH: 96,
  charPx: 8,
  nodeMinH: 34,
  nodePadX: 24,
  nodeMaxW: 200,
  nodeMinW: 84,
  lineH: 18,
  margin: 28,
} as const;

// ── label wrapping / truncation (keeps long labels INSIDE the box) ──────────

/**
 * Greedy word-wrap of `label` so no line exceeds `maxChars`. If a single word is
 * longer than `maxChars` it is hard-truncated with an ellipsis (labels must
 * never overflow the node box — the spec forbids horizontal overflow). At most
 * `maxLines` lines are produced; overflow is truncated with an ellipsis on the
 * final line. Pure, deterministic — the renderer draws exactly these lines.
 */
export function wrapLabel(label: string, maxChars: number, maxLines: number = 3): string[] {
  const clamp = Math.max(1, Math.floor(maxChars));
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  const pushCur = () => {
    if (cur) lines.push(cur);
    cur = "";
  };
  for (const w of words) {
    // A word longer than a whole line: break it hard.
    if (w.length > clamp) {
      pushCur();
      // fill remaining line budget with a truncated chunk
      const chunk = w.slice(0, Math.max(1, clamp - 1)) + "…";
      lines.push(chunk);
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > clamp) {
      pushCur();
      cur = w;
    } else {
      cur = next;
    }
  }
  pushCur();
  if (lines.length <= maxLines) return lines;
  // Too many lines → keep the first maxLines and ellipsize the last kept one.
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? "";
  kept[maxLines - 1] = (last.length > clamp - 1 ? last.slice(0, clamp - 1) : last).replace(/…?$/, "") + "…";
  return kept;
}

// ── node sizing ─────────────────────────────────────────────────────────────

/** Size a node box from its wrapped label. Pure. */
export function sizeNode(
  label: string,
  opts: Required<Pick<DiagramLayoutOpts, "charPx" | "nodePadX" | "nodeMaxW" | "nodeMinW" | "nodeMinH" | "lineH">>,
): { width: number; height: number; lines: string[] } {
  const maxTextW = opts.nodeMaxW - opts.nodePadX;
  const maxChars = Math.max(4, Math.floor(maxTextW / opts.charPx));
  const lines = wrapLabel(label, maxChars);
  const widestLine = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const textW = widestLine * opts.charPx;
  const width = Math.min(opts.nodeMaxW, Math.max(opts.nodeMinW, textW + opts.nodePadX));
  const height = Math.max(opts.nodeMinH, lines.length * opts.lineH + (opts.nodeMinH - opts.lineH));
  return { width, height, lines };
}

// ── edge anchor selection + orthogonal routing ──────────────────────────────

/** The four side-anchor midpoints of a rect. */
export function anchors(r: Rect): Record<"top" | "right" | "bottom" | "left", Point> {
  return {
    top: { x: r.x + r.width / 2, y: r.y },
    right: { x: r.x + r.width, y: r.y + r.height / 2 },
    bottom: { x: r.x + r.width / 2, y: r.y + r.height },
    left: { x: r.x, y: r.y + r.height / 2 },
  };
}

type Side = "top" | "right" | "bottom" | "left";

/**
 * Choose the (fromSide, toSide) anchor pair for an edge between two boxes, based
 * on their relative center positions. Prefers the dominant axis: if the boxes
 * are further apart horizontally than vertically, exit/enter on left/right;
 * otherwise top/bottom. Deterministic — same input always yields same sides.
 */
export function chooseSides(a: LaidOutNode, b: LaidOutNode): { from: Side; to: Side } {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
  }
  return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
}

/**
 * Route an orthogonal (manhattan) polyline from anchor `p` (exiting on `fromSide`)
 * to anchor `q` (entering on `toSide`). Produces an L-bend when the two anchors
 * share neither axis, or a straight line when they're already axis-aligned. The
 * exit/entry directions are honored so the first segment leaves the source box
 * perpendicular to its edge and the last segment enters the target perpendicular
 * to its edge (clean arrowheads). Deterministic; consecutive points differ.
 */
export function routeOrthogonal(p: Point, fromSide: Side, q: Point, toSide: Side): Point[] {
  const pts: Point[] = [p];
  const horizontalExit = fromSide === "left" || fromSide === "right";
  const horizontalEntry = toSide === "left" || toSide === "right";

  if (horizontalExit && horizontalEntry) {
    // → out, → in: bend at the horizontal midpoint (a Z if y differs).
    if (Math.abs(p.y - q.y) < 0.5) {
      pts.push(q);
    } else {
      const midX = (p.x + q.x) / 2;
      pts.push({ x: midX, y: p.y });
      pts.push({ x: midX, y: q.y });
      pts.push(q);
    }
  } else if (!horizontalExit && !horizontalEntry) {
    // ↓ out, ↓ in: bend at the vertical midpoint (a Z if x differs).
    if (Math.abs(p.x - q.x) < 0.5) {
      pts.push(q);
    } else {
      const midY = (p.y + q.y) / 2;
      pts.push({ x: p.x, y: midY });
      pts.push({ x: q.x, y: midY });
      pts.push(q);
    }
  } else if (horizontalExit && !horizontalEntry) {
    // → out, ↓/↑ in: single L-bend under/over the target's entry x.
    pts.push({ x: q.x, y: p.y });
    pts.push(q);
  } else {
    // ↓/↑ out, →/← in: single L-bend at the source's exit x.
    pts.push({ x: p.x, y: q.y });
    pts.push(q);
  }
  // Collapse any accidental zero-length duplicates (keeps segments meaningful).
  return dedupePoints(pts);
}

function dedupePoints(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const pt of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - pt.x) > 0.01 || Math.abs(last.y - pt.y) > 0.01) out.push(pt);
  }
  // A degenerate single-point path (source === target anchor) still needs 2 pts.
  if (out.length === 1) out.push({ ...out[0]! });
  return out;
}

/** Direction of the final segment (for arrowhead orientation). */
export function finalDir(points: Point[]): LaidOutEdge["dir"] {
  const n = points.length;
  const b = points[n - 1]!;
  const a = points[n - 2] ?? b;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

/** Label anchor = midpoint of the polyline's longest segment (most room). */
export function labelAnchor(points: Point[]): Point {
  let best = { x: points[0]!.x, y: points[0]!.y };
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
}

// ── the full layout engine ──────────────────────────────────────────────────

export function layoutDiagram(
  nodes: ReadonlyArray<DiagramNode>,
  edges: ReadonlyArray<DiagramEdge>,
  opts: DiagramLayoutOpts = {},
): DiagramLayout {
  if (!nodes || nodes.length === 0) throw new Error("Diagram: needs at least one node");
  const o = { ...DEFAULTS, ...opts };
  const sizeOpts = {
    charPx: o.charPx,
    nodePadX: o.nodePadX,
    nodeMaxW: o.nodeMaxW,
    nodeMinW: o.nodeMinW,
    nodeMinH: o.nodeMinH,
    lineH: o.lineH,
  };

  // 1. Place + size each node. Author (x,y) is the box CENTER in grid units.
  const laid: LaidOutNode[] = nodes.map((n) => {
    const { width, height, lines } = sizeNode(n.label, sizeOpts);
    const cx = n.x * o.cellW;
    const cy = n.y * o.cellH;
    return {
      id: n.id,
      kind: n.kind ?? "default",
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      cx,
      cy,
      lines,
    };
  });

  const byId = new Map(laid.map((n) => [n.id, n]));

  // 2. Route each edge. Unknown endpoints are skipped (defensive, not thrown —
  //    a bad ref shouldn't blank the whole figure).
  const routed: LaidOutEdge[] = [];
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const { from, to } = chooseSides(a, b);
    const p = anchors(a)[from];
    const q = anchors(b)[to];
    const points = routeOrthogonal(p, from, q, to);
    routed.push({
      from: e.from,
      to: e.to,
      kind: e.kind ?? "data",
      label: e.label,
      points,
      labelAt: labelAnchor(points),
      tip: points[points.length - 1]!,
      dir: finalDir(points),
    });
  }

  // 3. Content-fitted viewBox: frame every node box (edges live within the node
  //    hull for author-positioned graphs) plus a uniform margin.
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
  for (const n of laid) {
    extend(n.x, n.y);
    extend(n.x + n.width, n.y + n.height);
  }
  // Edge polylines can bow outside the node hull (rare, but the midpoint Z-bends
  // stay inside; label text may not). Include every routed point to be safe.
  for (const e of routed) {
    for (const pt of e.points) extend(pt.x, pt.y);
    extend(e.labelAt.x, e.labelAt.y);
  }

  const vbX = minX - o.margin;
  const vbY = minY - o.margin;
  const width = maxX - minX + o.margin * 2;
  const height = maxY - minY + o.margin * 2;

  return {
    nodes: laid,
    edges: routed,
    viewBox: `${round(vbX)} ${round(vbY)} ${round(width)} ${round(height)}`,
    width: round(width),
    height: round(height),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Serialize a routed polyline to an SVG `points`/`path` `d` string. */
export function polylinePath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${round(p.x)} ${round(p.y)}`).join(" ");
}
