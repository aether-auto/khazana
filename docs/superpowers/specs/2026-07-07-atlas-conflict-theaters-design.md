# Atlas — Conflict Theaters (design spec)

> *Atlas's war mode. When the world's news is a war, a single event card and a global
> divergence score aren't enough: a major active conflict earns a persistent, report-shaped
> **theater page** — front lines, casualties with honest uncertainty bands, displacement,
> discrete engagements, world-impact proxies — plus a globe-wide conflict lens and an
> escalated event card with different editorial physics. This spec defines the theater
> entity, its schemas, its data layers, and the honest posture toward front-line geometry
> that half the OSINT world can't legally redistribute. It consumes the Spine's schemas and
> the Bias Lab's wartime methodology; it renders pixels with the Ledger's zero-AI-prose
> discipline.*

**Status:** Proposed — spec 6 of 8 (Atlas: Spine → Globe → Bias Lab → Ledger → Extras →
**Conflict Theaters** → Government Structure → Two Faces)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — the same binding constraint as khazana v1 and every Atlas
spec. No paid APIs, no paid hosting, no GPU, no always-on machine beyond the existing free
Cloudflare Worker.

**This spec exists because of D6 and D12.** It is one of the two new specs the 2026-07-07
founder interview (`docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md`, binding)
called into being: D6 — *"war has a different mode"* — selected all four proposed war-mode
elements **plus** troop movements, active engagements, and world-impact, with a best-effort,
source-flagged OSINT posture; D12 granted full autonomy to expand the plan using
internet-verified research. Every source and posture below is grounded in the verified
research dossier `.superpowers/research/atlas/conflict-osint.json` — the source of truth for
what data exists and under what license. This spec also honors D1 (private-indefinitely /
public-ready-by-construction), D2 (private world-data repo), D3 (density mandate), D4 (zero
AI prose in the world-data path), D7 (event-card spectrum + corroborated core), and D9
(India-forward defaults).

**Reads first:** `docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md` (D6 is this
spec's charter), `.superpowers/research/atlas/conflict-osint.json` (the license findings this
spec must not contradict), `docs/superpowers/specs/2026-07-07-world-data-spine-design.md`
(spec 1 — the `WorldEvent`/`Provenance`/`Indicator`/`Uncertainty` schemas this spec extends;
it already registers this spec as owning a new flat core file, `world-theater.ts`, §6),
`docs/superpowers/specs/2026-07-07-atlas-globe-design.md` (spec 2 — §8.5 defines the
conflict-lens handoff this spec receives), and
`docs/superpowers/specs/2026-07-07-atlas-bias-lab-design.md` (spec 3 — §4.7's wartime
editorial physics, which this spec **consumes** but does not own).

---

## 0. What Conflict Theaters is, and what it is not

A **Theater** is a persistent, hand-registered entity for one major active conflict —
Russia-Ukraine, Israel-Gaza, Sudan. It is the war-mode counterpart to a `WorldEvent`: where
an event is a single ping of news, a theater is the standing frame that individual conflict
events belong *to*. The Globe (spec 2 §8.5) renders active theaters as persistent labeled
regions and swaps conflict events for an escalated card; this spec defines the theater
entity behind both, plus a dedicated, report-shaped theater page.

**What it is:**

- A **curated registry** of major active conflicts (§2), each with belligerents grouped by
  side, geographic bounds, a lifecycle status, and a linkage rule tying `WorldEvent`s to it.
- A set of **data layers** per theater (§5): front-line/control geometry (where legally
  available), casualty and displacement time series with honest uncertainty, discrete
  engagements, remote-sensing proxies (fires, nightlights), and world-impact indicators
  (commodities, energy, shipping).
- A **report-shaped page** (§7) with the Ledger's exact discipline (D4): zero AI prose,
  fully deterministic, templated micro-copy, rebuilt by Actions on every refresh.

**What it is not:**

- **Not auto-detected.** khazana does **not** infer "there is a war here" from a GDELT event
  spike (§2 explains why at length). The theater registry is hand-curated, deliberately.
- **Not a front-line-geometry pirate.** The two authoritative front-line sources
  (DeepStateMap, ISW/CTP) both require **written permission** before pipeline ingestion
  (dossier, verified). Until granted, theaters render a legally clean Wikipedia CC BY-SA
  fallback layer plus link-outs, honestly labeled (§6). This spec never scrapes around a
  license.
- **Not the owner of wartime editorial physics.** The corroboration-weighting,
  single-source skepticism, and state-affiliation labeling that make war coverage different
  live in the Bias Lab (spec 3 §4.7, amended per D6.4) — methodology over `reportings[]`
  belongs there. This spec *consumes* that methodology and defines the theater/belligerent
  data it needs (§9).
- **Not a Read format.** Like the Globe and Bias Lab, theater pages are hand-built
  Astro/React pages under `apps/site/src/pages/atlas/theaters/`, outside the
  richness-gate/`FormatKit` machinery, importing the same `apps/site/src/components/mdx/`
  primitives directly (§11).

### 0.1 The honesty contract, stated once up front

Every other section inherits this: a conflict is the single worst place to imply precision
you don't have. Casualty figures are contested; front lines are claimed; propaganda is the
norm. So this spec's non-negotiable posture — the war-mode extension of the Spine's "no bare
number ever reaches the UI" (spec 1 §1.3) — is: **every layer carries a visible
provenance + reliability flag, casualties are always ranges never points, and a layer that
can't be sourced cleanly is labeled as such or linked out, never faked.** The balanced-framing
inheritance from the Ledger (§7 there) applies with full force: casualties are counts with
uncertainty, never rhetorical devices; no moralizing color scales; belligerents are labeled
by name and side, not by sympathy.

---

## 1. Binding decisions (settled)

These follow directly from D6 and the dossier; downstream implementation treats them as
fixed.

1. **The theater registry is hand-curated. Auto-detection from GDELT is rejected (§2).** A
   theater is a deliberate editorial act with a permanence and a page cost that a noisy event
   spike must never trigger on its own.
2. **OSINT posture: best-effort, source-flagged (D6).** Ingest what each project legitimately
   allows; flag every layer's provenance + reliability prominently; accept that some layers
   update irregularly or die. Density-first, honesty-labeled — never license-violating.
3. **Clean spines first, geometry last (§13).** UCDP casualties, UNHCR displacement, NASA
   FIRMS/Black Marble proxies, World Bank/EIA world-impact, and GDELT media-attention are all
   CC-BY-or-public-domain and ship regardless of any permission outcome. The front-line map
   is the *last* layer built, gated on a permission email (§6), and the page is fully useful
   without it.
4. **Casualties are ranges, sourced from UCDP.** UCDP GED's low/best/high fatality bounds map
   to `Uncertainty.confidenceInterval`; a casualty number rendered as a point value is a
   schema/rendering violation, not a stylistic choice.
5. **ACLED is derived-only (dossier, verified EULA).** khazana may publish only its **own
   computed aggregates** ("N events this month in region X") with attribution — never raw
   rows, never a raw event browser. Enforced by the Spine's `Provenance.superRefine` (spec 1
   §3.1): every ACLED-sourced datum carries `origin: "computed"`, `redistribution: false`.
6. **Zero AI prose (D4).** The theater page is deterministic end to end: computed values,
   templated micro-copy, schema-carried provenance. No LLM writes, summarizes, or paraphrases
   anywhere between a source API and the rendered theater page.
7. **No Spine schema changes.** This spec adds its own theater-owned schemas in a new flat
   core file (`packages/core/src/world-theater.ts`, spec 1 §6), reuses `WorldEvent`
   unchanged, and reuses `Indicator`/`Uncertainty`/`Provenance` verbatim — the same
   "derived layer owns its own schemas, Spine stays stable" discipline as the Bias Lab's
   `world-bias-lab.ts`.

---

## 2. What a Theater is — registry, lifecycle, and the v1 seed

### 2.1 Why the registry is hand-curated, not auto-detected

The tempting design is to watch the GDELT fast lane (spec 2) for a sustained spike in
`category: "conflict"` events in one region and auto-promote it to a theater. This is
**rejected**, for reasons that are not incidental:

- **GDELT event geocoding is noisy** (dossier: "event geocoding is noisier/lower-precision
  than UCDP/ACLED… best used as an attention/tone signal rather than a fatality source"). A
  spike-triggered theater would inherit that noise as its founding act.
- **A theater is expensive and permanent.** It creates a page, a control-map layer, a
  belligerent roster, a permission-email obligation (§6). Spinning one up on a false positive
  — a protest wave, a data artifact, a single high-tone diplomatic row — and then tearing it
  down is worse than never having created it.
- **"Major active conflict" is an editorial judgment, not a threshold.** Which conflicts
  merit the war-mode treatment is exactly the kind of call D3's density mandate explicitly
  keeps human ("everything that can be found/calculated *reliably*") — reliability here means
  a curator decided, not a counter crossed a line.

So the registry is a hand-maintained `data/world/theaters/registry.json` in the private
repo (D2, §10), each entry added deliberately. GDELT still *feeds* a theater once it exists
(its media-attention sparkline, §5), and event→theater membership is computed automatically
by geometry (§8) — but **promotion to a theater is always a human act.**

### 2.2 Lifecycle

```
proposed ──▶ active ──▶ dormant ──▶ archived
   │            │           │
   │            └──▶ (reactivate) ◀──┘
   └──▶ (rejected, never shipped)
```

- **proposed** — registered but not yet rendered; used while the clean-spine layers are being
  wired and (for geometry-bearing theaters) while the permission email is outstanding.
- **active** — rendered on the Globe (persistent region) and has a live theater page; all
  lanes running.
- **dormant** — a theater whose intensity has fallen below a materiality floor (§14 open
  question): the page stays reachable and frozen with a "not currently active — last
  material activity YYYY-MM" badge, no fast-lane compute. Reactivates automatically if events
  resume above the floor.
- **archived** — a concluded conflict, kept as a static historical record (the Bellingcat
  Ukraine timemap precedent — dossier notes it "archived/frozen"): full page, no polling, an
  explicit end date.

`status` is a field on `TheaterSchema` (§4); the transitions are a documented curator/cron
policy, not a runtime state machine.

### 2.3 The v1 seed

Three theaters seed v1, chosen so the trio exercises **every** posture of the
`geometryStatus` field (§4) and proves the clean-spine layers stand on their own:

| Theater | Why it seeds v1 | Geometry posture at ship | Clean-spine coverage |
|---|---|---|---|
| **Russia-Ukraine war** | Best-covered conflict in the entire dossier; the reference case for every layer | `link-out-only` → `fallback` (Wikipedia CC BY-SA) → `licensed` if DeepState/ISW grant permission (§6) | UCDP, UNHCR Ukraine situation portal, FIRMS, Black Marble (grid damage), GDELT, Pink Sheet (wheat/gas), EIA (Brent/Henry Hub), Global Fishing Watch (Black Sea grain corridor), EU-sanctions state-media (RT/Sputnik/RIA) |
| **Israel-Gaza war** | ISW/CTP publishes a Gaza control map; UNOSAT has mapped Gaza damage heavily; strong proxy + humanitarian coverage | `link-out-only` → `fallback`, `licensed` pending ISW permission | UCDP, UNHCR/HDX displacement, FIRMS, UNOSAT damage assessments, Global Fishing Watch (Red Sea/Bab-el-Mandeb), Airwars Gaza (link-out) |
| **Sudan civil war (RSF vs SAF)** | The deliberate **clean-spine-only proof case**: no DeepState-equivalent exists, and the page must be fully valuable *without* front-line geometry | `link-out-only`, likely permanently — and that is fine | UCDP, UNHCR (one of the world's largest displacement crises), IOM DTM via HDX (derived-only), FIRMS, Black Marble (Khartoum blackout), GDELT, ACLED-computed aggregates |

Sudan is the load-bearing choice: it demonstrates that a theater with **no** licensable
front-line map is still a rich, honest report — casualties, displacement, fires, nightlights,
media attention, and world-impact all render from clean spines. If the design only worked for
Ukraine, it would be a Ukraine feature, not a war mode.

Candidate watch-list (dormancy/seed criteria in §14, not shipped v1): Myanmar civil war,
Sahel (Mali/Burkina Faso/Niger), DRC/M23, Yemen, Syria post-2024. India-neighborhood
relevance (D9) makes any flare on India's borders a standing candidate — flagged in §14.

---

## 3. Architecture at a glance

```
┌─ registry (hand-curated, private khazana-world-data repo — D2) ──────────────────────┐
│  data/world/theaters/registry.json      Theater[] — belligerents, bounds, status     │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │ read by ingest (public-repo Actions, push to private repo)
        ▼
┌─ packages/world-ingest/src/theaters/ (NEW subtree, same package as spec 1 §4.1) ─────┐
│  CLEAN SPINES (ship regardless):                                                      │
│    ucdp-casualties.ts  unhcr-displacement.ts  firms-fires.ts  blackmarble-lights.ts   │
│    gdelt-attention.ts  pinksheet-impact.ts  eia-energy.ts  gfw-shipping.ts            │
│  DERIVED-ONLY (khazana aggregates, attribution):                                      │
│    acled-aggregate.ts  dtm-aggregate.ts                                               │
│  GEOMETRY (permission-gated, §6):                                                     │
│    control-wikipedia.ts (fallback, CC BY-SA)                                          │
│    control-deepstate.ts / control-isw.ts (BUILT, DISABLED until permission granted)   │
│  aggregate/theater-rollup.ts   membership.ts (event↔theater point-in-polygon)         │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │ commits (lanes per §10) ↓
┌─ data/world/theaters/ (private repo, D2) ───────────────────────────────────────────┐
│  registry.json  active.json (Globe reads at build) │ <theaterId>/control/<asOf>.json  │
│  <theaterId>/metrics.json  <theaterId>/engagements.json  <theaterId>/impact.json      │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │ static Astro build (Atlas surface)                       ┌─ Cloudflare Worker ─┐
        ▼                                                          │ GET /world/latest    │
┌─ apps/site/src/pages/atlas/theaters/[theaterId].astro ─────────┐│ (Spine, UNCHANGED —  │
│  → components/atlas/Theater*.tsx → mdx/{Map,BattleMap,RangePlot,││  NO theater rollup,  │
│    Chart,DataTable,StatBand,Timeline,OrderOfBattle,Callout}     ││  §10.3)              │
│  + ONE new component: TheaterControlMap (§11)                   │└──────────────────────┘
└──────────────────────────────────────────────────────────────────┘
```

Same ethos as every Atlas spec: **the page works from committed data with zero client-side
network calls or ML inference.** Everything is fetched and computed once in the cron, committed
as static JSON to the private repo, and read at build time.

---

## 4. Schemas — `packages/core/src/world-theater.ts`

Illustrative zod, following spec 1 §3.0's house style (flat file, `world-` prefix, exports
via `index.ts`). Every object embeds `ProvenanceSchema` unmodified from spec 1; casualties use
`Uncertainty.confidenceInterval`; the licensing invariants are enforced at parse time, not by
renderer discipline.

```ts
// vocab.ts additions
export const THEATER_STATUSES = ["proposed", "active", "dormant", "archived"] as const;
export const GEOMETRY_STATUSES = ["licensed", "fallback", "link-out-only"] as const;
export const THEATER_METRIC_KINDS = [
  "casualties", "displacement", "fires", "nightlights", "media-attention", "commodity-impact",
] as const;
export const ENGAGEMENT_KINDS = ["battle", "strike", "siege", "advance", "incident"] as const;

// world-theater.ts
export const SideSchema = z.object({
  id: z.string(),                          // "ua", "ru" — stable within a theater
  label: z.string(),                        // "Ukraine", "Russian Federation"
  belligerents: z.array(z.object({
    name: z.string(),
    country: CountryCodeSchema.optional(), // ISO3 where a state actor
    role: z.enum(["state", "non-state", "coalition-member", "proxy"]).default("state"),
  })).min(1),
});

export const TheaterSchema = z.object({
  id: z.string(),                          // "russia-ukraine", "israel-gaza", "sudan-civil-war"
  name: z.string(),
  status: z.enum(THEATER_STATUSES),
  sides: z.array(SideSchema).min(2),        // grouped belligerents — the war has ≥2 sides
  bounds: z.object({                        // bounding box for globe region + event membership (§8)
    minLat: z.number().min(-90).max(90), maxLat: z.number().min(-90).max(90),
    minLng: z.number().min(-180).max(180), maxLng: z.number().min(-180).max(180),
  }),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(), // set on archive
  /** Rule (not a foreign key): a WorldEvent belongs to this theater iff its geo falls
   *  within `bounds` AND its time ≥ startedAt (< endedAt if archived). Computed by
   *  membership.ts (§8), never hand-maintained per event. */
  primaryCountries: z.array(CountryCodeSchema).default([]),
  provenance: ProvenanceSchema,             // provenance of the REGISTRY ENTRY itself (curator + method note)
});
export type Theater = z.infer<typeof TheaterSchema>;

export const ControlLayerSchema = z.object({
  theaterId: z.string(),
  asOf: z.string().datetime(),
  /** Encodes the permission posture (§6). The map component renders identically for all
   *  three; only the label + the geometryRef presence change. */
  geometryStatus: z.enum(GEOMETRY_STATUSES),
  /** GeoJSON FeatureCollection of control-area multipolygons, per side. PRESENT only for
   *  "licensed" and "fallback"; NULL for "link-out-only" (nothing to embed). */
  geometryRef: z.string().nullable(),        // path to the committed GeoJSON shard, or null
  /** Where a reader goes for the authoritative live map when we can't embed it. */
  sourceLinkUrl: z.string().url(),
  reliabilityNote: z.string(),               // templated: e.g. "Community cross-check (Wikipedia), lower rigor than primary OSINT"
  provenance: ProvenanceSchema,
}).superRefine((c, ctx) => {
  // geometryStatus × licenseTier cross-check — the war-mode analogue of the Spine's
  // derived-only invariant. We can never embed geometry we aren't licensed to redistribute.
  if (c.geometryStatus === "link-out-only" && c.geometryRef !== null) {
    ctx.addIssue({ code: "custom", path: ["geometryRef"],
      message: "link-out-only layers must not embed geometry" });
  }
  if (c.geometryStatus === "fallback" && c.provenance.licenseTier !== "redistribute-raw-ok") {
    ctx.addIssue({ code: "custom", path: ["provenance", "licenseTier"],
      message: "fallback geometry must be a redistribute-raw-ok source (Wikipedia CC BY-SA)" });
  }
  if (c.geometryStatus !== "link-out-only" && c.geometryRef === null) {
    ctx.addIssue({ code: "custom", path: ["geometryRef"],
      message: "licensed/fallback layers must reference embedded geometry" });
  }
});
export type ControlLayer = z.infer<typeof ControlLayerSchema>;

export const TheaterMetricSchema = z.object({
  theaterId: z.string(),
  kind: z.enum(THEATER_METRIC_KINDS),
  key: z.string(),                          // provider's own series key, e.g. "ucdp-best", "unhcr-idp"
  label: z.string(),
  points: z.array(z.object({
    period: PeriodSchema,                    // reuse Spine's Period (YYYY | YYYY-MM | full ISO)
    value: z.number(),
    uncertainty: UncertaintySchema,          // casualties → confidenceInterval(low,best-as-mid,high)
  })).min(1),
  unit: z.string(),
  provenance: ProvenanceSchema,
});
export type TheaterMetric = z.infer<typeof TheaterMetricSchema>;
// NOTE: theater-scoped series that are ALSO natural country Indicators (e.g. a belligerent's
// GDP shock) reuse Spine's `Indicator` directly, keyed by country; TheaterMetric exists only
// for series that are scoped to the THEATER, not a country (front-wide casualties, corridor
// shipping). No duplication — country-grain stays Indicator, theater-grain is TheaterMetric.

export const EngagementSchema = z.object({
  id: z.string(),
  theaterId: z.string(),
  kind: z.enum(ENGAGEMENT_KINDS),
  geo: z.object({ lat: z.number(), lng: z.number(), place: z.string().optional() }),
  time: z.string().datetime(),
  sideId: z.string().optional(),            // attributed actor's side, when a clean source states it
  fatalities: UncertaintySchema.optional(), // UCDP low/best/high where present; omitted otherwise
  summary: z.string(),                       // templated micro-copy ONLY (D4) — never generated prose
  provenance: ProvenanceSchema,             // clean sources only (UCDP GED/Candidate, GDELT) — NOT raw ACLED
});
export type Engagement = z.infer<typeof EngagementSchema>;
```

**Design notes a reviewer should check:**

- `SideSchema` groups belligerents so a coalition (e.g. a state + proxies) is one side, which
  is what the escalated card's opposing-side corroboration (§9) needs. `sides.min(2)` encodes
  "a war has at least two sides" structurally.
- `bounds` is a box, not a polygon, on purpose: it's for cheap globe-region rendering and
  point-in-polygon event membership (§8), not for depicting territory. The *actual* territory
  is `ControlLayer.geometryRef`, which carries its own license posture.
- `TheaterMetric` vs `Indicator` split is called out in the schema comment: no duplication —
  country-grain reuses `Indicator`, theater-grain is `TheaterMetric`. Worth a reviewer's eye
  that the boundary is drawn correctly for each series in §5's catalog.
- `Engagement.provenance` is restricted **by policy** to clean sources; the schema can't
  enforce "source X only" beyond the Spine's tier invariant, so the fetcher tests (§12) assert
  no ACLED-raw engagement is ever emitted.

---

## 5. The data layers, source by source

Every source below is from the verified dossier; the license/tier column does not contradict
its findings. "Posture" is the operative column: **ingest-raw** (clean spine, redistribute
freely), **aggregate-only** (derived-only tier — khazana-computed summaries + attribution,
never raw rows), or **link-out** (cite/link, no pipeline ingestion — pending permission or no
public bulk license).

| Layer | Source | Lane | Tier | Uncertainty kind | Posture |
|---|---|---|---|---|---|
| **Casualties** (anchor) | UCDP GED + Candidate Events | slow (monthly candidate) | redistribute-raw-ok (CC BY 4.0) | `confidenceInterval` (low/best/high) | **ingest-raw** |
| Casualties (aggregate cross-check) | ACLED | medium | derived-only (EULA) | `sampleSize` | **aggregate-only** — "N events this month", attribution, never rows |
| **Displacement** | UNHCR ODP API | medium | redistribute-raw-ok (CC BY 4.0) | `none` / admin headcount | **ingest-raw** |
| Displacement (IDP detail) | IOM DTM via HDX | medium | derived-only (parent ToS) — check per HDX dataset | `none` | **aggregate-only** unless the HDX copy carries an open tag |
| Crisis severity | ACAPS INFORM Severity | slow | derived-only (CC BY-NC) | `raterSpread` | **aggregate-only** (NC fine for private site, flagged) |
| **Fires** (proxy) | NASA FIRMS (MODIS/VIIRS) | fast/medium | redistribute-raw-ok (NASA open) | `none` | **ingest-raw** |
| **Nightlights** (proxy) | NASA Black Marble (VNP46) | slow (batch → derived numbers) | redistribute-raw-ok (NASA open) | `none` | **ingest-raw** (store derived numbers/tiles, not full rasters) |
| Damage assessments | UNOSAT via HDX | slow (per-crisis, manual) | per-product (check each) | `none` | **link-out** default; **ingest-raw** only where the product is CC BY |
| **Media attention** | GDELT DOC 2.0 | fast | redistribute-raw-ok (unrestricted) | `sampleSize` (article count) | **ingest-raw** |
| **World impact — commodities** | World Bank Pink Sheet | slow (monthly) | redistribute-raw-ok (CC BY 4.0) | `none` | **ingest-raw** |
| **World impact — energy** | U.S. EIA Open Data | medium | redistribute-raw-ok (public domain) | `none` | **ingest-raw** |
| **World impact — shipping** | Global Fishing Watch (4Wings) | medium | derived-only (non-commercial) | `sampleSize` | **aggregate-only** (directional, thin on cargo — dossier) |
| **Front-line geometry** | DeepStateMap | (geometry lane) | proprietary — permission required | n/a | **link-out** until written agreement (§6) |
| **Front-line geometry** | ISW / CTP ArcGIS | (geometry lane) | derived-only — written permission required | n/a | **link-out** until written agreement (§6) |
| Front-line geometry (fallback) | Wikipedia detailed-map templates | medium | redistribute-raw-ok (CC BY-SA 4.0) | n/a | **ingest-raw** as the labeled `fallback` layer (§6) |
| Base map only | OpenStreetMap | build asset | ODbL | n/a | base infrastructure only — **never** a front-line source (dossier) |
| State-media labeling | EU sanctions (EUR-Lex) + DOJ FARA + Wikidata P127 | slow | redistribute-raw-ok (all three) | n/a | **ingest-raw** — triangulated, consumed by Bias Lab §9 |

Explicitly **skipped/deferred** per the dossier: AISHub (needs a physical receiver —
incompatible with $0/no-always-on-hardware); OpenSky (its "operational integration" clause
appears to cover an Actions cron — email first, §14); FRED (redundant with EIA/World Bank,
per-series licensing burden); Airwars/Bellingcat/Eyes-on-Russia (no public bulk license —
link-out, pursue data-sharing agreements later, §14).

### 5.1 Why the remote-sensing proxies matter (and matter *most* in wartime)

FIRMS fires and Black Marble nightlights are the layers D6.4's wartime skepticism wants most,
because they are **side-independent physical evidence.** A casualty claim is contested; a
front line is claimed; but a thermal anomaly detected by a NASA satellite over a city, or the
collapse of that city's nighttime radiance, is measured by an instrument neither belligerent
controls. They don't tell you *who* or *why* — FIRMS can't distinguish shelling from an
agricultural burn, which the layer's reliability note says plainly — but they are the one
class of evidence in the entire dossier that no propaganda apparatus can author. That is
exactly why they ship on the clean-spine tier (§13) and render prominently, not as a footnote:
in a domain where every narrative source has a side, the physics layer is the reader's anchor.

---

## 6. Front-line geometry — the honest section

This is the hardest layer and the one most likely to be done dishonestly, so it gets its own
section and its own discipline.

**The finding (dossier, verified):** the two authoritative front-line sources everyone else
cites — **DeepStateMap** and **ISW/Critical Threats** — both carry restrictive terms.
DeepState's API is free only for volunteer/Ukraine-defense entities and bans unauthorized
bulk distribution; ISW's Fair Use policy *explicitly* requires prior written permission before
"incorporation… into other datasets, mapping platforms, analytic products or systems," even
derivative ones. A public GitHub REST endpoint being *fetchable* does not make it
*licensed*. Using Wikipedia to launder their exact assessments doesn't change whose facts they
are.

**The posture:**

1. **Email both for a data-use agreement, as a tracked prerequisite** (§13 build order, step
   0). This is worth doing given how central they are. The email is a real dependency with a
   real owner, tracked like any other blocking task — not an afterthought.
2. **Until granted, `geometryStatus: "link-out-only"`.** The theater page shows no embedded
   front-line polygons; it shows a prominent, labeled link to the authoritative live map
   (`ControlLayer.sourceLinkUrl`) and a templated note ("Front-line geometry is published by
   ISW/DeepState under terms that require permission to embed; view their live map →").
3. **A legally clean fallback layer: Wikipedia CC BY-SA.** Where Wikipedia's community
   "detailed map" templates exist (Russo-Ukrainian War, Gaza), khazana ingests *those* — CC
   BY-SA 4.0, zero legal risk — as `geometryStatus: "fallback"`, labeled honestly as a
   lower-rigor community cross-check, not primary OSINT. The dossier's caveat is respected in
   the label: the facts underneath still trace to ISW/DeepState, so the fallback is a
   cross-check layer, not a claim of independent authority.
4. **If permission is granted, `geometryStatus: "licensed"`** and the same map component
   renders the primary geometry with full attribution.

**The load-bearing engineering decision: the schema and the map component are built the same
way for all three postures.** `ControlLayerSchema` (§4) and `TheaterControlMap` (§11) don't
branch on the source — they branch on `geometryStatus`, which only changes the label and
whether `geometryRef` is populated. So the geometry layer can be **fully built and tested
against the Wikipedia fallback and Sudan's link-out-only case before any permission arrives**,
and a granted permission is a data change (flip `geometryStatus`, populate `geometryRef` from
the newly-enabled fetcher), not a code change. Sudan ships permanently on `link-out-only` and
looks intentional, because it is.

---

## 7. Theater page anatomy

Report-shaped like the amended Ledger (D4): zero AI prose, fully deterministic, templated
micro-copy, rebuilt on every refresh. Top to bottom:

1. **Header** — theater name, belligerents grouped by side (via `OrderOfBattle.astro`, reused
   — it already renders side → formation rosters), `status` badge, and a **duration ticker**
   ("Day 1,231" from `startedAt`, a deterministic `StatBand`-style count, no prose).
2. **Control map** — `TheaterControlMap` (§11), rendering `ControlLayer.geometryRef` when
   `licensed`/`fallback`, or the labeled link-out panel when `link-out-only`. The map's
   reliability note and `asOf` timestamp are always visible. Troop-movement arrows and active
   engagements overlay here, reusing `BattleMap`'s NATO-glyph + arrow geometry (§11).
3. **Casualty & displacement series** — `RangePlot` for casualties (UCDP low/best/high as the
   native low→high band with the best estimate as the mid dot — the component is built for
   exactly this) and `Chart` for displacement over time. Casualties are **never** a single
   number anywhere on the page (decision 4).
4. **Engagement timeline** — `Timeline` (reused) of discrete `Engagement`s from clean sources,
   each with its own provenance chip; `GanttStrip` for phase-level operations where a source
   supports it.
5. **Media divergence panel** — consumes the Bias Lab's wartime physics (§9): the corroborated
   core with opposing-side weighting, single-source badges, and state-affiliation chips,
   rendered via the same `DataTable`/`RangePlot` primitives the Bias Lab story page uses. This
   panel *renders* Bias-Lab-computed output; it does not compute divergence.
6. **World-impact strip** — `StatBand` + `Chart` for the commodity/energy/shipping proxies
   ("Brent +N% since escalation · wheat +N% · Black Sea corridor transits −N%"), each figure
   carrying its Pink Sheet/EIA/GFW provenance. Framed as measured correlation with dates, never
   causal rhetoric (Ledger §7 balanced-framing inheritance).
7. **Provenance rail** — a persistent side rail (the Bias Lab uncertainty-strip precedent,
   spec 3 §5.5) listing every layer on the page with its source, tier, reliability note, and
   `asOf` — so the reader can distrust any single layer without distrusting the page.

The page is fully useful with the control map in `link-out-only` state: layers 1, 3–7 all
render from clean spines. Sudan is the standing proof of this.

---

## 8. Globe + escalated event card integration

This spec is the receiving end of the Globe's §8.5 handoff.

**Persistent theater regions on the Globe.** The Globe reads a small committed
`data/world/theaters/active.json` (the active-theater registry subset: `id`, `name`, `sides`,
`bounds`) at build time and renders each as a persistent labeled region while the conflict lens
is on (spec 2 §8.5). This file is small and low-churn, so no Worker mirror is needed for it
(§10.3).

**Event → theater membership, computed by geometry, not stored on `WorldEvent`.** The Globe
resolves whether a polled event belongs to an active theater by a **client-side
point-in-`bounds` test** against the `active.json` it already holds — deterministic geometry
the client can do for free, no Spine schema change, no Worker rollup. `membership.ts` runs the
same test server-side for the theater page's own event list. The swap trigger (spec 2 §8.5) is
`event.category === "conflict"` **or** membership in an active theater; the handoff carries
`WorldEvent.id` + `theaterId`.

**The ESCALATED event card — full definition** (spec 2 commits to the swap + handoff; this
spec defines the card):

- **Belligerents** — the two (or more) `sides` from the theater, labeled by name and side,
  never by sympathy.
- **Casualty claims with per-side disagreement shown** — where the event carries competing
  casualty figures, each is shown attributed to its claiming side with its source, as a
  `RangePlot`-style spread, **never** reconciled into one number. "Side A claims X; Side B
  claims Y" is the honest rendering; silence or a midpoint is not.
- **Corroborated core with opposing-side weighting** — the Bias Lab's `corroboratedCore`
  (spec 3 §4.5) computed under §4.7's wartime physics: a claim confirmed by outlets spanning
  *opposing sides* leads; a same-side-only claim (`spectrumSpan: false`) is shown but visually
  discounted and labeled **"confirmed only within one side's media."**
- **State-media labels** — every reporting from a state-affiliated outlet carries an explicit
  chip (from `OutletStateAffiliation`, spec 3 §6.1 / §9 here), on the card itself.
- **A link into the theater page** for the full report.

The escalated card *renders* Bias-Lab-computed values (corroborated core, state affiliation,
lean chips); it computes none of them. The division is the same one the whole Atlas family
draws: the Globe surfaces, the Bias Lab computes, this spec frames it for war.

---

## 9. Editorial physics consumption (Bias Lab §4.7, D6.4)

Wartime editorial physics is **owned by the Bias Lab** (spec 3 §4.7, amended per D6.4) —
methodology over `reportings[]` lives there. This spec is a **consumer**; it defines the
theater/belligerent data that methodology needs and renders its output. Concretely:

- **Outlet → side alignment inputs.** The Bias Lab derives each outlet's side from two things
  this spec provides: (1) the `OutletStateAffiliation` annotation (state-controlled /
  state-funded / state-aligned / none + affiliated country), triangulated from **EU sanctions
  (EUR-Lex) + DOJ FARA + Wikidata P127** per the dossier (no single list is globally complete
  — all three, hand-cross-checked); and (2) each outlet's home country checked against the
  theater's `sides[].belligerents[].country`. This spec owns the *theater/belligerent* half;
  the Bias Lab owns the *outlet* half and the join.
- **Opposing-side corroboration weighting.** Consumed as described in §8: the theater page's
  media divergence panel and the escalated card both render the Bias Lab's opposing-side-
  weighted `corroboratedCore`, discounting same-side-only agreement rather than hiding it
  (density over silence, D3).
- **Single-source skepticism.** A reporting with no entailing edge to any other outlet on the
  same event renders a **"single-source claim"** badge (spec 3 §4.7.2) — this spec renders the
  badge the Bias Lab derives; it does not recompute the edges.
- **State-affiliation chips** render everywhere a state-affiliated outlet's reporting appears
  on a theater surface.

**Balanced-framing inheritance (Ledger §7).** Casualties are counts with uncertainty, never
rhetorical devices. No moralizing color scales — control areas and severity use neutral,
side-keyed tones (the `OrderOfBattle`/`BattleMap` "amber/clay/neutral" convention already in
the kit), not a red-for-villain palette. The state-affiliation annotation is itself a source
with provenance (spec 3 §4.7 flags this): the chip cites its list, subject to the same honesty
as every other layer.

---

## 10. Pipeline

### 10.1 Lanes

Theater layers ride the **existing** three-lane structure (spec 1 §4.2), never a new lane:

- **Fast lane (~20 min)** — GDELT media-attention per active theater rides the existing
  GDELT fast lane already running for the Globe; FIRMS near-real-time fire counts where a
  theater wants sub-daily fire freshness. These are the only theater layers that update
  faster than daily; everything else is medium/slow.
- **Medium lane (daily)** — UNHCR displacement, EIA energy, GFW shipping aggregates, ACLED
  aggregates, IOM DTM aggregates, Wikipedia fallback control geometry, `membership.ts`,
  `theater-rollup.ts` → `active.json`.
- **Slow lane (weekly poll)** — UCDP candidate events (monthly upstream), Black Marble derived
  nightlight numbers, Pink Sheet (monthly), ACAPS severity, state-media triangulation, UNOSAT
  manual per-crisis ingests.

The **geometry lane** (DeepState/ISW fetchers) exists as code but is **disabled** until
permission is granted (§6, §13); when enabled it rides the medium lane (daily is ample — both
sources update ~daily).

### 10.2 Commit targets (private repo, D2)

All theater data commits to the **private `khazana-world-data` repo** under
`data/world/theaters/` (registry, `active.json`, per-theater control/metrics/engagements/impact
shards), pushed from the public-repo Actions via the repo-scoped token, exactly like every
other world layer (spec 1 §4.3). Sharding follows the Spine's discipline: one file per natural
unit (per theater, per `asOf` control snapshot), bounded size. The hand-curated
`registry.json` is the one file a human edits directly in the private repo.

### 10.3 Worker mirror: does `/world/latest` need a theater rollup? — **No.**

Decided and justified: the Worker's `/world/latest` (spec 1 §4.4) stays **unchanged**, carrying
only the Spine's `WorldEvent[]` rollup. The Globe's conflict lens needs two things — the active
theater regions and each event's theater membership — and gets **both without a Worker
change**: the regions come from the committed `active.json` read at build time (theaters are
persistent and low-churn; a control layer updates daily at most, nowhere near the fast lane's
20-minute cadence, so build-time freshness is honest), and membership is a client-side
point-in-`bounds` test the Globe computes locally from that same file against each polled event
(§8). Adding a theater rollup to the near-live endpoint would buy freshness the theater data
doesn't have and duplicate geometry the client can compute for free. If a future need for
sub-daily control-layer freshness ever appears, revisit — but it would be solving a problem the
data cadence doesn't currently have.

---

## 11. Component reuse + the one genuinely new component

Per the Atlas-wide "reuse the Reads kit, don't reinvent" discipline (Bias Lab decision 7),
almost everything reuses an existing `apps/site/src/components/mdx/` primitive:

| Page need | Component | Reused as-is? |
|---|---|---|
| Belligerent roster by side | `OrderOfBattle.astro` | yes — already side → formation → sub-unit, with the amber/clay/neutral side tones §9 wants |
| Casualty low/best/high band | `RangePlot` | yes — "hairline low→high with a mid dot," built for exactly UCDP's low/best/high |
| Displacement / world-impact time series | `Chart`, `SmallMultiples` | yes |
| Duration ticker, world-impact headline figures | `StatBand` | yes — count-up big numbers, reduced-motion-safe |
| Engagement timeline / phase strip | `Timeline`, `GanttStrip` | yes |
| Media divergence panel, corroboration matrix | `DataTable`, `RangePlot` | yes — same as the Bias Lab story page |
| Troop-movement arrows + NATO unit glyphs | `BattleMap`'s `lib/battle-map.ts` geometry (`arrowGeometry`, `unitGlyph`, `frontGeometry`, side→token color) | **reused as a library**, not the component |
| Base projection + topology + graticule | `Map.tsx`'s d3-geo primitives (`geoPath`, world-atlas topology) | reused as primitives |
| Fallback link-out / caveat panels | `Callout.astro` | yes |

**The one new component: `TheaterControlMap`** (`apps/site/src/components/atlas/`). It is
justified because no existing component does its specific job, and the closest two each miss it
in a different way:

- **`Map.tsx`** is a *global* choropleth on `geoNaturalEarth1` over bundled world-atlas
  topology. It has no notion of a theater bounding box, can't `fitExtent` to a sub-national
  region, and renders country fills, not arbitrary control-area GeoJSON multipolygons that
  change `asOf` snapshot.
- **`BattleMap.tsx`** draws front lines, control areas, units, and movement arrows with a phase
  scrubber — *but over a committed static terrain image in percent-coordinate viewBox space*,
  not a live geographic projection. It can't ingest daily-updating GeoJSON in real lat/lng, and
  its base is a baked raster, not a projected map.

`TheaterControlMap` is the small piece that bridges them: it takes `Map.tsx`'s d3-geo
projection/`geoPath` primitives, `fitExtent`s them to a `Theater.bounds`, and draws
`ControlLayer.geometryRef`'s GeoJSON control-area multipolygons as side-keyed fills — then
**reuses `BattleMap`'s pure geometry library** (`arrowGeometry`, `unitGlyph`, `frontGeometry`,
`toSvg`) to overlay troop-movement arrows and engagement glyphs *in the same projected space*,
and reuses `BattleMap`'s phase-scrubber pattern to step through control-layer `asOf` snapshots.
It renders identically across all three `geometryStatus` values, branching only on the label +
whether `geometryRef` is populated (§6). SSR fallback: a static image of the most recent
snapshot plus a semantic list of control areas and engagements — the same "never blank"
contract every mdx component honors, following `BattleMap`'s own SSR discipline. This is **one**
new component that stitches two existing ones together for the geographic case; it is not a new
map engine.

---

## 12. Testing

Following spec 1 §5 and the Bias Lab §10 conventions exactly:

- **Zod round-trip tests** for every `world-theater.ts` schema (colocated
  `world-theater.test.ts`): a valid fully-populated fixture round-trips; `.default()` fields
  apply when omitted; `THEATER_STATUSES`/`GEOMETRY_STATUSES`/`THEATER_METRIC_KINDS`/
  `ENGAGEMENT_KINDS` enums are exercised for every literal.
- **The `geometryStatus × licenseTier` cross-check is tested both ways** — the enforcement in
  §4's `superRefine` is only real if a test fails on a regression: assert that
  (`geometryStatus: "fallback"` + `licenseTier: "derived-only"`) throws, that
  (`link-out-only` + non-null `geometryRef`) throws, that (`licensed`/`fallback` + null
  `geometryRef`) throws, and that the legal combinations parse. Also assert the Spine's own
  `Provenance.superRefine` still rejects any ACLED/GFW/DTM datum claiming
  `redistribution: true`.
- **Fixture-based fetcher tests, one per source** (`__fixtures__/<source-id>/`): a canned
  response (UCDP JSON with low/best/high, UNHCR JSON, FIRMS CSV, GDELT DOC JSON, a Wikipedia
  detailed-map template excerpt, an ACLED excerpt) fed through the source's `fetch()`,
  asserting the mapped `TheaterMetric`/`Engagement`/`ControlLayer` fields **and** that
  `provenance.licenseTier`/`redistribution`/`origin` come out correctly stamped for that
  source's known tier — and, specifically, that the ACLED and DTM fetchers emit
  `origin: "computed"`, `redistribution: false` aggregates and **never** a raw-row engagement
  (the §4 policy the schema can't encode).
- **`membership.ts` unit tests**: point-in-`bounds` correctness including the `time ≥ startedAt`
  and archived-`endedAt` window; an event on a `bounds` edge; an event outside every theater
  resolves to no `theaterId`.
- **Aggregation tests** for `theater-rollup.ts` and the side-grouped corroboration inputs §9
  feeds the Bias Lab: given fixed `sides` + a fixed `reportings[]`, assert the outlet→side
  grouping the Bias Lab consumes is correct (opposing-side vs same-side partition), so a
  regression in the theater half of §9's join is caught here, not only in the Bias Lab's tests.
- **SSR fallback test** (`theater-control-map-ssr.test.ts`, mirroring `battlemap-ssr.test.ts`):
  `TheaterControlMap` renders a legible static map + semantic control-area/engagement list from
  a fixed fixture with no client JS, for all three `geometryStatus` values including the
  link-out-only panel.
- **Browser-verified**, per khazana's standing convention: the control-map snapshot scrubber,
  the movement-arrow overlay, the escalated event card, and the `link-out-only` → `fallback`
  → `licensed` visual states (forced via fixture) all confirmed live before being considered
  done.

---

## 13. Build order

Phased so the permission email is explicit and the clean spines ship independently of it. A
theater is useful long before its geometry exists.

0. **Permission emails to DeepState and ISW/CTP** (§6) — sent as a tracked prerequisite at
   the very start, because the response time is outside khazana's control and everything on the
   `licensed` path waits on it. Nothing else blocks on it.
1. **Schemas + registry + `membership.ts`** — `world-theater.ts`, the hand-curated
   `registry.json` seeded with the v1 three (§2.3), event→theater membership, and
   `active.json` for the Globe. Ships the Globe's persistent theater regions (spec 2 §8.5) with
   no layers yet.
2. **Clean spines — ship regardless of any permission outcome:** UCDP casualties (the anchor,
   decision 4), UNHCR displacement, FIRMS fires, Black Marble nightlights, GDELT media
   attention. At this point all three v1 theaters have real casualty/displacement/proxy data
   and a useful page — **including Sudan, permanently, with no front-line map.**
3. **World-impact layer:** Pink Sheet, EIA, GFW aggregates → the world-impact strip (§7).
4. **Derived-only aggregates:** ACLED, IOM DTM, ACAPS — khazana-computed summaries with
   attribution (decision 5), as cross-checks to the clean-spine anchors.
5. **The theater page + `TheaterControlMap` (§11)** built and tested against the **Wikipedia
   fallback and Sudan's link-out-only** case — no primary geometry needed to build or ship the
   map component; `geometryStatus` drives the label.
6. **Escalated event card + Bias Lab §9 wiring**, once spec 3's wartime physics (§4.7) is live
   to compute the corroborated core / state affiliation this card renders.
7. **Front-line geometry, last:** if/when permission arrives, enable the DeepState/ISW
   fetchers and flip `geometryStatus` to `licensed` — a data change, not a code change (§6).
   If permission never arrives, the theaters stay on `fallback`/`link-out-only` indefinitely
   and the feature is still complete.

---

## 14. Founder open questions

Genuinely open, vision-level or judgment calls — not implementation trivia:

- **Which theaters seed v1 beyond the obvious?** §2.3 proposes Russia-Ukraine, Israel-Gaza,
  and Sudan (the clean-spine proof case). Is Sudan the right third, or should a
  India-neighborhood-relevant conflict (Myanmar spillover, or a standing India-Pakistan LoC
  watch) seed instead/additionally, given D9's India-forward posture? This is an editorial
  call the registry is designed to make cheap either way.
- **Pursue ACLED written permission for deeper use?** Today ACLED is aggregate-only (decision
  5). ACLED's richest value — a per-engagement browser — needs either their transformative-
  derivative bar cleared or a written agreement. Worth an email like DeepState/ISW, or is the
  aggregate cross-check enough alongside UCDP as the anchor?
- **OpenSky posture (dossier).** OpenSky's free tier requires a prior written agreement for
  "operational" integration, which an Actions cron arguably is. Email them for an airspace-
  closure world-impact layer, or leave it out of v1? The dossier recommends emailing first;
  this spec defers to the founder on whether the airspace layer is worth the diligence.
- **Theater dormancy criteria (§2.2).** What materiality floor moves a theater active →
  dormant (a fatalities-per-month threshold from UCDP? a media-attention floor from GDELT? a
  curator call?), and what reactivates it? Proposed as a low casualty-and-attention floor with
  a curator override, but the exact rule wants real data before it's fixed — the same
  "measure once building, don't assume" epistemics as spec 1 §8's fast-lane frequency.
- **Airwars / Bellingcat / Eyes-on-Russia data-sharing agreements.** All are link-out today
  (no public bulk license). Pursue agreements for deeper civilian-harm incident ingestion
  later, or keep them as cited link-outs indefinitely?
- **Wikipedia fallback for non-Ukraine theaters.** The detailed-map templates are richest for
  Russo-Ukrainian War; Gaza has some; Sudan effectively none. Is a partial/absent fallback
  layer acceptable per theater (the design says yes — `link-out-only` is a first-class state),
  or is a minimum geometry bar wanted before a theater ships `active`?
```
