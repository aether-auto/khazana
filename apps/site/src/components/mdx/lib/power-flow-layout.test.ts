// apps/site/src/components/mdx/lib/power-flow-layout.test.ts
//
// Pure-geometry tests for the <PowerFlow> layout: branch/tier placement,
// optional electoral/other columns, intra-cell placement + determinism,
// viewBox bounds, unknown-endpoint handling, relation preservation, and distinct
// opposite-direction curves.
import { describe, expect, test } from "vitest";
import {
  layoutPowerFlow,
  type PowerFlowInstitution,
} from "./power-flow-layout.js";
import type { PowerFlowEdge } from "@khazana/core";

// A compact but branch/tier-spanning institution set (no provenance needed — the
// layout only reads id/name/branch/tier).
const insts: PowerFlowInstitution[] = [
  { id: "hos", name: "President", branch: "executive", tier: "national" },
  { id: "hog", name: "Prime Minister", branch: "executive", tier: "national" },
  { id: "lower", name: "Lower House", branch: "legislative", tier: "national" },
  { id: "upper", name: "Upper House", branch: "legislative", tier: "national" },
  { id: "apex", name: "Supreme Court", branch: "judicial", tier: "national" },
  { id: "state-exec", name: "Governor", branch: "executive", tier: "state" },
];

function edge(from: string, to: string, relation: PowerFlowEdge["relation"]): PowerFlowEdge {
  // provenance is not read by the layout; a minimal object satisfies the field.
  return { from, to, relation, provenance: {} as PowerFlowEdge["provenance"] };
}

describe("branch columns + tier rows", () => {
  test("columns follow canonical GOV_BRANCHES order, rows follow GOV_TIERS", () => {
    const layout = layoutPowerFlow(insts, []);
    expect(layout.columns.map((c) => c.branch)).toEqual(["executive", "legislative", "judicial"]);
    expect(layout.rows.map((r) => r.tier)).toEqual(["national", "state"]);
    // columns are ordered left→right by center x
    const xs = layout.columns.map((c) => c.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // rows are ordered top→bottom by center y
    const ys = layout.rows.map((r) => r.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  test("a node lands in the column of its branch and row of its tier", () => {
    const layout = layoutPowerFlow(insts, []);
    const execCol = layout.columns.find((c) => c.branch === "executive")!;
    const legCol = layout.columns.find((c) => c.branch === "legislative")!;
    const nationalRow = layout.rows.find((r) => r.tier === "national")!;
    const stateRow = layout.rows.find((r) => r.tier === "state")!;

    const hos = layout.nodes.find((n) => n.id === "hos")!;
    expect(hos.cx).toBe(execCol.x);
    // national-tier node sits in the national row band
    expect(hos.cy).toBeGreaterThanOrEqual(nationalRow.top);
    expect(hos.cy).toBeLessThanOrEqual(nationalRow.top + nationalRow.height);

    const lower = layout.nodes.find((n) => n.id === "lower")!;
    expect(lower.cx).toBe(legCol.x);

    const stateExec = layout.nodes.find((n) => n.id === "state-exec")!;
    expect(stateExec.cx).toBe(execCol.x); // same branch column
    expect(stateExec.cy).toBeGreaterThanOrEqual(stateRow.top);
    expect(stateExec.cy).toBeLessThanOrEqual(stateRow.top + stateRow.height);
    // state tier is strictly below national tier
    expect(stateExec.cy).toBeGreaterThan(hos.cy);
  });
});

describe("optional electoral / other columns", () => {
  test("electoral + other columns are absent when no institution has that branch", () => {
    const layout = layoutPowerFlow(insts, []);
    const branches = layout.columns.map((c) => c.branch);
    expect(branches).not.toContain("electoral");
    expect(branches).not.toContain("other");
  });

  test("an electoral-branch institution adds the electoral column in canonical position", () => {
    const withElectoral: PowerFlowInstitution[] = [
      ...insts,
      { id: "eci", name: "Election Commission", branch: "electoral", tier: "national" },
    ];
    const layout = layoutPowerFlow(withElectoral, []);
    expect(layout.columns.map((c) => c.branch)).toEqual([
      "executive",
      "legislative",
      "judicial",
      "electoral",
    ]);
  });
});

describe("intra-cell placement", () => {
  test("two institutions in one cell get non-overlapping boxes, stable id order", () => {
    // hos + hog share (executive, national)
    const layout = layoutPowerFlow(insts, []);
    const hos = layout.nodes.find((n) => n.id === "hos")!;
    const hog = layout.nodes.find((n) => n.id === "hog")!;
    // stable sort by id: "hog" < "hos" → hog is placed above hos
    expect(hog.y).toBeLessThan(hos.y);
    // no vertical overlap between the stacked boxes
    const hogBottom = hog.y + hog.height;
    expect(hogBottom).toBeLessThanOrEqual(hos.y + 0.01);
    // both share the same column center x
    expect(hog.cx).toBe(hos.cx);
  });
});

describe("determinism", () => {
  test("same input yields byte-identical layout across runs", () => {
    const edges = [edge("hos", "lower", "dissolves"), edge("lower", "hos", "elects")];
    const a = layoutPowerFlow(insts, edges);
    const b = layoutPowerFlow(insts, edges);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("viewBox bounds", () => {
  test("every node box lies inside the content viewBox", () => {
    const layout = layoutPowerFlow(insts, [edge("hos", "apex", "appoints")]);
    const [vx, vy, vw, vh] = layout.viewBox.split(" ").map(Number) as [number, number, number, number];
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(vx);
      expect(n.y).toBeGreaterThanOrEqual(vy);
      expect(n.x + n.width).toBeLessThanOrEqual(vx + vw + 0.01);
      expect(n.y + n.height).toBeLessThanOrEqual(vy + vh + 0.01);
    }
    expect(vw).toBeGreaterThan(0);
    expect(vh).toBeGreaterThan(0);
  });
});

describe("unknown-endpoint handling", () => {
  test("edges referencing a missing institution are skipped, not thrown", () => {
    const edges = [edge("hos", "ghost", "appoints"), edge("hos", "apex", "appoints")];
    const layout = layoutPowerFlow(insts, edges);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]!.from).toBe("hos");
    expect(layout.edges[0]!.to).toBe("apex");
  });
});

describe("relation preservation", () => {
  test("each route carries its source edge's relation untouched", () => {
    const edges = [
      edge("hos", "lower", "dissolves"),
      edge("upper", "apex", "confirms"),
      edge("lower", "hog", "confidence"),
    ];
    const layout = layoutPowerFlow(insts, edges);
    const relByPair = new Map(layout.edges.map((r) => [`${r.from}->${r.to}`, r.relation]));
    expect(relByPair.get("hos->lower")).toBe("dissolves");
    expect(relByPair.get("upper->apex")).toBe("confirms");
    expect(relByPair.get("lower->hog")).toBe("confidence");
  });
});

describe("distinct opposite-direction curves", () => {
  test("A→B and B→A get opposite-sign bows and different path d", () => {
    const edges = [edge("hos", "lower", "dissolves"), edge("lower", "hos", "elects")];
    const layout = layoutPowerFlow(insts, edges);
    const ab = layout.edges.find((e) => e.from === "hos" && e.to === "lower")!;
    const ba = layout.edges.find((e) => e.from === "lower" && e.to === "hos")!;
    expect(ab.d).not.toBe(ba.d);
    // opposite bow sides
    expect(Math.sign(ab.lane)).toBe(-Math.sign(ba.lane));
    expect(ab.lane).not.toBe(0);
  });

  test("a 3-cycle keeps all three curves distinct", () => {
    const edges = [
      edge("hos", "lower", "dissolves"),
      edge("lower", "apex", "elects"),
      edge("apex", "hos", "reviews"),
    ];
    const layout = layoutPowerFlow(insts, edges);
    const ds = new Set(layout.edges.map((e) => e.d));
    expect(ds.size).toBe(3);
  });
});
