// apps/site/src/components/mdx/lib/chart-spec.test.ts
import { expect, test } from "vitest";
import {
  normalizeChartSpec,
  KHAZANA_SERIES,
  isCategoricalX,
  shouldRotateXLabels,
  rotatedMarginBottom,
  coerceNumericX,
  humanizeLabel,
} from "./chart-spec.js";

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

test("barY alias: normalizeChartSpec accepts mark='barY' as alias for 'bar'", () => {
  // Some MDX content uses the Plot-native "barY" name; the normalizer should
  // silently coerce it to "bar" rather than throwing.
  // @ts-expect-error intentionally passing a Plot alias, not the ChartMark type
  const spec = normalizeChartSpec({ data, mark: "barY", x: "year", y: "value" });
  expect(spec.marks[1].type).toBe("barY");
});

// ── isCategoricalX ───────────────────────────────────────────────────────────

test("isCategoricalX: numeric strings are NOT categorical", () => {
  const d = [{ x: "2020" }, { x: "2021" }, { x: "2022" }];
  expect(isCategoricalX(d, "x")).toBe(false);
});

test("isCategoricalX: numeric numbers are NOT categorical", () => {
  const d = [{ x: 2020 }, { x: 2021 }];
  expect(isCategoricalX(d, "x")).toBe(false);
});

test("isCategoricalX: word labels are categorical", () => {
  const d = [{ x: "bet max (all-in)" }, { x: "bet min (timid)" }];
  expect(isCategoricalX(d, "x")).toBe(true);
});

test("isCategoricalX: short strategy strings are categorical", () => {
  const d = [{ strategy: "bet max (all-in)", ruin: 100 }, { strategy: "bet min (timid)", ruin: 0 }];
  expect(isCategoricalX(d, "strategy")).toBe(true);
});

test("isCategoricalX: fraction strings like '10%' are categorical", () => {
  const d = [{ bet: "10%" }, { bet: "25%" }, { bet: "50%" }];
  expect(isCategoricalX(d, "bet")).toBe(true);
});

test("isCategoricalX: empty data returns false", () => {
  expect(isCategoricalX([], "x")).toBe(false);
});

// ── shouldRotateXLabels ───────────────────────────────────────────────────────

test("shouldRotateXLabels: long labels in narrow container → rotate", () => {
  // Two long labels ("bet max (all-in)" ~17 chars, "bet min (timid)" ~15 chars)
  // in 300 px: avg ~16 chars * 7 px = 112 px per label, slot = 150 px — fits,
  // but in a 200 px narrow pane: slot = 100 px, 112 > 100 → rotate.
  const labels = ["bet max (all-in)", "bet min (timid)"];
  expect(shouldRotateXLabels(labels, 200)).toBe(true);
});

test("shouldRotateXLabels: same long labels in wide container → no rotate", () => {
  const labels = ["bet max (all-in)", "bet min (timid)"];
  expect(shouldRotateXLabels(labels, 800)).toBe(false);
});

test("shouldRotateXLabels: short labels never need rotation", () => {
  const labels = ["A", "B", "C", "D"];
  expect(shouldRotateXLabels(labels, 200)).toBe(false);
});

test("shouldRotateXLabels: empty labels returns false", () => {
  expect(shouldRotateXLabels([], 400)).toBe(false);
});

// ── rotatedMarginBottom ───────────────────────────────────────────────────────

test("rotatedMarginBottom: returns value between 32 and 80", () => {
  const labels = ["bet max (all-in)", "bet min (timid)"];
  const mb = rotatedMarginBottom(labels, -22);
  expect(mb).toBeGreaterThanOrEqual(32);
  expect(mb).toBeLessThanOrEqual(80);
});

test("rotatedMarginBottom: longer labels produce larger margin", () => {
  const short = ["A", "B"];
  const long = ["a very long label string here", "another long label string"];
  const shortMb = rotatedMarginBottom(short, -22);
  const longMb = rotatedMarginBottom(long, -22);
  expect(longMb).toBeGreaterThan(shortMb);
});

// ── normalizeChartSpec: categorical x-axis ────────────────────────────────────

test("normalizeChartSpec: bar with categorical x and narrow width → xTickRotate set", () => {
  const catData = [
    { strategy: "bet max (all-in)", ruin: 100 },
    { strategy: "bet min (timid)", ruin: 0 },
  ];
  const spec = normalizeChartSpec({ data: catData, mark: "bar", x: "strategy", y: "ruin" }, 200);
  expect(spec.xCategorical).toBe(true);
  expect(spec.xTickRotate).toBeDefined();
  expect(typeof spec.xTickRotate).toBe("number");
  expect(spec.xMarginBottom).toBeDefined();
  expect(spec.xMarginBottom).toBeGreaterThan(32);
});

test("normalizeChartSpec: bar with categorical x and wide width → xTickRotate undefined", () => {
  const catData = [
    { strategy: "bet max (all-in)", ruin: 100 },
    { strategy: "bet min (timid)", ruin: 0 },
  ];
  const spec = normalizeChartSpec({ data: catData, mark: "bar", x: "strategy", y: "ruin" }, 800);
  expect(spec.xCategorical).toBe(true);
  // No rotation needed at 800 px wide
  expect(spec.xTickRotate).toBeUndefined();
});

test("normalizeChartSpec: line with numeric x → xCategorical false, no rotation", () => {
  const numData = [
    { f: 0.0, growth: 0 },
    { f: 0.2, growth: 0.020 },
    { f: 0.4, growth: -0.007 },
  ];
  const spec = normalizeChartSpec({ data: numData, mark: "line", x: "f", y: "growth" }, 300);
  expect(spec.xCategorical).toBe(false);
  expect(spec.xTickRotate).toBeUndefined();
  expect(spec.xMarginBottom).toBeUndefined();
});

// ── fill / stroke behavior per mark type ─────────────────────────────────────

test("line mark: fill is 'none' (no flood-fill)", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value" });
  expect(spec.marks[1].options.fill).toBe("none");
});

test("dot mark: fill is 'none' (hollow dots use stroke only)", () => {
  const spec = normalizeChartSpec({ data, mark: "dot", x: "year", y: "value" });
  expect(spec.marks[1].options.fill).toBe("none");
});

test("area mark: fill is the series/accent color (low opacity applied in Chart.tsx)", () => {
  const spec = normalizeChartSpec({ data, mark: "area", x: "year", y: "value" });
  // fill must be a color string, not 'none'
  expect(spec.marks[1].options.fill).not.toBe("none");
  expect(typeof spec.marks[1].options.fill).toBe("string");
});

test("bar mark: fill is the series/accent color (bars are filled)", () => {
  const spec = normalizeChartSpec({ data, mark: "bar", x: "year", y: "value" });
  expect(spec.marks[1].options.fill).not.toBe("none");
});

test("line mark with series: stroke = series field name, fill = 'none'", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value", series: "series" });
  expect(spec.marks[1].options.stroke).toBe("series");
  expect(spec.marks[1].options.fill).toBe("none");
});

// ── axis labels ───────────────────────────────────────────────────────────────

test("humanizeLabel: 'f' → 'f', 'growth_rate' → 'growth rate', 'fpRate' → 'fp rate'", () => {
  expect(humanizeLabel("f")).toBe("f");
  expect(humanizeLabel("growth_rate")).toBe("growth rate");
  expect(humanizeLabel("fpRate")).toBe("fp rate");
  expect(humanizeLabel("fp_rate")).toBe("fp rate");
});

test("normalizeChartSpec: xLabel/yLabel props pass through", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value", xLabel: "Year", yLabel: "Count" });
  expect(spec.xLabel).toBe("Year");
  expect(spec.yLabel).toBe("Count");
});

test("normalizeChartSpec: auto-derives xLabel/yLabel from field names when not provided", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value" });
  expect(typeof spec.xLabel).toBe("string");
  expect(spec.xLabel!.length).toBeGreaterThan(0);
  expect(typeof spec.yLabel).toBe("string");
});

test("normalizeChartSpec: yZero defaults to true for bar, false for line/area", () => {
  const barSpec = normalizeChartSpec({ data, mark: "bar", x: "year", y: "value" });
  expect(barSpec.yZero).toBe(true);
  const lineSpec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value" });
  expect(lineSpec.yZero).toBe(false);
});

test("normalizeChartSpec: explicit yZero prop overrides the default", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value", yZero: true });
  expect(spec.yZero).toBe(true);
});

// ── coerceNumericX ────────────────────────────────────────────────────────────

test("coerceNumericX: numeric-string x values are coerced to Number", () => {
  const raw = [
    { digit: "1", logspan: 0.301 },
    { digit: "2", logspan: 0.176 },
    { digit: "9", logspan: 0.046 },
  ];
  const coerced = coerceNumericX(raw, "digit");
  expect(coerced[0]!.digit).toBe(1);
  expect(coerced[1]!.digit).toBe(2);
  expect(coerced[2]!.digit).toBe(9);
  expect(typeof coerced[0]!.digit).toBe("number");
});

test("coerceNumericX: y values are NOT touched", () => {
  const raw = [{ digit: "1", logspan: "0.301" }];
  const coerced = coerceNumericX(raw, "digit");
  // logspan was a string and should remain unchanged
  expect(coerced[0]!.logspan).toBe("0.301");
});

test("coerceNumericX: already-numeric x values → original array returned unchanged", () => {
  const raw = [{ f: 0.1, growth: 0.01 }, { f: 0.2, growth: 0.02 }];
  const coerced = coerceNumericX(raw, "f");
  // No string coercion needed → must be the exact same reference
  expect(coerced).toBe(raw);
});

test("coerceNumericX: categorical x values → original array returned unchanged", () => {
  const raw = [
    { strategy: "bet max (all-in)", ruin: 100 },
    { strategy: "bet min (timid)", ruin: 0 },
  ];
  const coerced = coerceNumericX(raw, "strategy");
  expect(coerced).toBe(raw);
  expect(coerced[0]!.strategy).toBe("bet max (all-in)");
});

test("coerceNumericX: percent strings like '10%' are categorical → unchanged", () => {
  const raw = [{ bet: "10%", expected: 2 }, { bet: "25%", expected: 5 }];
  const coerced = coerceNumericX(raw, "bet");
  expect(coerced).toBe(raw);
  expect(coerced[0]!.bet).toBe("10%");
});

test("coerceNumericX: empty data returns the same empty array", () => {
  const raw: ReadonlyArray<Record<string, unknown>> = [];
  expect(coerceNumericX(raw, "x")).toBe(raw);
});

test("coerceNumericX: does NOT mutate the original array", () => {
  const raw = [{ digit: "1", logspan: 0.301 }, { digit: "9", logspan: 0.046 }];
  const original0 = { ...raw[0] };
  coerceNumericX(raw, "digit");
  // Original rows are unmodified
  expect(raw[0]!.digit).toBe("1");
  expect(raw[0]).toEqual(original0);
});

// ── distinctSorted: numeric-aware categorical ordering (M9) ──────────────────

test("distinctSorted: numeric-prefix strings like '10%','100%','25%','50%' sort numerically", () => {
  // Benford-style bar: x values are percent strings that arrive out of order
  const rows = [
    { label: "10%", value: 30 },
    { label: "100%", value: 5 },
    { label: "25%", value: 18 },
    { label: "50%", value: 10 },
  ];
  const spec = normalizeChartSpec({ data: rows, mark: "bar", x: "label", y: "value" });
  // The x domain (order) should be numeric-ascending: 10, 25, 50, 100
  expect(spec.xDomain).toEqual(["10%", "25%", "50%", "100%"]);
});

test("distinctSorted: pure word labels keep stable insertion order", () => {
  const rows = [
    { strategy: "bet max (all-in)", ruin: 100 },
    { strategy: "bet min (timid)", ruin: 0 },
    { strategy: "kelly", ruin: 12 },
  ];
  const spec = normalizeChartSpec({ data: rows, mark: "bar", x: "strategy", y: "ruin" });
  // Words sort lexicographically (locale); order should be stable
  expect(spec.xDomain).toEqual(["bet max (all-in)", "bet min (timid)", "kelly"]);
});

test("distinctSorted: ordinal labels with numeric prefixes sort numerically", () => {
  // Scenario: labels like "1st", "2nd", "10th" — numeric prefix, word suffix
  const rows = [
    { rank: "9th", v: 1 },
    { rank: "2nd", v: 2 },
    { rank: "10th", v: 3 },
    { rank: "1st", v: 4 },
  ];
  const spec = normalizeChartSpec({ data: rows, mark: "bar", x: "rank", y: "v" });
  expect(spec.xDomain).toEqual(["1st", "2nd", "9th", "10th"]);
});

test("distinctSorted: mixed numeric-prefix and pure-word labels handled sanely (locale numeric)", () => {
  // When mixed, localeCompare numeric:true still handles it gracefully
  const rows = [
    { label: "25%", value: 18 },
    { label: "alpha", value: 5 },
    { label: "10%", value: 30 },
  ];
  const spec = normalizeChartSpec({ data: rows, mark: "bar", x: "label", y: "value" });
  // '10%' < '25%' numerically, 'alpha' comes after digits in locale order
  const domain = spec.xDomain!;
  expect(domain.indexOf("10%")).toBeLessThan(domain.indexOf("25%"));
});
