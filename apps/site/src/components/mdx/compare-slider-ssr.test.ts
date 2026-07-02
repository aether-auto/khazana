// apps/site/src/components/mdx/compare-slider-ssr.test.ts
//
// SSR / no-JS fallback test for the CompareSlider React island. Same harness as
// p1-annotfig-ssr.test.ts: renderToStaticMarkup via React.createElement (no JSX,
// Node env). The "never blank" invariant here is that WITHOUT JS both images
// render stacked, each with its label — a fully readable comparison.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import CompareSlider from "./CompareSlider.js";

test("CompareSlider SSR renders both images with reserved aspect, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(CompareSlider, {
      before: "/_image/before.avif",
      after: "/_image/after.avif",
      width: 1200,
      height: 800,
      alt: "San Francisco in 1906 and today",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain('src="/_image/before.avif"');
  expect(html).toContain('src="/_image/after.avif"');
  // aspect ratio reserved to prevent CLS
  expect(html).toContain("aspect-ratio");
  // not marked hydrated in SSR → stacked fallback shows without JS
  expect(html).not.toContain("cmp--hydrated");
  expect(html).toContain("cmp__stack");
});

test("CompareSlider SSR surfaces both labels + a11y slider label", () => {
  const html = renderToStaticMarkup(
    createElement(CompareSlider, {
      before: "/b.avif",
      after: "/a.avif",
      width: 100,
      height: 100,
      alt: "the ruins vs the rebuilt block",
      beforeLabel: "1906",
      afterLabel: "Today",
      caption: "The same corner, 118 years apart",
    }),
  );
  expect(html).toContain("1906");
  expect(html).toContain("Today");
  // caption surfaced in the shared caption vocabulary
  expect(html).toContain("mdx-caption");
  expect(html).toContain("The same corner, 118 years apart");
  // native range control provides the ARIA slider + a labelled interaction
  expect(html).toContain('type="range"');
  expect(html).toContain("Wipe between 1906 and Today");
});

test("CompareSlider SSR alt lives on the base image; after image is aria-hidden", () => {
  const html = renderToStaticMarkup(
    createElement(CompareSlider, {
      before: "/b.avif",
      after: "/a.avif",
      width: 10,
      height: 10,
      alt: "delta",
    }),
  );
  // the base (before) image carries alt for a11y
  expect(html).toContain('alt="delta"');
  // the overlay after image is decorative in the wipe view
  expect(html).toContain('aria-hidden="true"');
  // vertical orientation flips the modifier class
  const v = renderToStaticMarkup(
    createElement(CompareSlider, {
      before: "/b.avif",
      after: "/a.avif",
      width: 10,
      height: 10,
      alt: "d",
      orientation: "v" as const,
    }),
  );
  expect(v).toContain("cmp--v");
});
