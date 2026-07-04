// apps/site/src/components/mdx/timeline-ssr.test.ts
//
// SSR / no-JS fallback tests for the vertical <Timeline> ("The Chronometer").
// Rendered with react-dom/server's renderToStaticMarkup (Node env, no jsdom) —
// asserting the static HTML is a non-blank, fully-readable vertical list carrying
// EVERY event's date, label, AND detail (nothing hover-gated, nothing truncated),
// that it does NOT emit the `.tl2--live` scroll-enhancement gate (so no-JS shows
// everything at full opacity), and that the optional image contract renders.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Timeline from "./Timeline.js";

const EVENTS = [
  {
    date: "218-05-01",
    label: "Hannibal leaves Iberia",
    detail: "Marches from New Carthage northward with roughly 90,000 infantry and 37 war elephants.",
  },
  {
    date: "218-12-22",
    label: "Battle of the Trebia",
    detail: "Hannibal lures Sempronius Longus into a dawn engagement; only 10,000 of ~40,000 Romans escape.",
  },
  {
    date: "216-08-02",
    label: "Battle of Cannae",
    detail: "The consuls field eight legions. Hannibal annihilates them in a single afternoon.",
  },
];

test("Timeline SSR renders every date, label, and full detail — never hover-gated", () => {
  const html = renderToStaticMarkup(
    createElement(Timeline, { events: EVENTS, caption: "The road to Cannae" }),
  );
  expect(html.length).toBeGreaterThan(0);
  // every label present
  expect(html).toContain("Hannibal leaves Iberia");
  expect(html).toContain("Battle of the Trebia");
  expect(html).toContain("Battle of Cannae");
  // every FULL detail present in the static markup (no truncation, no hover gate)
  expect(html).toContain("37 war elephants");
  expect(html).toContain("dawn engagement");
  expect(html).toContain("single afternoon");
  // formatted dates present (formatNodeDate)
  expect(html).toContain("1 May 218");
  expect(html).toContain("2 Aug 216");
  // the beats structure + a per-event detail class (real prose, not a tooltip)
  expect(html).toContain("tl2-beat");
  expect(html).toContain("tl2-beat-detail");
  // caption wrapped in the shared MDX frame
  expect(html).toContain("mdx-figure");
  expect(html).toContain("mdx-caption");
  expect(html).toContain("The road to Cannae");
});

test("Timeline SSR does NOT emit the tl2--live gate (no-JS shows the full stack)", () => {
  const html = renderToStaticMarkup(createElement(Timeline, { events: EVENTS }));
  // `.tl2--live` is added only after hydration when motion is allowed; its
  // absence in SSR means the dimming/sticky enhancement never applies statically
  // → every beat renders at full opacity in the single-column fallback.
  expect(html).not.toContain("tl2--live");
  // but the base timeline IS there
  expect(html).toContain("tl2");
  expect(html).toContain("tl2-beats");
});

test("Timeline SSR sorts events chronologically (ascending) regardless of input order", () => {
  // Unambiguous CE dates so ascending-by-time order is well defined. (Reads that
  // encode BC years as positive ISO years sort by the numeric year exactly as the
  // shared layoutTimeline always has — that pre-existing behaviour is preserved.)
  const ce = [
    { date: "1942-06-04", label: "Midway", detail: "The hinge." },
    { date: "1941-12-07", label: "Pearl Harbor", detail: "The opening." },
    { date: "1942-02-01", label: "Marshall raids", detail: "The probe." },
  ];
  const html = renderToStaticMarkup(createElement(Timeline, { events: ce }));
  const iPearl = html.indexOf(">Pearl Harbor<");
  const iRaids = html.indexOf(">Marshall raids<");
  const iMidway = html.indexOf(">Midway<");
  expect(iPearl).toBeLessThan(iRaids);
  expect(iRaids).toBeLessThan(iMidway);
});

test("Timeline SSR synthesises a numeric plate when no image is supplied", () => {
  const html = renderToStaticMarkup(createElement(Timeline, { events: EVENTS }));
  expect(html).toContain("tl2-plate");
  expect(html).toContain("tl2-plate-index");
  // the first beat's plate reads "opening"; later beats carry an elapsed gap
  expect(html).toContain("opening");
});

test("Timeline SSR renders an author-supplied image with alt + credit", () => {
  const withImage = [
    {
      date: "1859-09-01",
      label: "11:18 GMT — the flare",
      detail: "Carrington sees the white-light flare at Redhill.",
      image: "/img/carrington-sketch.png",
      alt: "Carrington's sketch of the sunspot group",
      imageCaption: "R. C. Carrington, 1859",
    },
  ];
  const html = renderToStaticMarkup(createElement(Timeline, { events: withImage }));
  expect(html).toContain("tl2-plate--image");
  expect(html).toContain("/img/carrington-sketch.png");
  expect(html).toContain("Carrington&#x27;s sketch of the sunspot group");
  expect(html).toContain("R. C. Carrington, 1859");
});

test("Timeline empty events → caption-only figure, non-throwing, not blank when captioned", () => {
  const html = renderToStaticMarkup(createElement(Timeline, { events: [], caption: "empty" }));
  expect(html).toContain("empty");
  expect(html).toContain("mdx-figure");
});

test("Timeline empty events + no caption → renders nothing (null), non-throwing", () => {
  const html = renderToStaticMarkup(createElement(Timeline, { events: [] }));
  expect(html).toBe("");
});
