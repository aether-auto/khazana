// apps/site/src/components/mdx/p2-smallmult-dist-ssr.test.ts
//
// SSR / no-JS fallback tests for the P2 Plot-wrapper islands (SmallMultiples,
// Distribution). Like p0-ssr.test.ts, we render with react-dom/server's
// renderToStaticMarkup via React.createElement (no JSX, no jsdom, Node env) and
// assert the static HTML is meaningful and non-blank — the "never blank"
// invariant. Plot only ever runs inside useEffect, which does NOT fire during
// server render, so these islands SSR to their pure text/table fallbacks.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import SmallMultiples from "./SmallMultiples.js";
import Distribution from "./Distribution.js";

const smData = [
  { region: "west", year: 2020, sales: 3 },
  { region: "west", year: 2021, sales: 5 },
  { region: "east", year: 2020, sales: 2 },
  { region: "east", year: 2021, sales: 8 },
];

test("SmallMultiples SSR renders a per-facet summary list, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(SmallMultiples, {
      data: smData,
      mark: "line",
      x: "year",
      y: "sales",
      facet: "region",
      caption: "sales by region",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("small multiples");
  // one summary row per facet, with counts — the non-blank fallback
  expect(html).toContain("east — 2 points");
  expect(html).toContain("west — 2 points");
  // role="img" host + aria-label present
  expect(html).toContain('role="img"');
  expect(html).toContain("faceted by region");
  // caption rendered
  expect(html).toContain("sales by region");
});

const distData = [
  { latency: 10 },
  { latency: 12 },
  { latency: 15 },
  { latency: 20 },
  { latency: 30 },
];

test("Distribution SSR renders a real bin table (range → count), never blank", () => {
  const html = renderToStaticMarkup(
    createElement(Distribution, {
      data: distData,
      value: "latency",
      bins: 5,
      marker: [{ at: 18, label: "SLA" }],
      caption: "request latency",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("histogram");
  // bin table headers present
  expect(html).toContain("range");
  expect(html).toContain("count");
  // marker label surfaced in the fallback + aria
  expect(html).toContain("SLA");
  expect(html).toContain('role="img"');
  expect(html).toContain("request latency");
});

test("Distribution SSR density variant renders non-blank with density label", () => {
  const html = renderToStaticMarkup(
    createElement(Distribution, { data: distData, value: "latency", mark: "density" }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("density");
  expect(html).toContain('role="img"');
});
