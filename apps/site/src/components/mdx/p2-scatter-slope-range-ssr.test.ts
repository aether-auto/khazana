// apps/site/src/components/mdx/p2-scatter-slope-range-ssr.test.ts
//
// SSR / no-JS fallback tests for the three P2 data-viz islands: <Scatter>,
// <Slopegraph>, <RangePlot>. The repo's vitest runs in Node (no jsdom), so we
// render via react-dom/server's renderToStaticMarkup through createElement (no
// JSX) and assert the static HTML is meaningful and non-empty — the "never
// blank" invariant. Every data label / value must appear in the no-JS markup.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import Scatter from "./Scatter.js";
import Slopegraph from "./Slopegraph.js";
import RangePlot from "./RangePlot.js";
import type { ScatterProps } from "./lib/scatter-spec.js";
import type { SlopeDatum } from "./lib/slopegraph-scale.js";
import type { RangeDatum } from "./lib/rangeplot-scale.js";

// ── Scatter ──────────────────────────────────────────────────────────────────
const scatterProps: ScatterProps = {
  data: [
    { gdp: 1.2, life: 61 },
    { gdp: 5.4, life: 73 },
    { gdp: 9.1, life: 82 },
  ],
  x: "gdp",
  y: "life",
  fit: "linear",
  caption: "Wealth vs longevity",
};

describe("Scatter SSR", () => {
  test("renders a non-blank figure with the panel + host", () => {
    const html = renderToStaticMarkup(createElement(Scatter, scatterProps));
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("mdx-figure");
    expect(html).toContain("scatter-panel");
    expect(html).toContain("chart-host");
  });
  test("no-JS fallback carries a legible text summary (never blank)", () => {
    const html = renderToStaticMarkup(createElement(Scatter, scatterProps));
    expect(html).toContain("chart-fallback");
    expect(html).toContain("life vs gdp");
    expect(html).toContain("linear fit");
    expect(html).toContain("3 points");
  });
  test("a11y role=img + descriptive aria-label on the host", () => {
    const html = renderToStaticMarkup(createElement(Scatter, scatterProps));
    expect(html).toContain('role="img"');
    expect(html).toContain("scatter plot");
  });
  test("caption renders inside .mdx-caption", () => {
    const html = renderToStaticMarkup(createElement(Scatter, scatterProps));
    expect(html).toContain("mdx-caption");
    expect(html).toContain("Wealth vs longevity");
  });
  test("size + color encodings surface in the fallback when present", () => {
    const html = renderToStaticMarkup(
      createElement(Scatter, { ...scatterProps, size: "pop", color: "region" }),
    );
    expect(html).toContain("sized by pop");
    expect(html).toContain("colored by region");
  });
});

// ── Slopegraph ───────────────────────────────────────────────────────────────
const slopeData: SlopeDatum[] = [
  { label: "Rust", before: 5, after: 2 },
  { label: "Go", before: 3, after: 3 },
  { label: "Zig", before: 8, after: 1 },
];

describe("Slopegraph SSR", () => {
  test("renders a non-blank figure with the panel + svg", () => {
    const html = renderToStaticMarkup(
      createElement(Slopegraph, { data: slopeData, beforeLabel: "2020", afterLabel: "2025" }),
    );
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("sg-panel");
    expect(html).toContain("<svg");
  });
  test("column headers appear (before + after labels)", () => {
    const html = renderToStaticMarkup(
      createElement(Slopegraph, { data: slopeData, beforeLabel: "2020", afterLabel: "2025" }),
    );
    expect(html).toContain("2020");
    expect(html).toContain("2025");
  });
  test("fallback exposes every category + both values (no-JS legible)", () => {
    const html = renderToStaticMarkup(
      createElement(Slopegraph, { data: slopeData, beforeLabel: "2020", afterLabel: "2025" }),
    );
    expect(html).toContain("sg-fallback");
    for (const d of slopeData) expect(html).toContain(d.label);
    // before→after arrow present in the fallback
    expect(html).toContain("→");
  });
  test("direction classes drive amber-up / clay-down styling", () => {
    const html = renderToStaticMarkup(
      createElement(Slopegraph, { data: slopeData, beforeLabel: "2020", afterLabel: "2025" }),
    );
    expect(html).toContain("sg-slope--down"); // Rust, Zig
    expect(html).toContain("sg-slope--flat"); // Go
  });
  test("caption renders inside .mdx-caption when provided", () => {
    const html = renderToStaticMarkup(
      createElement(Slopegraph, {
        data: slopeData,
        beforeLabel: "2020",
        afterLabel: "2025",
        caption: "Adoption reordering",
      }),
    );
    expect(html).toContain("mdx-caption");
    expect(html).toContain("Adoption reordering");
  });
});

// ── RangePlot ────────────────────────────────────────────────────────────────
const rangeData: RangeDatum[] = [
  { label: "Model A", low: 10, mid: 18, high: 24, n: 40 },
  { label: "Model B", low: 14, mid: 20, high: 31 },
  { label: "Model C", low: 8, mid: 12, high: 16, n: 12 },
];

describe("RangePlot SSR", () => {
  test("renders a non-blank figure with the panel + svg", () => {
    const html = renderToStaticMarkup(createElement(RangePlot, { data: rangeData }));
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("rp-panel");
    expect(html).toContain("<svg");
  });
  test("fallback exposes every category + its low/mid/high (no-JS legible)", () => {
    const html = renderToStaticMarkup(createElement(RangePlot, { data: rangeData }));
    expect(html).toContain("rp-fallback");
    for (const d of rangeData) expect(html).toContain(d.label);
    // a bound value and a mid value are present
    expect(html).toContain("10");
    expect(html).toContain("18");
  });
  test("unit suffix is appended to fallback values", () => {
    const html = renderToStaticMarkup(createElement(RangePlot, { data: rangeData, unit: "ms" }));
    expect(html).toContain("ms");
  });
  test("sample size n surfaces when provided, omitted otherwise", () => {
    const html = renderToStaticMarkup(createElement(RangePlot, { data: rangeData }));
    expect(html).toContain("n=40");
    expect(html).toContain("n=12");
  });
  test("caption renders inside .mdx-caption when provided", () => {
    const html = renderToStaticMarkup(
      createElement(RangePlot, { data: rangeData, caption: "Latency by model" }),
    );
    expect(html).toContain("mdx-caption");
    expect(html).toContain("Latency by model");
  });
});
