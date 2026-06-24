// apps/site/src/components/mdx/lib/chart-spec.test.ts
import { expect, test } from "vitest";
import { normalizeChartSpec, KHAZANA_SERIES } from "./chart-spec.js";

const data = [
  { year: 2020, value: 3, series: "a" },
  { year: 2021, value: 5, series: "a" },
  { year: 2020, value: 2, series: "b" },
  { year: 2021, value: 8, series: "b" },
];

test("line mark builds Plot marks with x/y/stroke channels", () => {
  const spec = normalizeChartSpec({
    data,
    mark: "line",
    x: "year",
    y: "value",
    series: "series",
  });
  expect(spec.marks).toHaveLength(2); // ruleY baseline + the line
  const line = spec.marks[1];
  expect(line.type).toBe("line");
  expect(line.options.x).toBe("year");
  expect(line.options.y).toBe("value");
  expect(line.options.stroke).toBe("series");
});

test("bar mark uses barY and includes a y baseline rule", () => {
  const spec = normalizeChartSpec({ data, mark: "bar", x: "year", y: "value" });
  expect(spec.marks[0].type).toBe("ruleY");
  expect(spec.marks[1].type).toBe("barY");
});

test("color domain is the sorted distinct series values, range = khazana palette", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value", series: "series" });
  expect(spec.color?.domain).toEqual(["a", "b"]);
  expect(spec.color?.range).toEqual(KHAZANA_SERIES.slice(0, 2));
});

test("no series => single-accent stroke, no color scale", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value" });
  expect(spec.color).toBeUndefined();
  expect(spec.marks[1].options.stroke).toBe(KHAZANA_SERIES[0]);
});

test("defaults: responsive height, mono tick font, no gridlines by default", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value" });
  expect(spec.height).toBe(320);
  expect(spec.style.fontFamily).toMatch(/mono/i);
  expect(spec.grid).toBe(false);
});

test("explicit caption + height + grid pass through", () => {
  const spec = normalizeChartSpec({
    data, mark: "bar", x: "year", y: "value", height: 240, grid: true, caption: "GDP",
  });
  expect(spec.height).toBe(240);
  expect(spec.grid).toBe(true);
  expect(spec.caption).toBe("GDP");
});

test("rejects unknown mark", () => {
  // @ts-expect-error invalid mark at the type level too
  expect(() => normalizeChartSpec({ data, mark: "pie", x: "year", y: "value" })).toThrow(/mark/i);
});

test("rejects empty data", () => {
  expect(() => normalizeChartSpec({ data: [], mark: "line", x: "year", y: "value" })).toThrow(/data/i);
});
