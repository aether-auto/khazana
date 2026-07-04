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

test("Timeline SSR preserves AUTHORED order — does NOT re-sort by parsed epoch", () => {
  // BC dates are stored as positive ISO years (218/217/216 = 218–216 BC). An
  // ascending-epoch sort would INVERT this to 216→218 (the battle first). The
  // vertical Timeline renders the authored order, so the chronology stays correct.
  const bc = [
    { date: "218-05-01", label: "Hannibal leaves Iberia", detail: "The march begins." },
    { date: "217-06-21", label: "Lake Trasimene", detail: "The ambush." },
    { date: "216-08-02", label: "Cannae", detail: "The annihilation." },
  ];
  const html = renderToStaticMarkup(createElement(Timeline, { events: bc }));
  const iIberia = html.indexOf(">Hannibal leaves Iberia<");
  const iTrasimene = html.indexOf(">Lake Trasimene<");
  const iCannae = html.indexOf(">Cannae<");
  // authored (chronological) order top-to-bottom: 218 BC → 217 BC → 216 BC
  expect(iIberia).toBeLessThan(iTrasimene);
  expect(iTrasimene).toBeLessThan(iCannae);
});

test("Timeline SSR elapsed-gap plate is non-negative for a BC (decreasing-epoch) sequence", () => {
  // 218-05-01 → 216-08-02 steps DOWN in stored epoch; the gap must read forward
  // (absolute magnitude), never as an empty/negative gap.
  const bc = [
    { date: "218-05-01", label: "Hannibal leaves Iberia", detail: "The march begins." },
    { date: "216-08-02", label: "Cannae", detail: "The annihilation." },
  ];
  const html = renderToStaticMarkup(createElement(Timeline, { events: bc }));
  // first beat reads "opening"; the second carries a positive elapsed gap
  expect(html).toContain("opening");
  expect(html).toMatch(/\+\d+\s*(yr|mo|days?|hr|min)/);
  expect(html).not.toContain("+-"); // no negative gap ever
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
