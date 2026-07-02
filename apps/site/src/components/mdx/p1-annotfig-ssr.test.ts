// apps/site/src/components/mdx/p1-annotfig-ssr.test.ts
//
// SSR / no-JS fallback test for the AnnotatedFigure React island. Same harness
// as p0-ssr.test.ts: renderToStaticMarkup via React.createElement (no JSX, no
// jsdom, Node env) asserting the static HTML is meaningful and non-blank — the
// "never blank" invariant. The island's fallback is the image + a full <ol> of
// every pin's note (rendered server-side, reachable with no JS).
//
// NOTE ON CodeWalkthrough: it is an *Astro* component (Shiki runs at build), so
// this react-dom/server harness cannot render it. Its stepping / line-range
// logic is unit-tested directly in lib/code-walkthrough.test.ts, and its no-JS
// fallback (full code + notes <ol>) is authored to render server-side by Astro.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import AnnotatedFigure from "./AnnotatedFigure.js";

const PINS = [
  { x: 0.2, y: 0.3, label: "the corona", note: "the outer solar atmosphere" },
  { x: 0.8, y: 0.5, label: "a filament", note: "cooler plasma suspended by magnetic fields" },
  { x: 0.5, y: 0.85, label: "a sunspot", note: "an intense magnetic knot" },
];

test("AnnotatedFigure SSR renders the image with src + reserved aspect, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(AnnotatedFigure, {
      src: "/_image/opt.avif",
      width: 1600,
      height: 900,
      alt: "The sun's surface",
      pins: PINS,
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain('src="/_image/opt.avif"');
  expect(html).toContain('alt="The sun&#x27;s surface"');
  // aspect ratio reserved to prevent CLS
  expect(html).toContain("aspect-ratio");
  expect(html).toContain("afig__img");
});

test("AnnotatedFigure SSR lists every pin's note (reachable no-JS)", () => {
  const html = renderToStaticMarkup(
    createElement(AnnotatedFigure, {
      src: "/x.avif",
      width: 100,
      height: 100,
      alt: "x",
      pins: PINS,
      caption: "The disk in extreme UV",
      credit: "NASA / SDO",
      sourceUrl: "https://example.org/ledger",
    }),
  );
  for (const p of PINS) {
    expect(html).toContain(p.note);
    expect(html).toContain(p.label);
  }
  // fallback list present + not marked hydrated in SSR (so it shows without JS)
  expect(html).toContain('aria-label="Annotations"');
  expect(html).not.toContain("afig--hydrated");
  // credit + source + caption surfaced
  expect(html).toContain("NASA / SDO");
  expect(html).toContain("https://example.org/ledger");
  expect(html).toContain("The disk in extreme UV");
});

test("AnnotatedFigure SSR numbers pins 1-based and each note has role=note", () => {
  const html = renderToStaticMarkup(
    createElement(AnnotatedFigure, {
      src: "/y.avif",
      width: 10,
      height: 10,
      alt: "y",
      pins: [{ x: 0.5, y: 0.5, label: "L", note: "N" }],
    }),
  );
  expect(html).toContain('aria-label="Annotation 1: L"');
  expect(html).toContain('role="note"');
});
