// apps/site/src/components/mdx/parameterplay-ssr.test.ts
//
// SSR / no-JS fallback tests for the <ParameterPlay> React island. Vitest runs
// in Node (no jsdom), so we render via react-dom/server's renderToStaticMarkup
// through React.createElement (no JSX) and assert the static markup is meaningful
// and non-blank — the "never blank" invariant. Without JS the reader must still
// get: the default-parameter curve as inert SVG, a labeled control per param,
// and (when present) the default-value readouts.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import ParameterPlay, { type ParameterPlayProps } from "./ParameterPlay.js";

const base: ParameterPlayProps = {
  params: [
    { key: "dop", label: "geometric dilution (DOP)", min: 1, max: 10, default: 2.5, step: 0.1 },
  ],
  expr: "dop * x",
  xVar: "x",
  xRange: [0, 6],
  xLabel: "range error σ_range (m)",
  yLabel: "position error σ_pos (m)",
  readouts: [{ label: "σ_pos at σ_range=3m", expr: "dop * 3", unit: "m" }],
  caption: "Position error scales linearly with range error, amplified by DOP.",
};

test("SSR renders a non-blank instrument panel with an SVG curve", () => {
  const html = renderToStaticMarkup(createElement(ParameterPlay, base));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("mdx-figure");
  expect(html).toContain("cc-panel");
  expect(html).toContain("<svg");
  // an actual plotted path (visx LinePath emits a <path>)
  expect(html).toContain("<path");
});

test("SSR fallback exposes every slider label (no-JS legible controls)", () => {
  const html = renderToStaticMarkup(createElement(ParameterPlay, base));
  for (const p of base.params) {
    expect(html).toContain(p.label);
  }
  // a real range input per param, at its default value
  expect(html).toContain('type="range"');
  expect(html).toContain('value="2.5"');
});

test("SSR renders the readouts strip at the DEFAULT parameter values", () => {
  const html = renderToStaticMarkup(createElement(ParameterPlay, base));
  expect(html).toContain("σ_pos at σ_range=3m");
  // dop default 2.5 * 3 = 7.5 m
  expect(html).toContain("7.5 m");
});

test("SSR renders a caption inside .mdx-caption when provided", () => {
  const html = renderToStaticMarkup(createElement(ParameterPlay, base));
  expect(html).toContain("mdx-caption");
  expect(html).toContain("Position error scales linearly");
});

test("SSR aria-live mirror announces the readout for screen readers", () => {
  const html = renderToStaticMarkup(createElement(ParameterPlay, base));
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("cc-sr-readout");
});

test("SSR works with MULTIPLE params (controls grid, all sliders present)", () => {
  const html = renderToStaticMarkup(
    createElement(ParameterPlay, {
      params: [
        { key: "L", label: "carrying capacity", min: 1, max: 100, default: 50, step: 1, unit: "" },
        { key: "k", label: "growth rate", min: 0.1, max: 3, default: 1, step: 0.1 },
        { key: "x0", label: "midpoint", min: 0, max: 10, default: 5, step: 0.5 },
      ],
      expr: "L / (1 + exp(-k * (x - x0)))",
      xRange: [0, 10],
      xLabel: "t",
      yLabel: "population",
      readouts: [
        { label: "value at midpoint", expr: "L / 2" },
        { label: "max slope", expr: "k * L / 4" },
      ],
    } satisfies ParameterPlayProps),
  );
  expect(html).toContain("pp-controls");
  expect(html).toContain("carrying capacity");
  expect(html).toContain("growth rate");
  expect(html).toContain("midpoint");
  // logistic default plots a real curve
  expect(html).toContain("<path");
  // both readouts computed at defaults: L/2 = 25, k*L/4 = 12.5
  expect(html).toContain("25");
  expect(html).toContain("12.5");
});

test("SSR with NO readouts still renders a non-blank curve (never blank)", () => {
  const html = renderToStaticMarkup(
    createElement(ParameterPlay, {
      params: [{ key: "a", label: "amplitude", min: 0, max: 5, default: 2, step: 0.1 }],
      expr: "a * sin(x)",
      xRange: [0, 6.28],
      yLabel: "y",
    } satisfies ParameterPlayProps),
  );
  expect(html).toContain("<svg");
  expect(html).toContain("<path");
  expect(html).toContain("amplitude");
});

test("SSR surfaces an AUTHOR error (bad formula) instead of a silent blank", () => {
  const html = renderToStaticMarkup(
    createElement(ParameterPlay, {
      params: [{ key: "a", label: "a", min: 0, max: 5, default: 1, step: 0.1 }],
      // `window` is not a declared var → rejected by the sandbox at compile time
      expr: "a * window",
      xRange: [0, 5],
    } satisfies ParameterPlayProps),
  );
  expect(html).toContain("could not compile");
  expect(html).toContain('role="alert"');
});

test("SSR does not overflow: SVG is width-fluid (no fixed pixel width attr)", () => {
  const html = renderToStaticMarkup(createElement(ParameterPlay, base));
  // the svg uses a viewBox and CSS width:100% — it must NOT carry a hard width= px
  expect(html).toContain("viewBox");
  expect(html).not.toMatch(/<svg[^>]*\swidth="640"/);
});
