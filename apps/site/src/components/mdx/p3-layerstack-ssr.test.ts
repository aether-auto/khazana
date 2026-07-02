// apps/site/src/components/mdx/p3-layerstack-ssr.test.ts
//
// SSR / no-JS + reduced-motion fallback tests for the <LayerStack> React island.
// Node env (no jsdom): renderToStaticMarkup is exactly the no-JS / reduced-motion
// end state — the component's SSR-safe defaults are reduced=true → EVERY layer
// expanded. We assert the static HTML is a non-blank semantic <ol> carrying every
// label, note, and detail, and that it does NOT emit the ls--js gate (so all
// bodies stay visible without JS).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import LayerStack from "./LayerStack.js";

const LAYERS = [
  {
    label: "Application",
    note: "The protocols the user actually speaks — HTTP, DNS, SMTP.",
    detail: "L7: where a browser or mail client lives.",
  },
  {
    label: "Transport",
    note: "End-to-end delivery: the ordered TCP stream or fire-and-forget UDP.",
    detail: "L4: ports, segments, the handshake.",
  },
  {
    label: "Internet",
    note: "Addressing and routing across networks — IP moves packets hop to hop.",
  },
  {
    label: "Link",
    note: "The wire (or the air): frames on a single physical segment.",
    detail: "L2/L1: Ethernet, Wi-Fi, MAC addresses.",
  },
];

test("LayerStack SSR renders a non-blank semantic <ol> with panel", () => {
  const html = renderToStaticMarkup(createElement(LayerStack, { layers: LAYERS }));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("mdx-figure");
  expect(html).toContain("ls-panel");
  expect(html).toContain("<ol");
  expect(html).toContain("ls-stack");
  // SSR must NOT carry the ls--js hydration gate → every body stays visible.
  expect(html).not.toContain("ls--js");
});

test("LayerStack SSR exposes EVERY label, note, and detail (all expanded end state)", () => {
  const html = renderToStaticMarkup(createElement(LayerStack, { layers: LAYERS }));
  for (const l of LAYERS) {
    expect(html).toContain(l.label);
    expect(html).toContain(l.note);
    if (l.detail) expect(html).toContain(l.detail);
  }
});

test("LayerStack SSR renders every layer expanded (aria-expanded=true, all bodies present)", () => {
  const html = renderToStaticMarkup(createElement(LayerStack, { layers: LAYERS }));
  // all four slabs report expanded in the static end state
  const expandedCount = (html.match(/aria-expanded="true"/g) ?? []).length;
  expect(expandedCount).toBe(LAYERS.length);
  expect(html).toContain("ls-layer--expanded");
  // no layer is collapsed in the SSR end state
  expect(html).not.toContain('aria-expanded="false"');
});

test("LayerStack SSR renders a caption inside .mdx-caption", () => {
  const html = renderToStaticMarkup(
    createElement(LayerStack, { layers: LAYERS, caption: "The four layers of the TCP/IP model" }),
  );
  expect(html).toContain("mdx-caption");
  expect(html).toContain("The four layers of the TCP/IP model");
});

test("LayerStack SSR empty layers → caption-only figure, non-throwing", () => {
  const html = renderToStaticMarkup(
    createElement(LayerStack, { layers: [], caption: "empty" }),
  );
  expect(html).toContain("empty");
  expect(html).toContain("mdx-figure");
});

test("LayerStack SSR empty layers + no caption → renders nothing", () => {
  const html = renderToStaticMarkup(createElement(LayerStack, { layers: [] }));
  expect(html).toBe("");
});
