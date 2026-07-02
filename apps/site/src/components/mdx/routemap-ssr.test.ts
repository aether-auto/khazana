// apps/site/src/components/mdx/routemap-ssr.test.ts
//
// SSR / no-JS fallback tests for the <RouteMap> React island. Rendered with
// react-dom/server's renderToStaticMarkup (Node env, no jsdom), asserting:
//  • the static HTML is NON-BLANK: it carries the choropleth land, the graticule,
//    the great-circle arcs, and a semantic <ol> listing every route + point label
//    (so the figure is never blank even with the SVG unstyled).
//  • no-JS shows arcs FULLY DRAWN: the server render emits `is-drawn` and a zero
//    dash-offset (armed-undraw only happens after client hydration), so the
//    reveal animation never leaves the map blank.
//  • the caption wraps in .mdx-caption inside .mdx-figure.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import RouteMap from "./RouteMap.js";
import type { RouteMapProps } from "./RouteMap.js";

const NAPOLEON: RouteMapProps = {
  routes: [
    { from: [2.35, 48.85], to: [37.62, 55.75], label: "Paris → Moscow (advance)", kind: "march" },
    { from: [37.62, 55.75], to: [2.35, 48.85], label: "Moscow → Paris (retreat)", kind: "path" },
  ],
  points: [
    { at: [37.62, 55.75], label: "Moscow (burned)" },
    { at: [31.99, 54.78], label: "Smolensk" },
  ],
  caption: "1812: the march to Moscow and the long retreat home",
};

test("RouteMap SSR is non-blank: land + graticule + arcs + a labeled route/point list", () => {
  const html = renderToStaticMarkup(createElement(RouteMap, NAPOLEON));
  expect(html.length).toBeGreaterThan(0);
  // choropleth land (reused Map paths) and the graticule
  expect(html).toContain("map-country");
  expect(html).toContain("map-graticule");
  // the great-circle arcs
  expect(html).toContain("rm-arc");
  expect(html).toContain("rm-routes");
  // every route label present (in the SVG label AND/OR the semantic legend)
  expect(html).toContain("Paris");
  expect(html).toContain("retreat");
  // every point label present
  expect(html).toContain("Moscow (burned)");
  expect(html).toContain("Smolensk");
  // the semantic legend list is the never-blank fallback
  expect(html).toContain("<ol");
  expect(html).toContain("rm-legend");
  // caption wrapped in .mdx-caption inside .mdx-figure
  expect(html).toContain("mdx-figure");
  expect(html).toContain("mdx-caption");
  expect(html).toContain("the march to Moscow");
});

test("RouteMap SSR draws arcs FULLY (no-JS never blank): is-drawn + zero dash-offset", () => {
  const html = renderToStaticMarkup(createElement(RouteMap, NAPOLEON));
  // the undrawn (armed) start is client-only; SSR must show the arc drawn.
  expect(html).toContain("rm-arc is-drawn");
  // the arc's stroke-dashoffset in SSR is 0 (fully revealed), not == its length.
  expect(html).toMatch(/stroke-dashoffset:\s*0\b/);
});

test("RouteMap SSR tags each route kind for styling (march / path)", () => {
  const html = renderToStaticMarkup(createElement(RouteMap, NAPOLEON));
  expect(html).toContain("rm-route--march");
  expect(html).toContain("rm-route--path");
});

test("RouteMap default route kind is 'arc' when omitted", () => {
  const html = renderToStaticMarkup(
    createElement(RouteMap, {
      routes: [{ from: [-0.13, 51.5], to: [2.35, 48.85], label: "London → Paris" }],
    }),
  );
  expect(html).toContain("rm-route--arc");
  expect(html).toContain("London → Paris");
});

test("RouteMap with only points (no routes) still renders land + the point + its label", () => {
  const html = renderToStaticMarkup(
    createElement(RouteMap, {
      points: [{ at: [139.7, 35.7], label: "Tokyo" }],
      caption: "a single landfall",
    }),
  );
  expect(html).toContain("map-country"); // the base map is always there
  expect(html).toContain("rm-point-dot");
  expect(html).toContain("Tokyo");
  expect(html).toContain("a single landfall");
});

test("RouteMap with choropleth values shades the land (reuses Map's amber ramp)", () => {
  const html = renderToStaticMarkup(
    createElement(RouteMap, {
      values: { RUS: 100, FRA: 40 },
      labels: { RUS: "Russia", FRA: "France" },
      routes: [{ from: [2.35, 48.85], to: [37.62, 55.75], label: "west→east" }],
    }),
  );
  // choropleth fills are inline color-mix amber weights
  expect(html).toMatch(/color-mix\([^)]*var\(--accent\)/);
});

test("RouteMap empty (no routes, no points) → still a non-blank base map, non-throwing", () => {
  const html = renderToStaticMarkup(createElement(RouteMap, {}));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("map-country");
  expect(html).toContain("routemap");
});

test("RouteMap SSR wraps in .mdx-figure--wide and scales the SVG via viewBox (no fixed px width)", () => {
  const html = renderToStaticMarkup(createElement(RouteMap, NAPOLEON));
  expect(html).toContain("mdx-figure--wide");
  expect(html).toContain('viewBox="0 0 960 480"');
  // the svg must not carry a hardcoded pixel width attribute (CSS width:100%)
  expect(html).not.toMatch(/<svg[^>]*\swidth="/);
});
