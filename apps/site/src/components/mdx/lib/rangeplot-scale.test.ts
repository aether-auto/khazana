// apps/site/src/components/mdx/lib/rangeplot-scale.test.ts
import { describe, expect, test } from "vitest";
import {
  layoutRangePlot,
  projectX,
  niceTicks,
  formatRangeValue,
  type RangeDatum,
} from "./rangeplot-scale.js";

const data: RangeDatum[] = [
  { label: "Model A", low: 10, mid: 18, high: 24, n: 40 },
  { label: "Model B", low: 14, mid: 20, high: 31 },
  { label: "Model C", low: 8, mid: 12, high: 16, n: 12 },
];

describe("projectX", () => {
  test("domain endpoints map to plot edges", () => {
    expect(projectX(0, 0, 100, 50, 550)).toBe(50);
    expect(projectX(100, 0, 100, 50, 550)).toBe(550);
  });
  test("degenerate domain maps to plot center", () => {
    expect(projectX(5, 5, 5, 50, 550)).toBe(300);
  });
});

describe("niceTicks", () => {
  test("returns rounded step ticks within range", () => {
    const t = niceTicks(0, 100, 5);
    expect(t[0]).toBe(0);
    expect(t).toContain(20);
    expect(t[t.length - 1]).toBeLessThanOrEqual(100);
  });
  test("degenerate range returns single value", () => {
    expect(niceTicks(7, 7)).toEqual([7]);
  });
  test("ticks are strictly increasing", () => {
    const t = niceTicks(3.2, 47.8, 5);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });
});

describe("layoutRangePlot", () => {
  test("throws on empty data", () => {
    expect(() => layoutRangePlot([])).toThrow(/at least one/);
  });
  test("throws when low > high", () => {
    expect(() => layoutRangePlot([{ label: "bad", low: 5, mid: 4, high: 3 }])).toThrow(/low must be/);
  });
  test("throws on non-finite bound", () => {
    expect(() => layoutRangePlot([{ label: "x", low: 0, mid: Infinity, high: 2 }])).toThrow(/finite/);
  });
  test("xLow ≤ xMid ≤ xHigh for every row", () => {
    const l = layoutRangePlot(data);
    for (const r of l.rows) {
      expect(r.xLow).toBeLessThanOrEqual(r.xMid);
      expect(r.xMid).toBeLessThanOrEqual(r.xHigh);
    }
  });
  test("rows are vertically stacked by rowStep", () => {
    const l = layoutRangePlot(data, { rowStep: 40, topPad: 26 });
    expect(l.rows[1].y - l.rows[0].y).toBe(40);
  });
  test("domain is padded beyond the raw extremes", () => {
    const l = layoutRangePlot(data);
    expect(l.domainMin).toBeLessThan(8); // rawMin
    expect(l.domainMax).toBeGreaterThan(31); // rawMax
  });
  test("all bounds render inside the plotting band", () => {
    const l = layoutRangePlot(data);
    for (const r of l.rows) {
      expect(r.xLow).toBeGreaterThanOrEqual(l.plotLeft);
      expect(r.xHigh).toBeLessThanOrEqual(l.plotRight);
    }
  });
  test("carries n through to the row for the readout", () => {
    const l = layoutRangePlot(data);
    expect(l.rows[0].n).toBe(40);
    expect(l.rows[1].n).toBeUndefined();
  });
});

describe("formatRangeValue", () => {
  test("integers stay clean", () => {
    expect(formatRangeValue(20)).toBe("20");
  });
  test("small magnitudes keep more precision", () => {
    expect(formatRangeValue(0.1234)).toBe("0.123");
    expect(formatRangeValue(3.14159)).toBe("3.14");
    expect(formatRangeValue(123.45)).toBe("123.5");
  });
});
