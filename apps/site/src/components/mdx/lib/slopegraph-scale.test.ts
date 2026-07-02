// apps/site/src/components/mdx/lib/slopegraph-scale.test.ts
import { describe, expect, test } from "vitest";
import {
  layoutSlopegraph,
  projectValue,
  slopeDirection,
  deCollideColumn,
  formatSlopeValue,
  type SlopeDatum,
} from "./slopegraph-scale.js";

const data: SlopeDatum[] = [
  { label: "Rust", before: 5, after: 2 },
  { label: "Go", before: 3, after: 3 },
  { label: "Zig", before: 8, after: 1 },
];

describe("projectValue", () => {
  test("max maps to top, min maps to bottom", () => {
    expect(projectValue(10, 0, 10, 40, 400)).toBe(40);
    expect(projectValue(0, 0, 10, 40, 400)).toBe(400);
  });
  test("midpoint maps to band center", () => {
    expect(projectValue(5, 0, 10, 40, 400)).toBe(220);
  });
  test("degenerate range (max===min) maps to band center", () => {
    expect(projectValue(7, 7, 7, 40, 400)).toBe(220);
  });
});

describe("slopeDirection", () => {
  test("classifies up / down / flat", () => {
    expect(slopeDirection(1, 5)).toBe("up");
    expect(slopeDirection(5, 1)).toBe("down");
    expect(slopeDirection(3, 3)).toBe("flat");
  });
});

describe("layoutSlopegraph", () => {
  test("throws on empty data", () => {
    expect(() => layoutSlopegraph([])).toThrow(/at least one/);
  });
  test("throws on non-finite value", () => {
    expect(() => layoutSlopegraph([{ label: "x", before: NaN, after: 1 }])).toThrow(/finite/);
  });
  test("computes min/max across before+after", () => {
    const l = layoutSlopegraph(data);
    expect(l.min).toBe(1);
    expect(l.max).toBe(8);
  });
  test("endpoints share the two column x's; before on left, after on right", () => {
    const l = layoutSlopegraph(data, { width: 720, colInset: 150 });
    expect(l.x1).toBe(150);
    expect(l.x2).toBe(570);
    for (const r of l.rows) {
      expect(r.x1).toBe(150);
      expect(r.x2).toBe(570);
      expect(r.x1).toBeLessThan(r.x2);
    }
  });
  test("higher value sits higher on screen (smaller y)", () => {
    const l = layoutSlopegraph(data);
    const zig = l.rows.find((r) => r.label === "Zig")!;
    // before=8 (max) → top; after=1 (min) → bottom
    expect(zig.y1).toBe(l.top);
    expect(zig.y2).toBe(l.bottom);
  });
  test("direction is carried on each row", () => {
    const l = layoutSlopegraph(data);
    expect(l.rows.find((r) => r.label === "Rust")!.dir).toBe("down");
    expect(l.rows.find((r) => r.label === "Go")!.dir).toBe("flat");
  });
  test("all endpoints stay within [top, bottom]", () => {
    const l = layoutSlopegraph(data);
    for (const r of l.rows) {
      expect(r.y1).toBeGreaterThanOrEqual(l.top);
      expect(r.y1).toBeLessThanOrEqual(l.bottom);
      expect(r.y2).toBeGreaterThanOrEqual(l.top);
      expect(r.y2).toBeLessThanOrEqual(l.bottom);
    }
  });
});

describe("deCollideColumn", () => {
  test("keeps already-separated labels put", () => {
    expect(deCollideColumn([0, 50, 100], 20)).toEqual([0, 50, 100]);
  });
  test("pushes overlapping labels down by minGap, preserving input order", () => {
    const out = deCollideColumn([100, 105, 108], 20);
    // sorted starts at 100, then 120, then 140 — mapped back to input order
    expect(out).toEqual([100, 120, 140]);
  });
  test("respects the minimum gap between adjacent placed labels", () => {
    const out = deCollideColumn([0, 1, 2, 3], 10);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(10 - 1e-9);
    }
  });
});

describe("formatSlopeValue", () => {
  test("keeps integers clean", () => {
    expect(formatSlopeValue(42)).toBe("42");
  });
  test("trims decimals sensibly by magnitude", () => {
    expect(formatSlopeValue(3.14159)).toBe("3.14");
    expect(formatSlopeValue(123.456)).toBe("123.5");
  });
});
