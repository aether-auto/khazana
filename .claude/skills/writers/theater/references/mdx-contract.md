# MDX contract — what every emitted theater post MUST satisfy

This is the exact contract the generated `.mdx` must meet to build in the site
and pass `validateDraft`. Derived verbatim from
`apps/site/src/content.config.ts`, `packages/generate/src/validate.ts`, and the
component signatures in `apps/site/src/components/mdx/`. Do not drift from it.

## 1. Frontmatter (YAML between `---` fences)

```yaml
---
title: "Exact title from the brief"
format: theater
channels:
  - <channel from the brief; must be in the site channel vocab (e.g. history, geopolitics, politics, geography)>
summary: "One sentence. Concrete. No hedging."
publishedAt: 2026-06-24T09:00:00.000Z   # ISO 8601 datetime (coerced to a date)
sources:
  - title: "Real source article title"
    url: "https://exact-url-from-the-brief"
draft: false
---
```

Hard rules (each maps to a check in `validate.ts`):

- **`format`** — exactly `theater`. No synonyms.
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
import { BattleMap, ForceComparison, Sankey, Annotation, Map } from "../../components/mdx";
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

Use only the subset in **theater's kit** (see the SKILL). Interactive islands
are React; in Astro MDX they need a **client directive** — use `client:visible`
for below-the-fold figures (lazy) and `client:load` for above-the-fold or inline
ones. Static Astro components (`OrderOfBattle`, `CastGrid`, `Pullquote`, `Figure`,
`Callout`, `Detail`) take **no** directive.

## 2a. Attribute quoting — inner quotes MUST be curly

Component attributes are **double-quoted** (`note="…"`). NEVER put a straight
double-quote (`"`) or a backslash (`\`) inside an attribute value — MDX closes
the string at the first inner `"` and the build fails. Inner quotes must be
**typographic curly quotes**: `“ ”` for double, `‘ ’` for single (and `’` for
apostrophes). `validateDraft` runs an MDX-syntax lint that rejects a draft with
straight or `\"` inner quotes before it can reach `astro build`.

    ✗ note="the "arid interruption" in the Sahara"
    ✓ note="the “arid interruption” in the Sahara"

## 3. Theater's military kit — exact props (copy these shapes)

> These four — BattleMap, OrderOfBattle, ForceComparison, Sankey — are theater's
> spine. Match the prop shapes exactly.

### `<BattleMap>` — phase-by-phase tactical map over a committed base image (island → `client:visible`)
BattleMap needs a committed, already-optimized base-map/terrain image; supply
`src`/`width`/`height` from `getImage()` at the page level (the `<AnnotatedFigure>`
pattern — the component does NOT import assets):
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
Props: `src` (optimized base-map URL from `getImage()`), `width`/`height`
(intrinsic px — reserve aspect ratio AND set the SVG viewBox), `alt`, `caption?`,
`sides: { id, label, tone?: "friendly"|"enemy"|"neutral" }[]`, `phases:
PhaseSpec[]`. Each phase: `{ title, time?, note?` (short **HTML string**, NOT MDX
children)`, units?, movements?, fronts? }`. `units: { side, type:
"infantry"|"armor"|"cavalry"|"artillery"|"naval"|"air"|"hq", label?, strength?, at:
[x,y] }` (coords **0..1** over the image). `movements: { side, from: [x,y], to:
[x,y], kind?: "advance"|"attack"|"retreat"|"supply", label? }`. `fronts: { side?,
kind?: "line"|"area", points: [x,y][] }`. A phase scrubber (‹/›, clickable ticks,
arrow/Home/End) walks phases; unit glyphs are NATO-style. No-JS / reduced-motion →
base image + first phase overlay + legend + a semantic phase-by-phase `<ol>` (never
blank). **This is theater's spine — one phase per narrative beat.**

### `<OrderOfBattle>` — force-structure roster (**static Astro — NO client directive**)
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
Props: `sides: { id, label, commander?, tone?: "friendly"|"enemy"|"neutral",
formations: Formation[] }[]`, `caption?`. `Formation: { name, kind?:
"army"|"corps"|"division"|"brigade"|"regiment"|"fleet"|"wing"|"other", strength?,
commander?, note?, units?: { name, strength?, note? }[] }`. **STATIC Astro — do NOT
add `client:*`.** Sub-units live in native `<details open>`, so the full roster is
visible with zero JS. Reflows to one column at 360px.

### `<ForceComparison>` — head-to-head forces & casualties (island → `client:visible`)
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
Props: `sides: { label, tone?: "friendly"|"enemy"|"neutral" }[]` (usually 2),
`metrics: { label, values: number[]` (one per side, same order)`, unit?,
higherIsWorse? }[]`, `caption?`. Each metric = diverging paired bars sharing a
center baseline that carries the ratio; bars normalized per metric. `higherIsWorse`
(e.g. casualties, losses) flips the advantaged side to the *smaller* value.
Hover/focus a bar → exact value + ratio. No-JS / ≤520px → a labeled comparison
table (never blank); reduced-motion → static end state. **Reach for it twice — the
strength ratio going in, the butcher's bill coming out.**

### `<Sankey>` — force / casualty / budget flow diagram (island → `client:visible`)
```jsx
<Sankey client:visible
  caption="Where the Army of Northern Virginia's Gettysburg losses fell"
  unit="men"
  nodes={[
    { id: "engaged", label: "Engaged (≈71,700)" },
    { id: "returned", label: "Returned to duty" },
    { id: "killed",   label: "Killed" },
    { id: "wounded",  label: "Wounded" },
    { id: "captured", label: "Captured / missing" }
  ]}
  links={[
    { source: "engaged", target: "returned", value: 43637 },
    { source: "engaged", target: "killed",   value: 4708 },
    { source: "engaged", target: "wounded",  value: 12693 },
    { source: "engaged", target: "captured", value: 5830 }
  ]} />
```
Props: `nodes: { id: string, label: string }[]`, `links: { source: string, target:
string, value: number }[]` (`source`/`target` reference node `id`s; the graph must
be a DAG — no cycles), `caption?`, `unit?` (suffix appended to flow values +
fallback, e.g. `"men"`, `"tanks"`, `"$M"`). Hover/focus a flow → its exact value +
share of the grand total. No-JS / ≤640px → a semantic `source → target: value
(unit)` flow list with the total (never blank); reduced-motion → no transitions.
**Reach for it when the *breakdown of a total* is the point** — total force →
committed/reserve/lost, or total casualties → killed/wounded/captured.

## 4. The connective tissue — exact props

### `<Annotation>` — inline cited term (the citation apparatus)
```jsx
<Annotation client:load term="in echelon" note="Attacking one formation after another rather than all at once — which cost Lee the coordination at Gettysburg on July 2." />
```
`term` (the inline word, kept in the prose flow) + `note` (short margin/popover
text). This is the primary way to cite a named fact without breaking prose.

### `<Map>` — world/regional choropleth (ISO 3166-1 alpha-3 keys) (island → `client:visible`)
```jsx
<Map client:visible caption="Relative weight of the combatant states, 1863"
  labels={{ USA: "Union", CSA: "Confederacy" }}
  values={{ USA: 100, CSA: 55 }} />
```
`values` (iso3 → number) drives the shading; `labels` (iso3 → name) the hover.

### `<RouteMap>` — choropleth world map with great-circle routes + points (island → `client:visible`)
```jsx
<RouteMap client:visible
  routes={[
    { from: [-77.03, 38.90], to: [-77.23, 39.83], label: "Army of the Potomac marches north", kind: "march" }
  ]}
  points={[
    { at: [-77.23, 39.83], label: "Gettysburg" }
  ]}
  values={{ USA: 100 }}
  labels={{ USA: "Union" }}
  caption="The armies converge on a Pennsylvania crossroads." />
```
Props: `routes?: { from: [lng,lat], to: [lng,lat], label?, kind?:
"march"|"arc"|"path" }[]` (`kind` default `"arc"`), `points?: { at: [lng,lat], label
}[]`, `values?: Record<iso3, number>`, `labels?: Record<iso3, string>`, `caption?`.
Coords are `[longitude, latitude]`. No-JS / reduced-motion → the full static map
with all arcs + a semantic legend `<ol>` (never blank).

### `<Timeline>` — horizontal SVG timeline (island → `client:load`)
```jsx
<Timeline client:load caption="The campaign"
  events={[
    { date: "1863-06-03", label: "Lee moves north", detail: "The Army of Northern Virginia leaves the Rappahannock." },
    { date: "1863-07-03", label: "Pickett's Charge fails", detail: "The high-water mark." }
  ]} />
```
`events` = `{ date (YYYY-MM-DD), label, detail }`.

### `<EventCascade>` — vertical CAUSAL chain (island → `client:visible`)
```jsx
<EventCascade client:visible caption="how the Union right collapsed"
  nodes={[
    { kind: "cause", label: "Jackson's corps completes the flank march undetected",
      detail: "12 miles around the Union right through the Wilderness." },
    { kind: "effect", label: "The Union XI Corps is struck in the flank at dusk",
      detail: "Rolled up before it can change front." },
    { kind: "turning-point", label: "Hooker's line is bent back on itself",
      detail: "The initiative passes to Lee for the rest of the battle." }
  ]} />
```
Props: `nodes: { label, detail, kind?: "cause"|"effect"|"turning-point" }[]`
(`detail` required, plain string), `caption?`. The amber spine carries labeled
*reasoning* — distinct from `Timeline`'s clock. No-JS → an ordered `<ol>`.

### `<Diagram>` — labeled node/edge diagram (island → `client:visible`)
Use for a command structure, a chain of command, a decision tree, or a deception
plan. See the barrel for its exact `nodes`/`edges` prop shape; keep node labels
terse and every relationship grounded.

### `<Scrolly>` + `<ScrollyStep>` — sticky-graphic, stepped prose (island → `client:visible`)
```jsx
<Scrolly client:visible caption="the artillery tempo">
  <ScrollyStep graphic={ <Chart client:visible mark="line" x="hour" y="rounds" data={[{ hour: 13, rounds: 0 }]} /> }>
    **The bombardment opens.** The pinned chart advances as the prose steps.
  </ScrollyStep>
</Scrolly>
```
Each `ScrollyStep` takes a `graphic` prop (a pinned `<Chart>`/`<Map>`/`<Timeline>`)
and prose children. Import BOTH `Scrolly` and `ScrollyStep`. (For the *tactical*
replay use `<BattleMap>`; reach for `<Scrolly>` only for a non-BattleMap sequence.)

### `<Figure>` — the image primitive (static Astro; NO client directive)
Local, committed, build-optimized assets only. Import the asset, then pass it as `src`:
```jsx
import Figure from "../../components/mdx/Figure.astro";
import fig from "./_assets/<slug>/terrain.jpg";

<Figure src={fig} alt="Required a11y description."
  caption="Editorial caption." credit="Library of Congress"
  sourceUrl="https://exact-ledger-url" zoom bleed="wide" aspect="16/9" />
```
Props: `src: ImageMetadata` (imported), `alt` (required), `caption?`, `credit?`,
`sourceUrl?` (ledger URL, grounding), `zoom?`, `bleed?: "column"|"wide"|"full"`,
`aspect?`. Assets live in `apps/site/src/content/blog/_assets/<slug>/` and must be
public-domain / open-license or pipeline-generated, with the source URL recorded.

### `<AnnotatedFigure>` — numbered pins over an image (island → `client:visible`)
The island takes an already-optimized `src` string + intrinsic `width`/`height`
(an island cannot import an asset). Optimize once in the MDX ESM header with
`getImage()`, then pass its fields:
```jsx
import { getImage } from "astro:assets";
import plate from "./_assets/<slug>/aerial.png";
const opt = await getImage({ src: plate, width: 1200 });

<AnnotatedFigure client:visible
  src={opt.src} width={opt.attributes.width} height={opt.attributes.height}
  alt="Aerial of the ridge" caption="What to look at on the ground"
  credit="USAAF" sourceUrl="https://exact-source-url"
  pins={[
    { x: 0.22, y: 0.30, label: "sunken road", note: "The reverse-slope position that broke the first assault." }
  ]} />
```
Props: `src: string` (from `getImage()`), `width`/`height` (intrinsic px), `alt`
(required), `caption?`, `credit?`, `sourceUrl?`, `pins: { x, y, label, note }[]`
(`x`/`y` are **0..1 fractions**). No-JS → every pin's note in an `<ol>`.

### `<CompareSlider>` — before/after image wipe (island → `client:visible`)
Optimize each image in the MDX ESM header with `getImage()`:
```jsx
import { getImage } from "astro:assets";
import beforeImg from "./_assets/line-d1.png";
import afterImg from "./_assets/line-d2.png";
const b = await getImage({ src: beforeImg, width: 1200 });
const a = await getImage({ src: afterImg, width: 1200 });

<CompareSlider client:visible before={b.src} after={a.src}
  width={b.attributes.width} height={b.attributes.height}
  alt="The front line, one day apart" beforeLabel="D-1" afterLabel="D+1"
  caption="Drag to wipe between the two." />
```
Props: `before`/`after` (from `getImage()`), `width`/`height`, `alt` (required),
`beforeLabel?`, `afterLabel?`, `caption?`, `orientation?: "h"|"v"`. No-JS → both
images stacked with labels.

### `<CastGrid>` — "cast of commanders" card grid (STATIC Astro → NO client directive)
```jsx
import { getImage } from "astro:assets";
import portrait from "./_assets/lee.png";
const c = await getImage({ src: portrait, width: 480 });

<CastGrid caption="The commanders"
  cast={[
    { name: "Robert E. Lee", role: "Cmdg., Army of Northern Virginia", img: c.src,
      note: "Chose to attack a strong position on the third day.",
      sourceUrl: "https://exact-ledger-url" },
    { name: "George G. Meade", role: "Cmdg., Army of the Potomac",
      note: "In command three days before the battle." }
  ]} />
```
Props: `cast: { name, role, note, img?, sourceUrl? }[]` — `img?` is an OPTIONAL
`getImage()` string; `note` is always visible. `caption?`. (For force *structure*
prefer `<OrderOfBattle>`; for the *people*, `<CastGrid>`.)

### `<StatBand>` — dramatic figure row, counts up on scroll (`client:visible`)
```jsx
<StatBand client:visible caption="The scale of the three days"
  stats={[
    { value: 165620, label: "MEN ENGAGED", sub: "both armies", href: "https://..." },
    { value: 1863, label: "YEAR", group: false },
    { value: 51000, label: "TOTAL CASUALTIES", sub: "killed, wounded, missing", href: "https://..." }
  ]} />
```
`stats` = `Stat[]`; each: `value` (number, required), `prefix?`, `suffix?`,
`decimals?`, `group?` (default `true`; `false` for years), `label` (required),
`sub?`, `href?` (source link → turns the stat into a citation). `caption?`,
`duration?`. Place near the top; earn it only when the numbers set the stakes.

### `<Pullquote>` — primary-source block (static Astro, NO `client:` directive)
```jsx
<Pullquote cite="Lee to Longstreet, July 3, 1863" href="https://..." kind="quote">
  The enemy is there, and I am going to attack him there.
</Pullquote>
```
Props: `cite?`, `href?`, `kind?` (default `"quote"`). Variants: `"quote"`,
`"document"` (mono archival), `"telegram"` (signal/order), `"headline"`. Children =
the quote text. **No `client:` directive.** Earn it: only when the verbatim
order/signal is more powerful than a paraphrase.

### `<Chart>` / `<DataTable>` — data figures
`<Chart client:visible mark="line"|"bar"|"area"|"dot" x=… y=… data={[…]} caption=…
/>` for a series (strength over time, artillery tempo). `<DataTable client:load
columns={[{ key, label, type: "string"|"number", align? }]} rows={[…]} total?=…/>`
for a structured table (casualties by formation). Reach for them when the *shape* of
the data is the point.

### `<Callout>` / `<Detail>` / `<Definition>` / `<Sidenote>` — notes (static / island)
- `<Callout kind="note"|"warning"|"key-insight"|"aside"|"caution" title?>` — a
  boxed operational note. Static Astro, MDX children, no directive.
- `<Detail summary="Go deeper: full order of battle" defaultOpen={false}>` — native
  `<details>`, zero JS, folds in OOB minutiae without bloating the linear read.
- `<Definition client:visible term="defilade" def="Protection from enemy fire or
  observation by an obstacle or fold in the ground." />` — teaches a term (vs
  Annotation, which cites).
- `<Sidenote>` — margin aside / numbered footnote.

> **Note:** `NarrativeScene` is **retired** — it is not in the allow-list and must
> not be used.

## 5. Body conventions

- Astro MDX: prose is Markdown; components are JSX islands woven in. A blank line
  separates a component block from surrounding prose.
- **Inline components (`Annotation`, `Sidenote`, and any phrasing-level component)
  MUST sit on the SAME physical line as the surrounding prose — NEVER alone on their
  own line.** MDX renders a JSX element that stands alone on a line as a *block* (flow)
  element, which closes the surrounding `<p>` and shatters one paragraph into ragged
  fragments. Keep the sentence continuous: `...approach — <Annotation ... /> — was sound...`,
  never the term on a line by itself between two prose lines.
- Cite inline with `<Annotation>` (preferred — renders as marginalia) or a normal
  Markdown link to a brief source URL; use component `sourceUrl`/`href` where the
  component carries the fact (BattleMap phase, OrderOfBattle, Figure, StatBand stat).
- The `<BattleMap>` phases and the prose beats are the SAME sequence — walk them in
  lockstep; never let the map show a phase the prose has not reached.
- Match founder voice (STYLE.md, included in the brief): open in the moment of
  decision; no hedging; vary sentence rhythm; numbers always contextualized; don't
  start consecutive sentences with "The"; no "in conclusion".

## 6. The grounding self-check (run before emit)

1. Every `sources[].url` is a verbatim brief source URL, and the list is non-empty.
2. Every factual military claim (unit, strength, movement, position, date, casualty,
   quoted order) has an inline citation (`<Annotation>` or a component
   `sourceUrl`/`href`) tracing to a ledger source — or it is cut. Special attention:
   every OrderOfBattle strength, every ForceComparison / Sankey figure, and every
   BattleMap unit position is a *claim* and must be grounded (load-bearing ones
   corroborated by ≥2 independent sources).
3. Every JSX component name is in theater's kit (⊆ the allow-list); every
   BattleMap/OrderOfBattle/ForceComparison/Sankey matches the prop shapes above.
4. Frontmatter parses and matches the schema above.
5. `python3 scripts/check-links.py <file>.mdx` exits 0.
