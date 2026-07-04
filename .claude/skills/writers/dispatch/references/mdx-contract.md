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

## 3b. P1 components — Diagram, Simulation, Quiz (this format's kit)

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
coords**, `kind?`: `default|input|output|process|store|decision`. `edges: { from,
to, label?, kind? }[]` — `kind?`: `data|control|async` (solid/dashed/dotted).
`caption?`, `highlightOnHover?` (default `true`). Author coordinates yourself; no
auto-layout. ≤640px promotes a semantic node/edge list (no 360px overflow).

### Simulation — interactive canvas sandbox with reader sliders (island → `client:visible`)

```jsx
<Simulation client:visible kind="sir" height={260}
  params={[
    { key: "beta", label: "infection rate β", min: 0, max: 0.6, default: 0.35, step: 0.01 },
    { key: "gamma", label: "recovery rate γ", min: 0.01, max: 0.3, default: 0.08, step: 0.01 }
  ]}
  caption="Push β above γ and the outbreak grows." />
```

Props: `kind: string` — one of the built-in kernels: `walk` (diffusion), `sir`
(epidemic), `wave` (interference), `life` (Game of Life). `params?: { key, label,
min, max, default, step }[]` — reader sliders (the kernel reads them by `key`; an
empty list still works with kernel defaults). `caption?`, `height?` (logical px).
Pick a `kind`; you do **not** write physics. No-JS / reduced-motion → a static
frame + a described param list.

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

## 3c. P2 components — SmallMultiples, Distribution, Scatter, Slopegraph, RangePlot, EventCascade (this format's kit)

The five data-viz components are thin Observable-Plot / hand-rolled-SVG islands
(all `client:visible`). Data is a plain serializable array. EventCascade is a
causal chain (a dispatch "mechanism").

### SmallMultiples — one faceted chart per category (island → `client:visible`)

```jsx
<SmallMultiples client:visible mark="line" x="year" y="reqs" facet="region"
  caption="request volume by region, 2019–2024"
  data={[
    { region: "us-east", year: 2019, reqs: 120 }, { region: "us-east", year: 2020, reqs: 240 },
    { region: "eu-west", year: 2019, reqs: 80 },  { region: "eu-west", year: 2020, reqs: 150 }
  ]} />
```

Props: `data: Record<string, unknown>[]`, `mark: "line"|"bar"|"area"|"dot"`,
`x: string`, `y: string`, `facet: string` (distinct values → one panel each),
`columns?` (default near-square, capped 4), `sharedY?` (default true), `caption?`,
`height?`. Panels reflow into more rows on mobile — never widens past 360px.

### Distribution — histogram / density with optional reference line (island → `client:visible`)

```jsx
<Distribution client:visible value="ms" bins={24}
  valueLabel="response time (ms)"
  marker={[{ at: 200, label: "SLA 200ms" }]}
  caption="p50 latency; amber line is the 200 ms SLA"
  data={[{ ms: 42 }, { ms: 88 }, { ms: 205 }, { ms: 480 }]} />
```

Props: `data: Record<string, unknown>[]`, `value: string` (numeric column to bin),
`bins?` (default Sturges, clamped 5–40), `marker?: { at: number, label: string }[]`
(amber reference line(s)), `mark?: "hist"|"density"` (default `hist`), `caption?`,
`valueLabel?`, `height?` (default 300). No-JS → a real bin `<table>`.

### Scatter — x/y points with optional linear fit (island → `client:visible`)

```jsx
<Scatter client:visible x="params" y="mmlu" fit="linear"
  xLabel="parameters (B)" yLabel="MMLU (%)"
  caption="Capability vs scale, with a linear fit"
  data={[
    { model: "GPT-3", params: 175, mmlu: 44 },
    { model: "GPT-4", params: 1400, mmlu: 86 }
  ]} />
```

Props: `data: Record<string, unknown>[]`, `x: string`, `y: string`, `size?: string`
(field → dot radius), `color?: string` (field → color+legend), `fit?: "linear"|"none"`
(default `none`), `caption?`, `xLabel?`, `yLabel?`, `height?` (default 340).

### Slopegraph — before/after ranking or value reordering (island → `client:visible`)

```jsx
<Slopegraph client:visible beforeLabel="2019" afterLabel="2024"
  data={[
    { label: "Python", before: 1, after: 1 },
    { label: "TypeScript", before: 7, after: 2 },
    { label: "Rust", before: 9, after: 4 }
  ]}
  caption="Language-popularity reordering, 2019 → 2024 (rank)" />
```

Props: `data: { label: string, before: number, after: number }[]`, `beforeLabel:
string`, `afterLabel: string`, `caption?`. Risers amber, fallers clay. ≤640px
promotes a semantic list (no 360px overflow).

### RangePlot — low–mid–high intervals by category (island → `client:visible`)

```jsx
<RangePlot client:visible unit="ms"
  data={[
    { label: "SQLite", low: 0.4, mid: 1.2, high: 3.1, n: 1000 },
    { label: "Postgres", low: 1.1, mid: 2.8, high: 6.4, n: 1000 }
  ]}
  caption="Read latency by store — 95% interval, median dot" />
```

Props: `data: { label: string, low: number, mid: number, high: number, n? }[]`,
`caption?`, `unit?` (suffix on readouts, e.g. `"ms"`, `"%"`). ≤640px promotes a
semantic list.

### EventCascade — vertical CAUSAL chain (island → `client:visible`)

```jsx
<EventCascade client:visible caption="how one misconfig cascaded"
  nodes={[
    { kind: "cause", label: "A threshold triggers premature scale-in",
      detail: "The fleet drops below the connection-draining floor mid-spike." },
    { kind: "effect", label: "Retries amplify load",
      detail: "Each retry multiplies request rate against a shrinking pool." },
    { kind: "turning-point", label: "Circuit breakers trip and shed load",
      detail: "Shedding 40% of inbound traffic lets the pool recover." }
  ]} />
```

Props: `nodes: { label: string, detail: string, kind?: "cause"|"effect"|"turning-point" }[]`
(`detail` required — a plain serializable string; `kind` defaults to `effect`),
`caption?`. Distinct from `Timeline`: the amber spine carries labeled *reasoning*
("therefore" / "which drives" / "and so"), not elapsed time. No-JS → an ordered
`<ol>` with every label + detail visible.

## 3d. P3 components — GanttStrip, RouteMap (this format's kit)

### GanttStrip — a phase/timeline strip of bars (island → `client:visible`)
```jsx
<GanttStrip client:visible unit="day"
  caption="how long each phase took"
  tasks={[
    { label: "Design + BOM", start: 0, end: 3, note: "most time was sourcing the sensor" },
    { label: "PCB fab wait", start: 3, end: 17, note: "JLCPCB, cheapest shipping" },
    { label: "Assembly", start: 17, end: 19 },
    { label: "Firmware", start: 19, end: 24 }
  ]} />
```
Props: `tasks: { label, start, end, note? }[]` (`start`/`end` in `unit`s, `end >= start`), `unit?: "day" | "hr"` (default `"day"`), `caption?`. Bars + inline durations render server-side; hover/focus surfaces the note+duration (JS-only). SSR / no-JS → SVG plus a semantic `<ul>` of task — duration — note (never blank).

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

## 3e. Flow diagram — Sankey (this format's kit)

### Sankey — flow / allocation diagram (island → `client:visible`)
```jsx
<Sankey client:visible unit="$M"
  caption="Where the 2026 budget goes"
  nodes={[
    { id: "budget", label: "Budget" },
    { id: "eng", label: "Engineering" },
    { id: "sales", label: "Sales" },
    { id: "salaries", label: "Salaries" },
    { id: "cloud", label: "Cloud" }
  ]}
  links={[
    { source: "budget", target: "eng", value: 60 },
    { source: "budget", target: "sales", value: 40 },
    { source: "eng", target: "salaries", value: 45 },
    { source: "eng", target: "cloud", value: 15 },
    { source: "sales", target: "salaries", value: 25 }
  ]} />
```
Props: `nodes: { id, label? }[]` (`label` falls back to `id`), `links: { source, target, value }[]` (ids reference `nodes`; `value` positive finite; the graph must be a DAG — no cycles/self-loops), `unit?` (suffix on flow values, e.g. `"$M"`, `"TWh"`), `caption?`. Hover/focus a flow → its value + share of total in a stable readout. `% of total` = flow value / sum of ALL link values (shares sum to 1). No-JS / <640px → a semantic `source → target: value (unit) (pct)` list + total (never blank); reduced-motion → static end state.

## 3f. Reader-tunable model — ParameterPlay (this format's kit)

### ParameterPlay — N reader sliders bound to YOUR formula, live curve + readouts (island → `client:visible`)
```jsx
<ParameterPlay client:visible
  params={[
    { key: "rate", label: "adoption rate", min: 0.1, max: 3, default: 1, step: 0.1 }
  ]}
  expr="100 / (1 + exp(-rate * (x - 5)))"
  xRange={[0, 10]}
  xLabel="quarters"
  yLabel="% adopted"
  readouts={[{ label: "max slope", expr: "rate * 100 / 4", unit: "%/qtr" }]}
  caption="How adoption rate reshapes the S-curve." />
```
Props: `params: { key, label, min, max, default, step, unit? }[]` (the reader sliders — `key` is the identifier used in the formulas), `expr: string` (a **pure** formula of the param keys + the `x` variable → y), `xRange: [from, to]`, `xVar?` (default `"x"`), `xLabel?`, `yLabel?`, `readouts?: { label, expr, unit? }[]` (pure scalar formulas of the params — **may NOT reference x**), `caption?`. Grammar: `+ - * / ^` (right-assoc), unary minus, parens, numbers (incl. `1e3`), whitelisted funcs `sin cos tan exp log ln sqrt abs min max pow floor ceil round` + constants `pi e` — **nothing else** (the author string is sandboxed; never `eval`'d). Use it when a report needs a NEW reader-tunable relationship a fixed component doesn't cover — the formula MUST express a relationship already cited in your prose (do not invent figures). No-JS / reduced-motion → the default-parameter curve as inert SVG + one static slider per param + the readouts strip (never blank; sliders adjust the curve, nothing animates on a timer).

## 4. Body conventions

- Astro MDX: prose is Markdown; components are JSX islands woven in. A blank line
  separates a component block from surrounding prose.
- **Inline components (`Annotation`, `Sidenote`, and any phrasing-level component)
  MUST sit on the SAME physical line as the surrounding prose — NEVER alone on their
  own line.** MDX renders a JSX element that stands alone on a line as a *block* (flow)
  element, which closes the surrounding `<p>` and shatters one paragraph into ragged
  fragments. Keep the sentence continuous: `...approach — <Annotation ... /> — was sound...`,
  never the term on a line by itself between two prose lines.
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
