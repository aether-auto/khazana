// apps/site/src/components/mdx/lib/small-multiples-spec.test.ts
import { describe, expect, test } from "vitest";
import {
  buildSmallMultiplesSpec,
  distinctFacets,
  gridColumns,
  facetGrid,
  facetSummary,
  humanizeLabel,
  type SmallMultiplesProps,
} from "./small-multiples-spec.js";

const data: SmallMultiplesProps["data"] = [
  { region: "west", year: 2020, sales: 3 },
  { region: "west", year: 2021, sales: 5 },
  { region: "east", year: 2020, sales: 2 },
  { region: "east", year: 2021, sales: 8 },
  { region: "north", year: 2020, sales: 1 },
];

const base: SmallMultiplesProps = { data, mark: "line", x: "year", y: "sales", facet: "region" };

describe("distinctFacets", () => {
  test("distinct + numeric-aware sort", () => {
    expect(distinctFacets(data, "region")).toEqual(["east", "north", "west"]);
    const nums = [{ f: "A10" }, { f: "A2" }, { f: "A2" }];
    expect(distinctFacets(nums, "f")).toEqual(["A2", "A10"]);
  });
});

describe("gridColumns", () => {
  test("honors explicit request clamped to [1,n]", () => {
    expect(gridColumns(5, 3)).toBe(3);
    expect(gridColumns(5, 99)).toBe(5);
    expect(gridColumns(5, 0)).toBe(1);
  });
  test("auto picks near-square, capped at 4", () => {
    expect(gridColumns(4)).toBe(2);
    expect(gridColumns(9)).toBe(3);
    expect(gridColumns(20)).toBe(4); // capped so it reflows into rows, not width
    expect(gridColumns(1)).toBe(1);
  });
  test("degenerate n", () => {
    expect(gridColumns(0)).toBe(1);
  });
});

describe("facetGrid", () => {
  test("assigns zero-padded col/row indices that sort correctly", () => {
    const facets = ["a", "b", "c", "d", "e"];
    const grid = facetGrid(facets, 2);
    expect(grid.get("a")).toEqual({ col: "00", row: "00" });
    expect(grid.get("b")).toEqual({ col: "01", row: "00" });
    expect(grid.get("c")).toEqual({ col: "00", row: "01" });
    expect(grid.get("e")).toEqual({ col: "00", row: "02" });
  });
  test("padding keeps ordinal string sort correct past 10 columns", () => {
    const facets = Array.from({ length: 12 }, (_, i) => `f${i}`);
    const grid = facetGrid(facets, 11);
    // 11th facet is col "10", which must sort after "09" as a string
    expect(grid.get("f10")).toEqual({ col: "10", row: "00" });
    expect("10" > "09").toBe(true);
  });
});

describe("facetSummary", () => {
  test("one row per facet with its point count", () => {
    expect(facetSummary(data, "region")).toEqual([
      { facet: "east", count: 2 },
      { facet: "north", count: 1 },
      { facet: "west", count: 2 },
    ]);
  });
});

describe("humanizeLabel", () => {
  test("camel + snake", () => {
    expect(humanizeLabel("fpRate")).toBe("fp rate");
    expect(humanizeLabel("growth_rate")).toBe("growth rate");
  });
});

describe("buildSmallMultiplesSpec", () => {
  test("builds a spec with sorted facets, defaults sharedY true", () => {
    const spec = buildSmallMultiplesSpec(base);
    expect(spec.facets).toEqual(["east", "north", "west"]);
    expect(spec.sharedY).toBe(true);
    expect(spec.markType).toBe("line");
    expect(spec.noFill).toBe(true);
    expect(spec.height).toBeGreaterThan(0);
  });
  test("mark aliases + fill assignment", () => {
    expect(buildSmallMultiplesSpec({ ...base, mark: "barY" as never }).markType).toBe("barY");
    expect(buildSmallMultiplesSpec({ ...base, mark: "bar" }).noFill).toBe(false);
    expect(buildSmallMultiplesSpec({ ...base, mark: "dot" }).noFill).toBe(true);
  });
  test("respects explicit columns + sharedY false", () => {
    const spec = buildSmallMultiplesSpec({ ...base, columns: 1, sharedY: false });
    expect(spec.columns).toBe(1);
    expect(spec.sharedY).toBe(false);
  });
  test("throws on empty data / unknown mark / missing facet", () => {
    expect(() => buildSmallMultiplesSpec({ ...base, data: [] })).toThrow(/non-empty/);
    expect(() => buildSmallMultiplesSpec({ ...base, mark: "pie" as never })).toThrow(/unknown mark/);
    expect(() => buildSmallMultiplesSpec({ ...base, facet: "" })).toThrow(/facet/);
  });
});
