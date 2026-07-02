// apps/site/src/components/mdx/lib/sankey-layout.test.ts
import { describe, expect, test } from "vitest";
import {
  layoutSankey,
  validateSankeyInput,
  formatFlowValue,
  formatShare,
  type SankeyNodeInput,
  type SankeyLinkInput,
} from "./sankey-layout.js";

// A small, valid budget-allocation DAG: Budget → {Eng, Sales} → sub-buckets.
const nodes: SankeyNodeInput[] = [
  { id: "budget", label: "Budget" },
  { id: "eng", label: "Engineering" },
  { id: "sales", label: "Sales" },
  { id: "salaries", label: "Salaries" },
  { id: "cloud", label: "Cloud" },
  { id: "ads", label: "Ads" },
];
const links: SankeyLinkInput[] = [
  { source: "budget", target: "eng", value: 60 },
  { source: "budget", target: "sales", value: 40 },
  { source: "eng", target: "salaries", value: 45 },
  { source: "eng", target: "cloud", value: 15 },
  { source: "sales", target: "salaries", value: 25 },
  { source: "sales", target: "ads", value: 15 },
];

describe("validateSankeyInput", () => {
  test("accepts a well-formed DAG and maps ids to indices", () => {
    const { idToIndex, labelOf } = validateSankeyInput(nodes, links);
    expect(idToIndex.get("budget")).toBe(0);
    expect(idToIndex.get("ads")).toBe(5);
    expect(labelOf("eng")).toBe("Engineering");
  });

  test("label falls back to id when omitted", () => {
    const { labelOf } = validateSankeyInput(
      [{ id: "x" }, { id: "y" }],
      [{ source: "x", target: "y", value: 1 }],
    );
    expect(labelOf("x")).toBe("x");
  });

  test("throws on empty nodes", () => {
    expect(() => validateSankeyInput([], links)).toThrow(/at least one node/);
  });

  test("throws on empty links", () => {
    expect(() => validateSankeyInput(nodes, [])).toThrow(/at least one link/);
  });

  test("throws on duplicate node id", () => {
    expect(() =>
      validateSankeyInput([{ id: "a" }, { id: "a" }], [{ source: "a", target: "a", value: 1 }]),
    ).toThrow(/duplicate node id "a"/);
  });

  test("throws on a link referencing an unknown source", () => {
    expect(() =>
      validateSankeyInput(nodes, [{ source: "ghost", target: "eng", value: 1 }]),
    ).toThrow(/unknown source "ghost"/);
  });

  test("throws on a link referencing an unknown target", () => {
    expect(() =>
      validateSankeyInput(nodes, [{ source: "budget", target: "ghost", value: 1 }]),
    ).toThrow(/unknown target "ghost"/);
  });

  test("throws on a self-loop", () => {
    expect(() =>
      validateSankeyInput([{ id: "a" }, { id: "b" }], [{ source: "a", target: "a", value: 1 }]),
    ).toThrow(/self-loop on node "a"/);
  });

  test("throws on a non-positive value", () => {
    expect(() =>
      validateSankeyInput(nodes, [{ source: "budget", target: "eng", value: 0 }]),
    ).toThrow(/positive finite value/);
  });

  test("throws on a NaN value", () => {
    expect(() =>
      validateSankeyInput(nodes, [{ source: "budget", target: "eng", value: NaN }]),
    ).toThrow(/positive finite value/);
  });

  test("throws on a cyclic graph", () => {
    const cyc: SankeyLinkInput[] = [
      { source: "a", target: "b", value: 1 },
      { source: "b", target: "c", value: 1 },
      { source: "c", target: "a", value: 1 },
    ];
    expect(() =>
      validateSankeyInput([{ id: "a" }, { id: "b" }, { id: "c" }], cyc),
    ).toThrow(/acyclic/);
  });

  test("a diamond DAG (shared target, no cycle) is accepted", () => {
    const diamond: SankeyLinkInput[] = [
      { source: "a", target: "b", value: 1 },
      { source: "a", target: "c", value: 1 },
      { source: "b", target: "d", value: 1 },
      { source: "c", target: "d", value: 1 },
    ];
    expect(() =>
      validateSankeyInput([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], diamond),
    ).not.toThrow();
  });
});

describe("layoutSankey", () => {
  const layout = layoutSankey(nodes, links);

  test("returns one laid-out node per input node", () => {
    expect(layout.nodes).toHaveLength(nodes.length);
  });

  test("returns one laid-out link per input link", () => {
    expect(layout.links).toHaveLength(links.length);
  });

  test("grand total is the sum of all link values", () => {
    // 60+40+45+15+25+15 = 200 (every flow counts toward the total the shares
    // are measured against; the shares therefore sum to exactly 1).
    expect(layout.total).toBe(200);
  });

  test("each link's share sums with siblings to ~1 across the whole graph", () => {
    const sum = layout.links.reduce((s, l) => s + l.share, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  test("a specific link carries the right value + share", () => {
    const l = layout.links.find((x) => x.source === "budget" && x.target === "eng")!;
    expect(l.value).toBe(60);
    expect(l.share).toBeCloseTo(60 / 200, 10);
    expect(l.sourceLabel).toBe("Budget");
    expect(l.targetLabel).toBe("Engineering");
  });

  test("every laid-out node has finite coordinates within the viewBox", () => {
    for (const n of layout.nodes) {
      for (const v of [n.x0, n.x1, n.y0, n.y1, n.labelX, n.labelY]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(n.x0).toBeGreaterThanOrEqual(0);
      expect(n.x1).toBeLessThanOrEqual(layout.width);
      expect(n.y0).toBeGreaterThanOrEqual(0);
      expect(n.y1).toBeLessThanOrEqual(layout.height);
    }
  });

  test("source-column nodes label to the right, sink-column to the left", () => {
    const budget = layout.nodes.find((n) => n.id === "budget")!;
    const salaries = layout.nodes.find((n) => n.id === "salaries")!;
    expect(budget.labelSide).toBe("right");
    expect(salaries.labelSide).toBe("left");
  });

  test("every link produces a non-empty SVG path and a >=1 width", () => {
    for (const l of layout.links) {
      expect(l.path.length).toBeGreaterThan(0);
      expect(l.path.startsWith("M")).toBe(true);
      expect(l.width).toBeGreaterThanOrEqual(1);
    }
  });

  test("node ids are resolved back to strings (not d3 indices)", () => {
    for (const l of layout.links) {
      expect(typeof l.source).toBe("string");
      expect(typeof l.target).toBe("string");
      expect(nodes.some((n) => n.id === l.source)).toBe(true);
      expect(nodes.some((n) => n.id === l.target)).toBe(true);
    }
  });

  test("honors custom width/height in the viewBox", () => {
    const wide = layoutSankey(nodes, links, { width: 1000, height: 500 });
    expect(wide.width).toBe(1000);
    expect(wide.height).toBe(500);
    for (const n of wide.nodes) {
      expect(n.x1).toBeLessThanOrEqual(1000);
      expect(n.y1).toBeLessThanOrEqual(500);
    }
  });
});

describe("formatFlowValue", () => {
  test("integers pass through", () => {
    expect(formatFlowValue(160)).toBe("160");
    expect(formatFlowValue(0)).toBe("0");
  });
  test("small fractions get 3 decimals", () => {
    expect(formatFlowValue(0.12345)).toBe("0.123");
  });
  test("mid magnitudes get 2 decimals", () => {
    expect(formatFlowValue(4.567)).toBe("4.57");
  });
  test("large magnitudes get 1 decimal", () => {
    expect(formatFlowValue(42.678)).toBe("42.7");
  });
});

describe("formatShare", () => {
  test("formats a mid share to one decimal percent", () => {
    expect(formatShare(0.375)).toBe("37.5%");
  });
  test("formats a small share to one decimal percent", () => {
    expect(formatShare(0.031)).toBe("3.1%");
  });
  test("clamps a full share to 100%", () => {
    expect(formatShare(1)).toBe("100%");
  });
  test("zero is 0%", () => {
    expect(formatShare(0)).toBe("0%");
  });
});
