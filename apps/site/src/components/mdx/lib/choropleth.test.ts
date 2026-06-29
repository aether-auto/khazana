// apps/site/src/components/mdx/lib/choropleth.test.ts
import { describe, expect, test } from "vitest";
import {
  buildChoropleth,
  NO_DATA_FILL,
  graticuleLatitudes,
  formatReadout,
} from "./choropleth.js";

const values = { USA: 100, FRA: 50, BRA: 0 };

test("derives domain [min,max] across provided values", () => {
  const c = buildChoropleth(values);
  expect(c.domain).toEqual([0, 100]);
});

test("max value gets the most saturated amber, min the faintest", () => {
  const c = buildChoropleth(values);
  const hi = c.fill("USA");
  const lo = c.fill("BRA");
  expect(hi).not.toBe(lo);
  expect(hi).toMatch(/oklab|rgb|var\(/i);
});

test("unknown iso3 => NO_DATA_FILL", () => {
  const c = buildChoropleth(values);
  expect(c.fill("ZZZ")).toBe(NO_DATA_FILL);
});

test("interpolation is monotonic: higher value => higher amber weight", () => {
  const c = buildChoropleth({ A: 0, B: 25, C: 50, D: 100 });
  const weight = (iso: string) => Number(c.fill(iso).match(/(\d+(?:\.\d+)?)%/)?.[1] ?? "0");
  expect(weight("A")).toBeLessThan(weight("B"));
  expect(weight("B")).toBeLessThan(weight("C"));
  expect(weight("C")).toBeLessThan(weight("D"));
});

test("flat domain (all equal) does not divide by zero", () => {
  const c = buildChoropleth({ A: 7, B: 7 });
  expect(() => c.fill("A")).not.toThrow();
  expect(c.fill("A")).toMatch(/%/);
});

test("empty values => everything is NO_DATA_FILL", () => {
  const c = buildChoropleth({});
  expect(c.fill("USA")).toBe(NO_DATA_FILL);
});

describe("graticuleLatitudes — latitude reference lines", () => {
  test("always includes the equator (0°) and marks it major", () => {
    const lines = graticuleLatitudes();
    const equator = lines.find((l) => l.lat === 0);
    expect(equator).toBeDefined();
    expect(equator?.major).toBe(true);
  });

  test("is symmetric north/south and sorted from north to south", () => {
    const lats = graticuleLatitudes().map((l) => l.lat);
    // sorted descending (north at top of the SVG, south at bottom)
    expect([...lats].sort((a, b) => b - a)).toEqual(lats);
    // symmetric: for every +lat there is a matching -lat
    for (const lat of lats) {
      if (lat !== 0) expect(lats).toContain(-lat);
    }
  });

  test("stays within the projection's drawable band (|lat| < 90)", () => {
    for (const { lat } of graticuleLatitudes()) {
      expect(Math.abs(lat)).toBeLessThan(90);
    }
  });

  test("labels carry hemisphere suffix and a bare Equator label", () => {
    const lines = graticuleLatitudes();
    expect(lines.find((l) => l.lat === 0)?.label).toBe("Equator");
    const north = lines.find((l) => l.lat > 0);
    const south = lines.find((l) => l.lat < 0);
    expect(north?.label).toMatch(/°\s?N$/);
    expect(south?.label).toMatch(/°\s?S$/);
  });
});

describe("formatReadout — hover/focus readout text", () => {
  const values = { USA: 95, CUB: 80 };
  const labels = { USA: "United States", CUB: "Cuba — aurora overhead" };

  test("returns null when nothing is hovered (no dangling dash)", () => {
    expect(formatReadout(null, values, labels)).toBeNull();
  });

  test("returns null for a country with no data (raw ISO code suppressed)", () => {
    // TZA (Tanzania) is a real path but absent from the dataset.
    expect(formatReadout("TZA", values, labels)).toBeNull();
  });

  test("uses the label and value for an in-data country", () => {
    expect(formatReadout("USA", values, labels)).toBe("United States: 95");
  });

  test("falls back to the iso3 when in data but unlabelled", () => {
    expect(formatReadout("CUB", { CUB: 80 }, {})).toBe("CUB: 80");
  });
});
