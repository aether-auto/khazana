// apps/site/src/components/mdx/lib/choropleth.test.ts
import { expect, test } from "vitest";
import { buildChoropleth, NO_DATA_FILL } from "./choropleth.js";

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
