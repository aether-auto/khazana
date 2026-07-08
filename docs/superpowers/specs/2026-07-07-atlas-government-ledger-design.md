# Atlas — Government Ledger (design spec)

> *A deep, balanced, per-country ledger of governance/macro/fiscal/corruption/conflict
> data — 200+ indicators, India carried to state/district depth — where every cell is a
> number **plus** the method that produced it **plus** how noisy it is. The founder's own
> framing is the design constraint: "show the DATA calculated from all possible published
> methods; show the bias in each." Corruption, nepotism, and opposition quality are
> rendered as data with heavy uncertainty framing — never as a verdict.*

**Status:** Proposed — spec 4 of 5 (Atlas: Spine → Globe → Bias Lab → **Ledger** → Extras)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — same binding constraint as all of khazana. No paid APIs, no
paid hosting, no always-on machine beyond the existing free Cloudflare Worker.

**Depends on:** `docs/superpowers/specs/2026-07-07-world-data-spine-design.md` (spec 1 —
`Indicator`, `CountryProfile`, `Contract`, `Provenance`, the `normalizedScore` 0–100 common
axis, the license-tier `superRefine`). Every schema reference below is to that spec; this
document defines *what the Ledger builds on top of it*, not a second schema layer.

---

## 0. What the Ledger is, and the promise it makes

The Government Ledger is Atlas's third face (spec 3 of 5, after the Globe and the Bias
Lab): a per-country page that answers "what does the published data actually say about
how this country is governed, run, and doing" — across macroeconomics, democracy,
corruption, wellbeing, procurement, fiscal health, elections/opposition, and
conflict/unrest — **at the depth of 200+ individually-sourced, individually-uncertain
data points**, with India carried down to state and district grain because that is the
country the founder actually lives in and cares to go deep on.

The promise, stated plainly, because it is the thing that could go wrong if unstated:

> **The Ledger publishes data, not verdicts.** Every number renders with its method, its
> source, and its uncertainty in the same glance. Where a concept (say, "how corrupt is
> this government") has multiple independently-published measurements that disagree —
> CPI's expert-perception score, WGI's aggregated-source score, the Global Corruption
> Barometer's household-survey bribery rate — the Ledger shows **all of them side by
> side**, not a khazana-blended "corruption score." Disagreement between methods is
> itself the most honest thing the page can say, and it is never resolved into a single
> number by khazana's own judgment.

This is not a style choice bolted on after the fact — it is why the Spine's `Provenance`
and `Uncertainty` are mandatory on every `Indicator` (spec 1 §3.1) and why
`normalizedScore` exists as a shared plotting axis without replacing `value`+`unit` as
the source of truth (spec 1 §3.2). The Ledger is the spec that actually has to *render*
that discipline for a reader, at 200+ indicators, without producing an unreadable brick
of a page or, worse, an accidental accusation.

---

## 1. Binding decisions (settled)

Carried over from the Spine, restated here because they are load-bearing for every
section below:

1. **No bare numbers.** Every rendered value carries its `Provenance` one interaction
   away (hover/expand), never buried in a footnote-only appendix (spec 1 §3, decision 3).
2. **License tiers are structural, not a rendering convention** — a `derived-only` source
   (CPI, Polity5, Freedom House, WHR, HDI, Open Budget Survey, EIU Democracy Index) can
   never claim raw redistribution; the schema itself rejects that combination at parse
   time (spec 1 §3.1). The Ledger's UI never needs to defensively check this — it is
   already impossible for the data to violate it.
3. **`normalizedScore` (0–100) is the one common plotting axis** across all 8
   `IndicatorField`s, purpose-built so a single country's radar/heatmap/range-plot can mix
   macro, corruption, and conflict indicators on one visual scale while `value`+`unit`
   remain the ground truth in every tooltip/table cell (spec 1 §3.2).
4. **Multi-method redundancy is a feature, not duplication.** Where the founder's brief
   calls for "all possible published methods," the Ledger's indicator catalog (§3)
   deliberately carries more than one indicator key for the same underlying concept
   (WGI Control-of-Corruption *and* CPI *and* the Global Corruption Barometer *and*
   V-Dem's Political Corruption Index all live in the `corruption` field simultaneously).
   This is the mechanism that makes "show the bias in each" literal rather than aspirational.
5. **Corruption/nepotism/opposition-quality indicators are objective, computable
   proxies, framed with maximal uncertainty disclosure, never a rendered verdict.** §7
   is the full contract for this; it is the single most important section in this spec.
6. **India gets state/district depth; every other country gets national depth only, in
   v1.** The `SubnationalRef`/`subnational[]` shape on `CountryProfile` (spec 1 §3.3) is
   general enough that any country could gain this later — v1 populates it only where a
   named source ships it, which today means only India (Lok Dhaba, Open Budgets India,
   NITI SDG India Index, RBI DBIE, MyNeta/ADR, PRS Legislative Research).

---

## 2. Information architecture — page map

Atlas is a top-level switch inside `apps/site` (spec 1 §1, decision 1); the Ledger owns
everything under `/atlas/ledger/*`. Routes, mirroring the existing Astro page
conventions already in `apps/site/src/pages/` (`reads/[slug].astro`, `item/[id].astro`):

```
apps/site/src/pages/atlas/ledger/
  index.astro                    # landing: world overview + country picker
  [country].astro                # per-country Ledger (§4) — country = lowercase ISO3, e.g. "ind"
  compare.astro                  # country-comparison tool (§5) — client-hydrated, no combinatorial build
  india/
    index.astro                  # India's own landing: state chooser + national India page
    [state].astro                 # state drill-down (§6)
    [state]/[district].astro      # district drill-down (§6) — only emitted where a source has district grain
```

**`/atlas/ledger` (landing).** Server-rendered at build time (no client JS needed for the
core content, matching the Observatory's SSR-first pattern in `apps/site/src/pages/
graph.astro`): a world `<Map>` choropleth of one flagship indicator (default: WGI Control
of Corruption, switchable via a small client island dropdown to any of the ~52 catalog
keys), a searchable country list, and a "how to read this page" `<Callout kind="note">`
stating the balanced-data contract from §0 up front, once, so every downstream page can
assume the reader has seen it (each per-country page repeats a one-line reminder, not the
full explainer, to avoid nagging).

**`/atlas/ledger/[country]` (per-country Ledger, §4).** One static page per country with
committed data — statically generated via `getStaticPaths()` reading
`data/world/countries/*.json` (spec 1 §4.3), same pattern as `reads/[slug].astro` reading
the `blog` content collection. This is the spec's core deliverable.

**`/atlas/ledger/compare` (comparison, §5).** Deliberately **not** a combinatorial static
route (`/compare/[a]/[b].astro` would need O(n²) build-time pages for a growing country
set — wasteful and it still can't handle a reader wanting to add a third country
mid-session). Instead: one static shell page that ships a small client-hydrated
(`client:visible`, matching the Sources explorer's post-sweep hydration discipline —
`docs/superpowers/specs/2026-07-06-surface-sweep-design.md` P1.3) country-picker island.
The island fetches the already-committed `data/world/countries/<ISO3>.json` files as
static assets (same "data lives in the repo, shipped as public JSON" approach the Sources
explorer already uses for its dataset) — no server, no API route, still $0.

**`/atlas/ledger/india/*` (state/district drill-down, §6).** `[state].astro` is statically
generated from `CountryProfile("IND").subnational` filtered to `level: "state"`.
`[state]/[district].astro` is statically generated **only** for districts that actually
exist in the committed data (a state with no district-grain source coverage yet — most of
them, in v1, since only NITI SDG India Index and parts of MyNeta/ADR reach district grain
— simply has no district pages, and its state page says so plainly rather than rendering
empty rows).

---

## 3. The indicator catalog — hitting 200+ honestly

### 3.1 What "200+" means, precisely

The founder's brief asks for "200+ indicators (~4–5 per field across many fields)." Taken
literally as 200+ *distinct concepts*, that would mean either padding the catalog with
near-duplicate indicators or displaying an unreadable 200-row flat table. Neither is the
right reading. The honest arithmetic, consistent with how `Indicator` is actually shaped
(spec 1 §3.2 — one `Indicator` record is one metric **for one country for one period**,
and `data/world/indicators/<ISO3>/<field>.json` stores "all periods" per spec 1 §4.3):

- This catalog names **52 distinct indicator keys** across the 8 `IndicatorField`s (§3.2
  below) — itself already above "4–5 per field" for most fields, because the corruption,
  wellbeing, and elections fields deliberately carry more to satisfy the multi-method
  mandate (decision 4).
- Each key is stored as a **time series**, not a single value — WDI/WGI/V-Dem all have a
  decade-plus of annual history; even the shallowest keys (procurement-derived metrics,
  which depend on however far back USAspending/TED/OCDS/GeM records go) carry several
  years.
- **52 keys × a conservative 4-year rolling window ≈ 208 stored `Indicator` records per
  well-covered country** — comfortably past 200 — and a country with WDI/WGI/V-Dem's
  decade-plus depth pushes well past 400. This is real historical depth, not superficial
  padding: the "200+" is satisfied by breadth (52 keys) **times** depth (multi-year
  series), exactly matching what `Indicator`'s per-period shape already models.
- **The UI never renders 200+ rows flatly** (§4 addresses this directly) — the default
  per-country view shows the *latest* period per key (52 rows across 8 collapsible field
  sections), with an expand-to-history affordance per row. Legibility and "200+ real
  records exist" are not in tension once the UI separates "how much data exists" from
  "how much is shown at once."

### 3.2 Catalog, field by field

Columns: **Key** (the label rendered) · **Source(s)** (which upstream(s) feed it — a
`|` means "same concept, independent method" per decision 4) · **License tier** ·
**Origin** · **Typical uncertainty kind** · **Note**.

#### `macro` — Macroeconomics (6 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| GDP growth (annual %) | WDI `NY.GDP.MKTP.KD.ZG` | raw-ok | referenced | none | headline growth |
| Inflation, consumer prices (annual %) | WDI `FP.CPI.TOTL.ZG` | raw-ok | referenced | none | |
| Unemployment rate (% labor force) | WDI `SL.UEM.TOTL.ZS` | raw-ok | referenced | sampleSize (survey n, where WDI notes it) | |
| Gov't gross debt (% GDP) — WDI method | WDI `GC.DOD.TOTL.GD.ZS` | raw-ok | referenced | none | see IMF cross-check below |
| Gov't gross debt (% GDP) — IMF method | IMF SDMX (fiscal cross-check) | raw-ok | referenced | none | **independent method, same concept** — WDI and IMF often diverge a few points on contingent-liability treatment; the divergence is shown, not reconciled |
| Trade balance (% GDP) | WDI `NE.RSB.GNFS.ZS` | raw-ok | referenced | none | |

#### `governance` — Governance & Democracy (8 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| Liberal Democracy Index | V-Dem `v2x_libdem` | share-alike derived¹ | computed | confidenceInterval (V-Dem ships expert-coder CI) | |
| Electoral Democracy Index (Polyarchy) | V-Dem `v2x_polyarchy` | share-alike derived¹ | computed | confidenceInterval | |
| Voice & Accountability | WGI | raw-ok | referenced | standardError | one of WGI's 6 published dims |
| Political Stability & Absence of Violence | WGI | raw-ok | referenced | standardError | |
| Government Effectiveness | WGI | raw-ok | referenced | standardError | |
| Regulatory Quality | WGI | raw-ok | referenced | standardError | |
| Rule of Law | WGI | raw-ok | referenced | standardError | |
| Executive constraints ("checks and balances") | Polity5 `polity2`/`xconst` | derived-only | computed | raterSpread (Polity5's own coder-agreement note) | |

¹ V-Dem is share-alike (derivative works must carry the same license + attribution) — a
distinct sub-case of `derived-only` worth flagging: khazana's `licenseTier: "derived-only"`
covers it correctly (never redistributed raw, always khazana-computed normalizedScore),
but the attribution string must additionally carry V-Dem's share-alike notice, not just a
generic citation. Flagged as an implementation-time content requirement, not a schema gap.

#### `corruption` — Corruption & Integrity (6 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| Corruption Perceptions Index (CPI) | Transparency International | derived-only (No-Derivs) | computed | raterSpread (CPI publishes a standard-error-like source-count spread) | expert/business-survey composite |
| Control of Corruption | WGI | raw-ok | referenced | standardError | **independent method, same concept as CPI** |
| Political Corruption Index | V-Dem `v2x_corr` | share-alike derived | computed | confidenceInterval | **third independent method** |
| Bribery-experience rate (%) | Global Corruption Barometer | derived-only | computed | sampleSize (household-survey n) | **household-experience method — distinct from the three expert/perception methods above** |
| Candidate criminal-case rate (%) | MyNeta / ADR (India only) | raw-ok (self-declared affidavits, publicly filed) | referenced | sampleSize (n = contesting candidates) | §7 — an objective count, never a corruption verdict on any individual |
| Procurement single-bidder rate (%) | USAspending/TED/OCDS/GeM (via `Contract`) | raw-ok, khazana-computed rate | computed | sampleSize (n = contracts) | cross-linked from `procurement`; shown here as a *correlate*, explicitly labeled "correlational proxy, not evidence of wrongdoing" |

#### `wellbeing` — Wellbeing (10 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| Happiness ladder score | World Happiness Report | derived-only | computed | raterSpread (Gallup World Poll rater/sample spread) | |
| — GDP per capita (log) contribution | WHR sub-factor | derived-only | computed | none | WHR's own decomposition |
| — Social support contribution | WHR sub-factor | derived-only | computed | none | |
| — Healthy life expectancy contribution | WHR sub-factor | derived-only | computed | none | |
| — Freedom to make life choices contribution | WHR sub-factor | derived-only | computed | none | |
| — Generosity contribution | WHR sub-factor | derived-only | computed | none | |
| — Perceptions of corruption contribution | WHR sub-factor | derived-only | computed | none | **fourth independent corruption-adjacent method** — WHR's own survey item, distinct from CPI/WGI/GCB above |
| Human Development Index (HDI) | UNDP | derived-only (per binding data plan) | computed | none | |
| Inequality-adjusted HDI (IHDI) | UNDP | derived-only | computed | none | |
| Gender Inequality Index (GII) | UNDP | derived-only | computed | none | |

#### `procurement` — Procurement (5 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| Award concentration (HHI over supplier value share) | USAspending/TED/OCDS (comparators); GeM/CPPP (India, phase 2) | raw-ok source, khazana-computed metric | computed | sampleSize (n = contracts in window) | objective concentration proxy |
| Single-bidder rate (%) | same | computed | computed | sampleSize | |
| Average time-to-award (days) | same | computed | computed | sampleSize | |
| Value share, top-5 suppliers (%) | same | computed | computed | sampleSize | |
| Competitive vs. limited/direct award-method mix (%) | same, from `Contract.method` free text, bucketed | computed | computed | sampleSize | India rows empty until the GeM/CPPP scraper (Spine §7 phase 2) ships — see §12 |

#### `fiscal` — Fiscal / Budgets (5 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| Fiscal deficit (% GDP) | IMF SDMX / WDI cross-check | raw-ok | referenced | none | |
| Open Budget Survey transparency score | Open Budget Survey/BOOST | derived-only | computed | none (OBS is an expert questionnaire score, no published CI) | |
| Open Budget Survey public-participation score | Open Budget Survey/BOOST | derived-only | computed | none | |
| Budget credibility (actual vs. budgeted expenditure variance, %) | Open Budgets India (India); IMF fiscal data (comparators) | computed | computed | sampleSize (n = budget lines compared) | |
| Tax revenue (% GDP) | WDI `GC.TAX.TOTL.GD.ZS` | raw-ok | referenced | none | |

*(Public debt % GDP is deliberately not re-defined here — it is `macro`'s key, field-owned
there; the Ledger UI cross-links it into the Fiscal section's "related" rail rather than
storing a duplicate `Indicator`, since `field` is a single enum value per `Indicator`,
spec 1 §3.2 — one record, one home field, UI-level cross-linking only.)*

#### `elections` — Elections & Opposition (7 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| Effective number of parliamentary parties (Laakso–Taagepera, seat-share) | Lok Dhaba (India); comparators' election authorities | computed | computed | none (deterministic formula over official results) | |
| Effective number of electoral parties (vote-share version) | same | computed | computed | none | |
| Gallagher disproportionality index | same | computed | computed | none | seat-share vs. vote-share divergence |
| Opposition seat-share (%) | same | computed | computed | none | |
| Largest-opposition-party seat-share (%) | same | computed | computed | none | §7 — "does a strong single opposition exist," a *share-of-seats fact*, never a quality judgment |
| Legislative productivity (bills passed per session; attendance rate) | PRS Legislative Research (India) | referenced | referenced | sampleSize (n = sessions/members) | §7 |
| Incumbent turnover rate (%) | Lok Dhaba (India); comparators' election authorities | computed | computed | sampleSize (n = constituencies) | |

#### `conflict` — Conflict / Movements (5 keys)

| Key | Source(s) | Tier | Origin | Uncertainty | Note |
|---|---|---|---|---|---|
| Battle-related deaths (best estimate, annual) | UCDP | raw-ok | referenced | confidenceInterval (UCDP ships low/best/high) | |
| Non-state conflict events (count) | UCDP | raw-ok | referenced | sampleSize | |
| Protest/demonstration events (count, annual) | ACLED | derived-only | computed | sampleSize | |
| Political-violence events (count, annual) | ACLED | derived-only | computed | sampleSize | |
| Tone-volatility index (rolling std-dev of Goldstein scale) | GDELT GKG | raw-ok, khazana-computed metric | computed | standardError | |

**Total: 52 catalog keys** (6 + 8 + 6 + 10 + 5 + 5 + 7 + 5) — see §3.1 for why this
comfortably clears 200+ stored records per country once time-series depth is counted.

---

## 4. Per-country Ledger view (`/atlas/ledger/[country]`)

### 4.1 Page anatomy, top to bottom

1. **Header** — country name + flag, region, `CountryProfile.updatedAt` freshness label
   (mirrors the Observatory's "recomputed on every build" affordance in `graph.astro`), a
   one-line reminder of the balanced-data contract (`<Callout kind="note">`, not the full
   landing-page explainer — see §2), and a compact summary strip: "52 indicators tracked ·
   N distinct sources · M with independent cross-checks."
2. **Eight field sections**, one per `IndicatorField`, in the fixed order
   `macro → governance → corruption → wellbeing → procurement → fiscal → elections →
   conflict` (stable ordering matters for a reader building a mental map across many
   country visits). Each section is a `<Detail summary="…">`-style progressive-disclosure
   block (native `<details>`, zero JS, matching the existing Detail.astro pattern) so the
   page loads collapsed and legible rather than a 50-row wall, but every section is
   server-rendered in full underneath — no client fetch needed to expand it.
3. **Footer — Provenance rail.** A grouped-by-tier summary of every source that fed this
   page: N raw-ok sources, M derived-only sources, per-source retrieval date. This is a
   direct structural cousin of the just-shipped `SourceLedger.astro` pattern for Reads
   (`apps/site/src/components/reads/SourceLedger.astro`, commit `acdc4e4`) —
   "summary line + grouped-by-tier list + no-JS degrade" is the right shape here too, even
   though the underlying data is `WorldSourceEntry`/`Provenance` rather than
   `FeedItem`-derived citations. Reuse the *pattern*, not the component (the source shape
   is disjoint — see spec 1 §4.1's placement rationale for why `world-ingest` doesn't
   force its data through the Reads pipeline's contract either). Propose a new
   `apps/site/src/components/atlas/ProvenanceRail.astro` following the same "summary +
   grouped list" idiom.

### 4.2 Inside a field section

Each of the 8 sections repeats this same internal structure (consistency across fields is
itself part of legibility at this density):

- **Field summary `<StatBand>`** — one stat tile per catalog key in that field, showing
  the latest `value`+`unit` as the headline figure and `normalizedScore` as the sub-label
  (e.g., "CPI: 39 / 100 (2025)" headline, "governance percentile: 31st among tracked
  countries" sub — see §8 for what that percentile actually means and how it's computed).
- **`<RangePlot>` — the uncertainty-first view.** One row per catalog key in the field,
  x-axis is the shared `normalizedScore` 0–100 axis (decision 3), each row's range is
  built from that `Indicator`'s `Uncertainty` via a small pure adapter (new file,
  `apps/site/src/lib/atlas/indicator-to-range.ts`, mirroring the existing
  `lib/rangeplot-scale.ts` input contract): `confidenceInterval`/`standardError` map
  directly to a `low`/`high` band around `mid = normalizedScore`; `raterSpread` maps its
  `min`/`max` the same way with `n = raterCount`; `sampleSize` collapses to a point
  (`low = mid = high = normalizedScore`) with `n` surfaced in the readout so a large-`n`
  administrative count reads differently from a small-`n` survey estimate; `none` collapses
  to a point with no `n` — the reader sees "no stated uncertainty for this figure," stated
  as fact, not hidden as if it were precise. This is the single visual that makes
  "show the bias in each" literal: uncertainty width IS the bias/noise signal, on the one
  common axis the Spine built for exactly this.
- **`<DataTable>` — the exhaustive, sortable detail.** Columns: Indicator · Value (native
  unit) · Normalized (0–100) · Uncertainty (rendered per-kind, same logic as the adapter
  above but as text: "± 4.2 (SE)", "31–47 (90% CI)", "6 raters, 22–58 spread", "n = 214",
  "no stated uncertainty") · Method (a link icon to `provenance.methodUrl`) · License
  (a small tier chip: "raw" for `redistribute-raw-ok` + `redistribution: true`,
  "khazana-derived" otherwise — directly surfacing decision 2's structural guarantee).
  Sortable client-side (reuse the existing `lib/table-sort.js` the DataTable component
  already depends on, per its `Column`/`Row` types in `apps/site/src/components/mdx/
  index.ts`).
- **Multi-method callout, where the field has ≥2 keys measuring the same underlying
  concept** (`corruption` has four; `governance`'s WGI dims + V-Dem overlap on "how
  democratic/well-run"; `wellbeing`'s WHR corruption sub-factor is itself a fourth
  corruption-adjacent measure). A `<Callout kind="note">` literally states "N independent
  methods measure this concept" and a small companion `<RangePlot>` (or, for exactly two
  methods, a compact two-row comparison) plots just those keys against each other on the
  shared axis — this is where "all possible published methods, side by side" becomes a
  rendered fact rather than a catalog-table abstraction.
- **Per-key history, on demand.** Each `DataTable` row expands (native `<details>` inline,
  or a small `<Detail>` per row) to a `<Chart mark="line">` of that key's full period
  history — this is where the "200+ stored records" (§3.1) actually surface to a reader
  who asks for them, without bloating the default collapsed view.
- **Percentile-in-context, per key** (§8's payoff). One `<Distribution>` per field
  section (not per key — that would be excessive), defaulting to the field's headline
  key (e.g. `corruption` defaults to CPI), with the country's own `normalizedScore` shown
  as a `marker` against the histogram of every other tracked country's score for that
  same (key, period). A dropdown swaps which key's distribution is shown. This is the
  visual answer to "where does this country sit, and how spread out is everyone else" —
  which is a materially more honest question than "is this country good or bad."

### 4.3 What the page deliberately does NOT do

- No composite "khazana score" blending the 52 keys into one number. That would be
  precisely the verdict-manufacturing this spec exists to prevent.
- No red/green or good/bad color coding on any indicator, corruption-adjacent or not
  (see §7.3's color-system note).
- No cross-country rank badge ("#14 most corrupt") — only percentile-in-distribution
  framing (§8), which is symmetric and doesn't imply an ordinal "worst to best" ladder.

---

## 5. Country-comparison view (`/atlas/ledger/compare`)

A client-hydrated tool, not a set of pre-built static pages (§2 explains why). Reader
picks 2–4 countries; the island fetches each country's committed
`data/world/countries/<ISO3>.json` and renders:

- **A `<Map>` world choropleth** for one selected indicator at a time (default: whatever
  key the reader arrived from, e.g. deep-linked from a per-country page's "compare this
  indicator" affordance), with the chosen countries highlighted.
- **A generalized head-to-head diverging-bar view, per field**, reusing the shape (not
  the theater-specific styling) of `<ForceComparison>` — its underlying spec already
  generalizes cleanly (`sides: {label, tone?}[]`, `metrics: {label, values: number[],
  unit?, higherIsWorse?}[]`, per the component catalog). For the Ledger, `higherIsWorse`
  is **deliberately omitted/false for every corruption-adjacent metric** — see §7.3 — and
  used only where a metric has an unambiguous, non-normative direction shared by both
  countries being compared (e.g., "average time-to-award, days" — faster isn't a moral
  claim, just an operational one, though even here the copy stays descriptive rather
  than evaluative).
- **A `<Slopegraph>`** for rank or value movement across two periods — e.g., "CPI score
  among the chosen comparator set, 2015 → 2025," or "opposition seat-share before/after
  the most recent election" — the component's exact "who moved past whom" use case.
- **A `<Scatter>`** for cross-metric correlation exploration — e.g., x = WGI Control of
  Corruption, y = procurement single-bidder rate, one dot per chosen country — explicitly
  captioned "correlation across the chosen countries, not causation; the x-axis is itself
  a perception-based measure with its own uncertainty" directly in the caption, not just
  in a linked methodology page. This is the sharpest point in the whole spec where an
  unwary reader could over-read a chart as an accusation, so the guard-rail is inline,
  not deferred.
- **A `<DataTable>`** of the full 52-key catalog, side by side per chosen country, sortable
  by any column, for the reader who wants the raw grid.

---

## 6. India state/district drill-down (`/atlas/ledger/india/[state]`, `[district]`)

### 6.1 Source-to-grain mapping

| Source | Grain | Feeds field(s) |
|---|---|---|
| Lok Dhaba | constituency (rolled up to state/district) | `elections` |
| Open Budgets India | union + state + ULB | `fiscal` |
| NITI Aayog SDG India Index | state + district | primarily `wellbeing`, plus SDG-16-mapped sub-scores into `governance` and SDG-8/9-mapped sub-scores touching `procurement`-adjacent context |
| RBI DBIE | state | `macro`/`fiscal` (monetary + state fiscal series) |
| MyNeta / ADR | candidate/constituency (rolled up to district) | `corruption` (candidate criminal-case rate), `elections` (candidate asset/education context) |
| PRS Legislative Research | state + national assembly | `elections` (legislative productivity/attendance) |
| GeM / CPPP (phase 2, Spine §7) | state (once the scraper ships) | `procurement` |

Per spec 1 §7, **NITI SDG India Index, RBI DBIE, Lok Dhaba, and Open Budgets India are NOT
the blocker** — they have workable APIs/bulk downloads and can populate `subnational[]`
in the same build wave as the Spine itself. **GeM/CPPP procurement is the genuine
blocker** (no official API, needs a bespoke scraper — study `mcp-india-tenders` first);
India's Procurement field rows stay empty with an explicit "not yet available — tracked
as a phase-2 build" state, rather than silently omitted, until that scraper ships.

### 6.2 A schema gap worth flagging before this is built

`SubnationalRef` (spec 1 §3.2) is `{ level: "state"|"district", code, name }` — it has
**no explicit parent-state reference on a district row**. That is fine for a state page
(filter `subnational` to `level: "state"`), but a district page needs to know which state
it belongs to, and nothing in the Spine's schema encodes that hierarchy. Two ways to
close this, neither requiring touching the Spine's core `Indicator`/`CountryProfile`
shapes:

- **(a) Convention over schema** — district `code` values are namespaced with their
  parent state's ISO 3166-2:IN code, e.g. `IN-UP::lucknow`, and the Ledger's build-time
  aggregation splits on `::` to group districts under states. Zero schema change, but a
  string convention that has to be honored by every India source fetcher consistently.
- **(b) A small, additive Spine amendment** — add an optional `parentCode?: string` to
  `SubnationalRefSchema`. Cleaner, but is a change to a spec already marked "settled" —
  flagged here rather than made unilaterally; see §12.

This spec's default (pending founder sign-off, §12) is **(a)**, since it ships without
reopening spec 1, and the convention is simple enough to document once in
`packages/world-ingest`'s India source fetchers.

### 6.3 State page anatomy

Same 8-field-section structure as §4.2, scoped to that state's `subnational` entries —
**not** a fresh design, deliberately, so a reader who has learned to read the national
page already knows how to read the state page. A state page additionally links to its
district pages (where any exist) in a compact list at the top, and an India-scoped
`<Map>` variant plots all states at once for whichever indicator is selected — flagged
in §12 as needing a new India-states TopoJSON asset, since the existing `Map.tsx` is
bundled against `world-atlas`'s ISO3 country-level topology only (`apps/site/src/
components/mdx/Map.tsx` imports `world-atlas/countries-110m.json` directly — there is no
sub-national topology in that dependency today).

---

## 7. Handling corruption/nepotism/opposition responsibly (the core contract)

This section is the spec's center of gravity — everything above exists to make this
possible without becoming an accusation engine.

### 7.1 The principle

**Every corruption/nepotism/opposition-quality-adjacent number in this catalog is an
objective, publicly-documented count or published survey result — never a khazana
judgment, and never presented as a conclusion about any named individual.** Concretely:

- "Candidate criminal-case rate" is a **count** — the percentage of candidates who
  **themselves declared** a pending criminal case on their own public election affidavit
  (MyNeta/ADR). It is not khazana asserting guilt, corruption, or wrongdoing about any
  candidate — it is a tally of self-disclosed, publicly-filed facts, with the caveat that
  "case pending" is legally distinct from "convicted," stated directly in the indicator's
  rendered note, not just its methodology link.
- "Procurement single-bidder rate" is an **operational metric** about how competitive an
  award process was. A high single-bidder rate correlates with corruption risk in the
  academic procurement literature, but the Ledger states the metric as what it literally
  is ("percentage of contracts awarded with exactly one bidder") and never as "evidence
  of corruption" — the corruption-field cross-link (§3.2) explicitly labels it
  "correlational proxy, not evidence of wrongdoing" every place it appears.
- "Largest-opposition-party seat-share" and "legislative productivity" are **share-of-
  seats and count-of-bills facts** — "how good is the opposition" is deliberately
  *not* asked as a quality question anywhere on this page; it is answered only by
  computable, mechanical quantities (seat-share, disproportionality, bill-passage rate,
  attendance rate) that a reader can weigh themselves.
- Every one of these carries its `Uncertainty` at full strength (§4.2's `RangePlot`) —
  a `sampleSize`-only reading (e.g., n = 214 candidates) is shown as exactly that: a count
  with no stated confidence interval, not upgraded to look more precise than it is.

### 7.2 The multi-method display, applied to the sharpest case

Corruption is where "all possible published methods, side by side" matters most, because
it is the field most prone to being read as an accusation. §3.2's `corruption` field
therefore carries **four independent methods for the same broad concept** (CPI's
expert-perception composite, WGI's aggregated-source score, the Global Corruption
Barometer's household bribery-experience survey, V-Dem's expert-coded political
corruption index) plus a **fifth, contextual** corruption-adjacent measure living in
`wellbeing` (WHR's own corruption sub-factor). The Ledger's job is to show all five
without collapsing them, and to let their *disagreement* — visible directly in the
`RangePlot`'s spread across rows — do the honest work a single number never could.

### 7.3 Visual language: how "balanced, not accusatory" actually renders

- **No moralizing color scale.** No red-to-green gradients on any indicator in the
  `corruption` or `elections` fields (or anywhere else). Use the same neutral sequential
  palette the rest of khazana's data-viz already uses (per the `dataviz` skill's palette
  discipline) for every field uniformly — corruption data does not get a "warning" red
  treatment that macro or wellbeing data doesn't also get.
- **No ranking ladders.** Percentile-in-distribution (§8), never "ranked #N of M" —
  percentile framing is inherently about *position in a spread*, not an ordinal
  "best-to-worst" list, and doesn't imply a race to be won or lost.
- **Uncertainty is drawn as wide, not hidden as narrow.** The `RangePlot`'s honest-range
  ethos (its own doc comment: "the honest alternative to bars-with-error-caps") is
  precisely the right default here — a bribery-experience survey with a wide rater/sample
  spread should *look* uncertain, not be rounded to a confident-looking single bar.
- **Every corruption-adjacent number sits one hover away from its method citation**, so a
  reader can always answer "how was this measured, by whom, from what sample" without
  leaving the page — this is the practical mechanism that keeps the page from reading as
  gossip rather than data.
- **Language, not just visuals** — every corruption/nepotism-adjacent indicator's rendered
  label and note use descriptive verbs ("declared," "measured," "surveyed," "counted"),
  never accusatory ones ("accused," "implicated," "guilty of"). This is a content-review
  item for whoever authors the final copy at implementation time, flagged here as a
  binding style constraint, not an afterthought.

---

## 8. How `normalizedScore` percentile-ranking is computed

Spec 1 §3.2 states the rule at a high level ("already 0–100 → pass through; raw
macro/fiscal → khazana's own percentile rank"). This section makes it precise enough to
implement, because the exact mechanism matters for the "no verdict" framing (§7.3): a
**fixed-bounds rescale** is stable and doesn't imply "compared to peers," while a
**cross-country percentile** is inherently relative and must disclose exactly what it's
relative *to*.

### 8.1 Three modes, chosen per source at ingest time (not improvised per-datum)

1. **Fixed-bounds rescale** — for sources whose `value` is *already* on a fixed, published
   scale (CPI 0–100, WGI dims ≈ −2.5..2.5, V-Dem indices 0–1, Polity5's `polity2` −10..10,
   HDI/IHDI 0–1, WHR ladder 0–10). `normalizedScore = linear rescale of value into that
   source's own documented bounds → [0, 100]`. This is a **units conversion**, computed
   once by the source's own fetcher (`WorldIndicatorSource.fetch()`, spec 1 §4.1) at fetch
   time, with no dependency on any other country's data. It is stable build-to-build (it
   doesn't shift just because khazana ingests a new country) — this is the mode used for
   every already-bounded index and every already-a-percentage rate (bribery-experience
   rate, single-bidder rate, opposition seat-share — these are degenerate fixed-bounds
   cases where `normalizedScore === value` outright, exactly spec 1 §3.2's "already a
   0–100 score" case).
2. **Cross-country percentile** — for raw magnitudes with no fixed bounds (GDP in current
   US$, contract value, battle-death counts, protest-event counts). `normalizedScore =
   percentile rank of this country's value among every country reporting the same (key,
   period) in khazana's committed dataset`. This **cannot** be computed by a single
   country's fetcher in isolation — it requires the full cross-country slice for that
   period. See §8.2 for where this actually runs.
3. **Rate/ratio pass-through** — a degenerate case of mode 1 for metrics that are already
   a 0–100 percentage by construction (procurement single-bidder rate, opposition
   seat-share, bribery-experience rate) — `normalizedScore = value`, no transform needed.

### 8.2 A pipeline refinement this requires (beyond Spine §4.2)

Mode 2's cross-country dependency means a per-source, per-country fetcher genuinely
cannot finish computing `normalizedScore` alone — the Spine's §4.2 fetch→commit ordering
needs one additional pass to make this correct, which this spec adds as an internal
`world-ingest` pipeline detail (not a Spine schema change, so it doesn't require reopening
spec 1):

```
slow-lane fetch phase   → per-country Indicator records committed, with normalizedScore
                           already final for mode-1/mode-3 keys, and a provisional
                           self-referential placeholder for mode-2 keys
normalize-scores pass    → NEW: packages/world-ingest/src/aggregate/normalize-scores.ts
  (runs once per slow-   → reads every committed country's raw `value` for each mode-2
   lane cycle, after      key+period across the full country set, computes the
   all fetches finish)    percentile rank per country, rewrites normalizedScore in place
                           across data/world/indicators/<ISO3>/<field>.json shards
country-profile pass    → aggregate/country-profile.ts (spec 1 §3.3) runs LAST, reading
                           the now-finalized Indicator shards
```

This is a pure, deterministic, already-fetched-data-only transform (no network call),
consistent with spec 1 §5's existing "aggregation tests are pure functions over
already-fetched fixtures" testing approach — it slots into the same testing philosophy
without adding a new kind of test.

### 8.3 The disclosure this requires in the UI

Because mode-2 percentiles are relative to *khazana's currently-tracked country set*, not
a true global percentile (khazana will never ingest all ~195 countries at once, certainly
not in v1 — see §12), **every mode-2 percentile readout must say "percentile among N
countries tracked by khazana as of `CountryProfile.updatedAt`,"** not a bare "73rd
percentile" that implies a claim about the whole world. This is a small copy requirement
with an outsized honesty payoff, directly serving §0's promise.

---

## 9. Compute & data flow

Reuses spec 1's architecture wholesale — the Ledger adds no new infrastructure, only a
new *reader* of what the Spine already produces:

- **Ingest & normalize-scores compute**: GitHub Actions, slow lane (weekly poll — spec 1
  §4.2), $0, public-repo unlimited minutes. The `normalize-scores` pass (§8.2) is a new
  step inside `world-pipeline.yml`, between the slow-lane fetch step and the
  `country-profile` aggregation step — no new workflow file needed.
- **Storage**: committed static JSON under `data/world/countries/<ISO3>.json` (the
  `CountryProfile` aggregate) and `data/world/indicators/<ISO3>/<field>.json` (the raw
  per-field `Indicator[]` shards) — spec 1 §4.3, unchanged.
- **Build-time read**: `apps/site/src/pages/atlas/ledger/[country].astro`'s
  `getStaticPaths()` reads `data/world/countries/*.json` directly (mirrors
  `reads/[slug].astro`'s `getCollection("blog")` pattern, just over a plain JSON directory
  instead of an Astro content collection — propose a small `apps/site/src/lib/atlas/
  world-data.ts` loader analogous to the existing `lib/feed.js`'s `loadCurated()` /
  `lib/taste.js`'s `loadTaste()`, e.g. `loadCountryProfile(iso3)` /
  `listCountryProfiles()`).
- **Client-hydrated pieces**: only the comparison tool's country picker (§5) and the
  landing page's indicator-choropleth dropdown (§2) need `client:visible` islands; every
  per-country Ledger page (§4) is otherwise fully server-rendered, matching the
  Observatory's "most of this page is server-rendered; a handful of islands layer motion
  on top" discipline (`graph.astro`'s own header comment).
- **No new Worker route needed.** Unlike the Globe (spec 2, near-live event data) and the
  Bias Lab (spec 3, daily-recomputed outlet profiles), the Ledger's underlying data is
  weekly-cadence at the fastest — a full static rebuild on the existing `world-pipeline.yml`
  cadence is sufficiently fresh; there is no near-live requirement here, so no new
  `/world/ledger` Worker endpoint is proposed.

---

## 10. Reuse of Reads chart primitives

Every visual on the Ledger reuses an existing `apps/site/src/components/mdx/` component
— this spec introduces **zero new chart primitives**, only new pure adapter functions
(`indicator-to-range.ts`, §4.2) that reshape `Indicator[]` into the props those
components already accept.

| Ledger need | Component | Why this one |
|---|---|---|
| Uncertainty-first view per field | `RangePlot` | dot + range on the shared 0–100 axis is exactly `normalizedScore` + `Uncertainty`'s native shape |
| Exhaustive sortable detail | `DataTable` | the structured detail a chart can't hold — value, normalizedScore, uncertainty text, method link, license chip, one row per key |
| Percentile-in-distribution | `Distribution` | histogram + a `marker` at the country's own score — the direct visual answer to "where does this country sit," §8's payoff |
| Per-key history | `Chart` (`mark: "line"`) | the trend view, on demand per row |
| Cross-country overview | `Map` | choropleth by ISO3, already built for exactly this |
| Rank/value movement across two periods | `Slopegraph` | "who moved past whom" — CPI rank 2015→2025, opposition seat-share before/after an election |
| Cross-metric correlation | `Scatter` | x/y relationship + optional linear fit, for the comparison tool's corruption-vs-procurement exploration |
| Head-to-head country comparison | `ForceComparison`'s generalized shape | diverging bars per metric across 2+ "sides" — reused conceptually beyond its theater origin |
| Procurement value breakdown | `Sankey` | buyer → sector → supplier flow, if/when the India GeM data (or comparators) reach the volume where a flow view earns its keep |
| Field-level headline stats | `StatBand` | dramatic figure row, used sparingly (once per field, not once per key) |
| Balanced-view framing / caveats | `Callout` | the "here is what the data shows and how noisy it is" reminder, repeated at the right altitude (full on landing, one-line per country page) |
| Progressive disclosure per field | `Detail` | native `<details>`, zero JS, matches the collapsed-by-default field-section requirement (§4.1) |
| Method/source citation | `Sidenote` / a new `ProvenanceRail` | per-datum aside for a single citation; the footer rail for the whole page's source summary (§4.1) |

---

## 11. Testing approach (brief — mirrors spec 1 §5's philosophy)

- **`indicator-to-range.ts`** (§4.2): pure unit tests, one per `Uncertainty` kind,
  asserting the exact `RangeDatum` produced — this is the one genuinely new piece of
  logic this spec introduces, and it is a pure function over already-validated
  `Indicator` fixtures, testable with zero network/build dependency.
- **`normalize-scores.ts`** (§8.2): fixture-based aggregation test — a fixed multi-country
  set of raw `value`s for one mode-2 key+period, asserting the exact percentile output
  per country, including ties (documented tie-breaking rule: standard percentile-rank
  with average rank for ties, stated explicitly since silent tie behavior would be a
  hidden inconsistency exactly where this spec is trying hardest to be transparent).
- **`getStaticPaths()` route tests** for `[country].astro`, `[state].astro`,
  `[state]/[district].astro`: assert the right set of pages is generated from a fixture
  `data/world/` tree (in particular, that a district page is *not* emitted for a
  state with no district-grain source coverage — §6.1's explicit non-goal).
- **Browser-verify** (per the `run`/`verify` skills' discipline already in use for Reads
  components): one pass over a real `[country].astro` build with representative fixture
  data covering all five `Uncertainty` kinds, confirming the `RangePlot` degrades
  correctly for `none`/`sampleSize` (point, not a fabricated range) and that the
  Provenance rail's no-JS fallback renders without the client island.

---

## 12. Founder open questions

- **Which fields/countries seed v1?** This spec's catalog and India depth are fully
  specified, but the *comparator country set* for launch is not — a small, deliberately
  chosen set (e.g., a few large democracies + a few large non-democracies, to make the
  multi-method corruption/governance comparisons actually interesting) would ship faster
  than "every WDI-covered country at once." Needs a founder pick.
- **India-procurement (GeM/CPPP) scraper timing.** Spec 1 §8 already flags this as an
  open Spine-level question; restated here in Ledger terms: does the Ledger ship with
  India's `procurement` field visibly empty ("not yet available — tracked as a phase-2
  build," per §6.1) for however long the scraper build takes, or does the founder want
  that build pulled forward given it's likely the single most personally interesting
  dataset in this whole spec?
- **`SubnationalRef` district-parent convention (§6.2).** Ship with the code-namespacing
  convention (`IN-UP::lucknow`), or take this back to spec 1 as a small additive
  `parentCode?` schema amendment? The convention ships faster; the schema field is
  cleaner and removes a "hope every fetcher honors the string convention" risk.
- **How to visually communicate "balanced, not accusatory" beyond §7.3's rules.** §7.3
  specifies concrete constraints (no moralizing color, no ranking ladders, uncertainty
  drawn wide, descriptive language) — is there a **standing, page-level design element**
  the founder wants beyond a `Callout` (a persistent header ribbon, a permanent footer
  note, something closer to a masthead-level statement of editorial policy) given how
  central this framing is to the whole spec?
- **India-states TopoJSON asset (§6.3).** `Map.tsx` is bundled against `world-atlas`'s
  country-level topology only. An India-states choropleth needs a new bundled asset
  (ISO 3166-2:IN-keyed state boundaries) — is there an existing $0, offline-bundleable
  TopoJSON source the founder already has in mind, or does this need its own small
  research pass before implementation?
- **NITI SDG India Index un-bundling.** It ships as composite SDG-goal sub-scores that
  don't map 1:1 onto this spec's 8 `IndicatorField`s — should each SDG sub-score become
  its own catalog key (more indicators, finer field-mapping, more maintenance), or should
  it stay as a smaller number of pre-bundled composite entries per goal (fewer keys,
  coarser)? This spec defaulted to "map onto existing fields per goal" (§6.1) as the
  lower-maintenance choice, but it's worth a founder gut-check once real NITI data is in
  hand.
