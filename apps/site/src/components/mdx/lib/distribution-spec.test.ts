// apps/site/src/components/mdx/lib/distribution-spec.test.ts
import { describe, expect, test } from "vitest";
import {
  buildDistributionSpec,
  extractValues,
  autoBinCount,
  computeBins,
  type DistributionProps,
} from "./distribution-spec.js";

const data: DistributionProps["data"] = [
  { latency: 10 },
  { latency: 12 },
  { latency: 15 },
  { latency: 15 },
  { latency: 20 },
  { latency: 22 },
  { latency: 30 },
  { latency: "not a number" },
  { latency: null },
];

const base: DistributionProps = { data, value: "latency" };

describe("extractValues", () => {
  test("keeps finite numbers, drops null/NaN/non-numeric", () => {
    expect(extractValues(data, "latency")).toEqual([10, 12, 15, 15, 20, 22, 30]);
  });
  test("empty column → empty", () => {
    expect(extractValues([{ a: 1 }], "b")).toEqual([]);
  });
});

describe("autoBinCount", () => {
  test("Sturges clamped to [5,40]", () => {
    expect(autoBinCount(1)).toBe(1);
    expect(autoBinCount(4)).toBe(5); // tiny → floor 5
    expect(autoBinCount(1_000_000)).toBeLessThanOrEqual(40);
    expect(autoBinCount(100)).toBeGreaterThanOrEqual(5);
  });
});

describe("computeBins", () => {
  test("uniform bins; counts sum to the value count", () => {
    const vals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bins = computeBins(vals, 5);
    expect(bins.length).toBe(5);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(vals.length);
    expect(bins[0]!.x0).toBe(0);
    expect(bins[4]!.x1).toBe(10);
  });
  test("max value lands in the final bin (right edge inclusive there)", () => {
    const bins = computeBins([0, 10], 2);
    expect(bins[1]!.count).toBe(1); // the 10
    expect(bins[0]!.count).toBe(1); // the 0
  });
  test("degenerate all-equal → single spike bin", () => {
    const bins = computeBins([5, 5, 5], 8);
    expect(bins.length).toBe(1);
    expect(bins[0]!.count).toBe(3);
  });
  test("empty / invalid inputs", () => {
    expect(computeBins([], 5)).toEqual([]);
    expect(computeBins([1, 2], 0)).toEqual([]);
  });
});

describe("buildDistributionSpec", () => {
  test("histogram is the default; extracts finite values + bins", () => {
    const spec = buildDistributionSpec(base);
    expect(spec.markType).toBe("hist");
    expect(spec.values.length).toBe(7);
    expect(spec.bins.reduce((s, b) => s + b.count, 0)).toBe(7);
    expect(spec.min).toBe(10);
    expect(spec.max).toBe(30);
    expect(spec.valueLabel).toBe("latency");
  });
  test("density mark honored; explicit bins used", () => {
    const spec = buildDistributionSpec({ ...base, mark: "density", bins: 8 });
    expect(spec.markType).toBe("density");
    expect(spec.binCount).toBe(8);
  });
  test("markers passed through", () => {
    const spec = buildDistributionSpec({ ...base, marker: [{ at: 18, label: "SLA" }] });
    expect(spec.markers).toEqual([{ at: 18, label: "SLA" }]);
  });
  test("throws on empty data / no numeric column / missing value", () => {
    expect(() => buildDistributionSpec({ ...base, data: [] })).toThrow(/non-empty/);
    expect(() => buildDistributionSpec({ ...base, value: "" })).toThrow(/value/);
    expect(() => buildDistributionSpec({ data: [{ a: "x" }], value: "a" })).toThrow(/finite/);
  });
});
