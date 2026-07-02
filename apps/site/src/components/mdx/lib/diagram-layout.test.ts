// apps/site/src/components/mdx/lib/diagram-layout.test.ts
import { describe, expect, test } from "vitest";
import {
  wrapLabel,
  sizeNode,
  anchors,
  chooseSides,
  routeOrthogonal,
  finalDir,
  labelAnchor,
  layoutDiagram,
  polylinePath,
  type DiagramNode,
  type DiagramEdge,
  type LaidOutNode,
} from "./diagram-layout.js";

const SIZE_OPTS = {
  charPx: 8,
  nodePadX: 24,
  nodeMaxW: 200,
  nodeMinW: 84,
  nodeMinH: 34,
  lineH: 18,
} as const;

// ── wrapLabel ────────────────────────────────────────────────────────────────
describe("wrapLabel", () => {
  test("short label fits on one line", () => {
    expect(wrapLabel("Cache", 20)).toEqual(["Cache"]);
  });

  test("wraps across words when over the char budget", () => {
    // "Load Balancer" (13) > 12 → each pair wraps; fits in 3 lines with a
    // generous maxLines so no word is dropped.
    const lines = wrapLabel("Load Balancer Tier", 12, 4);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(12);
    // every word preserved (order + content) when joined
    expect(lines.join(" ")).toBe("Load Balancer Tier");
    expect(lines.length).toBeGreaterThan(1);
  });

  test("hard-truncates a single word longer than the line budget", () => {
    const lines = wrapLabel("Supercalifragilistic", 8);
    expect(lines[0]!.length).toBeLessThanOrEqual(8);
    expect(lines[0]!.endsWith("…")).toBe(true);
  });

  test("caps at maxLines and ellipsizes the final kept line", () => {
    const lines = wrapLabel("one two three four five six seven eight nine ten", 6, 2);
    expect(lines.length).toBe(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  test("empty / whitespace label yields a single empty line (never throws)", () => {
    expect(wrapLabel("   ", 10)).toEqual([""]);
  });
});

// ── sizeNode ─────────────────────────────────────────────────────────────────
describe("sizeNode", () => {
  test("respects min width for tiny labels", () => {
    const { width } = sizeNode("A", SIZE_OPTS);
    expect(width).toBe(SIZE_OPTS.nodeMinW);
  });

  test("never exceeds max width — long labels wrap instead of widening", () => {
    const { width, lines } = sizeNode(
      "A very long descriptive node label that must wrap inside its box",
      SIZE_OPTS,
    );
    expect(width).toBeLessThanOrEqual(SIZE_OPTS.nodeMaxW);
    expect(lines.length).toBeGreaterThan(1);
  });

  test("box grows in height with more wrapped lines", () => {
    const one = sizeNode("Short", SIZE_OPTS);
    const many = sizeNode("this label wraps onto several distinct lines here", SIZE_OPTS);
    expect(many.height).toBeGreaterThan(one.height);
  });
});

// ── anchors ──────────────────────────────────────────────────────────────────
describe("anchors", () => {
  test("returns the four side midpoints of a rect", () => {
    const a = anchors({ x: 0, y: 0, width: 100, height: 40 });
    expect(a.top).toEqual({ x: 50, y: 0 });
    expect(a.right).toEqual({ x: 100, y: 20 });
    expect(a.bottom).toEqual({ x: 50, y: 40 });
    expect(a.left).toEqual({ x: 0, y: 20 });
  });
});

// ── chooseSides ──────────────────────────────────────────────────────────────
function node(id: string, cx: number, cy: number): LaidOutNode {
  return {
    id,
    kind: "default",
    x: cx - 40,
    y: cy - 20,
    width: 80,
    height: 40,
    cx,
    cy,
    lines: [id],
  };
}

describe("chooseSides", () => {
  test("horizontally-dominant → right/left", () => {
    expect(chooseSides(node("a", 0, 0), node("b", 300, 20))).toEqual({ from: "right", to: "left" });
  });
  test("leftward horizontally-dominant → left/right", () => {
    expect(chooseSides(node("a", 300, 0), node("b", 0, 10))).toEqual({ from: "left", to: "right" });
  });
  test("vertically-dominant downward → bottom/top", () => {
    expect(chooseSides(node("a", 0, 0), node("b", 20, 300))).toEqual({ from: "bottom", to: "top" });
  });
  test("vertically-dominant upward → top/bottom", () => {
    expect(chooseSides(node("a", 0, 300), node("b", 10, 0))).toEqual({ from: "top", to: "bottom" });
  });
});

// ── routeOrthogonal ──────────────────────────────────────────────────────────
describe("routeOrthogonal", () => {
  const isAxisAligned = (pts: { x: number; y: number }[]) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const sameX = Math.abs(a.x - b.x) < 0.01;
      const sameY = Math.abs(a.y - b.y) < 0.01;
      if (!(sameX || sameY)) return false;
    }
    return true;
  };

  test("straight horizontal run when anchors share y", () => {
    const pts = routeOrthogonal({ x: 0, y: 50 }, "right", { x: 200, y: 50 }, "left");
    expect(pts).toEqual([
      { x: 0, y: 50 },
      { x: 200, y: 50 },
    ]);
    expect(isAxisAligned(pts)).toBe(true);
  });

  test("Z-bend for horizontal exit + horizontal entry at different y", () => {
    const pts = routeOrthogonal({ x: 0, y: 0 }, "right", { x: 200, y: 100 }, "left");
    expect(pts.length).toBe(4);
    expect(isAxisAligned(pts)).toBe(true);
    // starts at source, ends at target
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 200, y: 100 });
  });

  test("Z-bend for vertical exit + vertical entry at different x", () => {
    const pts = routeOrthogonal({ x: 0, y: 0 }, "bottom", { x: 100, y: 200 }, "top");
    expect(pts.length).toBe(4);
    expect(isAxisAligned(pts)).toBe(true);
  });

  test("single L-bend for horizontal exit + vertical entry", () => {
    const pts = routeOrthogonal({ x: 0, y: 0 }, "right", { x: 150, y: 120 }, "top");
    expect(pts.length).toBe(3);
    expect(isAxisAligned(pts)).toBe(true);
    // corner sits under the target entry x, at the source y
    expect(pts[1]).toEqual({ x: 150, y: 0 });
  });

  test("all routes are strictly axis-aligned (manhattan)", () => {
    const combos: [Point2, "top" | "right" | "bottom" | "left", Point2, "top" | "right" | "bottom" | "left"][] = [
      [{ x: 0, y: 0 }, "right", { x: 300, y: 40 }, "left"],
      [{ x: 0, y: 0 }, "bottom", { x: 40, y: 300 }, "top"],
      [{ x: 0, y: 0 }, "right", { x: 200, y: 200 }, "top"],
      [{ x: 0, y: 0 }, "bottom", { x: 200, y: 200 }, "left"],
    ];
    for (const [p, fs, q, ts] of combos) {
      expect(isAxisAligned(routeOrthogonal(p, fs, q, ts))).toBe(true);
    }
  });

  test("never emits a single-point degenerate path", () => {
    const pts = routeOrthogonal({ x: 5, y: 5 }, "right", { x: 5, y: 5 }, "left");
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });
});
type Point2 = { x: number; y: number };

// ── finalDir ─────────────────────────────────────────────────────────────────
describe("finalDir", () => {
  test("rightward final segment", () => {
    expect(finalDir([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe("right");
  });
  test("downward final segment", () => {
    expect(finalDir([{ x: 0, y: 0 }, { x: 0, y: 100 }])).toBe("down");
  });
  test("leftward final segment", () => {
    expect(finalDir([{ x: 100, y: 0 }, { x: 0, y: 0 }])).toBe("left");
  });
  test("upward final segment", () => {
    expect(finalDir([{ x: 0, y: 100 }, { x: 0, y: 0 }])).toBe("up");
  });
});

// ── labelAnchor ──────────────────────────────────────────────────────────────
describe("labelAnchor", () => {
  test("lands on the midpoint of the longest segment", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 200 }, // longest
      { x: 20, y: 200 },
    ];
    expect(labelAnchor(pts)).toEqual({ x: 10, y: 100 });
  });
});

// ── layoutDiagram (integration) ──────────────────────────────────────────────
describe("layoutDiagram", () => {
  const nodes: DiagramNode[] = [
    { id: "in", label: "Request", x: 0, y: 0, kind: "input" },
    { id: "lb", label: "Load Balancer", x: 1, y: 0, kind: "process" },
    { id: "db", label: "Postgres", x: 2, y: 1, kind: "store" },
  ];
  const edges: DiagramEdge[] = [
    { from: "in", to: "lb", label: "HTTP", kind: "data" },
    { from: "lb", to: "db", label: "query", kind: "control" },
  ];

  test("throws on empty node set", () => {
    expect(() => layoutDiagram([], [])).toThrow(/at least one node/);
  });

  test("lays out every node with a positive box + center", () => {
    const l = layoutDiagram(nodes, edges);
    expect(l.nodes).toHaveLength(3);
    for (const n of l.nodes) {
      expect(n.width).toBeGreaterThan(0);
      expect(n.height).toBeGreaterThan(0);
      // center is the box mid-point
      expect(n.cx).toBeCloseTo(n.x + n.width / 2);
      expect(n.cy).toBeCloseTo(n.y + n.height / 2);
    }
  });

  test("routes each valid edge and preserves kind + label", () => {
    const l = layoutDiagram(nodes, edges);
    expect(l.edges).toHaveLength(2);
    expect(l.edges[0]!.kind).toBe("data");
    expect(l.edges[0]!.label).toBe("HTTP");
    expect(l.edges[1]!.kind).toBe("control");
    for (const e of l.edges) expect(e.points.length).toBeGreaterThanOrEqual(2);
  });

  test("defaults missing edge.kind to data and node.kind to default", () => {
    const l = layoutDiagram([{ id: "a", label: "A", x: 0, y: 0 }, { id: "b", label: "B", x: 1, y: 0 }], [
      { from: "a", to: "b" },
    ]);
    expect(l.edges[0]!.kind).toBe("data");
    expect(l.nodes[0]!.kind).toBe("default");
  });

  test("skips edges referencing an unknown node (never throws)", () => {
    const l = layoutDiagram(nodes, [{ from: "in", to: "ghost" }, { from: "in", to: "lb" }]);
    expect(l.edges).toHaveLength(1);
    expect(l.edges[0]!.to).toBe("lb");
  });

  test("viewBox tightly frames all content with the margin", () => {
    const l = layoutDiagram(nodes, edges, { margin: 30 });
    const parts = l.viewBox.split(" ").map(Number);
    expect(parts).toHaveLength(4);
    const [vx, vy, vw, vh] = parts as [number, number, number, number];
    expect(vw).toBeGreaterThan(0);
    expect(vh).toBeGreaterThan(0);
    // every node box lies within the viewBox bounds
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(vx);
      expect(n.y).toBeGreaterThanOrEqual(vy);
      expect(n.x + n.width).toBeLessThanOrEqual(vx + vw + 0.01);
      expect(n.y + n.height).toBeLessThanOrEqual(vy + vh + 0.01);
    }
    // width/height mirror the viewBox dims
    expect(l.width).toBeCloseTo(vw);
    expect(l.height).toBeCloseTo(vh);
  });

  test("is deterministic — same input yields byte-identical viewBox + geometry", () => {
    const a = layoutDiagram(nodes, edges);
    const b = layoutDiagram(nodes, edges);
    expect(a.viewBox).toBe(b.viewBox);
    expect(JSON.stringify(a.edges)).toBe(JSON.stringify(b.edges));
    expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
  });

  test("scales with cell size (bigger cells → wider layout)", () => {
    const small = layoutDiagram(nodes, edges, { cellW: 100 });
    const big = layoutDiagram(nodes, edges, { cellW: 300 });
    expect(big.width).toBeGreaterThan(small.width);
  });
});

// ── polylinePath ─────────────────────────────────────────────────────────────
describe("polylinePath", () => {
  test("emits an M then L commands", () => {
    const d = polylinePath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]);
    expect(d).toBe("M 0 0 L 10 0 L 10 20");
  });
});
