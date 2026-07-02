// apps/site/src/components/mdx/lib/scatter-spec.test.ts
import { describe, expect, test } from "vitest";
import {
  normalizeScatterSpec,
  scatterSummary,
  SCATTER_FIT_STROKE,
  type ScatterProps,
} from "./scatter-spec.js";

const base: ScatterProps = {
  data: [
    { gdp: 1, life: 60 },
    { gdp: 5, life: 72 },
    { gdp: 9, life: 81 },
  ],
  x: "gdp",
  y: "life",
};

describe("normalizeScatterSpec", () => {
  test("throws on empty data", () => {
    expect(() => normalizeScatterSpec({ ...base, data: [] })).toThrow(/non-empty/);
  });
  test("throws when x/y missing", () => {
    // @ts-expect-error intentional bad input
    expect(() => normalizeScatterSpec({ data: base.data, y: "life" })).toThrow(/required/);
  });
  test("defaults: no fit, hollow amber dots, r=3.5", () => {
    const s = normalizeScatterSpec(base);
    expect(s.fit).toBe(false);
    expect(s.dotOptions.fill).toBe("none");
    expect(s.dotOptions.stroke).toBe("var(--accent)");
    expect(s.dotOptions.r).toBe(3.5);
    expect(s.dotOptions.tip).toBe(true);
  });
  test('fit:"linear" enables the fit overlay', () => {
    expect(normalizeScatterSpec({ ...base, fit: "linear" }).fit).toBe(true);
  });
  test("size field is used as the radius channel", () => {
    const s = normalizeScatterSpec({ ...base, size: "pop" });
    expect(s.dotOptions.r).toBe("pop");
  });
  test("color field drives dot stroke + a color scale", () => {
    const s = normalizeScatterSpec({ ...base, color: "region" });
    expect(s.dotOptions.stroke).toBe("region");
    expect(s.color).toEqual({ field: "region" });
  });
  test("auto-derives axis labels from field names, overridable", () => {
    expect(normalizeScatterSpec(base).xLabel).toBe("gdp");
    expect(normalizeScatterSpec({ ...base, x: "gdpPerCapita" }).xLabel).toBe("gdp per capita");
    expect(normalizeScatterSpec({ ...base, xLabel: "GDP ($)" }).xLabel).toBe("GDP ($)");
  });
  test("default height is 340, overridable", () => {
    expect(normalizeScatterSpec(base).height).toBe(340);
    expect(normalizeScatterSpec({ ...base, height: 500 }).height).toBe(500);
  });
  test("fit stroke is the accent-dim token", () => {
    expect(SCATTER_FIT_STROKE).toBe("var(--accent-dim)");
  });
});

describe("scatterSummary", () => {
  test("describes the relationship + point count", () => {
    const s = scatterSummary(base);
    expect(s).toContain("scatter plot");
    expect(s).toContain("life vs gdp");
    expect(s).toContain("3 points");
  });
  test("mentions size, color, and fit encodings when present", () => {
    const s = scatterSummary({ ...base, size: "pop", color: "region", fit: "linear" });
    expect(s).toContain("sized by pop");
    expect(s).toContain("colored by region");
    expect(s).toContain("linear fit");
  });
});
