// apps/site/src/components/mdx/sankey-ssr.test.ts
//
// SSR / no-JS fallback tests for <Sankey>. The repo's vitest runs in Node (no
// jsdom), so we render via react-dom/server's renderToStaticMarkup through
// createElement (no JSX) and assert the static HTML is meaningful and non-empty
// — the "never blank" invariant. Every flow's source → target : value must
// appear in the no-JS markup, and the viewBox must scale (no fixed 360px width).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import Sankey from "./Sankey.js";
import type { SankeyProps } from "./Sankey.js";

const props: SankeyProps = {
  nodes: [
    { id: "budget", label: "Budget" },
    { id: "eng", label: "Engineering" },
    { id: "sales", label: "Sales" },
    { id: "salaries", label: "Salaries" },
    { id: "cloud", label: "Cloud" },
    { id: "ads", label: "Ads" },
  ],
  links: [
    { source: "budget", target: "eng", value: 60 },
    { source: "budget", target: "sales", value: 40 },
    { source: "eng", target: "salaries", value: 45 },
    { source: "eng", target: "cloud", value: 15 },
    { source: "sales", target: "salaries", value: 25 },
    { source: "sales", target: "ads", value: 15 },
  ],
  unit: "$M",
  caption: "Where the budget goes",
};

const render = (p: SankeyProps) => renderToStaticMarkup(createElement(Sankey, p));

describe("Sankey SSR", () => {
  test("renders a non-blank figure with the panel + svg", () => {
    const html = render(props);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("mdx-figure");
    expect(html).toContain("sk-panel");
    expect(html).toContain("<svg");
  });

  test("viewBox scales (width:100%, no fixed 360px overflow)", () => {
    const html = render(props);
    expect(html).toContain("sk-svg");
    expect(html).toContain('viewBox="0 0 720 450"');
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
    // no hardcoded pixel width attribute on the svg
    expect(html).not.toMatch(/<svg[^>]*\bwidth="\d/);
  });

  test("no-JS fallback lists every flow as source → target: value (never blank)", () => {
    const html = render(props);
    expect(html).toContain("sk-fallback");
    // arrow between source and target
    expect(html).toContain("→");
    // every node label surfaces
    for (const n of props.nodes) expect(html).toContain(n.label!);
    // representative flow values present
    expect(html).toContain("60");
    expect(html).toContain("45");
  });

  test("grand total surfaces in the fallback", () => {
    const html = render(props);
    expect(html).toContain("total");
    expect(html).toContain("200");
  });

  test("unit suffix is appended to fallback values", () => {
    const html = render(props);
    expect(html).toContain("$M");
  });

  test("per-flow percentage shares surface in the fallback", () => {
    const html = render(props);
    // total of all flows is 200; budget→eng is 60/200 = 30.0%
    expect(html).toContain("30.0%");
  });

  test("a11y: role=group aria-label on the svg + role=button per flow", () => {
    const html = render(props);
    expect(html).toContain('role="group"');
    expect(html).toContain("Flow diagram: Where the budget goes");
    expect(html).toContain('role="button"');
    // each flow's aria-label names value + share
    expect(html).toContain("of total");
  });

  test("caption renders inside .mdx-caption when provided", () => {
    const html = render(props);
    expect(html).toContain("mdx-caption");
    expect(html).toContain("Where the budget goes");
  });

  test("works without a unit (no trailing suffix required)", () => {
    const html = render({ ...props, unit: undefined, caption: undefined });
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("sk-fallback");
    // still lists flows
    expect(html).toContain("Engineering");
  });

  test("mobile stress: many long-labelled nodes still render a legible fallback", () => {
    const big: SankeyProps = {
      nodes: [
        { id: "src", label: "Total Annual Operating Budget FY2026" },
        { id: "a", label: "Research & Development Division" },
        { id: "b", label: "Go-To-Market & Field Sales" },
        { id: "c", label: "General & Administrative Overhead" },
        { id: "a1", label: "Platform Engineering Salaries" },
        { id: "a2", label: "Managed Cloud Infrastructure" },
        { id: "b1", label: "Paid Acquisition & Advertising" },
      ],
      links: [
        { source: "src", target: "a", value: 5200 },
        { source: "src", target: "b", value: 3100 },
        { source: "src", target: "c", value: 1700 },
        { source: "a", target: "a1", value: 3600 },
        { source: "a", target: "a2", value: 1600 },
        { source: "b", target: "b1", value: 3100 },
      ],
      unit: "K",
    };
    const html = render(big);
    expect(html).toContain("Total Annual Operating Budget FY2026");
    expect(html).toContain("Paid Acquisition & Advertising".replace("&", "&amp;"));
    expect(html).toContain("sk-fallback");
  });
});
