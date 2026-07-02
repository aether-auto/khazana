// apps/site/src/components/mdx/p3-statemachine-ssr.test.ts
//
// SSR / no-JS + reduced-motion fallback tests for the <StateMachine> React
// island. The repo's vitest runs in Node (no jsdom): react-dom/server's
// renderToStaticMarkup is exactly the no-JS / reduced-motion end state (the
// component's SSR-safe defaults are reduced=true, token on `start`, nothing
// spent). We assert the static HTML is never blank and carries EVERY state,
// EVERY transition, and — with a sequence — the ordered walk.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import StateMachine from "./StateMachine.js";

const states = [
  { id: "closed", label: "CLOSED", x: 0, y: 0 },
  { id: "syn", label: "SYN-SENT", x: 1, y: 0 },
  { id: "est", label: "ESTABLISHED", x: 2, y: 0 },
];
const transitions = [
  { from: "closed", to: "syn", on: "SYN" },
  { from: "syn", to: "est", on: "SYN-ACK" },
  { from: "est", to: "closed", on: "FIN" },
];

test("StateMachine SSR renders a non-blank figure with panel + svg", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, { states, transitions, start: "closed" }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("mdx-figure");
  expect(html).toContain("sm-panel");
  expect(html).toContain("<svg");
  // SSR must NOT carry the sm--js hydration gate → controls stay hidden, token
  // static on start, nothing animates.
  expect(html).not.toContain("sm--js");
});

test("StateMachine SSR fallback lists EVERY state label + marks the start", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, { states, transitions, start: "closed" }),
  );
  for (const s of states) expect(html).toContain(s.label);
  expect(html).toContain("sm-fallback");
  expect(html).toContain("(start)");
});

test("StateMachine SSR fallback lists EVERY transition (from —on→ to)", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, { states, transitions, start: "closed" }),
  );
  expect(html).toContain("sm-fallback-transitions");
  for (const t of transitions) expect(html).toContain(t.on);
  expect(html).toContain("→");
});

test("StateMachine SSR renders the token on the START state (static end state)", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, { states, transitions, start: "closed" }),
  );
  // The active state is `start` with no JS → the token circle is rendered once.
  const tokens = (html.match(/sm-token/g) ?? []).length;
  expect(tokens).toBe(1);
  expect(html).toContain("sm-node--start");
  expect(html).toContain("sm-node--active");
});

test("StateMachine SSR lists the ordered WALK when a sequence is given", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, {
      states,
      transitions,
      start: "closed",
      sequence: ["closed>syn:SYN", "syn>est:SYN-ACK"],
    }),
  );
  expect(html).toContain("sm-fallback-walk");
  // walk = CLOSED → SYN-SENT → ESTABLISHED
  expect(html).toContain("CLOSED");
  expect(html).toContain("SYN-SENT");
  expect(html).toContain("ESTABLISHED");
});

test("StateMachine SSR renders a caption inside .mdx-caption", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, {
      states,
      transitions,
      start: "closed",
      caption: "The TCP three-way handshake",
    }),
  );
  expect(html).toContain("mdx-caption");
  expect(html).toContain("The TCP three-way handshake");
});

test("StateMachine SSR empty states → caption-only figure, non-throwing", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, { states: [], transitions: [], start: "x", caption: "empty" }),
  );
  expect(html).toContain("empty");
  expect(html).toContain("mdx-figure");
});

test("StateMachine SSR empty states + no caption → renders nothing", () => {
  const html = renderToStaticMarkup(
    createElement(StateMachine, { states: [], transitions: [], start: "x" }),
  );
  expect(html).toBe("");
});
