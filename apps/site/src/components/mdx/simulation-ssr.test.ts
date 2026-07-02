// apps/site/src/components/mdx/simulation-ssr.test.ts
//
// SSR / no-JS fallback tests for the <Simulation> island. The vitest include
// glob matches `*.test.ts` and runs under Node, so we render to a static HTML
// string via react-dom/server (no JSX, no jsdom) and assert the fallback is
// meaningful and non-empty — the "never blank" invariant. On the server
// `mounted` is false, so the canvas + controls are absent and the descriptive
// fallback panel (kind description + full param list) is what ships.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Simulation from "./Simulation.js";

const walkParams = [
  { key: "walkers", label: "walkers", min: 10, max: 200, default: 60, step: 10 },
  { key: "step", label: "step size", min: 0.005, max: 0.05, default: 0.01, step: 0.005 },
];

test("Simulation SSR renders the kind description + every param label, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(Simulation, {
      kind: "walk",
      params: walkParams,
      caption: "Diffusion of a walker cloud.",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  // the kind's human description (the "what am I looking at" for no-JS readers)
  expect(html).toContain("random walkers");
  // the full param list is present in the static DOM
  expect(html).toContain("walkers");
  expect(html).toContain("step size");
  expect(html).toContain("range 10");
  // wrapped in the shared figure vocabulary + caption
  expect(html).toContain("mdx-figure");
  expect(html).toContain("mdx-caption");
  expect(html).toContain("Diffusion of a walker cloud.");
  // <noscript> panel present so JS-disabled readers get an explicit message
  expect(html).toContain("requires JavaScript");
  // no live canvas on the server (mounted=false) — the fallback carries it
  expect(html).not.toContain("<canvas");
});

test("Simulation SSR fallback works for a param-less kind (life)", () => {
  const html = renderToStaticMarkup(createElement(Simulation, { kind: "life" }));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("Game of Life");
  expect(html).toContain("mdx-figure");
});

test("Simulation SSR of an unknown kind is an honest non-blank panel, not a crash", () => {
  const html = renderToStaticMarkup(createElement(Simulation, { kind: "bogus" }));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("Unknown simulation kind");
  expect(html).toContain("bogus");
});
