// apps/site/src/components/mdx/p2-eventcascade-ssr.test.ts
//
// SSR / no-JS fallback tests for the P2 React island <EventCascade>. Rendered
// with react-dom/server's renderToStaticMarkup (Node env, no jsdom) — asserting
// the static HTML is a non-blank semantic <ol> carrying EVERY node label AND
// EVERY detail (the "never blank" invariant), and that no-JS shows the whole
// chain (the static markup carries no `.ec--js` gate, so the reveal animation is
// inert and everything is visible).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import EventCascade from "./EventCascade.js";

const CHAIN = [
  {
    label: "Archduke Franz Ferdinand is assassinated in Sarajevo",
    detail: "A single pistol shot on 28 June 1914 removes the heir to Austria-Hungary.",
    kind: "cause" as const,
  },
  {
    label: "Austria-Hungary issues an ultimatum to Serbia",
    detail: "Ten demands designed to be rejected, backed by Germany's 'blank cheque'.",
    kind: "effect" as const,
  },
  {
    label: "The alliance system converts a local quarrel into a continental war",
    detail: "Mobilization timetables leave no room to stop once the first order is given.",
    kind: "turning-point" as const,
  },
];

test("EventCascade SSR renders a semantic <ol> with every node + detail, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(EventCascade, { nodes: CHAIN, caption: "how one shot became a world war" }),
  );
  expect(html.length).toBeGreaterThan(0);
  // semantic ordered list (a causal chain IS ordered)
  expect(html).toContain("<ol");
  expect(html).toContain("ec-chain");
  // every node label present in static markup
  expect(html).toContain("Archduke Franz Ferdinand");
  expect(html).toContain("issues an ultimatum");
  expect(html).toContain("continental war");
  // every detail present (role=note, reachable no-JS / by AT)
  expect(html).toContain("single pistol shot");
  expect(html).toContain("blank cheque");
  expect(html).toContain("Mobilization timetables");
  expect(html).toContain('role="note"');
  // the causal connectors (the "spine" words that make it a chain, not a clock)
  expect(html).toContain("therefore"); // link into an effect
  expect(html).toContain("and so"); // link into the turning-point
  // caption wrapped in .mdx-caption inside .mdx-figure
  expect(html).toContain("mdx-figure");
  expect(html).toContain("mdx-caption");
  expect(html).toContain("how one shot became a world war");
});

test("EventCascade SSR does NOT emit the ec--js reveal gate (no-JS shows the full chain)", () => {
  const html = renderToStaticMarkup(createElement(EventCascade, { nodes: CHAIN }));
  // `.ec--js` is added only after client hydration; its absence in SSR means the
  // hidden-until-revealed CSS never applies statically → the chain is fully shown.
  expect(html).not.toContain("ec--js");
});

test("EventCascade SSR marks node kinds for emphasis styling (turning-point)", () => {
  const html = renderToStaticMarkup(createElement(EventCascade, { nodes: CHAIN }));
  expect(html).toContain("ec-node--cause");
  expect(html).toContain("ec-node--effect");
  expect(html).toContain("ec-node--turning-point");
});

test("EventCascade default kind is 'effect' when omitted", () => {
  const html = renderToStaticMarkup(
    createElement(EventCascade, {
      nodes: [{ label: "A plain link in the chain", detail: "no kind given" }],
    }),
  );
  expect(html).toContain("ec-node--effect");
  expect(html).toContain("A plain link in the chain");
});

test("EventCascade empty nodes → caption-only figure, non-throwing, not blank when captioned", () => {
  const html = renderToStaticMarkup(createElement(EventCascade, { nodes: [], caption: "empty" }));
  expect(html).toContain("empty");
  expect(html).toContain("mdx-figure");
});

test("EventCascade empty nodes + no caption → renders nothing (null), non-throwing", () => {
  const html = renderToStaticMarkup(createElement(EventCascade, { nodes: [] }));
  expect(html).toBe("");
});
