// apps/site/src/components/mdx/mil-forcecomp-ssr.test.ts
//
// SSR / no-JS fallback test for the <ForceComparison> React island (the
// military/strategy "theater" writer format). Same harness as the other island
// SSR tests: renderToStaticMarkup via React.createElement (no JSX, no jsdom,
// Node env), asserting the static HTML is meaningful and non-blank — the "never
// blank" invariant. The no-JS fallback is a full labeled comparison TABLE: every
// side, every metric value, and every ratio must appear server-side.
//
// NOTE ON <OrderOfBattle>: it is an *Astro* component (static, no island), so
// this react-dom/server harness cannot render it — the same as CodeWalkthrough /
// CastGrid. Its roster normalization is unit-tested directly in
// lib/order-of-battle.test.ts, and its no-JS guarantee is STRUCTURAL: the full
// roster renders server-side and sub-units ship inside `<details open>`, so the
// entire order of battle is visible with zero JS.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import ForceComparison from "./ForceComparison.js";
import type { ForceComparisonProps } from "./lib/force-comparison.js";

const props: ForceComparisonProps = {
  sides: [
    { label: "Union", tone: "friendly" },
    { label: "Confederate", tone: "enemy" },
  ],
  metrics: [
    { label: "Troops", values: [93921, 71699], unit: "men" },
    { label: "Artillery", values: [372, 283], unit: "guns" },
    { label: "Casualties", values: [23049, 28063], unit: "men", higherIsWorse: true },
  ],
  caption: "Gettysburg, July 1863",
};

describe("ForceComparison SSR", () => {
  test("renders a non-blank figure with the panel", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("mdx-figure");
    expect(html).toContain("fc-panel");
  });

  test("both side labels appear (header)", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    expect(html).toContain("Union");
    expect(html).toContain("Confederate");
  });

  test("no-JS fallback ships a real comparison TABLE (never blank)", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    expect(html).toContain("fc-fallback");
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    // every metric label present
    expect(html).toContain("Troops");
    expect(html).toContain("Artillery");
    expect(html).toContain("Casualties");
  });

  test("every value renders (grouped + unit) in the fallback", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    expect(html).toContain("93,921 men");
    expect(html).toContain("71,699 men");
    expect(html).toContain("372 guns");
  });

  test("per-metric ratios surface", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    expect(html).toContain("1.3:1"); // troops 93921/71699
  });

  test("tone classes drive amber (friendly) vs clay (enemy)", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    expect(html).toContain("fc-tone--friendly");
    expect(html).toContain("fc-tone--enemy");
  });

  test("higherIsWorse flips advantage to the lower-casualty side in the table", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    // the advantaged cell gets the fc-fallback-adv class; Union (fewer casualties) wins it
    expect(html).toContain("fc-fallback-adv");
  });

  test("caption renders inside .mdx-caption", () => {
    const html = renderToStaticMarkup(createElement(ForceComparison, props));
    expect(html).toContain("mdx-caption");
    expect(html).toContain("Gettysburg, July 1863");
  });

  test("missing value → em dash, no ratio (never throws, never blank)", () => {
    const partial: ForceComparisonProps = {
      sides: props.sides,
      metrics: [{ label: "Ships", values: [12], unit: "ships" }],
    };
    const html = renderToStaticMarkup(createElement(ForceComparison, partial));
    expect(html).toContain("Ships");
    expect(html).toContain("12 ships");
    expect(html).toContain("—"); // missing side + missing ratio
  });
});
