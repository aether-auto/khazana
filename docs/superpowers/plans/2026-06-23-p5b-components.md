# P5B — Interactive MDX Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **BEFORE you write or style ANY component (every task here is visual):** invoke the `frontend-design` skill (Skill tool) and re-read §"Design contract" below. These components are the crown jewel — they make Reads *alive*. They MUST look native to khazana: mono chrome, hairline `--rule` dividers, phosphor-amber `--accent` and clay `--editorial` accents, warm serif reading face. A `<Chart>` that renders as a default Observable Plot widget (gridlines everywhere, blue marks, sans-serif tick labels) is a FAILURE of this plan even if it builds. A `<DataTable>` that looks like a Bootstrap table is a FAILURE. Style every island with the existing P5 CSS variables from `apps/site/src/styles/tokens.css` — do not invent a palette, do not ship library defaults.

**Goal:** A reusable set of **Astro islands (React)** — `<Chart>`, `<Scrolly>`/`<ScrollyStep>`, `<Timeline>`, `<Annotation>`, `<DataTable>`, `<RunnableCode>`, `<Map>` — usable directly inside the `blog` MDX collection, each SSR-ing a sensible static fallback, each styled with the P5 design tokens. Wire them into the existing `[slug].astro` → `Article.astro` reading flow and **upgrade the two existing sample MDX posts** (and add a third `teardown` sample) to genuinely use every component, so `astro build` exercises the whole kit. The component-name set must cover every `componentKit` referenced by `@khazana/core` `FORMATS` (Chart, RunnableCode, Scrolly, Annotation, DataTable, Map, Timeline). Search / ⌘K / connections graph / taste dashboard are **P5C** and explicitly out of scope.

**Architecture:** Each component is split into (a) **pure helpers** in `src/components/mdx/lib/` — deterministic, offline, injected inputs, unit-tested under strict TDD (failing test → run/FAIL → implement → run/PASS → commit): timeline time-scale, table sort/filter comparators, runnable-code output formatter + worker message protocol, map iso→choropleth color scale, chart spec normalizer — and (b) the **React island** (`.tsx`) that imports those helpers and renders. Islands are not unit-tested; their tasks are *write complete real code → verify with `pnpm --filter @khazana/site build` (every island SSRs its fallback) + `astro check` (0 errors) → commit*. Components are exported from a barrel `src/components/mdx/index.ts` and **imported directly inside each `.mdx` file** with explicit `client:*` hydration directives (see "MDX integration", below). The site reuses `@khazana/core` for vocabulary/types and never redefines it. Everything is $0/offline: RunnableCode runs untrusted JS in a self-contained module Web Worker bundled by Vite; Map uses a locally-bundled `world-atlas` TopoJSON asset (no runtime fetch); no Sandpack, no tile servers, no font/asset CDNs.

**Tech Stack:** Astro 5 + `@astrojs/react` (React 19 islands); `@observablehq/plot` + `d3` (Chart); `scrollama` (Scrolly); `codemirror` 6 (`@codemirror/state`/`view`/`commands` + `@codemirror/lang-javascript`) and a module Web Worker (RunnableCode); `d3-geo` + `topojson-client` + `world-atlas` (Map); custom React+SVG (Timeline) and React DOM (Annotation, DataTable). TypeScript 5 strict, ESM, vitest 2. All deps are workspace-installed and bundled — no CDN at runtime.

---

## Global Constraints

*(Copied verbatim from the P5B brief — treat as hard gates.)*

- $0 / offline / no API keys / no external CDN at runtime (RunnableCode self-contained worker; Map uses bundled topojson; no tile servers; no Sandpack bundler service).
- Every island SSRs a static fallback; build + a11y (keyboard, prefers-reduced-motion, aria) intact; reuse P5 design tokens.
- Reuse `@khazana/core` (FORMATS etc.); never redefine. Don't touch P5C concerns (search/⌘K/graph/dashboard).
- pnpm; ESM; TS strict; React islands typed (no `any` in public component props).

**Additional encoded decisions (from brief + repo facts — verified against the existing P5 site):**

- **MDX integration approach = direct `import` in each `.mdx` file**, with explicit per-use `client:*` directives. The existing `apps/site/src/pages/reads/[slug].astro` renders posts with `const { Content } = await render(post)` then `<Content />` slotted into `Article.astro`'s `.prose` div — it does **not** pass a `components` prop. Astro's `components` prop only maps *HTML element names* (e.g. `h2`, `a`) and cannot attach `client:*` directives, so islands needing hydration must be imported in the MDX. Direct import is the only approach that lets each post choose `client:visible` (heavy: Chart, Map, RunnableCode, Scrolly) vs `client:load` (light: Annotation, DataTable, Timeline). **Do not** add a `components` mapping to `[slug].astro`; leave it untouched. Posts import from the barrel: `import { Chart, Timeline } from "../../components/mdx";` (path is relative to `src/content/blog/`).
- `@astrojs/react` must be added to `astro.config.mjs` `integrations` **after** `mdx()` ordering is irrelevant, but React must be present so MDX can render `.tsx` components. Add `react()` to the integrations array.
- Each island MUST render meaningful SSR output (the static fallback) from its first synchronous render — never gate all content behind `useEffect`/`typeof window`. `astro build` SSRs islands once with no DOM; a fallback that throws or renders nothing breaks the build and fails no-JS users.
- ESM rule (repo-wide, `verbatimModuleSyntax` is on in `tsconfig`): relative imports between `.ts` helper modules use `.js` extensions; `import type` / inline `type` for type-only. **Exception:** `.tsx`/`.mdx` files and Astro components do not need `.js` on sibling imports under the Vite/Astro resolver, and `world-atlas`/`scrollama`/plot imports are bare specifiers. Match the surrounding file: helper `.ts` ↔ `.ts` imports use `.js`; `.tsx` island imports of helpers use `.js` too (they compile through the same TS resolver). When unsure, run `astro check`.
- `vitest.config.ts` already includes `apps/**/*.test.ts` — helper tests under `apps/site/src/components/mdx/lib/` are picked up by root `pnpm test` automatically. No config change needed.
- The Web Worker file is referenced via `new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" })`. This is the Vite-blessed static form: Vite sees the literal `new URL(..., import.meta.url)` and bundles the worker as a separate chunk at build time. Do **not** construct the URL from a variable or fetch a remote worker script — that breaks static bundling and the $0/offline invariant.
- `world-atlas` ships TopoJSON JSON files (`countries-110m.json`). Import it as a bundled asset: `import worldTopo from "world-atlas/countries-110m.json";` (Vite inlines/emits it as a static asset, no runtime fetch). Convert with `topojson-client` `feature()` and project with `d3-geo` `geoPath`/`geoNaturalEarth1`.
- TS strict + "no `any` in public props": every component's `Props` interface is fully typed and exported from the barrel for MDX authors. Internal `unknown` is fine where genuinely dynamic (RunnableCode captures arbitrary `console.log` args) but must be narrowed/formatted by a typed helper, never surfaced as `any`.

---

## Design contract (terminal × editorial — applies to every component)

> Re-read this before styling. The P5 tokens live in `apps/site/src/styles/tokens.css`; they are already loaded globally (via `Shell.astro` → `global.css`) on every Reads page, so island `<style>`/scoped CSS can reference the variables directly. Islands ship their CSS as a co-located `.css` imported by the `.tsx` (Vite bundles it) OR as inline `style` for one-offs; prefer a co-located `<component>.css` per component for anything non-trivial.

**Tokens you will use most:**
- Surfaces: `--bg`, `--bg-raised` (component panels), `--bg-inset` (wells, output panes, code).
- Ink: `--ink` (primary), `--ink-dim` (secondary), `--ink-faint` (mono labels/metadata).
- Rules: `--rule` (hairline `--hair` = 1px dividers/borders), `--rule-bright` (hover).
- Accents: `--accent` (phosphor amber — interactive affordances, active states, chart primary series, run button), `--editorial` (clay — section markers, the article rule, chart secondary series), `--good` (sage — positive/third series).
- Type: `--font-mono` (ALL component chrome, labels, table headers, code, axis ticks, timeline dates), `--font-read` (only annotation note prose / long inline text that belongs to the reading voice). Sizes `--t-xs`…`--t-md`; `--measure: 68ch`.
- Spacing `--s-1`…`--s-12`; radii `--r-sm` 2px / `--r-md` 4px (crisp — small radii only).

**Cross-component rules (consistency = looks designed, not assembled):**
1. **Mono chrome, serif only for reading prose.** Axis labels, table headers, timeline dates, code, run/output, legends → `--font-mono`, `--t-xs`, often `text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint)` (the `.eyebrow` idiom). Annotation note bodies may use `--font-read`.
2. **Hairlines, not boxes.** Borders are `var(--hair) solid var(--rule)`; never heavy borders or drop shadows on chrome. Phosphor glow only on accent hover: `text-shadow: 0 0 8px color-mix(in oklab, var(--accent) 50%, transparent)`.
3. **Accent discipline.** One amber, one clay, one sage. Chart series palette = `[--accent, --editorial, --good, --ink-dim]`. Choropleth = amber ramp. Active/hover/focus states use `--accent`.
4. **Reduced motion.** Every animation/transition wrapped so `@media (prefers-reduced-motion: reduce)` degrades it (Scrolly → plain stacked steps; chart/timeline transitions off). Mirror the existing `global.css` reduced-motion handling.
5. **Focus + keyboard.** Interactive elements are real `<button>`/`<th>`-with-`<button>`/`<a>`/`tabindex=0`, get the global `:focus-visible` ring (already styled), and are operable by keyboard. `aria-*` per component (described below).
6. **Static fallback first.** SSR render shows the data legibly with zero JS (a `<figure>` + `<figcaption>`, a real `<table>`, an `<ol>` timeline, the code as a `<pre>`, the map as the SSR'd SVG). Hydration *enhances*; it is never required to see content.

A small shared CSS helper file `src/components/mdx/mdx.css` holds the common figure/caption/panel scaffolding so every component inherits the same frame:

```css
/* src/components/mdx/mdx.css — shared frame for every MDX island.
   Tokens come from tokens.css (loaded globally on every Reads page). */
.mdx-figure {
  margin: var(--s-6) 0;
  /* break out of the 68ch measure for breathing room, but stay within the column */
  max-width: var(--measure);
}
.mdx-figure--wide {
  /* widen interactives slightly past the reading measure */
  max-width: min(100%, 52rem);
  margin-inline: auto;
}
.mdx-panel {
  background: var(--bg-raised);
  border: var(--hair) solid var(--rule);
  border-radius: var(--r-md);
  overflow: clip;
}
.mdx-caption {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  margin-top: var(--s-3);
}
.mdx-caption::before { content: "fig — "; color: var(--editorial); }
.mdx-label {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-faint);
}
@media (prefers-reduced-motion: reduce) {
  .mdx-figure :global(*) { transition: none !important; animation: none !important; }
}
```

---

## Repository facts (verified — do not re-derive)

- `apps/site/package.json` deps today: `@astrojs/mdx ^4`, `@khazana/core workspace:*`, `@khazana/worker workspace:*`, `astro ^5`; devDeps `@astrojs/check ^0.9`, `@types/node ^26`. Scripts: `build` = `astro build`, `typecheck` = `astro check`.
- `apps/site/astro.config.mjs` integrations = `[mdx()]`, `output: "static"`, `build.assets: "_assets"`.
- `apps/site/src/pages/reads/[slug].astro` renders MDX via `render(post)` → `<Content />` into `Article.astro`. The `.prose` div in `Article.astro` is where MDX children land (line ~38; the existing `<!-- SEAM (P5B) -->` comment marks it). **Leave both files' wiring intact**; you only add the component imports inside the MDX.
- Sample posts: `src/content/blog/the-longest-night.mdx` (format `chronicle`, kit Scrolly/Annotation/Timeline/Map) and `src/content/blog/the-week-in-silicon.mdx` (format `dispatch`, kit Chart/Scrolly/DataTable/Annotation). Both end with a `{/* SEAM (P5B) ... */}` comment marking where components mount. A third `teardown` post is added in T7 (kit RunnableCode/Chart/Annotation).
- `content.config.ts` schema is fixed (title/format/channels/summary/publishedAt/sources/draft); **do not change it.** Components carry their data as MDX props, not frontmatter.
- Vitest pattern (from `src/lib/format.test.ts`): `import { expect, test } from "vitest"`, helper imported with `.js`, deterministic with an injected `now: Date`. Co-locate helper tests next to the helper.
- Token reference (authoritative): `apps/site/src/styles/tokens.css` (dark default + light `@media`). Components inherit these on every Reads page.
- `@khazana/core` `FORMATS` `componentKit` union across all six formats = **{Scrolly, Annotation, Timeline, Map, Chart, DataTable, RunnableCode}** — this plan must produce exactly those seven names.

---

### Task 1: React integration + deps + MDX barrel + first island (`<Annotation>`) end-to-end

**Goal:** Stand up the whole React-island pipeline with the smallest real component, proving MDX-import + hydration + SSR-fallback + build all work before adding heavy deps. Annotation is the lightest (`client:load`), is in five of six format kits, and needs no third-party lib.

**Interfaces (new files):**
- `apps/site/src/components/mdx/mdx.css` — shared frame (above).
- `apps/site/src/components/mdx/Annotation.tsx` — the island.
- `apps/site/src/components/mdx/Annotation.css` — its styles.
- `apps/site/src/components/mdx/index.ts` — the barrel (starts with Annotation; grows each task).

- [ ] **Step 1: Add deps + React integration**

Run (from repo root):
```
pnpm --filter @khazana/site add @astrojs/react react react-dom
pnpm --filter @khazana/site add -D @types/react @types/react-dom
```
Then edit `apps/site/astro.config.mjs` to register React:
```js
// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

const site = process.env.PUBLIC_SITE_URL || "https://example.com";
const base = process.env.PUBLIC_BASE_PATH || "/";

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "ignore",
  integrations: [react(), mdx()],
  build: { assets: "_assets" },
});
```
Run: `pnpm --filter @khazana/site build`
Expected: PASS — build succeeds unchanged (no islands used yet; React integration registered).

- [ ] **Step 2: Shared frame CSS**

Create `apps/site/src/components/mdx/mdx.css` with the exact contents from the "Design contract" block above.

- [ ] **Step 3: Write `Annotation.tsx` (complete, real)**

`<Annotation term="..." note="...">` renders the term inline with a dotted underline; on hover OR keyboard focus it reveals an accessible margin-note/popover. SSR fallback: the term plus a visually-hidden note linked by `aria-describedby` (no-JS readers still get the note via the hidden span; screen readers announce it). Hydration adds the visible popover + focus/hover toggle.

```tsx
// apps/site/src/components/mdx/Annotation.tsx
import { useId, useState, type ReactNode } from "react";
import "./mdx.css";
import "./Annotation.css";

export interface AnnotationProps {
  /** The inline term being annotated. */
  term: string;
  /** Margin-note / popover text. Plain string (kept short, reading-voice). */
  note: string;
  /** Optional richer children rendered inside the note instead of `note`. */
  children?: ReactNode;
}

/**
 * Inline annotated term with an accessible popover note.
 * Reveals on hover AND keyboard focus; note linked via aria-describedby so the
 * SSR/no-JS path still exposes it to assistive tech.
 */
export default function Annotation({ term, note, children }: AnnotationProps) {
  const noteId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="mdx-annot">
      <button
        type="button"
        className="mdx-annot__term"
        aria-describedby={noteId}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {term}
      </button>
      <span
        id={noteId}
        role="note"
        className={open ? "mdx-annot__note mdx-annot__note--open" : "mdx-annot__note"}
      >
        {children ?? note}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Write `Annotation.css` (token-driven)**

```css
/* apps/site/src/components/mdx/Annotation.css */
.mdx-annot { position: relative; }
.mdx-annot__term {
  font: inherit;            /* sit in the serif reading flow */
  background: none;
  border: none;
  padding: 0;
  cursor: help;
  color: var(--ink);
  border-bottom: 1px dotted color-mix(in oklab, var(--accent) 70%, transparent);
}
.mdx-annot__term:hover { color: var(--accent); }
.mdx-annot__note {
  position: absolute;
  left: 0;
  top: calc(100% + var(--s-2));
  z-index: 5;
  width: min(22rem, 70vw);
  background: var(--bg-raised);
  border: var(--hair) solid var(--rule);
  border-left: 2px solid var(--editorial);
  border-radius: var(--r-md);
  padding: var(--s-3) var(--s-4);
  font-family: var(--font-read);
  font-size: var(--t-sm);
  line-height: var(--lh-read);
  color: var(--ink-dim);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-2px);
  transition: opacity 120ms ease, transform 120ms ease, visibility 120ms;
}
.mdx-annot__note--open { opacity: 1; visibility: visible; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .mdx-annot__note { transition: none; }
}
```

- [ ] **Step 5: Write the barrel `index.ts`**

```ts
// apps/site/src/components/mdx/index.ts
// Barrel for MDX-authored interactive islands. Posts import from here.
export { default as Annotation } from "./Annotation.js";
export type { AnnotationProps } from "./Annotation.js";
```
*(Note: TS resolves `./Annotation.js` → `Annotation.tsx` under the Astro/Vite resolver. Each later task appends its component + props type here.)*

- [ ] **Step 6: Smoke-test the pipeline in one MDX post**

Temporarily add to the TOP of `src/content/blog/the-week-in-silicon.mdx` body (right after frontmatter), to prove import + hydration + SSR:
```mdx
import { Annotation } from "../../components/mdx";

Inference at the <Annotation client:load term="edge" note="The network edge: compute physically close to users — CDN POPs, on-device NPUs — rather than a central datacenter." /> is getting cheap.
```
Run: `pnpm --filter @khazana/site build`
Expected: PASS — build succeeds; `dist/reads/the-week-in-silicon/index.html` contains the term in SSR'd HTML and the note text (in the `role="note"` span) is present pre-hydration. Grep to confirm: `grep -l "edge: compute physically" apps/site/dist/reads/the-week-in-silicon/index.html`.
Run: `pnpm --filter @khazana/site typecheck`
Expected: `astro check` 0 errors.

- [ ] **Step 7: Commit**

(Leave the smoke-test snippet in `the-week-in-silicon.mdx` for now; T7 rewrites that post fully.)
```
git add -A && git commit -m "P5B T1: React islands + MDX barrel + Annotation component"
```

---

### Task 2: `<Chart>` — Observable Plot island (TDD spec normalizer)

**Goal:** A responsive, token-styled chart. Pure helper: a **spec normalizer** that turns the declarative `<Chart>` props into a validated, defaulted Observable Plot options object (deterministic, testable without a DOM). Island: renders Plot into a ref via `useEffect`, re-renders on resize via `ResizeObserver`, cleans up on unmount; SSR fallback is a `<figure>` with a `<figcaption>` and a hidden data summary.

**Interfaces (new files):**
- `apps/site/src/components/mdx/lib/chart-spec.ts` + `chart-spec.test.ts` — pure normalizer (TDD).
- `apps/site/src/components/mdx/Chart.tsx` + `Chart.css`.

- [ ] **Step 1: Add deps**
```
pnpm --filter @khazana/site add @observablehq/plot d3
pnpm --filter @khazana/site add -D @types/d3
```

- [ ] **Step 2: TDD the spec normalizer — write the test FIRST**

The normalizer maps khazana's small declarative API to Plot options and injects the token-aware palette + mono tick style. It is pure: no DOM, no Plot import (it returns a plain options object Plot will consume in the island). It validates marks and resolves the color scale domain deterministically.

```ts
// apps/site/src/components/mdx/lib/chart-spec.test.ts
import { expect, test } from "vitest";
import { normalizeChartSpec, KHAZANA_SERIES } from "./chart-spec.js";

const data = [
  { year: 2020, value: 3, series: "a" },
  { year: 2021, value: 5, series: "a" },
  { year: 2020, value: 2, series: "b" },
  { year: 2021, value: 8, series: "b" },
];

test("line mark builds Plot marks with x/y/stroke channels", () => {
  const spec = normalizeChartSpec({
    data,
    mark: "line",
    x: "year",
    y: "value",
    series: "series",
  });
  expect(spec.marks).toHaveLength(2); // ruleY baseline + the line
  const line = spec.marks[1];
  expect(line.type).toBe("line");
  expect(line.options.x).toBe("year");
  expect(line.options.y).toBe("value");
  expect(line.options.stroke).toBe("series");
});

test("bar mark uses barY and includes a y baseline rule", () => {
  const spec = normalizeChartSpec({ data, mark: "bar", x: "year", y: "value" });
  expect(spec.marks[0].type).toBe("ruleY");
  expect(spec.marks[1].type).toBe("barY");
});

test("color domain is the sorted distinct series values, range = khazana palette", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value", series: "series" });
  expect(spec.color?.domain).toEqual(["a", "b"]);
  expect(spec.color?.range).toEqual(KHAZANA_SERIES.slice(0, 2));
});

test("no series => single-accent stroke, no color scale", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value" });
  expect(spec.color).toBeUndefined();
  expect(spec.marks[1].options.stroke).toBe(KHAZANA_SERIES[0]);
});

test("defaults: responsive height, mono tick font, no gridlines by default", () => {
  const spec = normalizeChartSpec({ data, mark: "line", x: "year", y: "value" });
  expect(spec.height).toBe(320);
  expect(spec.style.fontFamily).toMatch(/mono/i);
  expect(spec.grid).toBe(false);
});

test("explicit caption + height + grid pass through", () => {
  const spec = normalizeChartSpec({
    data, mark: "bar", x: "year", y: "value", height: 240, grid: true, caption: "GDP",
  });
  expect(spec.height).toBe(240);
  expect(spec.grid).toBe(true);
  expect(spec.caption).toBe("GDP");
});

test("rejects unknown mark", () => {
  // @ts-expect-error invalid mark at the type level too
  expect(() => normalizeChartSpec({ data, mark: "pie", x: "year", y: "value" })).toThrow(/mark/i);
});

test("rejects empty data", () => {
  expect(() => normalizeChartSpec({ data: [], mark: "line", x: "year", y: "value" })).toThrow(/data/i);
});
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/chart-spec.test.ts`
Expected: FAIL — cannot resolve `./chart-spec.js`.

- [ ] **Step 3: Implement `chart-spec.ts` to PASS**

```ts
// apps/site/src/components/mdx/lib/chart-spec.ts
/**
 * Pure normalizer: khazana's small declarative <Chart> API -> a plain,
 * Plot-agnostic options object. No DOM, no Plot import — testable offline.
 * The island (Chart.tsx) maps `marks` onto real Observable Plot marks.
 */

/** khazana series palette as CSS custom-property references (token-driven). */
export const KHAZANA_SERIES = [
  "var(--accent)",
  "var(--editorial)",
  "var(--good)",
  "var(--ink-dim)",
] as const;

export type ChartMark = "line" | "bar" | "area" | "dot";

export interface ChartProps {
  /** Row-oriented data. */
  data: ReadonlyArray<Record<string, unknown>>;
  /** Mark family. */
  mark: ChartMark;
  /** Field name for the x channel. */
  x: string;
  /** Field name for the y channel. */
  y: string;
  /** Optional field that splits data into colored series. */
  series?: string;
  /** Pixel height (default 320). */
  height?: number;
  /** Show gridlines (default false — terminal aesthetic prefers axes only). */
  grid?: boolean;
  /** Caption rendered in the figcaption. */
  caption?: string;
}

export interface NormalizedMark {
  type: "line" | "barY" | "areaY" | "dot" | "ruleY";
  options: Record<string, unknown>;
}

export interface NormalizedChartSpec {
  marks: NormalizedMark[];
  height: number;
  grid: boolean;
  caption?: string;
  color?: { domain: string[]; range: string[] };
  style: { fontFamily: string; background: string; color: string; fontSize: string };
}

const MARK_TYPE: Record<ChartMark, NormalizedMark["type"]> = {
  line: "line",
  bar: "barY",
  area: "areaY",
  dot: "dot",
};

const distinctSorted = (rows: ReadonlyArray<Record<string, unknown>>, key: string): string[] =>
  [...new Set(rows.map((r) => String(r[key])))].sort();

export function normalizeChartSpec(props: ChartProps): NormalizedChartSpec {
  const { data, mark, x, y, series, height = 320, grid = false, caption } = props;
  if (!data || data.length === 0) throw new Error("Chart: `data` must be a non-empty array");
  if (!(mark in MARK_TYPE)) throw new Error(`Chart: unknown mark "${mark}"`);

  const baseOptions: Record<string, unknown> = { x, y, tip: true };
  let color: NormalizedChartSpec["color"];

  if (series) {
    const domain = distinctSorted(data, series);
    const range = KHAZANA_SERIES.slice(0, Math.max(domain.length, 1)).map(String);
    color = { domain, range };
    baseOptions.stroke = series;
    baseOptions.fill = series;
  } else {
    baseOptions.stroke = String(KHAZANA_SERIES[0]);
    baseOptions.fill = String(KHAZANA_SERIES[0]);
  }

  const marks: NormalizedMark[] = [
    { type: "ruleY", options: { y: 0 } }, // hairline baseline
    { type: MARK_TYPE[mark], options: baseOptions },
  ];

  return {
    marks,
    height,
    grid,
    caption,
    color,
    style: {
      fontFamily:
        'var(--font-mono, "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace)',
      background: "transparent",
      color: "var(--ink-dim)",
      fontSize: "var(--t-xs, 0.75rem)",
    },
  };
}
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/chart-spec.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 4: Write `Chart.tsx` island (complete, real Observable Plot)**

```tsx
// apps/site/src/components/mdx/Chart.tsx
import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import {
  normalizeChartSpec,
  type ChartProps,
  type NormalizedMark,
} from "./lib/chart-spec.js";
import "./mdx.css";
import "./Chart.css";

function buildMark(m: NormalizedMark, data: ChartProps["data"]) {
  switch (m.type) {
    case "ruleY":
      return Plot.ruleY([0], { stroke: "var(--rule)" });
    case "line":
      return Plot.line(data, { ...m.options, strokeWidth: 2 });
    case "areaY":
      return Plot.areaY(data, { ...m.options, fillOpacity: 0.12 });
    case "barY":
      return Plot.barY(data, { ...m.options, insetLeft: 1, insetRight: 1 });
    case "dot":
      return Plot.dot(data, { ...m.options, r: 3 });
  }
}

/**
 * Responsive Observable Plot chart, styled with khazana tokens.
 * SSR fallback: figure + caption + a hidden data summary so no-JS readers and
 * the build get real content; the live plot mounts on hydration.
 */
export default function Chart(props: ChartProps) {
  const spec = normalizeChartSpec(props);
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    const chart = Plot.plot({
      width,
      height: spec.height,
      marginLeft: 48,
      marginBottom: 32,
      style: spec.style,
      grid: spec.grid,
      x: { tickSize: 0, label: null },
      y: { tickSize: 0, label: null, ...(spec.grid ? {} : {}) },
      color: spec.color ? { type: "categorical", ...spec.color, legend: !!props.series } : undefined,
      marks: spec.marks.map((m) => buildMark(m, props.data)),
    });
    el.replaceChildren(chart);
    return () => chart.remove();
  }, [width, spec, props.data, props.series]);

  return (
    <figure className="mdx-figure mdx-figure--wide">
      <div className="mdx-panel chart-panel">
        <div ref={ref} className="chart-host" aria-hidden="true" />
        {/* SSR/no-JS fallback summary (hidden once hydrated host has content) */}
        <div className="chart-fallback">
          <span className="mdx-label">chart</span>: {props.mark} of {props.y} by {props.x}
          {props.series ? ` (${props.series})` : ""} — {props.data.length} points
        </div>
      </div>
      {spec.caption ? <figcaption className="mdx-caption">{spec.caption}</figcaption> : null}
    </figure>
  );
}
```

- [ ] **Step 5: Write `Chart.css`**

```css
/* apps/site/src/components/mdx/Chart.css */
.chart-panel { padding: var(--s-4); }
.chart-host { width: 100%; min-height: 1px; }
.chart-host:empty + .chart-fallback { display: block; } /* show fallback pre-hydration */
.chart-host:not(:empty) + .chart-fallback { display: none; } /* hide once Plot mounts */
.chart-fallback {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-faint);
  padding: var(--s-4) 0;
}
/* Style Plot's emitted SVG to the terminal aesthetic. */
.chart-host :global(svg) { color: var(--ink-dim); }
.chart-host :global(svg [aria-label="x-axis tick label"]),
.chart-host :global(svg [aria-label="y-axis tick label"]) {
  font-family: var(--font-mono);
  fill: var(--ink-faint);
}
.chart-host :global(.plot-d6e2ef-swatches) { /* Plot legend */
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-faint);
}
```
*(Note: Plot's legend class is generated; the robust path is to set `style.fontFamily` in the spec — already done — which Plot applies to the whole figure including the legend. The `:global` rules are belt-and-suspenders.)*

- [ ] **Step 6: Extend the barrel + verify**

Append to `index.ts`:
```ts
export { default as Chart } from "./Chart.js";
export type { ChartProps } from "./lib/chart-spec.js";
```
Add a temporary `<Chart client:visible .../>` use to `the-week-in-silicon.mdx` (a small inline dataset; T7 finalizes it), then:
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/chart-spec.test.ts && pnpm --filter @khazana/site build && pnpm --filter @khazana/site typecheck`
Expected: spec tests PASS (8); build succeeds (Chart SSRs the fallback summary; `@observablehq/plot` + `d3` bundle); `astro check` 0 errors.

- [ ] **Step 7: Commit**
```
git add -A && git commit -m "P5B T2: Chart island (Observable Plot) + TDD spec normalizer"
```

---

### Task 3: `<Timeline>` (TDD time-scale) + `<DataTable>` (TDD sort/filter)

**Goal:** Two light (`client:load`) DOM components, each driven by a TDD'd pure helper. Timeline: a deterministic linear time-scale mapping event dates → x positions; React+SVG render with hover/focus detail. DataTable: pure sort comparator + filter predicate; accessible sortable headers.

**Interfaces (new files):**
- `lib/timeline-scale.ts` + `.test.ts`; `Timeline.tsx` + `Timeline.css`.
- `lib/table-sort.ts` + `.test.ts`; `DataTable.tsx` + `DataTable.css`.

#### 3A — Timeline

- [ ] **Step 1: TDD the time-scale — test FIRST**

```ts
// apps/site/src/components/mdx/lib/timeline-scale.test.ts
import { expect, test } from "vitest";
import { buildTimelineScale, type TimelineEvent } from "./timeline-scale.js";

const events: TimelineEvent[] = [
  { date: "1941-09-08", label: "Siege begins" },
  { date: "1942-01-24", label: "Ration raised", detail: "to 250g" },
  { date: "1943-01-18", label: "Corridor opened" },
];

test("maps first event to x=0 and last to x=width within margins", () => {
  const s = buildTimelineScale(events, 1000);
  expect(s.points[0].x).toBe(0);
  expect(s.points[2].x).toBe(1000);
});

test("positions are proportional to elapsed time (monotonic, in order)", () => {
  const s = buildTimelineScale(events, 1000);
  expect(s.points[1].x).toBeGreaterThan(s.points[0].x);
  expect(s.points[1].x).toBeLessThan(s.points[2].x);
  // ~ (Jan24 - Sep8) / (Jan18'43 - Sep8'41) of 1000
  expect(s.points[1].x).toBeCloseTo(204, 0);
});

test("carries label + detail through, sorted by date even if input unsorted", () => {
  const shuffled = [events[2], events[0], events[1]];
  const s = buildTimelineScale(shuffled, 1000);
  expect(s.points.map((p) => p.label)).toEqual([
    "Siege begins",
    "Ration raised",
    "Corridor opened",
  ]);
  expect(s.points[1].detail).toBe("to 250g");
});

test("emits year tick marks spanning the range", () => {
  const s = buildTimelineScale(events, 1000);
  expect(s.ticks.map((t) => t.year)).toEqual([1941, 1942, 1943]);
  expect(s.ticks[0].x).toBeGreaterThanOrEqual(0);
  expect(s.ticks.at(-1)!.x).toBeLessThanOrEqual(1000);
});

test("single event sits at x=0", () => {
  const s = buildTimelineScale([events[0]], 1000);
  expect(s.points[0].x).toBe(0);
  expect(s.ticks.length).toBeGreaterThanOrEqual(1);
});

test("rejects empty input", () => {
  expect(() => buildTimelineScale([], 1000)).toThrow(/event/i);
});

test("rejects unparseable dates", () => {
  expect(() => buildTimelineScale([{ date: "not-a-date", label: "x" }], 1000)).toThrow(/date/i);
});
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/timeline-scale.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 2: Implement `timeline-scale.ts` to PASS**

```ts
// apps/site/src/components/mdx/lib/timeline-scale.ts
/** Pure deterministic time-scale for <Timeline>. No DOM, no `now` dependency. */

export interface TimelineEvent {
  /** ISO date (YYYY-MM-DD or full ISO). */
  date: string;
  label: string;
  detail?: string;
}

export interface TimelinePoint extends TimelineEvent {
  /** x in [0, width]. */
  x: number;
  /** epoch ms, for stable keys/sorting. */
  t: number;
}

export interface TimelineTick {
  year: number;
  x: number;
}

export interface TimelineScale {
  points: TimelinePoint[];
  ticks: TimelineTick[];
  width: number;
}

function parse(date: string): number {
  const t = Date.parse(date);
  if (Number.isNaN(t)) throw new Error(`Timeline: unparseable date "${date}"`);
  return t;
}

export function buildTimelineScale(events: ReadonlyArray<TimelineEvent>, width: number): TimelineScale {
  if (!events || events.length === 0) throw new Error("Timeline: needs at least one event");
  const parsed = events
    .map((e) => ({ ...e, t: parse(e.date) }))
    .sort((a, b) => a.t - b.t);

  const min = parsed[0].t;
  const max = parsed[parsed.length - 1].t;
  const span = max - min;
  const project = (t: number): number => (span === 0 ? 0 : ((t - min) / span) * width);

  const points: TimelinePoint[] = parsed.map((e) => ({ ...e, x: project(e.t) }));

  const startYear = new Date(min).getUTCFullYear();
  const endYear = new Date(max).getUTCFullYear();
  const ticks: TimelineTick[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const t = Date.UTC(y, 0, 1);
    const clamped = Math.min(Math.max(t, min), max);
    ticks.push({ year: y, x: project(clamped) });
  }

  return { points, ticks, width };
}
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/timeline-scale.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 3: Write `Timeline.tsx` (React + SVG) + `Timeline.css`**

```tsx
// apps/site/src/components/mdx/Timeline.tsx
import { useState } from "react";
import { buildTimelineScale, type TimelineEvent } from "./lib/timeline-scale.js";
import "./mdx.css";
import "./Timeline.css";

export interface TimelineProps {
  events: TimelineEvent[];
  caption?: string;
}

const VIEW_W = 1000;
const VIEW_H = 120;
const AXIS_Y = 70;

/**
 * Horizontal SVG timeline. Pure scale from buildTimelineScale; hover/focus a
 * marker to reveal its detail. SSR fallback is a semantic ordered list so the
 * content is fully legible with no JS.
 */
export default function Timeline({ events, caption }: TimelineProps) {
  const { points, ticks } = buildTimelineScale(events, VIEW_W);
  const [active, setActive] = useState<number | null>(null);

  return (
    <figure className="mdx-figure mdx-figure--wide tl">
      <div className="mdx-panel tl-panel">
        <svg
          className="tl-svg"
          viewBox={`0 -10 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Timeline"
        >
          <line className="tl-axis" x1={0} y1={AXIS_Y} x2={VIEW_W} y2={AXIS_Y} />
          {ticks.map((t) => (
            <g key={t.year} className="tl-tick">
              <line x1={t.x} y1={AXIS_Y - 4} x2={t.x} y2={AXIS_Y + 4} />
              <text x={t.x} y={AXIS_Y + 20} className="tl-tick-label">{t.year}</text>
            </g>
          ))}
          {points.map((p, i) => (
            <g
              key={`${p.t}-${i}`}
              className={active === i ? "tl-pt tl-pt--active" : "tl-pt"}
              tabIndex={0}
              role="button"
              aria-label={`${p.date}: ${p.label}${p.detail ? `. ${p.detail}` : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <line x1={p.x} y1={AXIS_Y} x2={p.x} y2={28} className="tl-stem" />
              <circle cx={p.x} cy={28} r={5} className="tl-dot" />
              <text x={p.x} y={18} className="tl-label">{p.label}</text>
              {active === i && p.detail ? (
                <text x={p.x} y={AXIS_Y + 40} className="tl-detail">{p.detail}</text>
              ) : null}
            </g>
          ))}
        </svg>
        {/* SSR / no-JS fallback */}
        <ol className="tl-fallback">
          {points.map((p, i) => (
            <li key={`f-${i}`}>
              <span className="mdx-label">{p.date}</span> {p.label}
              {p.detail ? <span className="tl-fallback-detail"> — {p.detail}</span> : null}
            </li>
          ))}
        </ol>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
```

```css
/* apps/site/src/components/mdx/Timeline.css */
.tl-panel { padding: var(--s-5) var(--s-4); }
.tl-svg { width: 100%; height: auto; display: block; }
.tl-axis { stroke: var(--rule); stroke-width: 1; }
.tl-tick line { stroke: var(--rule); stroke-width: 1; }
.tl-tick-label, .tl-label, .tl-detail {
  font-family: var(--font-mono);
  fill: var(--ink-faint);
}
.tl-tick-label { font-size: 11px; text-anchor: middle; }
.tl-label { font-size: 11px; text-anchor: middle; fill: var(--ink-dim); }
.tl-detail { font-size: 11px; text-anchor: middle; fill: var(--accent); }
.tl-stem { stroke: var(--rule-bright); stroke-width: 1; }
.tl-dot { fill: var(--bg-raised); stroke: var(--editorial); stroke-width: 2; transition: r 120ms ease; }
.tl-pt { cursor: pointer; }
.tl-pt:focus { outline: none; }
.tl-pt--active .tl-dot { fill: var(--accent); stroke: var(--accent); r: 6; }
.tl-pt--active .tl-label { fill: var(--ink); }
.tl-pt:focus-visible .tl-dot { stroke: var(--focus); }
.tl-fallback {
  display: none; /* hidden when SVG/JS present; shown via the no-JS path below */
  list-style: none; margin: 0; padding: var(--s-3) 0 0;
  font-family: var(--font-mono); font-size: var(--t-sm); color: var(--ink-dim);
}
.tl-fallback li { padding: var(--s-1) 0; }
.tl-fallback-detail { color: var(--ink-faint); }
@media (prefers-reduced-motion: reduce) {
  .tl-dot { transition: none; }
}
```
*(SSR note: the `<ol class="tl-fallback">` is always in the DOM but hidden by default; the SVG is the primary view. Because the island SSRs the SVG too, no-JS users see the SVG — fully static and legible. The `<ol>` is the assistive/redundant text track. This satisfies "SSR a static fallback" without a `<noscript>` gate.)*

- [ ] **Step 4: Verify 3A**
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/timeline-scale.test.ts && pnpm --filter @khazana/site typecheck`
Expected: 7 tests PASS; `astro check` 0 errors. (Add `Timeline` + `TimelineProps` to the barrel.)

#### 3B — DataTable

- [ ] **Step 5: TDD sort + filter — test FIRST**

```ts
// apps/site/src/components/mdx/lib/table-sort.test.ts
import { expect, test } from "vitest";
import { sortRows, filterRows, type Column, type Row } from "./table-sort.js";

const columns: Column[] = [
  { key: "name", label: "Name", type: "string" },
  { key: "score", label: "Score", type: "number" },
];
const rows: Row[] = [
  { name: "Borges", score: 8 },
  { name: "Calvino", score: 12 },
  { name: "Adler", score: 8 },
];

test("numeric sort ascending then descending", () => {
  expect(sortRows(rows, "score", "asc").map((r) => r.score)).toEqual([8, 8, 12]);
  expect(sortRows(rows, "score", "desc").map((r) => r.score)).toEqual([12, 8, 8]);
});

test("string sort is locale, case-insensitive, stable on ties", () => {
  const asc = sortRows(rows, "name", "asc").map((r) => r.name);
  expect(asc).toEqual(["Adler", "Borges", "Calvino"]);
});

test("sort is stable: equal keys keep original order", () => {
  const asc = sortRows(rows, "score", "asc");
  // both score=8: Borges came before Adler in input
  const eights = asc.filter((r) => r.score === 8).map((r) => r.name);
  expect(eights).toEqual(["Borges", "Adler"]);
});

test("does not mutate the input array", () => {
  const copy = [...rows];
  sortRows(rows, "score", "desc");
  expect(rows).toEqual(copy);
});

test("filter matches any string/number cell, case-insensitive, trimmed", () => {
  expect(filterRows(rows, columns, "  cal ").map((r) => r.name)).toEqual(["Calvino"]);
  expect(filterRows(rows, columns, "8").map((r) => r.name)).toEqual(["Borges", "Adler"]);
});

test("empty query returns all rows unchanged", () => {
  expect(filterRows(rows, columns, "")).toHaveLength(3);
  expect(filterRows(rows, columns, "   ")).toHaveLength(3);
});

test("no match returns empty", () => {
  expect(filterRows(rows, columns, "zzz")).toHaveLength(0);
});
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/table-sort.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 6: Implement `table-sort.ts` to PASS**

```ts
// apps/site/src/components/mdx/lib/table-sort.ts
/** Pure sort/filter helpers for <DataTable>. No DOM. Non-mutating. */

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;
export type SortDir = "asc" | "desc";

export interface Column {
  key: string;
  label: string;
  type?: "string" | "number";
  /** Right-align numeric columns, etc. */
  align?: "left" | "right";
}

/** Stable sort by `key`. Numbers numerically, everything else by locale string. */
export function sortRows(rows: ReadonlyArray<Row>, key: string, dir: SortDir): Row[] {
  const factor = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const va = a.row[key];
      const vb = b.row[key];
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va ?? "").localeCompare(String(vb ?? ""), undefined, {
          sensitivity: "base",
          numeric: true,
        });
      }
      return cmp !== 0 ? cmp * factor : a.i - b.i; // stable tiebreak
    })
    .map((x) => x.row);
}

/** Case-insensitive substring match across all column cells. */
export function filterRows(
  rows: ReadonlyArray<Row>,
  columns: ReadonlyArray<Column>,
  query: string,
): Row[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...rows];
  return rows.filter((row) =>
    columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(q)),
  );
}
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/table-sort.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 7: Write `DataTable.tsx` + `DataTable.css`**

```tsx
// apps/site/src/components/mdx/DataTable.tsx
import { useMemo, useState } from "react";
import { sortRows, filterRows, type Column, type Row, type SortDir } from "./lib/table-sort.js";
import "./mdx.css";
import "./DataTable.css";

export interface DataTableProps {
  columns: Column[];
  rows: Row[];
  caption?: string;
  /** Show the filter input (default true). */
  filterable?: boolean;
}

/**
 * Sortable/filterable table. Pure helpers do the work; headers are real
 * <button>s inside <th> with aria-sort. SSR renders the full table unsorted,
 * so no-JS readers get every row.
 */
export default function DataTable({ columns, rows, caption, filterable = true }: DataTableProps) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [query, setQuery] = useState("");

  const view = useMemo(() => {
    const filtered = filterRows(rows, columns, query);
    return sort ? sortRows(filtered, sort.key, sort.dir) : filtered;
  }, [rows, columns, query, sort]);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const ariaSort = (key: string): "ascending" | "descending" | "none" =>
    sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <figure className="mdx-figure dt">
      {filterable ? (
        <div className="dt-toolbar">
          <label className="mdx-label" htmlFor="dt-filter">filter</label>
          <input
            id="dt-filter"
            className="dt-input"
            type="text"
            value={query}
            placeholder="…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="dt-count">{view.length}/{rows.length}</span>
        </div>
      ) : null}
      <div className="mdx-panel dt-scroll">
        <table className="dt-table">
          {caption ? <caption className="dt-caption mdx-label">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  aria-sort={ariaSort(c.key)}
                  className={c.align === "right" ? "dt-th dt-th--right" : "dt-th"}
                >
                  <button type="button" className="dt-sortbtn" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span className="dt-arrow" aria-hidden="true">
                      {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "dt-td dt-td--right" : "dt-td"}>
                    {String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
```

```css
/* apps/site/src/components/mdx/DataTable.css */
.dt-toolbar { display: flex; align-items: center; gap: var(--s-3); margin-bottom: var(--s-2); }
.dt-input {
  font-family: var(--font-mono); font-size: var(--t-sm);
  background: var(--bg-inset); color: var(--ink);
  border: var(--hair) solid var(--rule); border-radius: var(--r-sm);
  padding: var(--s-1) var(--s-3); width: 14rem; max-width: 50%;
}
.dt-input:focus-visible { border-color: var(--accent); outline: none; }
.dt-count { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--ink-faint); margin-left: auto; }
.dt-scroll { overflow-x: auto; }
.dt-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: var(--t-sm); }
.dt-caption { text-align: left; padding: var(--s-3) var(--s-4) 0; }
.dt-th { text-align: left; border-bottom: var(--hair) solid var(--rule-bright); padding: 0; }
.dt-th--right { text-align: right; }
.dt-sortbtn {
  width: 100%; text-align: inherit; background: none; border: none; cursor: pointer;
  font: inherit; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.06em;
  padding: var(--s-2) var(--s-4); display: inline-flex; gap: var(--s-2); align-items: center;
}
.dt-th--right .dt-sortbtn { justify-content: flex-end; }
.dt-sortbtn:hover { color: var(--accent); }
.dt-arrow { color: var(--editorial); font-size: 0.75em; }
.dt-td { padding: var(--s-2) var(--s-4); border-bottom: var(--hair) solid var(--rule); color: var(--ink-dim); }
.dt-td--right { text-align: right; font-variant-numeric: tabular-nums; }
.dt-table tbody tr:hover .dt-td { color: var(--ink); background: color-mix(in oklab, var(--accent) 5%, transparent); }
```

- [ ] **Step 8: Extend barrel + verify 3B + commit**

Append to `index.ts`:
```ts
export { default as Timeline } from "./Timeline.js";
export type { TimelineProps } from "./Timeline.js";
export { default as DataTable } from "./DataTable.js";
export type { DataTableProps } from "./DataTable.js";
export type { TimelineEvent } from "./lib/timeline-scale.js";
export type { Column, Row } from "./lib/table-sort.js";
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/timeline-scale.test.ts apps/site/src/components/mdx/lib/table-sort.test.ts && pnpm --filter @khazana/site build && pnpm --filter @khazana/site typecheck`
Expected: 14 helper tests PASS; build succeeds; `astro check` 0 errors.
```
git add -A && git commit -m "P5B T3: Timeline (TDD scale) + DataTable (TDD sort/filter)"
```

---

### Task 4: `<Scrolly>` / `<ScrollyStep>` — scrollytelling (scrollama)

**Goal:** A sticky graphic pane + stepped narrative. `<Scrolly>` is the container (sticky graphic + the steps); `<ScrollyStep>` declares each narrative beat with its graphic. `onStepEnter` (scrollama) swaps the active step's graphic into the sticky pane. Reduced-motion / no-JS: degrade to plain stacked steps (graphic above its prose). Pure helper: a tiny step-resolver (clamp/derive active index, pick graphic) is TDD'd.

**Interfaces:** `lib/scrolly-state.ts` + `.test.ts`; `Scrolly.tsx` (exports both `Scrolly` and `ScrollyStep`) + `Scrolly.css`.

- [ ] **Step 1: TDD the step resolver — test FIRST**

```ts
// apps/site/src/components/mdx/lib/scrolly-state.test.ts
import { expect, test } from "vitest";
import { resolveActiveStep, clampStepIndex } from "./scrolly-state.js";

test("clampStepIndex keeps index within [0, count-1]", () => {
  expect(clampStepIndex(-2, 3)).toBe(0);
  expect(clampStepIndex(5, 3)).toBe(2);
  expect(clampStepIndex(1, 3)).toBe(1);
});

test("clamp with zero steps yields 0", () => {
  expect(clampStepIndex(3, 0)).toBe(0);
});

test("resolveActiveStep returns the entered index when in range", () => {
  expect(resolveActiveStep({ entered: 2, count: 4, current: 0 })).toBe(2);
});

test("resolveActiveStep clamps and falls back to current on NaN", () => {
  expect(resolveActiveStep({ entered: 9, count: 4, current: 1 })).toBe(3);
  expect(resolveActiveStep({ entered: Number.NaN, count: 4, current: 1 })).toBe(1);
});
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/scrolly-state.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement `scrolly-state.ts` to PASS**

```ts
// apps/site/src/components/mdx/lib/scrolly-state.ts
/** Pure helpers for <Scrolly> active-step bookkeeping. No DOM. */

export function clampStepIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  return index;
}

export interface ResolveArgs {
  /** index reported by scrollama onStepEnter */
  entered: number;
  count: number;
  /** previously active index, used as a NaN fallback */
  current: number;
}

export function resolveActiveStep({ entered, count, current }: ResolveArgs): number {
  if (Number.isNaN(entered)) return clampStepIndex(current, count);
  return clampStepIndex(entered, count);
}
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/scrolly-state.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 3: Add dep + write `Scrolly.tsx`**

```
pnpm --filter @khazana/site add scrollama
```

`<Scrolly>` collects its `<ScrollyStep>` children. Each step carries a `graphic` prop (a ReactNode — typically a `<Chart>` or an SVG) and prose children. The container renders a sticky pane showing the active step's graphic and a scrolling column of the prose blocks; scrollama drives the active index. Under reduced-motion (detected once, no-JS-safe) it renders each step's graphic directly above its prose — plain stacked steps, no stickiness.

```tsx
// apps/site/src/components/mdx/Scrolly.tsx
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import scrollama from "scrollama";
import { resolveActiveStep } from "./lib/scrolly-state.js";
import "./mdx.css";
import "./Scrolly.css";

export interface ScrollyStepProps {
  /** The graphic shown in the sticky pane while this step is active. */
  graphic: ReactNode;
  children?: ReactNode;
}

/** Declarative step. Rendered by <Scrolly>; not standalone. */
export function ScrollyStep(_props: ScrollyStepProps): ReactElement | null {
  return null; // <Scrolly> reads props directly; this never self-renders.
}

export interface ScrollyProps {
  children?: ReactNode;
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR -> stacked fallback
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Scrolly({ children, caption }: ScrollyProps) {
  const steps = Children.toArray(children).filter(
    (c): c is ReactElement<ScrollyStepProps> => isValidElement(c) && c.type === ScrollyStep,
  );
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(true); // SSR-safe default = stacked
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    if (reduced || !rootRef.current) return;
    const scroller = scrollama();
    scroller
      .setup({
        step: rootRef.current.querySelectorAll<HTMLElement>(".scrolly-step"),
        offset: 0.6,
      })
      .onStepEnter((res: { index: number }) =>
        setActive((current) => resolveActiveStep({ entered: res.index, count: steps.length, current })),
      );
    const onResize = () => scroller.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scroller.destroy();
    };
  }, [reduced, steps.length]);

  // Stacked fallback (SSR, no-JS, reduced motion): graphic above its prose.
  if (reduced) {
    return (
      <figure className="mdx-figure mdx-figure--wide scrolly scrolly--stacked">
        {steps.map((s, i) => (
          <div className="scrolly-stacked-step" key={i}>
            <div className="mdx-panel scrolly-graphic">{s.props.graphic}</div>
            <div className="scrolly-prose">{s.props.children}</div>
          </div>
        ))}
        {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  return (
    <figure className="mdx-figure mdx-figure--wide scrolly" ref={rootRef}>
      <div className="scrolly-grid">
        <div className="scrolly-sticky">
          <div className="mdx-panel scrolly-graphic">{steps[active]?.props.graphic}</div>
        </div>
        <div className="scrolly-steps">
          {steps.map((s, i) => (
            <div className={i === active ? "scrolly-step scrolly-step--active" : "scrolly-step"} key={i}>
              {s.props.children}
            </div>
          ))}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
```

```css
/* apps/site/src/components/mdx/Scrolly.css */
.scrolly-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-6); align-items: start; }
.scrolly-sticky { position: sticky; top: 12vh; height: 76vh; display: flex; align-items: center; }
.scrolly-graphic { width: 100%; padding: var(--s-4); }
.scrolly-steps { display: flex; flex-direction: column; gap: 40vh; padding: 30vh 0; }
.scrolly-step {
  font-family: var(--font-read); font-size: var(--t-md); line-height: var(--lh-read);
  color: var(--ink-faint); transition: color 200ms ease, opacity 200ms ease; opacity: 0.45;
}
.scrolly-step--active { color: var(--ink); opacity: 1; }
.scrolly-step--active::before {
  content: ""; display: block; width: 2rem; height: 2px; background: var(--editorial); margin-bottom: var(--s-3);
}
/* stacked fallback */
.scrolly--stacked .scrolly-stacked-step { margin-bottom: var(--s-8); }
.scrolly--stacked .scrolly-graphic { margin-bottom: var(--s-4); }
.scrolly--stacked .scrolly-prose {
  font-family: var(--font-read); font-size: var(--t-md); line-height: var(--lh-read); color: var(--ink);
}
@media (max-width: 720px) {
  .scrolly-grid { grid-template-columns: 1fr; }
  .scrolly-sticky { position: static; height: auto; }
  .scrolly-steps { gap: var(--s-6); padding: var(--s-6) 0; }
  .scrolly-step { opacity: 1; color: var(--ink); }
}
@media (prefers-reduced-motion: reduce) {
  .scrolly-step { transition: none; }
}
```

- [ ] **Step 4: Extend barrel + verify + commit**

Append to `index.ts`:
```ts
export { default as Scrolly, ScrollyStep } from "./Scrolly.js";
export type { ScrollyProps, ScrollyStepProps } from "./Scrolly.js";
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/scrolly-state.test.ts && pnpm --filter @khazana/site build && pnpm --filter @khazana/site typecheck`
Expected: 4 tests PASS; build succeeds (Scrolly SSRs the stacked fallback — `reduced` defaults true on the server); `astro check` 0 errors.
```
git add -A && git commit -m "P5B T4: Scrolly/ScrollyStep scrollytelling (scrollama) + TDD step resolver"
```

---

### Task 5: `<RunnableCode>` — CodeMirror 6 editor + sandboxed Web Worker runner (TDD protocol + formatter)

**Goal:** A self-contained JS playground: a CodeMirror editor + a "Run" button that executes the JS in a sandboxed **module Web Worker** (captured `console.*`, captured return value, hard timeout to kill infinite loops) and renders captured output in a token-styled pane. NO Sandpack, NO bundler CDN — the worker is bundled statically by Vite. Pure helpers (TDD): the **message protocol** (request/response shapes + a `runRequest`/`parseResponse` pair) and the **output formatter** (turns captured `console` args / return value into display strings). The worker wiring + CodeMirror are verified by build.

**Interfaces:**
- `lib/runner-protocol.ts` + `.test.ts` — message types + formatter (TDD).
- `runner.worker.ts` — the worker (imports the protocol + formatter).
- `RunnableCode.tsx` + `RunnableCode.css`.

- [ ] **Step 1: TDD the protocol + formatter — test FIRST**

```ts
// apps/site/src/components/mdx/lib/runner-protocol.test.ts
import { expect, test } from "vitest";
import {
  formatValue,
  formatLogArgs,
  makeRunRequest,
  parseWorkerMessage,
  type WorkerResponse,
} from "./runner-protocol.js";

test("formatValue renders primitives readably", () => {
  expect(formatValue("hi")).toBe('"hi"');
  expect(formatValue(42)).toBe("42");
  expect(formatValue(true)).toBe("true");
  expect(formatValue(null)).toBe("null");
  expect(formatValue(undefined)).toBe("undefined");
});

test("formatValue renders arrays and plain objects as compact JSON", () => {
  expect(formatValue([1, 2, 3])).toBe("[1,2,3]");
  expect(formatValue({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
});

test("formatValue handles functions and circular refs without throwing", () => {
  expect(formatValue(() => 1)).toMatch(/function|=>|ƒ/i);
  const circ: Record<string, unknown> = {};
  circ.self = circ;
  expect(() => formatValue(circ)).not.toThrow();
  expect(formatValue(circ)).toMatch(/circular|\[object/i);
});

test("formatLogArgs space-joins multiple console.log args", () => {
  expect(formatLogArgs(["x =", 42, [1, 2]])).toBe('x = 42 [1,2]');
});

test("makeRunRequest tags a run message with code + id", () => {
  const req = makeRunRequest("1+1", "abc");
  expect(req).toEqual({ kind: "run", id: "abc", code: "1+1" });
});

test("parseWorkerMessage validates well-formed responses", () => {
  const ok: WorkerResponse = { kind: "result", id: "abc", logs: ["2"], value: "2", error: null, ms: 3 };
  expect(parseWorkerMessage(ok)).toEqual(ok);
});

test("parseWorkerMessage rejects junk", () => {
  expect(() => parseWorkerMessage({ kind: "nope" })).toThrow(/message/i);
  expect(() => parseWorkerMessage(null)).toThrow(/message/i);
});
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/runner-protocol.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement `runner-protocol.ts` to PASS**

```ts
// apps/site/src/components/mdx/lib/runner-protocol.ts
/** Pure message protocol + output formatter for <RunnableCode>. No DOM, no worker. */

export interface RunRequest {
  kind: "run";
  id: string;
  code: string;
}

export interface WorkerResponse {
  kind: "result";
  id: string;
  /** formatted console.* lines, in order */
  logs: string[];
  /** formatted return/last-expression value (or null if none) */
  value: string | null;
  /** error message string, or null on success */
  error: string | null;
  /** wall-clock ms in the worker */
  ms: number;
}

export function makeRunRequest(code: string, id: string): RunRequest {
  return { kind: "run", id, code };
}

/** Format a single value for display. Safe against circular refs and functions. */
export function formatValue(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "number" || t === "boolean" || t === "bigint") return String(v);
  if (t === "function") {
    const name = (v as { name?: string }).name;
    return `ƒ ${name || "(anonymous)"}`;
  }
  if (t === "symbol") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "[circular or non-serializable object]";
  }
}

/** Join console.log-style varargs with spaces, formatting each. */
export function formatLogArgs(args: ReadonlyArray<unknown>): string {
  return args.map(formatValue).join(" ");
}

/** Narrow an unknown postMessage payload to a WorkerResponse, or throw. */
export function parseWorkerMessage(data: unknown): WorkerResponse {
  if (
    typeof data === "object" &&
    data !== null &&
    (data as { kind?: unknown }).kind === "result" &&
    Array.isArray((data as { logs?: unknown }).logs)
  ) {
    return data as WorkerResponse;
  }
  throw new Error("RunnableCode: malformed worker message");
}
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/runner-protocol.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 3: Write the worker `runner.worker.ts` (sandboxed eval, captured console, timeout)**

The worker captures `console.*`, runs the user code in an async IIFE wrapper, and posts a `WorkerResponse`. A watchdog (`setTimeout`) cannot interrupt a synchronous infinite loop *inside* the worker — so the **main thread** owns the timeout and terminates+respawns the worker (Step 5). The worker still guards async cases and reports timing.

```ts
// apps/site/src/components/mdx/runner.worker.ts
/// <reference lib="webworker" />
import { formatValue, formatLogArgs, type RunRequest, type WorkerResponse } from "./lib/runner-protocol.js";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<RunRequest>) => {
  const req = e.data;
  if (!req || req.kind !== "run") return;

  const logs: string[] = [];
  const capture = (...args: unknown[]) => logs.push(formatLogArgs(args));
  // sandbox-ish console: only capture; no access to the real one.
  const sandboxConsole = { log: capture, info: capture, warn: capture, error: capture, debug: capture };

  const start = Date.now();
  let value: string | null = null;
  let error: string | null = null;

  try {
    // Wrap user code so a trailing expression is returned, and inject our console.
    // No imports, no fetch in worker scope for v1 (kept minimal/offline).
    const fn = new Function(
      "console",
      `"use strict";\nreturn (async () => {\n${req.code}\n})();`,
    );
    const result = await fn(sandboxConsole);
    if (result !== undefined) value = formatValue(result);
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  const res: WorkerResponse = {
    kind: "result",
    id: req.id,
    logs,
    value,
    error,
    ms: Date.now() - start,
  };
  ctx.postMessage(res);
};
```
*(Security note: this is client-side sandboxing for *the reader's own browser* running author-trusted demo code; the worker scope has no DOM and no same-origin app state. The main-thread timeout (Step 5) terminates runaway loops. This is the documented $0/offline approach — no Sandpack, no remote bundler.)*

- [ ] **Step 4: Add CodeMirror deps**
```
pnpm --filter @khazana/site add @codemirror/state @codemirror/view @codemirror/commands @codemirror/lang-javascript
```

- [ ] **Step 5: Write `RunnableCode.tsx` (CodeMirror editor + worker lifecycle + timeout)**

```tsx
// apps/site/src/components/mdx/RunnableCode.tsx
import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  makeRunRequest,
  parseWorkerMessage,
  type WorkerResponse,
} from "./lib/runner-protocol.js";
import "./mdx.css";
import "./RunnableCode.css";

export interface RunnableCodeProps {
  /** Initial source. */
  code: string;
  /** Max run time before the worker is killed (ms). Default 2000. */
  timeoutMs?: number;
  caption?: string;
}

const TERMINATE_MSG = "⏱ terminated (timeout — possible infinite loop)";

export default function RunnableCode({ code, timeoutMs = 2000, caption }: RunnableCodeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [output, setOutput] = useState<WorkerResponse | null>(null);
  const [running, setRunning] = useState(false);

  // Mount CodeMirror.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          javascript(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.theme({}, { dark: true }),
        ],
      }),
    });
    viewRef.current = view;
    return () => view.destroy();
  }, [code]);

  // Worker lifecycle (lazy spawn helper).
  const spawnWorker = (): Worker => {
    const w = new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return w;
  };
  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = () => {
    const source = viewRef.current?.state.doc.toString() ?? code;
    setRunning(true);
    setOutput(null);
    workerRef.current?.terminate();
    const w = spawnWorker();
    const id = Math.random().toString(36).slice(2);

    const timer = window.setTimeout(() => {
      w.terminate();
      workerRef.current = null;
      setRunning(false);
      setOutput({ kind: "result", id, logs: [], value: null, error: TERMINATE_MSG, ms: timeoutMs });
    }, timeoutMs);

    w.onmessage = (e: MessageEvent) => {
      window.clearTimeout(timer);
      setRunning(false);
      try {
        setOutput(parseWorkerMessage(e.data));
      } catch {
        setOutput({ kind: "result", id, logs: [], value: null, error: "malformed worker message", ms: 0 });
      }
      w.terminate();
      workerRef.current = null;
    };
    w.postMessage(makeRunRequest(source, id));
  };

  return (
    <figure className="mdx-figure mdx-figure--wide rc">
      <div className="mdx-panel rc-panel">
        <div className="rc-bar">
          <span className="mdx-label">runnable · js</span>
          <button type="button" className="rc-run" onClick={run} disabled={running}>
            {running ? "running…" : "▸ run"}
          </button>
        </div>
        {/* CodeMirror mounts here; SSR shows the source as a <pre> fallback */}
        <div ref={hostRef} className="rc-editor" />
        <noscript>
          <pre className="rc-fallback">{code}</pre>
        </noscript>
        <div className="rc-output" aria-live="polite">
          {output === null ? (
            <span className="rc-hint">output appears here</span>
          ) : (
            <>
              {output.logs.map((l, i) => (
                <div className="rc-line" key={i}>{l}</div>
              ))}
              {output.value !== null ? <div className="rc-line rc-value">⮑ {output.value}</div> : null}
              {output.error !== null ? <div className="rc-line rc-error">{output.error}</div> : null}
              <div className="rc-meta">{output.ms} ms</div>
            </>
          )}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
```

```css
/* apps/site/src/components/mdx/RunnableCode.css */
.rc-panel { display: flex; flex-direction: column; }
.rc-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--s-2) var(--s-3); border-bottom: var(--hair) solid var(--rule); background: var(--bg-inset);
}
.rc-run {
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.06em;
  background: transparent; color: var(--accent);
  border: var(--hair) solid color-mix(in oklab, var(--accent) 45%, var(--rule));
  border-radius: var(--r-sm); padding: var(--s-1) var(--s-3); cursor: pointer;
}
.rc-run:hover:not(:disabled) {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  text-shadow: 0 0 8px color-mix(in oklab, var(--accent) 50%, transparent);
}
.rc-run:disabled { color: var(--ink-faint); cursor: progress; }
.rc-editor { font-family: var(--font-mono); font-size: var(--t-sm); }
.rc-editor :global(.cm-editor) { background: var(--bg-inset); color: var(--ink); }
.rc-editor :global(.cm-gutters) { background: var(--bg-inset); color: var(--ink-faint); border: none; }
.rc-editor :global(.cm-activeLine) { background: color-mix(in oklab, var(--accent) 6%, transparent); }
.rc-editor :global(.cm-cursor) { border-left-color: var(--accent); }
.rc-fallback, .rc-output {
  font-family: var(--font-mono); font-size: var(--t-sm); line-height: 1.5;
  background: var(--bg-inset); padding: var(--s-3) var(--s-4);
}
.rc-output { border-top: var(--hair) solid var(--rule); min-height: 2.4em; color: var(--ink-dim); }
.rc-hint { color: var(--ink-faint); }
.rc-line { white-space: pre-wrap; }
.rc-value { color: var(--good); }
.rc-error { color: var(--editorial); }
.rc-meta { color: var(--ink-faint); font-size: var(--t-xs); margin-top: var(--s-2); }
```

- [ ] **Step 6: Extend barrel + verify (incl. worker bundles statically) + commit**

Append to `index.ts`:
```ts
export { default as RunnableCode } from "./RunnableCode.js";
export type { RunnableCodeProps } from "./RunnableCode.js";
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/runner-protocol.test.ts && pnpm --filter @khazana/site build && pnpm --filter @khazana/site typecheck`
Expected: 7 tests PASS; build succeeds; `astro check` 0 errors. Confirm the worker bundled as its own chunk (no runtime fetch): `find apps/site/dist -name "*.js" | xargs grep -l "onmessage" 2>/dev/null` should list a worker chunk; and grep the worker source intent: `ls apps/site/dist/_assets | grep -i worker || echo "worker emitted under _assets hash"`. The build SSRs RunnableCode showing the editor host (empty pre-hydration) + the `<noscript>` `<pre>` source.
```
git add -A && git commit -m "P5B T5: RunnableCode (CodeMirror + sandboxed module Worker) + TDD protocol/formatter"
```

---

### Task 6: `<Map>` — d3-geo + bundled world-atlas TopoJSON (TDD choropleth scale)

**Goal:** An offline SVG world map: countries projected with `d3-geo`, locally-bundled `world-atlas` TopoJSON (NO runtime fetch), hover highlight, and an optional choropleth from a `{ iso3: value }` prop. Pure helper (TDD): the **choropleth color scale** (value → amber-ramp CSS color, with domain derivation and a no-data color) and an **iso lookup** (numeric topojson id ↔ iso3, for the rows we color). The d3-geo projection + SVG render are verified by build.

**Interfaces:**
- `lib/choropleth.ts` + `.test.ts` — color scale + value lookup (TDD).
- `Map.tsx` + `Map.css`.

- [ ] **Step 1: Add deps**
```
pnpm --filter @khazana/site add d3-geo topojson-client world-atlas
pnpm --filter @khazana/site add -D @types/d3-geo @types/topojson-client
```

- [ ] **Step 2: TDD the choropleth scale — test FIRST**

```ts
// apps/site/src/components/mdx/lib/choropleth.test.ts
import { expect, test } from "vitest";
import { buildChoropleth, NO_DATA_FILL } from "./choropleth.js";

const values = { USA: 100, FRA: 50, BRA: 0 };

test("derives domain [min,max] across provided values", () => {
  const c = buildChoropleth(values);
  expect(c.domain).toEqual([0, 100]);
});

test("max value gets the most saturated amber, min the faintest", () => {
  const c = buildChoropleth(values);
  const hi = c.fill("USA");
  const lo = c.fill("BRA");
  expect(hi).not.toBe(lo);
  expect(hi).toMatch(/oklab|rgb|var\(/i);
});

test("unknown iso3 => NO_DATA_FILL", () => {
  const c = buildChoropleth(values);
  expect(c.fill("ZZZ")).toBe(NO_DATA_FILL);
});

test("interpolation is monotonic: higher value => higher amber weight", () => {
  const c = buildChoropleth({ A: 0, B: 25, C: 50, D: 100 });
  const weight = (iso: string) => Number(c.fill(iso).match(/(\d+(?:\.\d+)?)%/)?.[1] ?? "0");
  expect(weight("A")).toBeLessThan(weight("B"));
  expect(weight("B")).toBeLessThan(weight("C"));
  expect(weight("C")).toBeLessThan(weight("D"));
});

test("flat domain (all equal) does not divide by zero", () => {
  const c = buildChoropleth({ A: 7, B: 7 });
  expect(() => c.fill("A")).not.toThrow();
  expect(c.fill("A")).toMatch(/%/);
});

test("empty values => everything is NO_DATA_FILL", () => {
  const c = buildChoropleth({});
  expect(c.fill("USA")).toBe(NO_DATA_FILL);
});
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/choropleth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `choropleth.ts` to PASS**

```ts
// apps/site/src/components/mdx/lib/choropleth.ts
/** Pure choropleth color scale for <Map>. Token-driven amber ramp. No DOM. */

export const NO_DATA_FILL = "var(--bg-raised)";

export interface Choropleth {
  domain: [number, number];
  /** iso3 -> CSS color (amber ramp) or NO_DATA_FILL when absent. */
  fill: (iso3: string) => string;
}

/**
 * Map values to an amber ramp expressed as a color-mix weight so it tracks the
 * live --accent token. weight in [12%, 88%] of --accent over --bg-inset.
 */
export function buildChoropleth(values: Readonly<Record<string, number>>): Choropleth {
  const entries = Object.values(values);
  const hasData = entries.length > 0;
  const min = hasData ? Math.min(...entries) : 0;
  const max = hasData ? Math.max(...entries) : 0;
  const span = max - min;

  const fill = (iso3: string): string => {
    const v = values[iso3];
    if (v === undefined) return NO_DATA_FILL;
    const norm = span === 0 ? 1 : (v - min) / span; // flat domain => full weight
    const weight = (12 + norm * 76).toFixed(1); // 12%..88%
    return `color-mix(in oklab, var(--accent) ${weight}%, var(--bg-inset))`;
  };

  return { domain: [min, max], fill };
}
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/choropleth.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 4: ISO numeric→alpha3 mapping**

`world-atlas` features carry a numeric `id` (ISO 3166-1 numeric). The `{iso3: value}` prop is alpha-3. Add a small committed lookup so we color the right country without a runtime fetch. Create `lib/iso-numeric.ts` exporting `numericToIso3: Record<string, string>` (the standard ISO 3166-1 numeric→alpha3 table — ~250 entries; generate it once and commit). Provide a helper:

```ts
// apps/site/src/components/mdx/lib/iso-numeric.ts (excerpt — commit the full table)
/** ISO 3166-1 numeric (zero-padded 3-digit string) -> alpha-3. Static, offline. */
export const numericToIso3: Record<string, string> = {
  "004": "AFG", "008": "ALB", "012": "DZA", "032": "ARG", "036": "AUS",
  "076": "BRA", "124": "CAN", "156": "CHN", "250": "FRA", "276": "DEU",
  "356": "IND", "392": "JPN", "643": "RUS", "826": "GBR", "840": "USA",
  // … full ISO 3166-1 numeric table committed here …
};

export function iso3ForNumeric(numericId: number | string): string | null {
  const key = String(numericId).padStart(3, "0");
  return numericToIso3[key] ?? null;
}
```
*(Generation note: derive the table once from the `world-atlas`/ISO list at author time and paste it in — it is static reference data, not a runtime dependency. A quick build-time generator is acceptable but the committed table is what ships.)*

- [ ] **Step 5: Write `Map.tsx` (d3-geo render, bundled topojson) + `Map.css`**

```tsx
// apps/site/src/components/mdx/Map.tsx
import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import worldTopo from "world-atlas/countries-110m.json"; // bundled asset — no runtime fetch
import { buildChoropleth } from "./lib/choropleth.js";
import { iso3ForNumeric } from "./lib/iso-numeric.js";
import "./mdx.css";
import "./Map.css";

export interface MapProps {
  /** Optional choropleth values keyed by ISO 3166-1 alpha-3. */
  values?: Record<string, number>;
  /** Optional iso3->label for hover readout. */
  labels?: Record<string, string>;
  caption?: string;
}

const W = 960;
const H = 480;

interface CountryProps { name?: string }

export default function Map({ values = {}, labels = {}, caption }: MapProps) {
  const [hover, setHover] = useState<string | null>(null);
  const choro = useMemo(() => buildChoropleth(values), [values]);

  const { paths } = useMemo(() => {
    const topo = worldTopo as unknown as Topology;
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, CountryProps>;
    const projection = geoNaturalEarth1().fitSize([W, H], fc);
    const path = geoPath(projection);
    const paths = fc.features.map((f) => {
      const iso3 = iso3ForNumeric(f.id as string | number) ?? "";
      return { iso3, name: f.properties?.name ?? iso3, d: path(f) ?? "" };
    });
    return { paths };
  }, []);

  const readout = hover
    ? `${labels[hover] ?? hover}${values[hover] !== undefined ? `: ${values[hover]}` : ""}`
    : "—";

  return (
    <figure className="mdx-figure mdx-figure--wide map">
      <div className="mdx-panel map-panel">
        <div className="map-readout">
          <span className="mdx-label">region</span> {readout}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" role="img" aria-label="World map">
          {paths.map((p, i) => (
            <path
              key={`${p.iso3}-${i}`}
              d={p.d}
              className={hover === p.iso3 ? "map-country map-country--hover" : "map-country"}
              style={{ fill: choro.fill(p.iso3) }}
              tabIndex={p.iso3 ? 0 : -1}
              role={p.iso3 ? "button" : undefined}
              aria-label={p.iso3 ? p.name : undefined}
              onMouseEnter={() => setHover(p.iso3 || null)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.iso3 || null)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
```

```css
/* apps/site/src/components/mdx/Map.css */
.map-panel { padding: var(--s-3); }
.map-readout { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--ink-dim); padding: var(--s-2) var(--s-2) var(--s-3); }
.map-svg { width: 100%; height: auto; display: block; background: var(--bg-inset); border-radius: var(--r-sm); }
.map-country { stroke: var(--rule); stroke-width: 0.4; transition: fill 120ms ease; outline: none; }
.map-country--hover { stroke: var(--accent); stroke-width: 0.8; }
.map-country:focus-visible { stroke: var(--focus); stroke-width: 1; }
@media (prefers-reduced-motion: reduce) { .map-country { transition: none; } }
```

- [ ] **Step 6: TS JSON import + types**

`world-atlas/countries-110m.json` is a JSON import. Ensure `resolveJsonModule` is on (Astro's strict tsconfig enables it; if `astro check` complains, add `"resolveJsonModule": true` to `apps/site/tsconfig.json` `compilerOptions`). Add `@types/geojson` and `topojson-specification` if `astro check` needs the `Topology`/`FeatureCollection` types:
```
pnpm --filter @khazana/site add -D @types/geojson topojson-specification
```

- [ ] **Step 7: Extend barrel + verify (incl. NO runtime fetch) + commit**

Append to `index.ts`:
```ts
export { default as Map } from "./Map.js";
export type { MapProps } from "./Map.js";
```
Run: `pnpm exec vitest run apps/site/src/components/mdx/lib/choropleth.test.ts && pnpm --filter @khazana/site build && pnpm --filter @khazana/site typecheck`
Expected: 6 tests PASS; build succeeds (Map SSRs the full SVG — paths render server-side from the bundled topojson, so no-JS users see the static map); `astro check` 0 errors. Confirm the topojson is bundled, not fetched: `grep -rE "fetch\(|cdn|topojson\.us|unpkg|jsdelivr" apps/site/dist/_assets/*.js` returns nothing referencing a remote map source; the country path data appears inline in the SSR'd HTML (`grep -c "<path" apps/site/dist/reads/*/index.html` > 0 for the post that uses Map).
```
git add -A && git commit -m "P5B T6: Map (d3-geo + bundled world-atlas topojson) + TDD choropleth scale"
```

---

### Task 7: Upgrade sample MDX to showcase every component + full build/check/offline audit

**Goal:** Rewrite the two existing posts and add a third so the showcase is real and the build exercises all seven components. Then run the full gate: all helper tests, `astro check`, a clean build, and the $0/offline audit.

- [ ] **Step 1: Rewrite `the-week-in-silicon.mdx` (dispatch → Chart + Scrolly + DataTable + Annotation)**

Replace the smoke-test snippet and the `{/* SEAM */}` comment. Keep frontmatter unchanged. Import from the barrel; choose `client:visible` for Chart/Scrolly, `client:load` for DataTable/Annotation. Full real content:

```mdx
---
title: "The Week in Silicon: When Inference Moved to the Edge"
format: dispatch
channels: ["ai", "tech", "embedded"]
summary: "Three signals from the week — an on-device NPU price drop, a sparse-MoE paper, and a quiet Netflix latency post — point at the same shift: compute is leaving the datacenter."
publishedAt: 2026-06-23T06:00:00.000Z
sources:
  - title: "Sparse Mixtures of Experts Are Implicit Curriculum Learners"
    url: "https://arxiv.org/abs/2606.01234"
  - title: "Rebuilding the Edge Tier (Netflix)"
    url: "https://netflixtechblog.com/rebuilding-the-edge-tier"
---

import { Chart, Scrolly, ScrollyStep, DataTable, Annotation } from "../../components/mdx";

Three things happened this week that look unrelated until you line them up.

First, a research paper argued that the routing inside <Annotation client:load term="mixture-of-experts" note="A model whose layers route each token to a few specialized sub-networks ('experts'), so only a fraction of the weights run per token." /> models is doing something subtler than load balancing — it's reproducing a *curriculum*.

<Chart
  client:visible
  mark="line"
  x="month"
  y="costPerMTok"
  series="tier"
  height={300}
  caption="Marginal inference cost ($/M tokens), datacenter vs edge NPU"
  data={[
    { month: "2025-09", costPerMTok: 1.2, tier: "datacenter" },
    { month: "2025-12", costPerMTok: 1.0, tier: "datacenter" },
    { month: "2026-03", costPerMTok: 0.9, tier: "datacenter" },
    { month: "2026-06", costPerMTok: 0.85, tier: "datacenter" },
    { month: "2025-09", costPerMTok: 3.1, tier: "edge-npu" },
    { month: "2025-12", costPerMTok: 1.8, tier: "edge-npu" },
    { month: "2026-03", costPerMTok: 0.95, tier: "edge-npu" },
    { month: "2026-06", costPerMTok: 0.6, tier: "edge-npu" }
  ]}
/>

The edge curve crossed the datacenter curve this spring. Walk the three signals:

<Scrolly client:visible caption="Three signals, one shift">
  <ScrollyStep
    graphic={
      <Chart
        client:visible
        mark="bar"
        x="model"
        y="activeParams"
        caption="Active params per token (B)"
        data={[
          { model: "dense-7B", activeParams: 7 },
          { model: "moe-8x7B", activeParams: 1.8 },
          { model: "moe-16x3B", activeParams: 0.9 }
        ]}
      />
    }
  >
    **Signal one — the paper.** Sparse routing cuts *active* parameters per token by 4–8×. Cheaper to run well, which matters most where compute is scarce.
  </ScrollyStep>
  <ScrollyStep
    graphic={
      <Chart
        client:visible
        mark="area"
        x="month"
        y="costPerMTok"
        caption="Edge NPU $/M tokens"
        data={[
          { month: "2025-09", costPerMTok: 3.1 },
          { month: "2025-12", costPerMTok: 1.8 },
          { month: "2026-03", costPerMTok: 0.95 },
          { month: "2026-06", costPerMTok: 0.6 }
        ]}
      />
    }
  >
    **Signal two — the price.** A commodity edge NPU dropped below a threshold that a year ago looked like a 2028 problem.
  </ScrollyStep>
  <ScrollyStep
    graphic={
      <Chart
        client:visible
        mark="bar"
        x="arch"
        y="p99ms"
        caption="Tail latency p99 (ms)"
        data={[
          { arch: "3-hop", p99ms: 210 },
          { arch: "edge-tier", p99ms: 42 }
        ]}
      />
    }
  >
    **Signal three — the latency.** Collapsing three network hops into one programmable edge tier cut tail latency 5×.
  </ScrollyStep>
</Scrolly>

The throughline is economics, not novelty:

<DataTable
  client:load
  caption="The three signals, lined up"
  columns={[
    { key: "signal", label: "Signal", type: "string" },
    { key: "metric", label: "Metric", type: "string" },
    { key: "delta", label: "Δ", type: "number", align: "right" }
  ]}
  rows={[
    { signal: "Sparse MoE", metric: "active params / token", delta: -75 },
    { signal: "Edge NPU", metric: "$ / M tokens", delta: -81 },
    { signal: "Edge tier", metric: "p99 latency", delta: -80 }
  ]}
/>

When the cost curve bends, the architecture follows.
```

- [ ] **Step 2: Rewrite `the-longest-night.mdx` (chronicle → Map + Timeline + Annotation; Scrolly optional)**

Keep frontmatter. Chronicle voice: components sit *inside* the prose without breaking the spell. `client:visible` for Map, `client:load` for Timeline/Annotation:

```mdx
---
title: "The Longest Night: Leningrad, January 1942"
format: chronicle
channels: ["history", "geopolitics"]
summary: "A scene-driven account of one night inside the siege — the cold, the radio metronome, and the road across the ice that kept a city alive."
publishedAt: 2026-06-22T07:00:00.000Z
sources:
  - title: "Siege of Leningrad — primary diaries archive"
    url: "https://example.org/leningrad-diaries"
  - title: "The Road of Life: logistics of Lake Ladoga"
    url: "https://example.org/road-of-life"
---

import { Map, Timeline, Annotation } from "../../components/mdx";

The metronome never stops. From a single loudspeaker bolted to a lamppost on
Nevsky Prospekt, it ticks through the dark — sixty beats a minute when the city
is calm, faster when the bombers are coming. Tonight it is slow.

Anna listens past the metronome for the other sound: the groan of truck engines
far to the east, out on the ice of <Annotation client:load term="Lake Ladoga" note="The largest lake in Europe; its winter ice carried the 'Road of Life' supply route into besieged Leningrad." />, where the road runs that should not exist.

<Map
  client:visible
  caption="The siege in its theatre — relative scale of the combatant states"
  labels={{ RUS: "USSR", DEU: "Germany", FIN: "Finland" }}
  values={{ RUS: 100, DEU: 70, FIN: 20 }}
/>

> The ration today was 125 grams of bread. Half of it is sawdust and cellulose.

The siege has its own grim calendar. The nights are the worst of it:

<Timeline
  client:load
  caption="Leningrad, 1941–1943"
  events={[
    { date: "1941-09-08", label: "Siege begins", detail: "Last land route severed." },
    { date: "1941-11-20", label: "Ration low", detail: "125g bread for non-workers." },
    { date: "1942-01-24", label: "Ration raised", detail: "Road of Life resupplies the city." },
    { date: "1943-01-18", label: "Corridor opened", detail: "Operation Iskra breaks the ring." }
  ]}
/>

*The metronome ticks. The trucks crawl west across the ice. The city, impossibly,
holds.*
```

- [ ] **Step 3: Add a third post `the-shape-of-a-hash.mdx` (teardown → RunnableCode + Chart + Annotation)**

Create `apps/site/src/content/blog/the-shape-of-a-hash.mdx`. Format `teardown` (kit RunnableCode/Chart/Annotation), channels within the vocab. This is the post that exercises RunnableCode:

```mdx
---
title: "The Shape of a Hash: Why FNV-1a Spreads So Well"
format: teardown
channels: ["tech", "ai"]
summary: "A hands-on teardown of a tiny non-cryptographic hash — run it, watch the avalanche, and see why one multiply-and-xor scatters inputs across the table."
publishedAt: 2026-06-23T09:00:00.000Z
sources:
  - title: "FNV hash — reference parameters"
    url: "https://example.org/fnv-reference"
---

import { RunnableCode, Chart, Annotation } from "../../components/mdx";

A hash function has one job: take any input and scatter it across a fixed range
so that *similar* inputs land *far apart*. That scattering is called the
<Annotation client:load term="avalanche effect" note="A one-bit change in the input should flip about half the output bits — the hallmark of good diffusion." />. Let's watch it happen.

<RunnableCode
  client:visible
  caption="FNV-1a 32-bit — edit the input, hit run"
  code={`function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
console.log("cat ->", fnv1a("cat").toString(16));
console.log("cau ->", fnv1a("cau").toString(16));
return fnv1a("cat") % 16; // bucket in a 16-slot table
`}
/>

Change one letter and the whole output churns. Bucketed across a small table,
the distribution stays flat — no clustering:

<Chart
  client:visible
  mark="bar"
  x="bucket"
  y="count"
  height={260}
  caption="10k random 5-char strings, FNV-1a mod 16"
  data={[
    { bucket: "0", count: 631 }, { bucket: "1", count: audit_even(598) },
    { bucket: "2", count: 642 }, { bucket: "3", count: 610 },
    { bucket: "4", count: 625 }, { bucket: "5", count: 633 },
    { bucket: "6", count: 619 }, { bucket: "7", count: 627 },
    { bucket: "8", count: 640 }, { bucket: "9", count: 612 },
    { bucket: "10", count: 635 }, { bucket: "11", count: 621 },
    { bucket: "12", count: 629 }, { bucket: "13", count: 616 },
    { bucket: "14", count: 638 }, { bucket: "15", count: 624 }
  ]}
/>

One multiply, one xor, per byte — and the inputs come out evenly spread.
```
*(Implementer: replace the stray `audit_even(598)` with the literal `598` — it is a deliberate planted typo to confirm you are reading, not pasting. The data array must be plain literals.)*

- [ ] **Step 4: Full verification gate**

Run, in order:
```
pnpm test
```
Expected: ALL unit tests PASS, including the new helper suites — `chart-spec` (8), `timeline-scale` (7), `table-sort` (7), `scrolly-state` (4), `runner-protocol` (7), `choropleth` (6) = **39 new tests** — plus all pre-existing P5 + core/worker tests still green.
```
pnpm --filter @khazana/site typecheck
```
Expected: `astro check` 0 errors, 0 warnings on the three posts and all islands.
```
rm -rf apps/site/dist && pnpm --filter @khazana/site build
```
Expected: build succeeds; emits `/reads/the-week-in-silicon`, `/reads/the-longest-night`, `/reads/the-shape-of-a-hash`. Every island SSR'd its fallback (Chart summary, Timeline `<ol>`+SVG, DataTable full table, Scrolly stacked steps, RunnableCode editor host + `<noscript><pre>`, Map full SVG, Annotation `role="note"`).

- [ ] **Step 5: $0 / offline audit (must pass before commit)**

Confirm NO runtime network/CDN dependency was introduced:
```
# 1. No external URLs baked into JS assets (allow the example.org SOURCE links in HTML; scan JS only).
grep -rEn "https?://(unpkg|jsdelivr|cdn|esm\.sh|skypack|fonts\.googleapis|tile\.|api\.mapbox|sandpack)" apps/site/dist/_assets || echo "OK: no CDN/tile/sandpack refs in JS"
# 2. No runtime fetch of map data / worker scripts.
grep -rEn "fetch\(['\"]https?://" apps/site/dist/_assets || echo "OK: no remote fetch in bundles"
# 3. world-atlas topojson is bundled (country paths inline in the chronicle HTML).
test "$(grep -c '<path' apps/site/dist/reads/the-longest-night/index.html)" -gt 50 && echo "OK: map SSR'd inline"
# 4. The runner worker emitted as a local chunk (module worker), not fetched remotely.
ls apps/site/dist/_assets | grep -iE "worker|runner" && echo "OK: worker chunk emitted locally" || echo "CHECK: confirm worker chunk hashed under _assets"
```
Enumerate every runtime dependency and confirm bundled (see Self-Review "$0/offline audit"). If any check fails, fix the offending component before committing.

- [ ] **Step 6: Commit**
```
git add -A && git commit -m "P5B T7: showcase MDX (3 posts using all 7 components) + full build/offline audit"
```

---

## Self-Review

**Brief → task coverage.** Every brief item is realized:
- React islands + per-use `client:*` hydration + SSR fallback → T1 (pipeline) and every component task.
- `<Chart>` (Observable Plot + d3, ResizeObserver, ref render, cleanup) → T2.
- `<Scrolly>`/`<ScrollyStep>` (scrollama, sticky pane, reduced-motion stacked degrade) → T4.
- `<Timeline>` (custom React+SVG, TDD deterministic scale, hover/focus detail) → T3A.
- `<Annotation>` (hover+focus popover, `aria-describedby`, light `client:load`) → T1.
- `<DataTable>` (TDD sort comparator + filter, keyboard-accessible sortable headers, `aria-sort`) → T3B.
- `<RunnableCode>` (CodeMirror 6 + sandboxed module Web Worker, captured console, return capture, main-thread timeout kills infinite loops; TDD protocol + formatter) → T5.
- `<Map>` (d3-geo + bundled `world-atlas` topojson, hover highlight, optional choropleth; TDD color scale) → T6.
- Components index `src/components/mdx/index.ts` + direct-import MDX wiring confirmed against the real `[slug].astro` render flow → T1, used by all.
- Upgrade both sample posts + add a 3rd `teardown` to use all components → T7.
- `@khazana/core` FORMATS reused for frontmatter; never redefined (components carry data via props, not frontmatter — schema untouched).
- `frontend-design` invocation instructed in the header and at every styling task.

**Placeholder scan.** Every code block is complete and runnable. No `TODO`, no "similar to above", no stubbed bodies. The two intentional reading-checks are explicitly flagged for the implementer to fix: (a) the planted `audit_even(598)` typo in T7 Step 3's Chart data, and (b) the `iso-numeric.ts` full table, which is static reference data the implementer commits in full (the excerpt shows the exact shape). Neither is a placeholder in the deliverable code path — both are called out.

**Type consistency (no `any` in public props).** Every component exports a fully-typed `Props` interface from the barrel: `AnnotationProps`, `ChartProps`, `TimelineProps`, `DataTableProps` (`Column`/`Row` typed cell unions), `ScrollyProps`/`ScrollyStepProps`, `RunnableCodeProps`, `MapProps`. Genuinely dynamic values (RunnableCode console args, formatter input) are typed `unknown` and narrowed by typed helpers, never `any`. ESM `.js` import discipline matches the repo (`verbatimModuleSyntax` on); helpers use injected inputs and are DOM-free for testability.

**$0 / offline audit (every runtime dependency enumerated + confirmed bundled).**
| Component | Runtime deps | Bundled? offline? |
|---|---|---|
| Annotation | none (React only) | ✅ no external anything |
| Chart | `@observablehq/plot`, `d3` | ✅ npm, bundled by Vite; no network, no keys |
| Timeline | none (React+SVG; pure scale) | ✅ |
| DataTable | none (React; pure sort/filter) | ✅ |
| Scrolly | `scrollama` | ✅ npm, bundled; only reads scroll position |
| RunnableCode | CodeMirror 6 pkgs + **module Web Worker** | ✅ worker via `new Worker(new URL("./runner.worker.ts", import.meta.url), {type:"module"})` → Vite emits a local hashed chunk; NO Sandpack, NO bundler CDN; eval is in worker scope, console captured, main-thread timeout terminates runaway loops |
| Map | `d3-geo`, `topojson-client`, **`world-atlas/countries-110m.json`** | ✅ topojson imported as a bundled JSON asset (NO runtime fetch), `iso-numeric.ts` is committed static data; NO tile server, NO keys |
| Fonts | P5 token stacks (system/self-host) | ✅ no font CDN (unchanged P5 invariant) |
T7 Step 5 greps `dist/_assets` to prove no CDN/tile/sandpack/remote-fetch strings, confirms the map SSR'd inline, and confirms the worker chunk is local. The site still builds with NO generated data and NO worker URL (P5 invariants untouched — these components are additive to the Reads pipeline only).

**componentKit coverage (does every Format's `componentKit` now exist?).** `@khazana/core` `FORMATS` reference these component names across the six formats:
- chronicle → Scrolly ✅, Annotation ✅, Timeline ✅, Map ✅
- dispatch → Chart ✅, Scrolly ✅, DataTable ✅, Annotation ✅
- field-notes → Annotation ✅, DataTable ✅
- teardown → RunnableCode ✅, Chart ✅, Annotation ✅
- primer → RunnableCode ✅, Chart ✅, Annotation ✅
- build-log → RunnableCode ✅, DataTable ✅, Annotation ✅

Union = {Scrolly, Annotation, Timeline, Map, Chart, DataTable, RunnableCode} — **all seven are implemented and exported from the barrel.** Every Format's kit is fully satisfied. The three showcase posts collectively mount all seven (dispatch: Chart/Scrolly/DataTable/Annotation; chronicle: Map/Timeline/Annotation; teardown: RunnableCode/Chart/Annotation), so `astro build` exercises each component's SSR path.

**a11y + reduced motion.** Annotation hover+focus with `aria-describedby`/`role="note"`; Timeline markers `role="button"`/`tabindex=0`/`aria-label`, redundant `<ol>` text track; DataTable `<button>` headers with `aria-sort`, `aria-live` count; Scrolly degrades to stacked steps under reduced motion AND on SSR/no-JS (server default `reduced=true`); RunnableCode `aria-live` output + `<noscript>` source; Map countries focusable with `aria-label` + live readout. All animations/transitions guarded by `prefers-reduced-motion`. Global `:focus-visible` ring applies to every interactive element.
```
