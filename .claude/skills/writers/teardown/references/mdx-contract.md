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
Sankey  BattleMap  OrderOfBattle  ForceComparison  ParameterPlay
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
<StatBand client:visible caption="The scale of the event"
  stats={[
    { value: 17.6, suffix: " HRS", label: "OUTAGE DURATION", sub: "North America", href: "https://..." },
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
<Pullquote cite="Source, Date" href="https://..." kind="quote">
  The quoted text or document excerpt goes here.
</Pullquote>
```
Props: `cite?` (attribution), `href?` (source link), `kind?` (default `"quote"`).
Variants: `"quote"` (large italic, hanging quotation mark), `"document"` (mono archival excerpt,
hairline frame), `"telegram"` (perforated-tape top, amber routing header, uppercase mono body),
`"headline"` (Fraunces, ruled top & bottom, centered attribution). Children = the quote text.
**No `client:` directive** — this is a static Astro component.


> **Note:** A richer scrollytelling component (`NarrativeScene`) is pending a rebuild — it is not in the allow-list and must not be used until reinstated.

## 3a. P0 components — Figure, Math, Callout, Detail, Definition

### Math — display equation + numbered derivation (island → `client:visible`)

KaTeX renders server-side, so math shows with no JS; `$…$` inline and `$$…$$`
block math also work directly in prose (remark-math + rehype-katex are wired).
Reach for `<Math>` when you need numbering, a caption, or a per-line "why" note:

```jsx
<Math client:visible tex="S_n = \frac{n(n+1)}{2}" label="(2)" numbered
  steps={[
    { tex: "S_n = 1 + 2 + \cdots + n", note: "write the sum forwards" },
    { tex: "2S_n = n(n+1)", note: "add it to its reverse, column-wise" },
  ]}
  caption="Gauss's pairing." />
```

Props: `tex: string` (display), `steps?: { tex, note? }[]` (each line
annotatable), `label?` (e.g. `"(2)"`), `caption?`, `numbered?`.

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

## 3b. P1 components — Diagram, Stepper, Quiz, CodeWalkthrough (this format's kit)

### Diagram — node-edge architecture / flow figure (island → `client:visible`)

```jsx
<Diagram client:visible caption="Request path through the edge"
  nodes={[
    { id: "client", label: "Browser Client", x: 0, y: 0, kind: "input" },
    { id: "edge", label: "Edge Worker", x: 1, y: 0, kind: "process" },
    { id: "kv", label: "KV Store", x: 2, y: 1, kind: "store" }
  ]}
  edges={[
    { from: "client", to: "edge", label: "HTTPS", kind: "data" },
    { from: "edge", to: "kv", label: "read/write", kind: "control" }
  ]} />
```

Props: `nodes: { id, label, x, y, kind? }[]` — `x`/`y` are **abstract-grid center
coords** (any consistent units), `kind?`: `default|input|output|process|store|decision`
(visual tint). `edges: { from, to, label?, kind? }[]` — `kind?`: `data|control|async`
(solid/dashed/dotted). `caption?`, `highlightOnHover?` (default `true`). Author the
coordinates yourself; there is no auto-layout. Hover/focus a node dims the rest;
≤640px promotes a semantic node/edge list (no 360px overflow).

### Stepper — numbered step sequence (island → `client:visible`)

```jsx
<Stepper client:visible mode="reveal" caption="casting a pewter part"
  steps={[
    { title: "Melt the ingot", body: "<p>Bring the crucible to 232&nbsp;°C.</p>" },
    { title: "Prime the mould", body: "<p>Dust the cavity with graphite.</p>", figure: "<svg viewBox='0 0 100 40' width='100%'><rect x='4' y='4' width='92' height='32' fill='none' stroke='currentColor'/></svg>" }
  ]} />
```

Props: `steps: { title, body, figure? }[]` — `body`/`figure` are **pre-rendered
HTML strings** (an island can't take MDX children). `mode?`: `reveal` (default) |
`tabs` | `all`. `caption?`. No-JS / reduced-motion → all steps shown as an `<ol>`.

### Quiz — check-your-understanding (island → `client:visible`)

```jsx
<Quiz client:visible caption="check your understanding"
  questions={[
    { prompt: "Which sort is O(n log n) worst-case?", choices: ["quicksort", "mergesort", "insertion sort"], answer: 1, explain: "Mergesort is n log n worst-case." },
    { prompt: "Bits in a byte?", answer: 8, kind: "numeric", explain: "A byte is 8 bits." }
  ]} />
```

Props: `questions: { prompt, choices?, answer, explain, kind? }[]` — `answer` is a
**0-based choice index** for `mc` or the **number** for `numeric`; `kind?`: `mc` |
`numeric` (inferred: `mc` if `choices` present). `caption?`. No-JS → questions +
answers in a `<details>`.

### CodeWalkthrough — narrated, syntax-highlighted static code (static Astro; NO `client:` directive)

```jsx
<CodeWalkthrough lang="ts" caption="A tiny rate limiter, step by step"
  steps={[
    { lines: [1, 6], note: "The bucket holds tokens; capacity + refill are fixed." },
    { lines: [8, 15], note: "refill() lazily adds tokens from elapsed wall-clock." }
  ]}
  code={`class TokenBucket { /* … full listing … */ }`} />
```

Props: `code: string` (full listing, any language, need not run), `lang?` (Shiki id,
e.g. `"ts"`, `"python"`; default `"text"`), `steps: { lines: [start,end], note }[]`
(1-based inclusive line range focused per step), `caption?`. **Static Astro** — no
`client:` directive; Shiki highlights at build, a bundled script does prev/next.
Distinct from `RunnableCode` (which is editable/executable JS).

## 3c. P2 components — CompareSlider, EventCascade (this format's kit)

### CompareSlider — before/after image wipe (island → `client:visible`)

For wear / failure comparisons (pristine vs worn part, intact vs fractured). Two
aligned images share one aspect-reserved frame; a draggable amber handle wipes
between them. Optimize each image in the MDX ESM header with `getImage()`:

```jsx
import { getImage } from "astro:assets";
import beforeImg from "./_assets/pristine.png";
import afterImg from "./_assets/worn.png";
const b = await getImage({ src: beforeImg, width: 1200 });
const a = await getImage({ src: afterImg, width: 1200 });

<CompareSlider client:visible
  before={b.src} after={a.src}
  width={b.attributes.width} height={b.attributes.height}
  alt="The gear, pristine vs after 10k hours"
  beforeLabel="New" afterLabel="Worn"
  caption="Drag to wipe between the two." />
```

Props: `before: string`, `after: string` (both from `getImage()`, **not** raw
imports), `width: number`, `height: number` (intrinsic px), `alt: string` (required),
`beforeLabel?` (default `"before"`), `afterLabel?` (default `"after"`), `caption?`,
`orientation?: "h"|"v"` (default `h`). No-JS / reduced-motion → both images stacked
with labels (never blank).

### EventCascade — vertical CAUSAL chain / failure cascade (island → `client:visible`)

```jsx
<EventCascade client:visible caption="how the outage cascaded"
  nodes={[
    { kind: "cause", label: "A misconfigured threshold triggers premature scale-in",
      detail: "The fleet drops below the connection-draining floor mid-spike." },
    { kind: "effect", label: "The retry storm saturates remaining capacity",
      detail: "Each retry multiplies request rate against a shrinking pool." },
    { kind: "turning-point", label: "Circuit breakers trip and shed load",
      detail: "Shedding 40% of inbound traffic lets the pool recover." }
  ]} />
```

Props: `nodes: { label: string, detail: string, kind?: "cause"|"effect"|"turning-point" }[]`
(`detail` required, a plain serializable string; `kind` defaults to `effect`),
`caption?`. The amber spine carries labeled *reasoning* — distinct from `Timeline`'s
clock. Ideal for failure cascades. No-JS → an ordered `<ol>` with every label +
detail.

## 3d. P3 components — StateMachine, LayerStack (this format's kit)

### StateMachine — a token walked through states/transitions (island → `client:visible`)
```jsx
<StateMachine client:visible
  caption="The TCP three-way handshake."
  start="closed"
  states={[
    { id: "closed", label: "CLOSED", x: 0, y: 0 },
    { id: "syn-sent", label: "SYN-SENT", x: 1, y: -1 },
    { id: "established", label: "ESTABLISHED", x: 2, y: 0 }
  ]}
  transitions={[
    { from: "closed", to: "syn-sent", on: "send SYN" },
    { from: "syn-sent", to: "established", on: "recv SYN-ACK / send ACK" }
  ]}
  sequence={["closed>syn-sent", "syn-sent>established"]} />
```
Props: `states: { id, label, x, y }[]` (x/y = author grid coords, like Diagram), `transitions: { from, to, on }[]` (`on` = the edge/event label), `start: string` (id the token starts on), `sequence?: string[]` (scripted walk; refs are `"<idx>"` | `"from>to"` | `"from>to:on"` — omit for free-click mode), `caption?`. No-JS / reduced-motion → the fully-labeled SVG plus a semantic States/Transitions/Walk list (never blank).

### LayerStack — a stack of expandable layers (island → `client:visible`)
```jsx
<LayerStack client:visible
  caption="The four layers of the TCP/IP model."
  layers={[
    { label: "Application", note: "The protocols the user speaks — HTTP, DNS, SMTP.", detail: "L7." },
    { label: "Transport", note: "End-to-end delivery: TCP stream or UDP datagrams.", detail: "L4." },
    { label: "Internet", note: "Addressing and routing across networks — IP.", detail: "L3." },
    { label: "Link", note: "Framing bits onto a physical segment.", detail: "L2/L1." }
  ]} />
```
Props: `layers: { label, note, detail? }[]` (top-to-bottom as authored), `orientation?: "vertical"` (only value in v1), `caption?`. Click/hover/focus expands a slab; arrow/Home/End move the active layer. No-JS / reduced-motion → every layer expanded as a semantic `<ol>` (never blank).

## 3e. Flow diagram + real 3D part — Sankey, Model3D (this format's kit)

### Sankey — flow / allocation diagram (island → `client:visible`)
```jsx
<Sankey client:visible unit="W"
  caption="Power budget across the board's rails"
  nodes={[
    { id: "usb", label: "USB-C 5V" },
    { id: "reg", label: "Buck regulator" },
    { id: "mcu", label: "MCU" },
    { id: "radio", label: "Radio" }
  ]}
  links={[
    { source: "usb", target: "reg", value: 5 },
    { source: "reg", target: "mcu", value: 2 },
    { source: "reg", target: "radio", value: 2.5 }
  ]} />
```
Props: `nodes: { id, label? }[]`, `links: { source, target, value }[]` (ids reference `nodes`; positive finite `value`; must be a DAG), `unit?` (suffix on values), `caption?`. Hover/focus a flow → value + share of total; `% of total` = flow value / sum of all links. No-JS / <640px → a semantic `source → target: value (unit) (pct)` list + total (never blank); reduced-motion → static end state.

### Model3D — the RARE inline 3D viewer, **v2** now loads a committed `.glb` (island → `client:visible`)
ONE per article max, and only when the subject is genuinely spatial. Two modes:
```jsx
{/* v2: load a real committed local model (a teardown/build part) */}
<Model3D client:visible
  src="/_assets/_demo/model-demo.glb"
  alt="A 12-tooth printed spur gear, viewed as a solid brass part."
  label="reduction gear"
  caption="Fig. 3 — the printed gear, drag to rotate." />

{/* default: no src → procedural gyroid infill lattice (zero external asset) */}
<Model3D client:visible detail={16} caption="The gyroid infill a slicer generates." />
```
Props: `src?` (a COMMITTED local `.glb`/`.gltf` URL — pass the URL your asset pipeline emits, e.g. a Vite `?url` import of a file under `_assets/`; drei `useGLTF` needs a resolvable URL, not a bare source path), `alt?` (accessible description → drives the no-JS fallback text + `aria-label`), `label?` (short instrument label above the fallback note), `detail?` (gyroid density; default mode only), `caption?`. Keep the committed model SMALL — budget < ~1–2 MB (the demo gear is ~17 KB), low-poly, single-material, no Draco/meshopt. With `src`, loads drag-to-rotate via `useGLTF` (auto-framed by drei `<Center>`+`<Bounds>`); with no `src`, renders the procedural gyroid lattice unchanged. No-JS / mobile / reduced-motion → a baked CSS lattice fallback describing the model (never live GL server-side).

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
