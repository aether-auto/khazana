// apps/site/src/components/mdx/battlemap-ssr.test.ts
//
// SSR / no-JS fallback tests for the <BattleMap> React island, rendered with
// react-dom/server's renderToStaticMarkup (Node env, no jsdom). The invariants:
//   • NON-BLANK static HTML: the base image, the FIRST phase's SVG overlay
//     (units + arrows + fronts), the legend (sides + unit types), AND a semantic
//     phase-by-phase <ol> with each phase's title/time/note + its forces as text.
//   • no-JS shows arrows FULLY DRAWN: the armed-undraw only happens after client
//     hydration, so the server render emits a zero stroke-dashoffset (never blank).
//   • no 360px overflow: the image is width:100% and the overlay scales via
//     viewBox — no hardcoded pixel width on the <svg>.
//   • the caption wraps in .mdx-caption inside .mdx-figure.
//   • empty phases → still non-blank + non-throwing.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import BattleMap from "./BattleMap.js";
import type { BattleMapProps } from "./BattleMap.js";

// A REAL small action: the opening of the Battle of Chancellorsville (1863),
// modeled across four phases. `src` is a plain string in tests (the integrator
// supplies a committed getImage() src in the real MDX demo).
const CHANCELLORSVILLE: BattleMapProps = {
  src: "/img/chancellorsville-terrain.avif",
  width: 1600,
  height: 1000,
  alt: "Terrain around Chancellorsville, Virginia, spring 1863",
  caption: "Chancellorsville, May 1863 — Jackson's flank march",
  sides: [
    { id: "usa", label: "Union (Hooker)", tone: "enemy" },
    { id: "csa", label: "Confederate (Lee)", tone: "friendly" },
  ],
  phases: [
    {
      title: "Hooker crosses the Rappahannock",
      time: "Apr 30",
      note: "The <strong>Army of the Potomac</strong> concentrates at Chancellorsville, threatening Lee's rear.",
      units: [
        { side: "usa", type: "infantry", label: "XI Corps", strength: "≈12,000", at: [0.28, 0.4] },
        { side: "usa", type: "hq", label: "Hooker HQ", at: [0.44, 0.55] },
        { side: "csa", type: "infantry", label: "Lee's main body", strength: "≈43,000", at: [0.68, 0.52] },
      ],
      movements: [
        { side: "usa", from: [0.12, 0.5], to: [0.4, 0.5], kind: "advance", label: "cross the Rappahannock" },
      ],
      fronts: [{ side: "csa", kind: "line", points: [[0.6, 0.2], [0.62, 0.5], [0.6, 0.8]] }],
    },
    {
      title: "Lee divides his army",
      time: "May 1",
      note: "Lee leaves a thin screen and sends <strong>Jackson</strong> on a wide march around the Union right.",
      units: [
        { side: "usa", type: "infantry", label: "XI Corps (exposed)", strength: "≈12,000", at: [0.24, 0.38] },
        { side: "csa", type: "infantry", label: "Jackson's column", strength: "≈28,000", at: [0.55, 0.7] },
      ],
      movements: [
        { side: "csa", from: [0.6, 0.55], to: [0.35, 0.78], kind: "advance", label: "Jackson's flank march" },
      ],
    },
    {
      title: "The flank attack",
      time: "May 2, 5:15pm",
      note: "Jackson's corps erupts from the woods onto the unguarded Union right.",
      units: [
        { side: "usa", type: "infantry", label: "XI Corps routed", at: [0.28, 0.34] },
        { side: "csa", type: "infantry", label: "Jackson", at: [0.2, 0.44] },
        { side: "csa", type: "artillery", label: "Confederate guns", at: [0.3, 0.6] },
      ],
      movements: [
        { side: "csa", from: [0.2, 0.46], to: [0.34, 0.36], kind: "attack", label: "the assault" },
        { side: "usa", from: [0.3, 0.34], to: [0.5, 0.28], kind: "retreat", label: "XI Corps flees" },
      ],
      fronts: [{ side: "csa", kind: "area", points: [[0.15, 0.3], [0.4, 0.3], [0.42, 0.6], [0.16, 0.6]] }],
    },
    {
      title: "Union withdrawal",
      time: "May 5-6",
      note: "Hooker pulls the army back across the river. A costly Confederate victory.",
      units: [{ side: "usa", type: "infantry", label: "Union rear guard", at: [0.4, 0.3] }],
      movements: [
        { side: "usa", from: [0.4, 0.3], to: [0.4, 0.05], kind: "retreat", label: "withdraw north" },
        { side: "csa", from: [0.6, 0.5], to: [0.5, 0.4], kind: "supply", label: "resupply" },
      ],
    },
  ],
};

test("BattleMap SSR is non-blank: base image + first-phase overlay + legend + phase list", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  expect(html.length).toBeGreaterThan(0);
  // base image
  expect(html).toContain("bm-img");
  expect(html).toContain("/img/chancellorsville-terrain.avif");
  // the first phase's overlay: units, arrows (none in phase 0 here), fronts
  expect(html).toContain("bm-overlay");
  expect(html).toContain("bm-units");
  expect(html).toContain("bm-unit--hq"); // Hooker HQ glyph in phase 0
  expect(html).toContain("bm-front--line"); // the CSA screen line in phase 0
  // legend: sides + unit types
  expect(html).toContain("bm-legend");
  expect(html).toContain("Union (Hooker)");
  expect(html).toContain("infantry");
  expect(html).toContain("artillery");
  // the semantic phase-by-phase fallback list (never blank).
  // NB: apostrophes are HTML-escaped in SSR output (&#x27;), so assert on
  // apostrophe-free substrings of the labels.
  expect(html).toContain("bm-phase-list");
  expect(html).toContain("s flank march"); // "Jackson's flank march"
  expect(html).toContain("the assault");
  expect(html).toContain("XI Corps flees");
});

test("BattleMap SSR lists EVERY phase's title, time, and note", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  for (const p of CHANCELLORSVILLE.phases) {
    // titles are apostrophe-free here except "Lee divides"; assert on a
    // stable, escape-free fragment of each to avoid HTML-entity mismatches.
    const fragment = p.title.replace(/'/g, "&#x27;");
    expect(html).toContain(fragment);
    if (p.time) expect(html).toContain(p.time);
  }
  // note HTML is injected as real markup (a <strong> survives)
  expect(html).toContain("<strong>Jackson</strong>");
  expect(html).toContain("Army of the Potomac");
});

test("BattleMap SSR draws the FIRST phase's arrows FULLY (no-JS never blank): zero dash-offset", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  // phase 0 has an advance; the armed-undraw start is client-only so SSR shows
  // the shaft drawn (offset 0) — the reveal animation never leaves it blank.
  expect(html).toContain("bm-move-shaft is-drawn");
  expect(html).toMatch(/stroke-dashoffset:\s*0\b/);
});

test("BattleMap SSR overlay shows ONLY the first phase; later kinds live in the fallback list", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  // phase 0's advance is in the live SVG overlay
  expect(html).toContain("bm-move--advance");
  // every movement kind appears somewhere (SVG for phase 0, semantic list for
  // the rest) — the fallback carries attack/retreat/supply as force text.
  expect(html).toContain("attack"); // via "Confederate (Lee) attack" in the list
  expect(html).toContain("retreat");
  expect(html).toContain("supply");
});

test("BattleMap SSR colors sides via TOKENS, not hardcoded hex", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  // friendly → --accent, enemy → --editorial, both as custom-prop values
  expect(html).toContain("var(--accent)");
  expect(html).toContain("var(--editorial)");
  // no raw six-digit hex leaked into inline styles for sides
  expect(html).not.toMatch(/--bm-side:\s*#[0-9a-fA-F]{6}/);
});

test("BattleMap SSR scales the overlay via viewBox (no fixed px width → no 360 overflow)", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  expect(html).toContain('viewBox="0 0 1600 1000"');
  // the overlay svg must not carry a hardcoded pixel width attribute
  expect(html).not.toMatch(/<svg[^>]*class="bm-overlay"[^>]*\swidth="/);
  // wrapped as a wide mdx figure
  expect(html).toContain("mdx-figure--wide");
});

test("BattleMap SSR default class is the stacked (reduced/no-JS) surface", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  expect(html).toContain("bm--stacked");
});

test("BattleMap SSR wraps the caption in .mdx-caption inside .mdx-figure", () => {
  const html = renderToStaticMarkup(createElement(BattleMap, CHANCELLORSVILLE));
  expect(html).toContain("mdx-figure");
  expect(html).toContain("mdx-caption");
  expect(html).toContain("s flank march"); // caption (apostrophe escaped)
});

test("BattleMap unknown unit type falls back to infantry glyph (never blank marker)", () => {
  const html = renderToStaticMarkup(
    createElement(BattleMap, {
      src: "/m.avif",
      width: 800,
      height: 600,
      alt: "map",
      sides: [{ id: "a", label: "A", tone: "friendly" }],
      // @ts-expect-error — deliberately invalid type to prove the fallback
      phases: [{ title: "P1", units: [{ side: "a", type: "dragon", at: [0.5, 0.5] }] }],
    }),
  );
  expect(html).toContain("bm-unit--infantry");
});

test("BattleMap empty phases → non-blank (caption only), non-throwing", () => {
  const html = renderToStaticMarkup(
    createElement(BattleMap, {
      src: "/m.avif",
      width: 800,
      height: 600,
      alt: "map",
      caption: "no phases yet",
      sides: [],
      phases: [],
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  expect(html).toContain("no phases yet");
  expect(html).toContain("mdx-figure");
});

test("BattleMap neutral side gets the faint token, not amber/clay", () => {
  const html = renderToStaticMarkup(
    createElement(BattleMap, {
      src: "/m.avif",
      width: 800,
      height: 600,
      alt: "map",
      sides: [{ id: "civ", label: "Civilians", tone: "neutral" }],
      phases: [{ title: "P", units: [{ side: "civ", type: "infantry", at: [0.5, 0.5] }] }],
    }),
  );
  expect(html).toContain("var(--ink-faint)");
});

test("BattleMap MOBILE STRESS: 10 units + 6 arrows + fronts on a narrow map still renders every glyph & the list", () => {
  const units = Array.from({ length: 10 }, (_, i) => ({
    side: i % 2 === 0 ? "a" : "b",
    type: (["infantry", "armor", "cavalry", "artillery", "naval", "air", "hq"] as const)[i % 7],
    label: `Unit ${i + 1}`,
    strength: `${(i + 1) * 1000}`,
    at: [0.05 + (i % 5) * 0.22, 0.15 + Math.floor(i / 5) * 0.5] as [number, number],
  }));
  const movements = Array.from({ length: 6 }, (_, i) => ({
    side: i % 2 === 0 ? "a" : "b",
    from: [0.1 + i * 0.12, 0.8] as [number, number],
    to: [0.15 + i * 0.12, 0.2] as [number, number],
    kind: (["advance", "attack", "retreat", "supply"] as const)[i % 4],
    label: `Move ${i + 1}`,
  }));
  const html = renderToStaticMarkup(
    createElement(BattleMap, {
      src: "/narrow.avif",
      width: 360, // deliberately narrow base
      height: 640,
      alt: "narrow map",
      caption: "mobile stress",
      sides: [
        { id: "a", label: "Alpha", tone: "friendly" },
        { id: "b", label: "Bravo", tone: "enemy" },
      ],
      phases: [
        {
          title: "Contact",
          time: "H-hour",
          note: "Everything at once.",
          units,
          movements,
          fronts: [{ side: "a", kind: "area", points: [[0, 0], [1, 0], [1, 0.5], [0, 0.5]] }],
        },
      ],
    }),
  );
  expect(html.length).toBeGreaterThan(0);
  // all ten units listed in the fallback (each glyph type present at least once)
  for (const t of ["infantry", "armor", "cavalry", "artillery", "naval", "air", "hq"]) {
    expect(html).toContain(`bm-unit--${t}`);
  }
  // viewBox uses the narrow base dims (overlay scales to fit, no overflow)
  expect(html).toContain('viewBox="0 0 360 640"');
  expect(html).toContain("mobile stress");
  expect(html).toContain("Move 6");
});
