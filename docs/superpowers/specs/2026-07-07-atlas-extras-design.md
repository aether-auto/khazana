# Atlas — Extras (design spec)

> *khazana's second face is a Spine (schemas + ingest), a Globe (live events), a Bias Lab
> (outlet lean/reliability), and a Government Ledger (200+ indicators). Those three
> surfaces are the core. This spec is the founder's own invitation taken literally —
> "then you can add more pages and more analysis how you want... go wild" — a ranked
> backlog of everything ELSE that turns Atlas from three great pages into a complete
> world-intelligence surface.*

**Status:** Proposed — spec 5 of 5 (Atlas: Spine → Globe → Bias Lab → Ledger → **Extras**)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — same binding constraint as every khazana spec. Every
feature below must be buildable on free data, free compute (GitHub Actions), and the
existing free Cloudflare Worker. None of them.

---

## 0. What this spec is, and how to use it

This is **not** a fourth feature spec sitting alongside the Globe/Bias Lab/Ledger — it's
a **menu**, deliberately wider than what any one build cycle should attempt. Sixteen
candidate features are described, each scored, each mapped onto the Spine's five schemas
(`WorldEvent`, `Indicator`, `Contract`, `Outlet`, `CountryProfile`) and its two license
tiers (`redistribute-raw-ok`, `derived-only`), and each ranked into one of three build
waves. **Nothing here is committed.** §5 hands the founder a short list of open questions
— which 2–3 to actually schedule after the core three pages ship — because "go wild" is
an instruction to generate options, not to greenlight all of them.

Two hard rules carried over from spec 1, binding on every entry below:

1. **Every datum needs a `Provenance`, every `Provenance` needs a `licenseTier`.** Where a
   feature needs a source not already named in spec 1 §3.7's ~15-source list, that's
   called out explicitly as a **Spine amendment** — a new `WorldSourceEntry` the Spine
   didn't originally anticipate, with its license tier judged the same way spec 1 judged
   the original fifteen (raw-table-shaped + permissive license → tier a; index/score
   product, or ToS-ambiguous → tier b, khazana computes its own derived figure).
2. **No feature introduces a sixth schema without saying so.** Fifteen of the sixteen
   features below fit `WorldEvent` / `Indicator` / `Contract` / `Outlet` / `CountryProfile`
   as-is. Exactly one (§4.16, Who-Funds-Whom) doesn't, and is flagged as needing its own
   schema design pass before it can be built — not glossed over as "just add a field."

### How each entry is scored

- **Impact** — Low / Medium / High, judged on how much it deepens Atlas's core promise
  (methodology-transparent world intelligence) vs. being a nice-to-have variant view.
- **Effort** — Low / Medium / High, judged on: does it need a new fetcher? a new schema
  or vocab addition? a genuinely new UI pattern (not a reskin of an existing chart)? Does
  it carry editorial-sensitivity weight (per-person data) that needs a review pass beyond
  normal code review?
- **Depends on** — which of specs 2 (Globe), 3 (Bias Lab), 4 (Government Ledger) must
  already be live, and specifically *which part* of that spec's data it reads.
- **Wave** — v1 (rides specs 2–4's already-ingested data, ships as a new UI view for
  near-zero incremental ingest cost), v2 (needs one new source or one new piece of
  cross-cutting derivation logic, but reuses an existing schema), or v3 (stretch — blocked
  on the Spine's own India-depth phase 2, needs a new schema, or carries enough
  editorial-sensitivity weight to warrant its own review before building).

---

## 1. At a glance — the full backlog, ranked

| # | Feature | Schema(s) | New source? | Impact / Effort | Wave | Depends on |
|---|---|---|---|---|---|---|
| 1 | Country Trajectory | `CountryProfile` | No | High / Low | v1 | Ledger (spec 4) |
| 2 | Macro Dashboard | `Indicator` | No | High / Low | v1 | Ledger (spec 4) |
| 3 | Same-Story Diff | `WorldEvent`/`Reporting` | No | Medium / Low | v1 | Globe (2) + Bias Lab (3) |
| 4 | Conflict & Movements Tracker | `WorldEvent` | No | High / Low | v1 | Globe (spec 2) |
| 5 | Treaties & Geopolitics Layer | `WorldEvent` | No (reuses GDELT) | Medium / Low | v1 | Globe (spec 2) |
| 6 | World Sources Explorer | `WorldSourceEntry` | No | Medium / Low | v1 | Spine (spec 1) only |
| 7 | Contracts Explorer / "Money Map" | `Contract` | No | High / Medium | v2 | Ledger (spec 4) |
| 8 | Press-Freedom & Censorship Layer | `Indicator` + `Outlet` | Yes (RSF) | High / Medium | v2 | Globe (2) + Bias Lab (3) |
| 9 | Blindspot Feed | `WorldEvent` + `Outlet` | No | High / Medium | v2 | Globe (2) + Bias Lab (3) |
| 10 | Election & Opposition Tracker (global slice) | `Indicator` | Yes (ParlGov) | Medium / Medium | v2 | Ledger (spec 4) |
| 11 | Climate Commitments vs Reality | `Indicator` | Yes (OWID + NDC) | High / Medium | v2 | Ledger (spec 4) |
| 12 | Sanctions Tracker | `WorldEvent` + `Indicator` | Yes (OFAC/EU/UN) | Medium / Medium | v2 | Globe (2) + Ledger (4) |
| 13 | Aid Flows Map (IATI) | `Contract` | Yes (IATI) | Medium / Medium | v2 | Ledger (spec 4) §7 pattern |
| 14 | Budget Explorer | `Indicator` | No (India-phase-2) | Medium / High | v3 | Ledger (4) + Spine India depth |
| 15 | Leader / Politician Profiles | `Indicator` + `CountryProfile` | Yes (MyNeta/ADR, PRS) | High / High | v3 | #10's India depth + Ledger (4) |
| 16 | Who-Funds-Whom (think-tank/lobbying map) | **none fit** | Yes (OpenSecrets/LDA) | Medium / High | v3 | needs new schema first |

---

## 2. Wave v1 — quick wins (ride specs 2–4's data for near-zero incremental ingest)

Every feature in this wave reads data that specs 2–4 are already committed to ingesting.
None needs a new `WorldSourceEntry`; each is a new Astro route + a new chart/derivation
over data already sitting in `data/world/`.

### 2.1 Country Trajectory

One country's path across all ~200 indicators over time, as a data narrative rather than
a snapshot table: "is Country X's democracy backsliding, and how confident are we?" The
Government Ledger's per-country page (spec 4) is inherently a snapshot — the latest value
per `(field, key)`. Country Trajectory instead groups the *same* `Indicator` records by
`key` across all stored `period`s and renders small-multiple sparkline strips per field
(governance, corruption, fiscal, conflict, …), each strip annotated with its own
`uncertainty` band so "the CPI score dropped 4 points" reads differently when the
underlying source is a `standardError`-carrying WGI series vs. a bare `sampleSize` ACLED
count. This is the spec-1-predicted payoff of storing every `period`, not just latest —
the schema already supports this page; nobody has built the view yet.

- **Data source(s):** none new — reads `Indicator[]` already committed under
  `data/world/indicators/<ISO3>/<field>.json` by the Ledger's own ingest.
- **Spine schema:** `CountryProfile` (build-time aggregation across periods), `Indicator`.
- **Impact / Effort:** High / Low — this is pure derived-view + charting work over data
  that already exists the day the Ledger ships.
- **Depends on:** spec 4 (Government Ledger) must be live and must retain historical
  periods per key (not just overwrite the latest value on each slow-lane run — worth
  double-checking the Ledger's aggregation step doesn't discard prior periods).

### 2.2 Macro Dashboard

A live-ish World Bank WDI / IMF SDMX / OWID indicator dashboard with a country-vs-country
comparison mode — pick two or three countries, one `macro` or `wellbeing` field, see the
trajectories overlaid. Where Country Trajectory (§2.1) is "one country, many fields," the
Macro Dashboard is "many countries, one field" — the complementary lens on the exact same
`Indicator[]` data.

- **Data source(s):** none new beyond what spec 4 already ingests (WDI, WGI, IMF SDMX are
  named in spec 1 §7 phase 1, all `redistribute-raw-ok`). **OWID** is referenced by the
  founder's own feature brief as a Macro Dashboard source but isn't in spec 1's named
  fifteen — flag as a small Spine amendment: OWID publishes under CC-BY, so it slots in
  as `redistribute-raw-ok`, feeding the `macro`/`wellbeing` fields alongside WDI.
- **Spine schema:** `Indicator`.
- **Impact / Effort:** High / Low.
- **Depends on:** spec 4 (Government Ledger).

### 2.3 Same-Story Diff

Side-by-side of how N outlets across the political spectrum covered one `WorldEvent` —
headline, tone, stance, and frame per `Reporting`, laid out as a comparison grid rather
than a list. The founder's brief already notes this "could live in Bias Lab" — it does,
functionally: spec 1 §3.5 states the same-story divergence index is *computed* in the
Bias Lab (spec 3), not stored on `WorldEvent`. What's missing is a **dedicated, linkable
page** for it — reachable both from a Globe event marker ("12 outlets covered this, see
how") and from a Bias Lab outlet page ("see this outlet's coverage of contested events") —
rather than the divergence index existing only as an internal Bias Lab computation with no
UI of its own. This entry exists to make that surfacing explicit and to note it shares
its data (`reportings[]`) and its divergence formula with the Blindspot Feed (§3.9) — the
two should share one computation module, not reimplement coverage-gap detection twice.

- **Data source(s):** none new — reads `WorldEvent.reportings[]` and `Outlet.bias`,
  already modeled by the Spine and computed by the Bias Lab.
- **Spine schema:** `WorldEvent` / `Reporting`, `Outlet`.
- **Impact / Effort:** Medium / Low — UI-only, but worth sequencing right after the Bias
  Lab ships since the divergence formula is genuinely its work, not this spec's.
- **Depends on:** spec 2 (Globe, for event linking) + spec 3 (Bias Lab, for the
  divergence computation and `Outlet.bias`).

### 2.4 Conflict & Movements Tracker

A dedicated timeline + map of unrest, protest, and political violence — ACLED events,
UCDP armed-conflict episodes, and GDELT-detected protest activity, with an India
insurgency/communal-violence layer once subnational geocoding is reliable. Spec 1 §7
phase 1 already lists ACLED (medium lane) and GDELT (fast lane) as comparators-first
sources feeding `WorldEvent`; UCDP is a phase-1 slow-lane `Indicator` source for the
`conflict` field. This feature is a **filtered lens** on data the Globe already ingests —
`category === "conflict"` plus `sourceCategoryCode` refinement for the GDELT CAMEO codes
that map to protest/violence, rendered as a scrubbable timeline synced to the map rather
than the Globe's default all-categories view.

- **Data source(s):** none new — ACLED, UCDP, GDELT are all already Spine sources
  (`derived-only`, `redistribute-raw-ok`, `redistribute-raw-ok` respectively).
- **Spine schema:** `WorldEvent` (primary), cross-referenced against `Indicator` (`field:
  "conflict"`, UCDP-sourced) for magnitude context. No schema change needed — protest/
  unrest filtering is a `sourceCategoryCode` sub-tag on the existing `conflict` category
  bucket, worth confirming against real GDELT CAMEO output before assuming the existing
  category alone is granular enough.
- **Impact / Effort:** High / Low.
- **Depends on:** spec 2 (Globe) for `WorldEvent` ingest + map rendering.

### 2.5 Treaties & Geopolitics Layer *(new)*

A layer tracking treaty signings, ratifications, and multilateral agreements — NATO/EU/
ASEAN/UN Security Council actions, bilateral pacts, ceasefires — as a distinct thread from
day-to-day `diplomacy`-category noise. GDELT's CAMEO taxonomy already codes "sign
agreement," "consult," and "engage in diplomatic cooperation" as distinct verb classes,
and `WorldEvent.sourceCategoryCode` already preserves the raw CAMEO code alongside the
coarse `category` bucket (spec 1 §3.5) specifically so a consumer like this one can refine
further without a Spine schema change. In practice this ships as a filtered, curated
sub-feed of `category: "diplomacy"` events with a CAMEO allowlist for treaty-shaped verb
codes, plus (once the format exists) a simple ratification-status annotation per treaty —
signed / ratified / pending — which the Ledger's `governance` field can absorb as new
`Indicator` keys per treaty (e.g., Paris Agreement ratification status per country) rather
than inventing a new object type for "a treaty."

- **Data source(s):** GDELT (already ingested, `redistribute-raw-ok`), no new source for
  v1; a curated ratification-status table (hand-maintained or scraped from the relevant
  depositary, e.g. UN Treaty Collection) is a v2 refinement, not required to ship the
  event-timeline view.
- **Spine schema:** `WorldEvent` (`category: "diplomacy"`), later `Indicator` (`field:
  "governance"`) for ratification-status keys.
- **Impact / Effort:** Medium / Low for the event-timeline slice; Medium for the
  ratification-status table if pursued.
- **Depends on:** spec 2 (Globe).

### 2.6 World Sources Explorer *(new, predicted by spec 1 §6)*

Spec 1 §6 already anticipated this: "\[spec 5\] likely reads `WorldSourceEntry`/
`WorldRegistry` for a Sources-explorer-style Atlas equivalent." khazana v1 has a Sources
page under the Feed (the registry Source Scout curates); Atlas's data sits behind an
exactly analogous registry (`data/world-sources.json`, §3.7 of spec 1) that currently has
no UI at all — every one of the ~15 hand-curated world sources, its `licenseTier`,
`cadenceLane`, `trustScore`, `failureCount`, and `lastFetchedAt`, is invisible to anyone
but the pipeline. This page makes Atlas's own methodology-transparency promise
self-referential: the same `Provenance.sourceId` a reader clicks on to ask "who says
this?" resolves to a real page describing that source's license tier, cadence, and
health — not just a name in a tooltip. Doubles as the operational dashboard for noticing
a source has silently failed (`failureCount` climbing) before a whole `Indicator` field
goes stale.

- **Data source(s):** none new — reads `data/world-sources.json` directly.
- **Spine schema:** `WorldSourceEntry` / `WorldRegistry`.
- **Impact / Effort:** Medium / Low — a registry-to-table render, plus (nice-to-have) a
  shared `<Methodology>` component that Globe/Bias Lab/Ledger can all link a `Provenance`
  into, per spec 1 §6's own note that spec 5 "likely" needs exactly this. See §4 below.
- **Depends on:** spec 1 (Spine) only — this can ship *before* the Globe/Bias Lab/Ledger
  UIs are even built, as a operational/methodology page, which makes it a genuine
  quick-win candidate for whoever wants to ship something Atlas-shaped first.

---

## 3. Wave v2 — needs one new source, or one new piece of cross-cutting logic

### 3.7 Contracts Explorer / "Money Map"

A deep OCDS procurement dashboard: buyer→supplier flow (rendered as a Sankey/flow
diagram, not a table), single-bidder-award and award-concentration red flags computed as
objective integrity proxies (what share of a buyer's awards went to their top supplier;
what share of tenders in a sector drew exactly one bidder) — the analytical layer the
Government Ledger's basic per-country procurement view (spec 4) doesn't attempt. Spec 1
§7 phase 1 already lands USAspending, TED, and native-OCDS feeds as comparators; India's
GeM/CPPP is explicitly phase 2 (needs a bespoke scraper + OCDS mapper, per spec 1 §3.6) —
this feature ships its flow-diagram + concentration-analytics UI against the phase-1
comparator data first, and gains India depth for free the day GeM/CPPP lands, with no UI
change required.

- **Data source(s):** USAspending, TED, native-OCDS (all `redistribute-raw-ok`, already
  Spine sources); India GeM/CPPP later, per spec 1's own phasing.
- **Spine schema:** `Contract`.
- **Impact / Effort:** High / Medium — the flow-diagram component and the concentration
  metrics (single-bidder rate, top-supplier-share) are new analytical work, not a reskin.
- **Depends on:** spec 4 (Government Ledger), which is the first consumer of `Contract`
  per spec 1 §6.

### 3.8 Press-Freedom & Censorship Layer

RSF's (Reporters Without Borders) Press Freedom Index and related censorship signals,
overlaid on both the Globe (country-level shading) and the Bias Lab (an outlet-level
"operates under X press-freedom regime" annotation next to its lean/reliability score).
This is the feature that makes the Bias Lab's outlet scores legible in context — an
outlet's apparent "neutral" tone reads differently once a reader knows its home country
ranks near the bottom of the press-freedom index.

- **Data source(s):** **RSF Press Freedom Index** — new `WorldSourceEntry`. It's a
  ranking/score product (like CPI and Freedom House, both already `derived-only` in spec
  1's list), not a raw microdata table, so it slots into the same tier by the same logic:
  khazana stores its own normalized figure, `origin: "computed"`, never RSF's raw
  ranking table verbatim.
- **Spine schema:** `Indicator` (new field, likely reusing `governance` rather than
  inventing a new one — RSF's index is conceptually adjacent to Freedom House, which
  already lives under `governance`) + `Outlet` (as a per-outlet annotation keyed by
  `Outlet.country`).
- **Impact / Effort:** High / Medium — one new fetcher, no new schema, but the
  cross-surface overlay (Globe *and* Bias Lab) is two integration points, not one.
- **Depends on:** spec 2 (Globe) for the country-shading overlay, spec 3 (Bias Lab) for
  the outlet-level annotation.

### 3.9 Blindspot Feed

Stories heavily under-covered by one side of the political spectrum — the Ground News
precedent, computed natively from khazana's own data rather than licensed from anyone.
Same-story clustering (already how the Globe groups `reportings[]` under one
`WorldEvent`) plus `Outlet.bias.lean` scores together yield a coverage-gap signal: for a
given event, bucket its `reportings[]` by the reporting outlets' `lean` sign, and surface
events where one bucket is empty or thin while the other is dense. This is explicitly a
**derived view over data both the Globe and the Bias Lab already produce** — no new
ingest, but real new computation (the coverage-gap detection itself), and it shares that
computation module with Same-Story Diff (§2.3) rather than reimplementing it.

- **Data source(s):** none new.
- **Spine schema:** `WorldEvent` (`reportings[]`), `Outlet` (`bias.lean`).
- **Impact / Effort:** High / Medium — no new fetcher, but the coverage-gap algorithm and
  its "how thin is thin" threshold tuning is genuine new logic, and it's the one feature
  in this backlog that's fully blocked on *both* other surfaces existing simultaneously
  (it needs the Globe's clustering *and* the Bias Lab's lean scores at once) — it cannot
  be built incrementally against just one of them the way most other entries can.
- **Depends on:** spec 2 (Globe) + spec 3 (Bias Lab), both required, not either/or.

### 3.10 Election & Opposition Tracker (global slice first)

Results, effective-number-of-parties, opposition strength, and seat-share swings —
globally via **ParlGov** (an academic dataset of party/election/government composition,
broad coverage, ships now), with India constituency-level drill-down deferred to the
Spine's own India-depth phase 2 (**Lok Dhaba**, already named in spec 1 §7 as a phase-2
source, not blocked on anything new this spec introduces). Shipping the global ParlGov
slice first means the Ledger's existing `elections` field (already in `INDICATOR_FIELDS`,
spec 1 §3.2 — no vocab change needed) gets populated broadly before India's harder,
constituency-grain depth lands.

- **Data source(s):** **ParlGov** — new `WorldSourceEntry`. Academic dataset, broad
  redistribution terms typical of this class of dataset; worth a license confirmation at
  implementation time (same hedge spec 1 §8 applied to its own reference-rater ToS
  question) before assuming `redistribute-raw-ok`. **Lok Dhaba** for India depth is
  already a named spec-1 phase-2 source, no new amendment needed there.
- **Spine schema:** `Indicator` (`field: "elections"`), `CountryProfile.subnational` for
  India's constituency grain once Lok Dhaba lands.
- **Impact / Effort:** Medium / Medium for the global slice (one new fetcher, existing
  field); the India depth piece inherits spec 1's own India-phase-2 effort, not new
  effort this spec adds.
- **Depends on:** spec 4 (Government Ledger); India depth additionally depends on the
  Spine's own phase-2 Lok Dhaba ingest landing (spec 1 §7).

### 3.11 Climate Commitments vs Reality *(new)*

Nationally Determined Contributions (NDC) under the Paris Agreement — each country's
*stated* emissions-reduction commitment — plotted against its *actual* emissions
trajectory (Our World in Data / Global Carbon Project series). The payoff is a data
narrative in the same shape as Country Trajectory (§2.1): "is this country on track for
its own stated target, and how uncertain is that read?" This is one of the more
editorially interesting extras — commitment-vs-reality gaps are exactly the kind of thing
a methodology-transparent surface is built to show without editorializing.

- **Data source(s):** **OWID CO2/emissions data** (CC-BY, `redistribute-raw-ok` — same
  amendment noted in §2.2 for the Macro Dashboard, shared source) + **UNFCCC NDC
  Registry** — the NDC registry itself is a set of public submission *documents*, not a
  clean tabular API, so extracting a structured "target: -45% by 2030 vs 2005 baseline"
  figure from each is inherently `origin: "computed"` (khazana parses/extracts it) even
  though the underlying document is public — mark this source `derived-only` on that
  basis, mirroring how spec 1 treats any source where khazana's own computation, not a
  raw passthrough, is what actually reaches the UI.
- **Spine schema:** `Indicator`. Likely needs a small vocab decision: reuse `macro` for
  the emissions-trajectory side and add the NDC-target figure as a second `Indicator` key
  under the same field, rather than adding a new `INDICATOR_FIELDS` entry — flag as an
  implementation-time call, same posture spec 1 took toward its own vocab additions.
- **Impact / Effort:** High / Medium — two new sources, one of which (NDC parsing) is
  genuinely fiddly (structured extraction from prose/PDF submissions, not a clean feed).
- **Depends on:** spec 4 (Government Ledger).

### 3.12 Sanctions Tracker *(new)*

Who is sanctioning whom, since when, and over what — OFAC's SDN list, the EU's
consolidated sanctions list, and the UN Security Council sanctions list, mapped as both
point-in-time `WorldEvent`s (a sanction imposed/lifted is an event with a `diplomacy` or
`conflict` category, a country pair, and a date) and a rolled-up `Indicator` (count of
active sanctions regimes per country, feeding the `governance` field alongside the Ledger's
existing corruption/governance metrics).

- **Data source(s):** **OFAC SDN list** (US federal government data, public domain →
  `redistribute-raw-ok`); **EU consolidated sanctions list** (EU open-data reuse terms,
  likely `redistribute-raw-ok`, worth a quick confirmation); **UN Security Council
  sanctions list** (UN materials sometimes carry more restrictive reuse terms than EU/US
  federal data — flag as a ToS check before assuming tier a, same posture as spec 1 §8's
  reference-rater ToS question). All three new `WorldSourceEntry`s.
- **Spine schema:** `WorldEvent` (imposition/lifting events) + `Indicator` (`field:
  "governance"`, active-sanctions-count per country).
- **Impact / Effort:** Medium / Medium — three new fetchers (three different list
  formats), but each is a straightforward structured/CSV-shaped government list, not a
  scrape.
- **Depends on:** spec 2 (Globe, for event display) + spec 4 (Ledger, for the rollup
  indicator).

### 3.13 Aid Flows Map (IATI) *(new)*

Foreign aid and development-assistance flows — donor country/agency → recipient
country/sector, amount, purpose — from the **International Aid Transparency Initiative
(IATI)** registry. This maps directly onto the existing `Contract` schema (donor as
`buyer`, recipient program/implementing org as `supplier`, `value`/`currency` as
published, `sector` as IATI's own sector-code free text per spec 1 §3.6's "free-text in
v1" allowance) rather than needing anything new — it's the same buyer→supplier flow shape
as procurement, just a different domain, and can literally reuse the Money Map's
(§3.7) Sankey-diagram component rather than building a second one.

- **Data source(s):** **IATI Registry** — published under the IATI Standard, generally
  open/CC-BY-equivalent → `redistribute-raw-ok`. New `WorldSourceEntry`, but zero schema
  work: it's a `WorldContractSource` exactly like USAspending/TED/OCDS.
- **Spine schema:** `Contract` (no schema change — a genuine "just add a fetcher" win).
- **Impact / Effort:** Medium / Medium — the fetcher and IATI's XML/JSON activity format
  take real mapping work, but the schema and (if §3.7 ships first) the UI are both reuse.
- **Depends on:** spec 4's `Contract`-consuming pattern (Government Ledger) and, for best
  effort economy, sequencing after §3.7 so the flow-diagram component already exists.

---

## 4. Wave v3 — stretch (India-depth-blocked, editorially sensitive, or needs new schema work)

### 4.14 Budget Explorer

Union, state, and ULB (urban local body) budget line-items for India, via **Open Budgets
India** — where does public money actually go, drillable from headline outlay down to
line item. This is explicitly gated on the Spine's own India-depth phase 2 (spec 1 §7:
"NITI SDG Index, RBI DBIE, Lok Dhaba, Open Budgets India... all have workable APIs/bulk
data — these are NOT the blocker" for the Spine itself, but they *are* sequenced after
comparators-first in spec 1's own phasing, so this Atlas feature inherits that same
sequencing rather than introducing new blockers). The UI itself — a waterfall/treemap
line-item drill-down — is also a genuinely new pattern, distinct from the Ledger's
cell-based indicator view.

- **Data source(s):** Open Budgets India (already a named spec-1 India-depth source,
  license tier per spec 1's own judgment, not reassessed here).
- **Spine schema:** `Indicator` (`field: "fiscal"`).
- **Impact / Effort:** Medium / High — no new source-acquisition risk, but a genuinely
  new drill-down UI pattern (treemap/waterfall) not shared with anything else in this
  backlog.
- **Depends on:** spec 4 (Government Ledger) + the Spine's own India-depth phase 2
  landing (spec 1 §7) — this is a downstream consumer, not a blocker on that phase.

### 4.15 Leader / Politician Profiles

Per-representative dossiers — criminal-case counts and asset declarations from
**MyNeta/ADR** (Association for Democratic Reforms, compiling public Election Commission
candidate affidavits), cross-referenced with **PRS Legislative Research**'s
attendance/bill-participation data, framed as data, responsibly. This is simultaneously
the highest-impact and highest-risk feature in the whole backlog: it's the closest thing
Atlas has to "here is a dossier on a named individual," and it must ship with the same
methodology-transparency discipline as everything else — every figure sourced, dated, and
never editorialized into a verdict — or it becomes a liability rather than an asset. It
should not ship without an explicit editorial-framing review pass (methodology note
visible on every profile: "these are public affidavit filings, not khazana's own
assessment"), separate from normal code review.

- **Data source(s):** **MyNeta/ADR** — ADR compiles public affidavits filed with India's
  Election Commission; the underlying facts are public record, but ADR's own compiled
  tables may carry their own reuse terms — treat cautiously (attribute to ADR, avoid
  bulk-redistributing their compiled dataset verbatim without checking their ToS, same
  posture as spec 1 §8's reference-rater-ToS hedge). **PRS Legislative Research** —
  similar India-public-interest-data caution. Both new `WorldSourceEntry`s, both
  provisionally `derived-only` pending a ToS read.
- **Spine schema:** `Indicator` (per-representative facts don't cleanly fit any existing
  key shape — likely needs a `subnational`-scoped `Indicator` keyed by constituency,
  reusing `CountryProfile.subnational`) + depends on the Election Tracker's (§3.10) India
  constituency mapping to resolve "which representative for which seat."
- **Impact / Effort:** High / High — two new India-specific fetchers, real editorial
  weight, and a dependency on the Election Tracker's constituency resolution already
  existing.
- **Depends on:** §3.10's India constituency depth + spec 4 (`CountryProfile.subnational`).

### 4.16 Who-Funds-Whom (think-tank / lobbying map) *(new — needs a schema pass first)*

Who funds which think tanks, who lobbies for what, rendered as a relationship graph
rather than a table — the one feature in this backlog that genuinely doesn't fit any of
the five existing Spine schemas. `Contract` almost works (it's a buyer→supplier flow) but
its semantics are procurement-specific (`method`, `status: planned|active|complete|
cancelled`) in ways that don't map onto "Foundation X gave $2M to Think Tank Y, who
testified in favor of Bill Z." This needs either a genuinely new schema (something like a
`FundingRelationship` — funder, recipient, amount, purpose, disclosure source) or a
deliberate decision to bend `Contract` semantics rather than add a sixth schema — either
way, that's a real design conversation, not a checkbox on this backlog. Free data is also
US-only in any buildable v1: **OpenSecrets** bulk data and **Senate LDA (Lobbying
Disclosure Act)** filings are both public-record/public-domain US sources, but there is no
equivalent clean global dataset for think-tank funding — this feature would ship US-only
or not at all in v1, which the founder should weigh against Atlas's global framing before
committing effort here.

- **Data source(s):** **OpenSecrets** bulk data (historically reusable with attribution,
  worth a current-ToS check) + **Senate LDA disclosures** (US government public record →
  `redistribute-raw-ok`). Global think-tank funding: no clean free source identified —
  this would need investigative-journalism-sourced data (patchy, license-uncertain) or
  stay US-only.
- **Spine schema:** **none of the existing five cleanly fit** — flagged explicitly per
  this spec's §0 hard rule 2. Needs its own schema-design pass before a build starts.
- **Impact / Effort:** Medium / High — the "medium" impact reflects the US-only v1
  ceiling; the "high" effort reflects both the missing schema and the harder-to-source
  global data.
- **Depends on:** a new schema decision (out of scope for this backlog spec) + likely
  reuses the Money Map's (§3.7) flow-diagram component once that schema exists.

---

## 5. Shared components worth building once, used by several extras

Four pieces of infrastructure pay for themselves more than once in this backlog — worth
naming explicitly so nobody rebuilds them per-feature:

- **A `<Methodology>` panel**, reading any `Provenance` and rendering
  `sourceId`/`sourceUrl`/`methodUrl`/`licenseTier`/`uncertainty` uniformly. Spec 1 §6
  predicted spec 5 would need exactly this ("a shared 'methodology' UI component reusable
  across Globe/Bias Lab/Ledger"); it's also what the World Sources Explorer (§2.6) links
  into from the other direction (source → every datum it produced).
- **A Sankey/flow-diagram component**, built once for the Contracts Explorer (§3.7),
  reused as-is by the Aid Flows Map (§3.13) and — if it ever ships — Who-Funds-Whom
  (§4.16). All three are the same buyer→recipient flow shape.
- **A coverage-gap / same-story computation module**, built once, consumed by both
  Same-Story Diff (§2.3) and the Blindspot Feed (§3.9) — they read the identical
  `reportings[]` + `Outlet.bias.lean` inputs, just render the output differently
  (side-by-side comparison vs. a "here's what's under-covered" feed).
- **A trajectory/small-multiples chart component**, built once for Country Trajectory
  (§2.1), reused by Climate Commitments vs Reality (§3.11) and (partially) the Macro
  Dashboard's (§2.2) comparison mode — all three are "value over `period`, with an
  uncertainty band, for a `key`" plotted against slightly different groupings.

---

## 6. Founder open questions

- **Which 2–3 extras ride along with the core three pages, not after?** Six features
  (§2.1–§2.6) are genuinely free the day specs 2–4 ship — no new fetcher, no new schema,
  pure new views. Shipping all six alongside the core pages costs little beyond UI time;
  shipping none of them leaves real value sitting in already-committed data unused. This
  spec's own lean, offered lightly: **Country Trajectory (§2.1) and World Sources
  Explorer (§2.6)** are the cheapest, highest-leverage pair — the first because it's the
  Ledger's own "why store every period" payoff finally paid out, the second because it's
  the one feature spec 1 itself already predicted this spec would need, and it can ship
  even before the Globe/Bias Lab/Ledger UIs exist. But the founder's actual reading
  habits (what gets dwelled on in the existing khazana v1 taste model) are a better signal
  than this spec's guess — worth checking against that before committing.
- **Blindspot Feed vs. Same-Story Diff — build both, or start with one?** They share a
  computation module (§5) but represent different reader intents (Same-Story Diff is
  "show me the divergence on a story I'm already reading"; Blindspot Feed is "surface a
  story I wouldn't have found because my side under-covered it"). Both are blocked on
  *both* other specs existing simultaneously (§3.9's note) — worth deciding whether that
  joint dependency makes them a natural v2-kickoff pair or whether one alone is enough
  signal to start.
- **Leader/Politician Profiles (§4.15) — build at all, or hold pending a framing review?**
  This is the one feature in the backlog whose risk profile (per-person data, criminal
  and financial records, India-specific political sensitivity) genuinely differs in kind
  from the rest, not just degree. Worth an explicit founder call on whether it belongs in
  Atlas's v1 conception at all, separate from its technical feasibility.
- **Who-Funds-Whom (§4.16) — worth a schema-design pass, or drop from the backlog
  entirely given the US-only data ceiling?** Global geopolitics/money-and-influence
  mapping is thematically strong for Atlas, but this is the one entry that can't ship
  against the existing Spine as-is; worth deciding whether it's worth a dedicated
  schema-design mini-spec before more effort goes into researching it further.
- **NDC parsing (§3.11) — hand-curate v1's target figures, or build the PDF/prose
  extraction pipeline immediately?** The commitment-vs-reality narrative is compelling
  with even a small, hand-entered set of major-emitter NDC targets; automating extraction
  from the full UNFCCC registry is real effort that could be deferred without blocking the
  feature's first ship.
