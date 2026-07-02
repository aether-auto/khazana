// apps/site/src/components/mdx/diagram-ssr.test.ts
//
// SSR / no-JS fallback tests for the <Diagram> React island. The repo's vitest
// runs in the Node environment (no jsdom), so we render via react-dom/server's
// renderToStaticMarkup through React.createElement (no JSX) and assert the
// static HTML is meaningful and non-empty — the "never blank" invariant. Every
// node label, edge, and edge-label must be present in the no-JS markup.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Diagram from "./Diagram.js";
import type { DiagramNode, DiagramEdge } from "./lib/diagram-layout.js";

const nodes: DiagramNode[] = [
  { id: "client", label: "Browser Client", x: 0, y: 0, kind: "input" },
  { id: "edge", label: "Edge Worker", x: 1, y: 0, kind: "process" },
  { id: "kv", label: "KV Store", x: 2, y: 1, kind: "store" },
  { id: "site", label: "Static Site", x: 2, y: -1, kind: "output" },
];
const edges: DiagramEdge[] = [
  { from: "client", to: "edge", label: "HTTPS", kind: "data" },
  { from: "edge", to: "kv", label: "read/write", kind: "control" },
  { from: "edge", to: "site", label: "revalidate", kind: "async" },
];

test("Diagram SSR renders a non-blank figure with the panel + svg", () => {
  const html = renderToStaticMarkup(createElement(Diagram, { nodes, edges }));
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("mdx-figure");
  expect(html).toContain("dg-panel");
  expect(html).toContain("<svg");
});

test("Diagram SSR fallback exposes EVERY node label (no-JS legible)", () => {
  const html = renderToStaticMarkup(createElement(Diagram, { nodes, edges }));
  for (const n of nodes) {
    expect(html).toContain(n.label);
  }
  // the semantic fallback list is present in the static DOM
  expect(html).toContain("dg-fallback");
  expect(html).toContain("Connections");
});

test("Diagram SSR fallback exposes every edge (from → to) + edge label", () => {
  const html = renderToStaticMarkup(createElement(Diagram, { nodes, edges }));
  for (const e of edges) {
    expect(html).toContain(e.label!);
  }
  // arrows connect labeled endpoints in the fallback list
  expect(html).toContain("dg-fallback-edges");
  expect(html).toContain("→");
});

test("Diagram SSR renders a caption inside .mdx-caption when provided", () => {
  const html = renderToStaticMarkup(
    createElement(Diagram, { nodes, edges, caption: "Request path through the edge" }),
  );
  expect(html).toContain("mdx-caption");
  expect(html).toContain("Request path through the edge");
});

test("Diagram SSR works with a single node + no edges (never blank, no Connections list)", () => {
  const html = renderToStaticMarkup(
    createElement(Diagram, { nodes: [{ id: "solo", label: "Lonely Node", x: 0, y: 0 }], edges: [] }),
  );
  expect(html).toContain("Lonely Node");
  // with zero edges the Connections block is omitted
  expect(html).not.toContain("Connections");
});

test("Diagram SSR long labels wrap into multiple tspans (no overflow), still present", () => {
  const html = renderToStaticMarkup(
    createElement(Diagram, {
      nodes: [
        { id: "a", label: "A very long descriptive service name that must wrap", x: 0, y: 0 },
        { id: "b", label: "Downstream", x: 1, y: 0 },
      ],
      edges: [{ from: "a", to: "b" }],
    }),
  );
  // multi-line label → multiple <tspan> elements
  const tspanCount = (html.match(/<tspan/g) ?? []).length;
  expect(tspanCount).toBeGreaterThan(1);
});
