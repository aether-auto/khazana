# MDX contract — what every emitted post MUST satisfy

This is the exact contract the generated `.mdx` must meet to build in the site
and pass `validateDraft`. Derived verbatim from
`apps/site/src/content.config.ts`, `packages/generate/src/validate.ts`, and the
component signatures in `apps/site/src/components/mdx/`. Do not drift from it.

## 1. Frontmatter (YAML between `---` fences)

```yaml
---
title: "Exact title from the brief"
format: <one of: chronicle | dispatch | teardown | primer | field-notes | build-log>
channels:
  - <channel from the brief; must be in the site channel vocab>
summary: "One sentence. Concrete. No hedging."
publishedAt: 2026-06-24T09:00:00.000Z   # ISO 8601 datetime (coerced to a date)
sources:
  - title: "Real source article title"
    url: "https://exact-url-from-the-brief"
draft: false
---
```

Hard rules (each maps to a check in `validate.ts`):

- **`format`** — exactly the brief's format name. No synonyms.
- **`channels`** — a non-empty array; every value must be a real site channel
  (the brief's Channel line is valid). At least one entry.
- **`sources`** — a **non-empty** array of `{ title, url }`. Every `url` must be
  **verbatim** one of the brief's source-item URLs (`validateDraft` rejects any
  url not in the known FeedItem set, and rejects an empty `sources` list). One
  entry per source you actually cite.
- **`publishedAt`** — ISO 8601 (e.g. the run date). `z.coerce.date()` parses it.
- **`draft`** — `false` to publish.
- `summary` and `title` are plain strings.

## 2. Component imports + allow-list

Import the components you use from the mdx barrel, on one line near the top of the
body (after the frontmatter):

```jsx
import { Chart, Annotation } from "../../components/mdx";
```

`validateDraft` rejects any JSX component (`<Foo>`) or mdx-import name **not** in
this allow-list:

```
Annotation  Chart  Timeline  DataTable  Scrolly  ScrollyStep  ScrollyTimeline
RunnableCode  Map  ControlledChart  KellyChart  Model3D  Sidenote  DrawChart
StatBand  Pullquote  Figure  Math  Callout  Detail  Definition
Diagram  Simulation  Stepper  Quiz  CodeWalkthrough  AnnotatedFigure
SmallMultiples  Distribution  Scatter  Slopegraph  RangePlot  CompareSlider  CastGrid  EventCascade
StateMachine  LayerStack  Checklist  GanttStrip  RouteMap
Sankey  BattleMap  OrderOfBattle  ForceComparison
```

Use only the subset in **this format's kit** (see the SKILL). Interactive islands
are React; in Astro MDX they need a **client directive** — use `client:visible`
for below-the-fold figures (lazy) and `client:load` for above-the-fold or inline
ones.

## 3. Exact component props (copy these shapes)

### `<Annotation>` — inline cited term (the citation apparatus)
```jsx
<Annotation client:load term="avalanche effect" note="A one-bit input change flips ~half the output bits — the hallmark of good diffusion." />
```
`term` (the inline word, kept in the prose flow) + `note` (short margin/popover
text). This is the primary way to cite a named fact without breaking prose.

### `<Chart>` — declarative chart (Observable Plot)
```jsx
<Chart client:visible mark="line" x="month" y="cost" height={300}
  series="tier"                      // optional: splits into colored series
  caption="Marginal cost ($/M tokens), datacenter vs edge"
  data={[
    { month: "2025-09", cost: 1.2, tier: "datacenter" },
    { month: "2025-09", cost: 3.1, tier: "edge" }
  ]} />
```
`mark` is one of `"line" | "bar" | "area" | "dot"`. `x`/`y` are field names in
each row. `data` must be a non-empty array of row objects. `series` (optional)
field name for multi-series. `height` defaults 320. Vary mark by intent: line for
trend, bar for comparison, area for cumulative, dot for relationship.

### `<DataTable>` — sortable/filterable table
```jsx
<DataTable client:load caption="Parts list"
  columns={[
    { key: "part", label: "Part", type: "string" },
    { key: "cost", label: "Cost ($)", type: "number", align: "right" }
  ]}
  rows={[
    { part: "Raspberry Pi 5", cost: 80 },
    { part: "NVMe HAT", cost: 18 }
  ]} />
```
`columns` = `{ key, label, type, align? }` (`type`: `"string" | "number"`;
`align: "right"` for numerics). `rows` = objects keyed by column `key`.
Optional `total?: string` = a numeric column `key` to sum in a right-aligned amber footer row (bills-of-materials); omit for no footer.

### `<Timeline>` — horizontal SVG timeline
```jsx
<Timeline client:load caption="1941–1944"
  events={[
    { date: "1941-09-08", label: "Siege begins", detail: "Last land route severed." },
    { date: "1944-01-27", label: "Siege lifted", detail: "872 days." }
  ]} />
```
`events` = `{ date (YYYY-MM-DD), label, detail }`.

### `<Map>` — world choropleth (ISO 3166-1 alpha-3 keys)
```jsx
<Map client:visible caption="Relative scale of combatant states"
  labels={{ RUS: "USSR", DEU: "Germany" }}
  values={{ RUS: 100, DEU: 70 }} />
```
`values` (iso3 -> number) drives the shading; `labels` (iso3 -> name) the hover.

### `<Scrolly>` + `<ScrollyStep>` — sticky-graphic, stepped-prose
```jsx
<Scrolly client:visible caption="Three signals, one shift">
  <ScrollyStep graphic={
      <Chart client:visible mark="bar" x="m" y="v" data={[{ m: "a", v: 1 }]} />
    }>
    **Step one.** Prose for this step — calm, fully readable. The graphic pins
    while these words scroll.
  </ScrollyStep>
  <ScrollyStep graphic={ <Chart client:visible mark="area" x="m" y="v" data={[{ m: "a", v: 1 }]} /> }>
    **Step two.** The next beat.
  </ScrollyStep>
</Scrolly>
```
Each `ScrollyStep` takes a `graphic` prop (the pinned figure, usually a `<Chart>`)
and prose children. Import BOTH `Scrolly` and `ScrollyStep`.

### `<RunnableCode>` — editable, runnable JS sandbox (CodeMirror + worker)
```jsx
<RunnableCode client:visible caption="FNV-1a — edit the input, hit run"
  code={`function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
return fnv1a("cat") % 16;`} />
```
`code` is a **template-literal string** (backticks) of **JavaScript** — the worker
runs JS only. Use `console.log(...)` for traces and `return <value>` for the
result. Keep it self-contained (no imports, no network). `timeoutMs` defaults
2000. This is the runnable component for teardown / primer / build-log.

### `<StatBand>` — dramatic figure row, counts up on scroll (`client:visible`)
```jsx
<StatBand client:visible caption="The scale of the storm"
  stats={[
    { value: 17.6, suffix: " HRS", label: "TELEGRAPH OUTAGE", sub: "North America", href: "https://..." },
    { value: 1859, label: "YEAR", group: false },
    { value: 2.6, prefix: "$", suffix: "T", label: "ESTIMATED DAMAGE", sub: "2024 USD", href: "https://..." }
  ]} />
```
`stats` is a non-empty array of `Stat` objects. Each `Stat`: `value` (number, required),
`prefix?` ("$"), `suffix?` (" HRS"), `decimals?` (fixed precision), `group?` (default `true`;
set `false` for years, IDs), `label` (mono label, required), `sub?` (smaller qualifier),
`href?` (source link — turns the stat into a citation). `caption?` is a caption below.
`duration?` is animation duration in ms (default 1400). Place near the top of the piece.

### `<Pullquote>` — dramatic primary-source block (static Astro, NO `client:` directive)
```jsx
<Pullquote cite="Samuel Morse, 2 September 1859" href="https://..." kind="telegram">
  What hath God wrought — the wires are alive without our hand.
</Pullquote>
```
Props: `cite?` (attribution), `href?` (source link), `kind?` (default `"quote"`).
Variants: `"quote"` (large italic, hanging quotation mark), `"document"` (mono archival excerpt,
hairline frame), `"telegram"` (perforated-tape top, amber routing header, uppercase mono body),
`"headline"` (Fraunces, ruled top & bottom, centered attribution). Children = the quote text.
**No `client:` directive** — this is a static Astro component.

> **Note:** A richer scrollytelling component (`NarrativeScene`) is pending a rebuild — it is not in the allow-list and must not be used until reinstated.

## 3a. P0 components — Figure, Math, Callout, Detail, Definition

### Figure — the image primitive (static Astro; NO client directive)

Local, committed, build-optimized assets only — no runtime hotlinking. Import
the asset, then pass it as `src`:

```jsx
import Figure from "../../components/mdx/Figure.astro";
import fig from "./_assets/<slug>/photo.jpg";

<Figure src={fig} alt="Required a11y description."
  caption="Editorial caption." credit="NASA / SDO"
  sourceUrl="https://exact-ledger-url" zoom bleed="wide" aspect="16/9" />
```

Props: `src: ImageMetadata` (imported), `alt` (required), `caption?`, `credit?`,
`sourceUrl?` (ledger URL, grounding), `zoom?` (default true → CSS-only lightbox),
`bleed?: "column"|"wide"|"full"`, `aspect?` (e.g. `"16/9"`, prevents CLS). Assets
live in `apps/site/src/content/blog/_assets/<slug>/` and must be public-domain /
open-license or pipeline-generated, with the source URL recorded.

### Callout — semantic note, single left hairline (static Astro; takes MDX children)

```jsx
<Callout kind="key-insight" title="Optional title">
The one sentence to remember. Amber edge for key-insight, clay for
warning/caution, neutral for note/aside — "lines not boxes", no heavy box.
</Callout>
```

Props: `kind: "note"|"warning"|"key-insight"|"aside"|"caution"`, `title?`,
children = the note body (MDX). No `client:` directive.

### Detail — progressive-disclosure "go deeper" (static Astro; ZERO JS)

```jsx
<Detail summary="Go deeper: a proof sketch" defaultOpen={false}>
Depth for motivated readers without bloating the linear read. Native
`<details>` — works with no JavaScript.
</Detail>
```

Props: `summary: string`, `defaultOpen?`, children = the expandable body (MDX).

### Definition — glossary tooltip that TEACHES a term (island → `client:visible`)

Distinct from `Annotation` (which cites a source): `Definition` teaches, with a
dotted amber underline. No-JS fallback via `<abbr title>`.

```jsx
The term <Definition client:visible term="entropy"
  def="the average bits needed to encode outcomes from a distribution." /> is
distinct from a citation.
```

Props: `term: string`, `def: string`, `children?` (rich popover body).

## 3b. P1 components — AnnotatedFigure (this format's kit)

### AnnotatedFigure — numbered pins over an image (island → `client:visible`)

An island layering numbered amber annotation pins over an **already-optimized**
image. Pins reveal a note on hover/focus/tap and are keyboard-cyclable.

**Page-level image wiring (required):** the island takes an already-optimized `src`
string + intrinsic `width`/`height` (an island cannot import an asset). Optimize the
image once in the MDX ESM header with `getImage()`, then pass its fields:

```jsx
import { getImage } from "astro:assets";
import plate from "./_assets/<your-image>.png";
const opt = await getImage({ src: plate, width: 1200 });

<AnnotatedFigure client:visible
  src={opt.src}
  width={opt.attributes.width}
  height={opt.attributes.height}
  alt="What the plate shows"
  caption="What to look at in the plate"
  credit="NASA / SDO"
  sourceUrl="https://exact-source-url"
  pins={[
    { x: 0.22, y: 0.30, label: "upper-left", note: "The first thing the eye lands on." },
    { x: 0.78, y: 0.52, label: "right-of-center", note: "A second detail." }
  ]} />
```

Props: `src: string` (from `getImage()`, **not** a raw import), `width: number`,
`height: number` (intrinsic px — reserves aspect ratio, prevents CLS), `alt: string`
(required a11y), `caption?`, `credit?`, `sourceUrl?` (grounding), `pins: { x, y,
label, note }[]` (`x`/`y` are **0..1 fractions** of the image box). No-JS /
reduced-motion → every pin's note is listed in an `<ol>` below (never blank).

## 3c. P2 components — CompareSlider, CastGrid, EventCascade (this format's kit)

### CompareSlider — before/after image wipe (island → `client:visible`)

Two aligned images share one aspect-reserved frame; a draggable amber handle wipes
between them. Like `AnnotatedFigure`, the island takes **already-optimized** `src`
strings, so optimize each image in the MDX ESM header with `getImage()`:

```jsx
import { getImage } from "astro:assets";
import beforeImg from "./_assets/before.png";
import afterImg from "./_assets/after.png";
const b = await getImage({ src: beforeImg, width: 1200 });
const a = await getImage({ src: afterImg, width: 1200 });

<CompareSlider client:visible
  before={b.src} after={a.src}
  width={b.attributes.width} height={b.attributes.height}
  alt="The same corner, 118 years apart"
  beforeLabel="1906" afterLabel="Today"
  caption="Drag to wipe between the two." />
```

Props: `before: string`, `after: string` (both from `getImage()`, **not** raw
imports), `width: number`, `height: number` (intrinsic px — reserves aspect ratio),
`alt: string` (required, describes the comparison), `beforeLabel?` (default
`"before"`), `afterLabel?` (default `"after"`), `caption?`, `orientation?: "h"|"v"`
(default `h`). No-JS / reduced-motion → both images stacked with labels (never
blank). Also usable in **build-log** (before/after builds) and **teardown**
(wear/failure comparisons).

### CastGrid — "cast of characters" card grid (STATIC Astro → NO client directive)

A grid of people / places / factions carrying the narrative. Static Astro — the
note reveal is pure CSS, so it needs **no client directive** and the notes are
always readable with no-JS. Portraits are optional; when present, supply an
optimized `img` string via `getImage()` (per-member).

```jsx
import { getImage } from "astro:assets";
import portrait from "./_assets/carrington.png";
const c = await getImage({ src: portrait, width: 480 });

<CastGrid caption="The cast of the 1859 solar storm"
  cast={[
    { name: "Richard Carrington", role: "astronomer", img: c.src,
      note: "Sketching sunspots when he saw the first solar flare ever recorded.",
      sourceUrl: "https://en.wikipedia.org/wiki/Richard_Carrington" },
    { name: "Balfour Stewart", role: "physicist",
      note: "His magnetometers at Kew ran off the chart as the storm hit." }
  ]} />
```

Props: `cast: { name, role, note, img?, sourceUrl? }[]` — `img?` is an OPTIONAL
optimized `getImage()` string (cards render name-only without it); `note` is always
visible. `caption?`. Reflows to one column at 360px. Also usable in **teardown**
("the components") / **primer** ("the key ideas").

### EventCascade — vertical CAUSAL chain (island → `client:visible`)

```jsx
<EventCascade client:visible caption="how one shot became a world war"
  nodes={[
    { kind: "cause", label: "Franz Ferdinand is assassinated in Sarajevo",
      detail: "A single shot hands Vienna's war party the pretext it wanted." },
    { kind: "effect", label: "Austria-Hungary issues an ultimatum to Serbia",
      detail: "Ten demands engineered to be rejected." },
    { kind: "turning-point", label: "The alliance system converts a local quarrel into a continental war",
      detail: "Rigid mobilization timetables leave no room to stop." }
  ]} />
```

Props: `nodes: { label: string, detail: string, kind?: "cause"|"effect"|"turning-point" }[]`
(`detail` required, a plain serializable string; `kind` defaults to `effect`),
`caption?`. The amber spine carries labeled *reasoning* — distinct from `Timeline`'s
clock. No-JS → an ordered `<ol>` with every label + detail. Also usable in
**teardown** (failure cascades) and **dispatch** (mechanisms).

## 3d. P3 components — RouteMap (this format's kit)

### RouteMap — choropleth world map with great-circle routes + points (island → `client:visible`)
```jsx
<RouteMap client:visible
  routes={[
    { from: [2.35, 48.85], to: [37.62, 55.75], label: "Paris → Moscow (advance)", kind: "march" },
    { from: [37.62, 55.75], to: [2.35, 48.85], label: "Moscow → Paris (retreat)", kind: "path" }
  ]}
  points={[
    { at: [37.62, 55.75], label: "Moscow (burned)" },
    { at: [23.35, 53.13], label: "Vilnius" }
  ]}
  values={{ RUS: 100, POL: 55, FRA: 25 }}
  labels={{ RUS: "Russian Empire", FRA: "France" }}
  caption="1812: the march to Moscow and the long retreat." />
```
Props: `routes?: { from: [lng,lat], to: [lng,lat], label?, kind?: "march"|"arc"|"path" }[]` (`kind` default `"arc"`), `points?: { at: [lng,lat], label }[]`, `values?: Record<iso3, number>` (choropleth weight, same as `Map`), `labels?: Record<iso3, string>` (readout label), `caption?`. Coords are `[longitude, latitude]`. Great-circle arcs bow poleward. No-JS / reduced-motion → the full static map with all arcs drawn plus a semantic legend `<ol>` of every route + point (never blank).

## 3e. Military / strategy kit — BattleMap, OrderOfBattle, ForceComparison (this format's kit)

> These three are the theater/history/geopolitics military kit. Provisionally documented under chronicle; a dedicated **theater** format skill will later own the full kit.

### BattleMap — phase-by-phase tactical map over a committed base image (island → `client:visible`)
BattleMap needs a committed, already-optimized base-map image; supply `src`/`width`/`height` from `getImage()` at the page level (the AnnotatedFigure pattern — the component does NOT import assets):
```jsx
import { getImage } from "astro:assets";
import terrain from "./_assets/battles/chancellorsville.png";
export const map = await getImage({ src: terrain, width: 1600 });

<BattleMap client:visible
  src={map.src} width={map.attributes.width} height={map.attributes.height}
  alt="Terrain around Chancellorsville, Virginia, spring 1863"
  caption="Chancellorsville, May 1863 — Jackson's flank march"
  sides={[
    { id: "usa", label: "Union (Hooker)", tone: "enemy" },
    { id: "csa", label: "Confederate (Lee)", tone: "friendly" }
  ]}
  phases={[
    {
      title: "Lee divides his army", time: "May 1",
      note: "Lee sends <strong>Jackson</strong> on a wide march around the Union right.",
      units: [
        { side: "usa", type: "infantry", label: "XI Corps", strength: "≈12,000", at: [0.24, 0.38] },
        { side: "csa", type: "hq", label: "Lee HQ", at: [0.68, 0.52] }
      ],
      movements: [{ side: "csa", from: [0.60, 0.55], to: [0.35, 0.78], kind: "advance", label: "flank march" }],
      fronts: [{ side: "csa", kind: "line", points: [[0.60, 0.20], [0.62, 0.50], [0.60, 0.80]] }]
    }
  ]} />
```
Props: `src` (optimized base-map URL from `getImage()`), `width`/`height` (intrinsic px — reserve aspect ratio AND set the SVG viewBox), `alt`, `caption?`, `sides: { id, label, tone?: "friendly"|"enemy"|"neutral" }[]`, `phases: PhaseSpec[]`. Each phase: `{ title, time?, note?` (short HTML string, NOT MDX children)`, units?, movements?, fronts? }`. `units: { side, type: "infantry"|"armor"|"cavalry"|"artillery"|"naval"|"air"|"hq", label?, strength?, at: [x,y] }` (coords 0..1 over the image). `movements: { side, from: [x,y], to: [x,y], kind?: "advance"|"attack"|"retreat"|"supply", label? }`. `fronts: { side?, kind?: "line"|"area", points: [x,y][] }`. A phase scrubber (‹/›, clickable ticks, arrow/Home/End) walks phases; unit glyphs are NATO-style. No-JS / reduced-motion → base image + first phase overlay + legend + a semantic phase-by-phase `<ol>` (never blank).

### OrderOfBattle — force-structure roster (**static Astro — NO client directive**)
```jsx
<OrderOfBattle
  caption="Order of battle — Gettysburg, July 1–3, 1863"
  sides={[
    {
      id: "potomac", label: "Army of the Potomac",
      commander: "Maj. Gen. George G. Meade", tone: "friendly",
      formations: [
        {
          name: "I Corps", kind: "corps", strength: "≈12,200",
          commander: "Maj. Gen. John F. Reynolds †",
          note: "opened the battle west of town on July 1",
          units: [
            { name: "1st Division (Wadsworth)", strength: "≈3,900", note: "held McPherson's Ridge" },
            { name: "Iron Brigade", strength: "≈1,800", note: "shattered but bought time" }
          ]
        }
      ]
    }
  ]} />
```
Props: `sides: { id, label, commander?, tone?: "friendly"|"enemy"|"neutral", formations: Formation[] }[]`, `caption?`. `Formation: { name, kind?: "army"|"corps"|"division"|"brigade"|"regiment"|"fleet"|"wing"|"other", strength?, commander?, note?, units?: { name, strength?, note? }[] }`. STATIC Astro — do NOT add `client:*`. Sub-units live in native `<details open>`, so the full roster is visible with zero JS. Reflows to one column at 360px.

### ForceComparison — head-to-head forces & casualties (island → `client:visible`)
```jsx
<ForceComparison client:visible
  caption="Forces & losses — Gettysburg"
  sides={[
    { label: "Union", tone: "friendly" },
    { label: "Confederate", tone: "enemy" }
  ]}
  metrics={[
    { label: "Troops",     values: [93921, 71699], unit: "men" },
    { label: "Artillery",  values: [372, 283],     unit: "guns" },
    { label: "Casualties", values: [23049, 28063], unit: "men", higherIsWorse: true }
  ]} />
```
Props: `sides: { label, tone?: "friendly"|"enemy"|"neutral" }[]`, `metrics: { label, values: number[]` (one per side, same order)`, unit?, higherIsWorse? }[]`, `caption?`. Each metric = diverging paired bars sharing a center baseline that carries the ratio; bars normalized per metric. `higherIsWorse` (e.g. casualties) flips the advantaged side to the smaller value. Hover/focus a bar → exact value + ratio. No-JS / ≤520px → a labeled comparison table (never blank); reduced-motion → static end state.

## 4. Body conventions

- Astro MDX: prose is Markdown; components are JSX islands woven in. A blank line
  separates a component block from surrounding prose.
- Cite inline with `<Annotation>` (preferred — renders as marginalia) or a normal
  Markdown link to a brief source URL.
- Match founder voice (STYLE.md, included in the brief): open with a scene /
  number / question; no hedging; vary sentence rhythm; numbers always
  contextualized; don't start consecutive sentences with "The"; no "in
  conclusion".

## 5. The grounding self-check (run before emit)

1. Every `sources[].url` is a verbatim brief source URL, and the list is non-empty.
2. Every factual claim (number, name, date, quote) has an inline citation tracing
   to a source item — or it is cut.
3. Every JSX component name is in this format's kit (⊆ the allow-list).
4. Frontmatter parses and matches the schema above.
5. `python3 scripts/check-links.py <file>.mdx` exits 0.
