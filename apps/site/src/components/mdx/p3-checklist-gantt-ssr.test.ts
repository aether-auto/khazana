// apps/site/src/components/mdx/p3-checklist-gantt-ssr.test.ts
//
// SSR / no-JS fallback tests for the P3 build-log islands Checklist and
// GanttStrip. Rendered with react-dom/server's renderToStaticMarkup (Node env,
// no jsdom) — asserting the static HTML is meaningful and non-blank (the "never
// blank" invariant) and that every item / task / duration is present without JS.
//
// NOTE: both components use a `hydrated` flag that starts FALSE, and localStorage
// is guarded on `typeof window` — so under SSR (no window) neither touches the
// store and the static markup is the pure no-JS fallback:
//   • Checklist → the `.ckl-fallback` static <ul> of every item (NOT `.ckl--hydrated`).
//   • GanttStrip → the SVG (bars + inline durations) PLUS the `.gnt-fallback` <ul>.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Checklist from "./Checklist.js";
import GanttStrip from "./GanttStrip.js";

// ── Checklist ────────────────────────────────────────────────────────────────

test("Checklist SSR renders the static fallback <ul> with every item, never blank", () => {
  const html = renderToStaticMarkup(
    createElement(Checklist, {
      title: "Reproduce the sensor node",
      items: [
        { label: "Flash the firmware", note: "use the 3.3V header", href: "https://example.com/fw" },
        { label: "Level the bed" },
        { label: "Print the enclosure" },
      ],
      caption: "one evening of work",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  // no-JS: NOT hydrated → static fallback list shows
  expect(html).not.toContain("ckl--hydrated");
  expect(html).toContain("ckl-fallback");
  // every item label present without JS
  expect(html).toContain("Flash the firmware");
  expect(html).toContain("Level the bed");
  expect(html).toContain("Print the enclosure");
  // note + link surfaced
  expect(html).toContain("use the 3.3V header");
  expect(html).toContain('href="https://example.com/fw"');
  // title + caption present in the shared vocabulary
  expect(html).toContain("Reproduce the sensor node");
  expect(html).toContain("mdx-caption");
  expect(html).toContain("one evening of work");
});

test("Checklist SSR does not throw without a window (localStorage guarded)", () => {
  // If localStorage access were unguarded this would throw during render.
  expect(() =>
    renderToStaticMarkup(
      createElement(Checklist, { items: [{ label: "solo step" }] }),
    ),
  ).not.toThrow();
});

test("Checklist SSR falls back to a default heading when no title is given", () => {
  const html = renderToStaticMarkup(
    createElement(Checklist, { items: [{ label: "a" }, { label: "b" }] }),
  );
  expect(html).toContain("Reproduce this");
});

// ── GanttStrip ───────────────────────────────────────────────────────────────

test("GanttStrip SSR renders bars + inline durations + a labelled fallback list", () => {
  const html = renderToStaticMarkup(
    createElement(GanttStrip, {
      tasks: [
        { label: "Design", start: 0, end: 3, note: "sketches + BOM" },
        { label: "Print", start: 3, end: 8 },
        { label: "Wire", start: 8, end: 10, note: "solder headers" },
      ],
      caption: "how long each phase took",
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  // content-fitted SVG scaling to width:100% via viewBox
  expect(html).toContain("viewBox");
  expect(html).toContain("gnt-svg");
  // every task label present
  expect(html).toContain("Design");
  expect(html).toContain("Print");
  expect(html).toContain("Wire");
  // durations spelled (default unit = day)
  expect(html).toContain("3 days");
  expect(html).toContain("5 days");
  expect(html).toContain("2 days");
  // semantic no-JS fallback list carries task + note
  expect(html).toContain("gnt-fallback");
  expect(html).toContain("sketches + BOM");
  expect(html).toContain("solder headers");
  // caption in shared vocabulary
  expect(html).toContain("mdx-caption");
  expect(html).toContain("how long each phase took");
});

test("GanttStrip SSR spells hours when unit=hr", () => {
  const html = renderToStaticMarkup(
    createElement(GanttStrip, {
      unit: "hr" as const,
      tasks: [
        { label: "Solder", start: 0, end: 1 },
        { label: "Test", start: 1, end: 4 },
      ],
    }),
  );
  expect(html).toContain("1 hr");
  expect(html).toContain("3 hr");
});

test("GanttStrip SSR renders a single task without dead vertical void", () => {
  const html = renderToStaticMarkup(
    createElement(GanttStrip, { tasks: [{ label: "Only", start: 0, end: 2 }] }),
  );
  expect(html).toContain("Only");
  expect(html).toContain("2 days");
});
