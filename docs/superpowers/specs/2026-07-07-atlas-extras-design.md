# Atlas — Extras (design spec)

> *khazana's second face is a Spine (schemas + ingest), a Globe (live events), a Bias Lab
> (outlet lean/reliability), and a Government Ledger — now a Country Report + Indicator
> Browser (spec 4, amended). Those are the core surfaces. This spec was written as the
> founder's own invitation taken literally — "then you can add more pages and more
> analysis how you want... go wild" — a ranked backlog of everything ELSE that turns Atlas
> from a handful of great pages into a complete world-intelligence surface. The 2026-07-07
> founder interview changed what "this spec" means: it is no longer a menu to pick from —
> it is a committed backlog with sequencing.*

**Status:** Proposed — spec 5 of 8 (Atlas: Spine → Globe → Bias Lab → Ledger → **Extras** →
Conflict Theaters → Government Structure → Two Faces)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — same binding constraint as every khazana spec. Every
feature below must be buildable on free data, free compute (GitHub Actions), and the
existing free Cloudflare Worker. None of them.

**Amended 2026-07-07 after founder interview** — see
`docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md` (D1–D12) for full authority.
Changes folded into this version:

- **Renumbered** spec 5 of 8, not 5 of 5 — the Atlas family grew three more specs (D5, D6,
  D11): Conflict Theaters, Government Structure, Two Faces.
- **Everything greenlit (D3).** Founder, verbatim: *"PUT EVERYTHING IN, IDC if it is 2000
  indicators, put in literally everything \[that\] can be found/calculated reliably."* All
  sixteen backlog entries below are committed. §0 reworked from "menu, nothing committed"
  to "committed backlog, wave = sequencing." §1 gains a Status column. §6 restructured into
  closed-by-founder-interview vs. still-open, matching the sibling specs' pattern.
- **Reconciled against spec 6 (Conflict Theaters).** #4 Conflict & Movements Tracker is
  recast as partially absorbed; #12 Sanctions Tracker and #5 Treaties layer gain
  cross-references.
- **Reconciled against the amended Ledger (spec 4).** #1 Country Trajectory is now shipped
  as a Report section, not a standalone page; #2 Macro Dashboard is repositioned alongside
  the new Indicator Browser; #14 Budget Explorer and #15 Leader Profiles are marked
  committed (still sequenced after India-depth data, but no longer conditional).
- **Source claims corrected against verified research** (`.superpowers/research/atlas/
  density-indicators.json`, `.superpowers/research/atlas/india-depth.json`) — RSF, ParlGov,
  MyNeta/ADR, PRS Legislative Research, OWID, and the UNFCCC NDC registry all get updated
  access/license/tier notes where the research dossiers found something this spec's
  original text got wrong or under-specified. Cited inline as "verified 2026-07-08
  research."
- **New §1a** (density follow-through, D3/D12): the verified research tranche of further
  world sources (OWID's full catalog, WHO GHO, ILOSTAT, FAOSTAT, Eurostat, EM-DAT, and
  others) that feed the Indicator Browser directly via the Spine's standing source
  mechanism, without needing their own backlog entries.

---

## 0. What this spec is, and how to use it

This was **written** as a menu — deliberately wider than what any one build cycle should
attempt, with §6 handing the founder a short list of open questions ("which 2–3 to
actually schedule after the core pages ship") because "go wild" originally read as an
instruction to generate options, not to greenlight all of them.

**The 2026-07-07 founder interview closed that question.** D3, verbatim: *"PUT EVERYTHING
IN, IDC if it is 2000 indicators, put in literally everything \[that\] can be found/
calculated reliably."* The founder's answer to "which 2–3" was all sixteen. The irony is
worth stating plainly, because pretending this document was always a committed backlog
would misrepresent how it got here: it argued with itself about scarcity, and scarcity
turned out not to be the constraint. What survives from the original menu framing is not
the menu itself — it's the **scoring** (Impact/Effort), the **schema mapping**, and the
**wave assignment** (v1/v2/v3), which now function as **sequencing guidance for a
committed backlog** rather than a selection mechanism for an optional one. "Wave v1" no
longer means "cheap enough to maybe do"; it means "build this first because it's free."
"Wave v3" no longer means "maybe, if there's appetite"; it means "build this once its
prerequisites land."

Sixteen features are described below, each scored, each mapped onto the Spine's five
schemas (`WorldEvent`, `Indicator`, `Contract`, `Outlet`, `CountryProfile`) and its two
license tiers (`redistribute-raw-ok`, `derived-only`), and each assigned a build wave that
now reads as build order. §1's table carries a Status column confirming all sixteen are
greenlit; §6 is restructured into *closed by the founder interview* vs. *still genuinely
open*, matching the pattern the sibling specs use for the same D-record.

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
  cross-cutting derivation logic, but reuses an existing schema), or v3 (blocked
  on the Spine's own India-depth phase, needs a new schema, or carries enough
  editorial-sensitivity weight to warrant its own review before building). Post-D3, wave
  is **sequencing, not a build/skip gate** — v3 entries are exactly as committed as v1
  entries, they simply have real prerequisites in front of them.
- **Status** (new, §1) — every entry is Greenlit (D3). Where D3's density mandate changed
  *how* an entry ships rather than *whether* — an entry absorbed into a sibling spec, or
  narrowed in scope by one — the Status column says so.

---

## 1. At a glance — the full backlog, ranked

| # | Feature | Schema(s) | New source? | Impact / Effort | Wave | Depends on | Status (D3) |
|---|---|---|---|---|---|---|---|
| 1 | Country Trajectory | `CountryProfile` | No | High / Low | v1 | Ledger (spec 4) | Greenlit — **absorbed** into the Country Report as a section (Ledger §4.1 step 4); standalone page is now optional v2 polish |
| 2 | Macro Dashboard | `Indicator` | No | High / Low | v1 | Ledger (spec 4) | Greenlit — complements the new Indicator Browser (Ledger §4a), doesn't duplicate it |
| 3 | Same-Story Diff | `WorldEvent`/`Reporting` | No | Medium / Low | v1 | Globe (2) + Bias Lab (3) | Greenlit |
| 4 | Conflict & Movements Tracker | `WorldEvent` | No | High / Low | v1 | Globe (spec 2) | Greenlit — **narrowed**: theater-grade depth is spec 6's; this stays the global non-theater slice |
| 5 | Treaties & Geopolitics Layer | `WorldEvent` | No (reuses GDELT) | Medium / Low | v1 | Globe (spec 2) | Greenlit — cross-refs spec 6 for ceasefire-type events in active theaters |
| 6 | World Sources Explorer | `WorldSourceEntry` | No | Medium / Low | v1 | Spine (spec 1) only | Greenlit |
| 7 | Contracts Explorer / "Money Map" | `Contract` | No | High / Medium | v2 | Ledger (spec 4) | Greenlit |
| 8 | Press-Freedom & Censorship Layer | `Indicator` + `Outlet` | Yes (RSF) | High / Medium | v2 | Globe (2) + Bias Lab (3) | Greenlit — RSF posture corrected to citation-only (verified 2026-07-08 research) |
| 9 | Blindspot Feed | `WorldEvent` + `Outlet` | No | High / Medium | v2 | Globe (2) + Bias Lab (3) | Greenlit |
| 10 | Election & Opposition Tracker (global slice) | `Indicator` | Yes (ParlGov) | Medium / Medium | v2 | Ledger (spec 4) | Greenlit — ParlGov coverage/license caveat (verified 2026-07-08 research) |
| 11 | Climate Commitments vs Reality | `Indicator` | Yes (OWID + NDC) | High / Medium | v2 | Ledger (spec 4) | Greenlit — NDC targets hand-curated v1 |
| 12 | Sanctions Tracker | `WorldEvent` + `Indicator` | Yes (OFAC/EU/UN) | Medium / Medium | v2 | Globe (2) + Ledger (4) | Greenlit — EU sanctions list cross-refs spec 6's state-affiliation triangulation |
| 13 | Aid Flows Map (IATI) | `Contract` | Yes (IATI) | Medium / Medium | v2 | Ledger (spec 4) §7 pattern | Greenlit — IATI not covered by the research dossiers, license claim unverified pending a dedicated pass |
| 14 | Budget Explorer | `Indicator` | No (needs India-depth data) | Medium / High | v3 | Ledger (4) + Spine India depth | Greenlit — was v3-conditional, now committed; still sequenced after India-depth data lands |
| 15 | Leader / Politician Profiles | `Indicator` + `CountryProfile` | Yes (MyNeta/ADR, PRS, SHRUG) | High / High | v3 | #10's India depth + Ledger (4) | Greenlit — framing-review requirement intact (D1); risk posture lowered by private-indefinitely audience |
| 16 | Who-Funds-Whom (think-tank/lobbying map) | **none fit** | Yes (OpenSecrets/LDA) | Medium / High | v3 | schema-design pass (prerequisite, not a question of whether — D3) | Greenlit |

---

## 1a. Density follow-through — further verified world sources (D3/D12)

D3's density mandate doesn't stop at these sixteen features. Verified 2026-07-08 research
(`.superpowers/research/atlas/density-indicators.json`, 29 sources checked for access
format and license) surfaced a further tranche of world-data sources that don't need their
own backlog entry — they don't power a new *feature*, they simply widen what the Spine
ingests, and they reach the reader through the Indicator Browser (Ledger §4a) and any
per-country Report section that already reads `Indicator[]` by field, via the Spine's
standing "how to add a source" mechanism (`CLAUDE.md`: new `WorldSourceEntry`, new fetcher,
register, test). No new schema, no new UI. The research's own top-line finding: **Our
World in Data (OWID) is the single highest-leverage add** — one API surface that itself
re-hosts or ETL-harmonizes several of the others below, roughly doubling khazana's
indicator surface (labour, food/ag, education, ICT, poverty, inequality, disaster risk,
energy, emissions, civic space) for close to zero additional legal exposure.

| Source | Tier | License (verified) | Note |
|---|---|---|---|
| Our World in Data (OWID) | `redistribute-raw-ok` | CC BY 4.0 for OWID-produced/harmonized data | Highest-leverage single add; re-hosted third-party series (WID, RSF, V-Dem, …) keep *their own* license — check the per-indicator sidecar, don't assume blanket CC BY |
| Eurostat | `redistribute-raw-ok` | CC BY 4.0 | REST/SDMX API |
| OECD SDMX | `redistribute-raw-ok` | CC BY 4.0 | "for any purpose, even for commercial" |
| FAOSTAT | `redistribute-raw-ok` | CC BY 4.0 | food/agriculture |
| ILOSTAT | `redistribute-raw-ok` | CC BY 4.0 (since May 2023) | labour |
| UNESCO UIS | `redistribute-raw-ok` | CC BY-SA 3.0 IGO | education; share-alike, no NC restriction |
| World Bank Global Findex | `redistribute-raw-ok` | CC BY 4.0 | financial inclusion |
| World Bank PIP (poverty/inequality) | `redistribute-raw-ok` | CC0 — even cleaner than WDI | replaces PovcalNet |
| INFORM Risk Index | `redistribute-raw-ok` | CC BY 4.0 | disaster/crisis risk composite |
| Ember | `redistribute-raw-ok` | CC BY 4.0 | electricity/energy transition |
| Global Carbon Project | `redistribute-raw-ok` | CC BY 4.0 | emissions, feeds §3.11 alongside OWID CO2 |
| CIVICUS Monitor | `redistribute-raw-ok` | CC BY-SA 4.0 | civic space rating |
| WHO Global Health Observatory | `derived-only` | CC BY-NC-SA 3.0 IGO | non-commercial clause — fine today (khazana is non-commercial), re-check before any future monetization, same posture as D1 |
| UN Comtrade | `derived-only` | Legacy agreement bans redistribution/republication without written UN permission | compute-and-cite only, 500 calls/day free tier, never republish record-level rows |
| Quality of Government (QoG) | *(discovery map only — do not ingest)* | Explicitly forbids redistribution of its compiled dataset | use to find primary sources, not as a source itself |
| RSF, Freedom House, BTI, Fragile States Index, Global Peace Index, GHS Index, Climate Action Tracker, EM-DAT | citation-pointer only | Mostly No-Derivs/NC score-products, licenses don't clear for ingestion or blending | store `(country, year, raw score)` + attribution, never blend into a khazana composite — RSF's own case is worked through in full in §3.8 |

WID.world and IRENA's data-specific licenses could not be located despite searching
(research dossier, verified) — treat both as `unclear` and verify before building a
fetcher, the same posture spec 1 §8 takes toward any source whose ToS couldn't be pinned
down. This table is intentionally a floor, not the full 29-source list the dossier
covers — implementation time is when the rest gets triaged against it.

---

## 2. Wave v1 — quick wins (ride specs 2–4's data for near-zero incremental ingest)

Every feature in this wave reads data that specs 2–4 are already committed to ingesting.
None needs a new `WorldSourceEntry`; each is a new Astro route + a new chart/derivation
over data already sitting in `data/world/`.

### 2.1 Country Trajectory — **shipped, absorbed into the Country Report**

**Status: this entry shipped as part of the Ledger's per-country Report, not as a
standalone page.** The amended Ledger spec (`2026-07-07-atlas-government-ledger-design.md`
§4.1 step 4, "Cross-field synthesis") embeds exactly the small-multiple sparkline-strip
component this section originally proposed, under the name "Country trajectory strip," and
cites this section as its component's original spec. Read the rest of this entry as the
component's design rationale, not as a description of a page that will exist separately —
a **dedicated, expanded-trajectory page remains an optional wave-2 polish item** (a deeper
per-key drill-down than the Report's summary strip affords) but is no longer the default
delivery vehicle.

One country's path across all ~200 indicators over time, as a data narrative rather than
a snapshot table: "is Country X's democracy backsliding, and how confident are we?" The
Government Ledger's per-country Report is inherently latest-value-forward at the section
level — the `RangePlot`/`DataTable` machinery in each field section (Ledger §4.2) shows
the current reading. Country Trajectory instead groups the *same* `Indicator` records by
`key` across all stored `period`s and renders small-multiple sparkline strips per field
(governance, corruption, fiscal, conflict, …), each strip annotated with its own
`uncertainty` band so "the CPI score dropped 4 points" reads differently when the
underlying source is a `standardError`-carrying WGI series vs. a bare `sampleSize` ACLED
count. This is the spec-1-predicted payoff of storing every `period`, not just latest —
the schema already supports this; the Report is where it now surfaces.

- **Data source(s):** none new — reads `Indicator[]` already committed under
  `data/world/indicators/<ISO3>/<field>.json` (private `khazana-world-data` repo per D2,
  checked out at build time — see the Ledger spec §2 for the mechanism) by the Ledger's
  own ingest.
- **Spine schema:** `CountryProfile` (build-time aggregation across periods), `Indicator`.
- **Impact / Effort:** High / Low — this is pure derived-view + charting work over data
  that already exists the day the Ledger ships. This is exactly why D4 absorbed it into
  the Report rather than leaving it a separate build: near-zero incremental cost either
  way, and one page is more legible than two.
- **Depends on:** the Ledger (spec 4) must retain historical periods per key (not just
  overwrite the latest value on each slow-lane run — the Ledger's §8.2 `normalize-scores`
  pass confirms this is honored for mode-2 keys specifically).

### 2.2 Macro Dashboard

A live-ish World Bank WDI / IMF SDMX / OWID indicator dashboard with a country-vs-country
comparison mode — pick two or three countries, one `macro` or `wellbeing` field, see the
trajectories overlaid. Where Country Trajectory (§2.1) is "one country, many fields," the
Macro Dashboard is "many countries, one field" — the complementary lens on the exact same
`Indicator[]` data.

**Relationship to the Indicator Browser (Ledger §4a, new under D3/D4) — avoid building the
same thing twice.** The Browser is a raw search/filter/facet grid over *everything*
ingested (curated and uncurated alike), with no opinion about which countries or keys
belong together — it's a lookup tool. The Macro Dashboard is the opposite shape: a small,
curated set of countries and one field, hand-picked for a specific comparison, rendered as
overlaid trajectories rather than a filterable table. Concretely: the Browser answers "what
data exists for X," the Dashboard answers "how do these three countries compare on Y, over
time." They share `Indicator[]` and the shared `normalizedScore` axis but not a UI pattern
or an entry point — a reader lands on the Dashboard from a curated comparison intent (likely
via the Ledger's `compare` tool, §5 there) and on the Browser from a lookup intent. Worth
sequencing the Dashboard after the Browser ships, since the Browser's `indicator-index.json`
(Ledger §4a.3) is a reusable building block for the Dashboard's own country/field picker.

- **Data source(s):** none new beyond what spec 4 already ingests (WDI, WGI, IMF SDMX are
  named in spec 1 §7 phase 1, all `redistribute-raw-ok`). **OWID** is referenced by the
  founder's own feature brief as a Macro Dashboard source and isn't in spec 1's originally
  named fifteen — a Spine amendment, confirmed by verified 2026-07-08 research
  (`.superpowers/research/atlas/density-indicators.json`): OWID's own compiled/harmonized
  data is CC BY 4.0 ("you have permission to use, reproduce, and distribute it, provided
  that you cite us") and slots in as `redistribute-raw-ok`, feeding the `macro`/`wellbeing`
  fields alongside WDI. One caveat the research surfaces that the original text didn't:
  OWID also *re-hosts* third-party series (WID, RSF, V-Dem, …) under those providers' own,
  often stricter licenses — the CC BY 4.0 grant covers OWID-produced/harmonized data only,
  not everything an OWID URL happens to serve, so each OWID-sourced key's fetcher must read
  the per-indicator source-license sidecar rather than assuming CC BY 4.0 blanket-wide.
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

### 2.4 Conflict & Movements Tracker — **largely absorbed by spec 6 (Conflict Theaters)**

**Reconciled against `2026-07-07-atlas-conflict-theaters-design.md` (spec 6, written after
this entry, per D6).** Spec 6 gives major active conflicts a dedicated, report-shaped
theater page — front lines, casualty ranges, displacement, discrete engagements,
world-impact proxies (spec 6 §5–§7) — plus a globe-wide conflict lens (spec 6 §8) that
strictly supersedes what this entry originally proposed for those conflicts: theater-grade
depth, honest uncertainty on casualties, and OSINT layers this entry never scoped. **What
this entry still owns:** the **global non-theater slice** — protest, unrest, and political
violence that never rises to "major active conflict" (a data artifact, a single protest
wave, a diplomatic row that never escalates) and therefore never earns a hand-curated
theater entry (spec 6 §2.1 explains why theater promotion stays a deliberate human act, not
an auto-detected threshold). This tracker is the lens a reader uses to scan *everything*
ACLED/UCDP/GDELT tag as conflict-adjacent, theater or not; spec 6's Globe conflict lens
(spec 6 §8) is the *escalated* view once an event actually belongs to a registered theater.
The two compose rather than compete: this tracker's timeline can link out to a theater page
wherever `membership.ts` (spec 6 §8) resolves an event into one, exactly the same handoff
spec 2's Globe already makes.

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
- **Impact / Effort:** High / Low — narrower than originally scoped now that spec 6 owns
  theater depth, but still real: most protest/unrest events globally never belong to a
  registered theater.
- **Depends on:** spec 2 (Globe) for `WorldEvent` ingest + map rendering; spec 6 (Conflict
  Theaters) for the theater-membership link-out, once an event resolves to one.

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

**Cross-reference to spec 6 (Conflict Theaters).** Ceasefires are the one treaty-shaped
event this layer would otherwise miss the context for: a ceasefire tied to an active
conflict is exactly the kind of "sign agreement" CAMEO code this layer's allowlist catches,
but its *meaning* is theater-scoped (which belligerents, which front). Where a ceasefire
event's geo/time resolves into an active theater (spec 6 §8's `membership.ts`), this
layer's rendering should link into that theater's page for the engagement-level context
rather than showing the ceasefire as an isolated diplomacy event — the same
event-to-theater handoff spec 2's Globe already makes. Ceasefires outside any registered
theater (a bilateral border-skirmish truce, say) stay this layer's own event, unlinked.

- **Data source(s):** GDELT (already ingested, `redistribute-raw-ok`), no new source for
  v1; a curated ratification-status table (hand-maintained or scraped from the relevant
  depositary, e.g. UN Treaty Collection) is a v2 refinement, not required to ship the
  event-timeline view.
- **Spine schema:** `WorldEvent` (`category: "diplomacy"`), later `Indicator` (`field:
  "governance"`) for ratification-status keys.
- **Impact / Effort:** Medium / Low for the event-timeline slice; Medium for the
  ratification-status table if pursued.
- **Depends on:** spec 2 (Globe); spec 6 (Conflict Theaters) for the ceasefire link-out.

### 2.6 World Sources Explorer *(new, predicted by spec 1 §6)*

Spec 1 §6 already anticipated this: "\[spec 5\] likely reads `WorldSourceEntry`/
`WorldRegistry` for a Sources-explorer-style Atlas equivalent." khazana v1 has a Sources
page under the Feed (the registry Source Scout curates); Atlas's data sits behind an
exactly analogous registry (`data/world-sources.json`, §3.7 of spec 1 — lives in the
private `khazana-world-data` repo per D2, checked out at build time like every other
`data/world/` path this spec references) that currently has no UI at all — every one of
the ~15 hand-curated world sources (now growing well past that per D3's density mandate,
§1a), its `licenseTier`,
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
  into, per spec 1 §6's own note that spec 5 "likely" needs exactly this. See §5 below.
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
GeM/CPPP was originally scoped as phase 2 (needs a bespoke scraper + OCDS mapper, per spec
1 §3.6) but D3 pulls it forward into the main build, sequenced after the comparator
sources land (Ledger §3.2/§6.1) — this feature ships its flow-diagram + concentration-
analytics UI against the comparator data first regardless, and gains India depth with no
UI change required once GeM/CPPP lands. Worth flagging plainly: verified 2026-07-08
research (`.superpowers/research/atlas/india-depth.json`) found GeM/CPPP is the single
most legally uncertain source in the India corpus — no official bulk API for either, ToS
unclear, and the `mcp-india-tenders` prior art (real, MIT-licensed, OCDS-normalized) proves
technical feasibility but its code license does not resolve the underlying tender data's
legal tier. "Sequenced into the main build" (D3) does not mean "the license question is
resolved" — the Ledger's own "not yet available" placeholder state (Ledger §3.2, §6.1)
stays load-bearing here too until that's settled, and a narrow, low-frequency derived
metric (e.g., state procurement volume by category, per the research's own suggestion) may
be the more defensible v1 than raw bid-level ingestion.

- **Data source(s):** USAspending, TED, native-OCDS (all `redistribute-raw-ok`, already
  Spine sources); India GeM/CPPP later, per the Ledger's own sequencing and legal caveat
  above.
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

- **Data source(s):** **RSF Press Freedom Index** — new `WorldSourceEntry`. Original text
  here assumed RSF slots into the same `derived-only` tier as CPI/Freedom House ("khazana
  stores its own normalized figure, `origin: 'computed'`"). **Corrected by verified
  2026-07-08 research** (`.superpowers/research/atlas/density-indicators.json`): RSF's
  license is **CC BY-ND** (Attribution–No Derivatives), which is *stricter* than plain
  `derived-only` — RSF's own terms state content "may not be modified, transformed, or
  adapted without explicit prior consent," which forbids not just raw redistribution but
  the rescaling/normalizing step `derived-only`'s "computed" origin assumes is always
  available. The correct posture is **citation-only**: store `(country, year, RSF's own
  raw score)` verbatim with direct RSF attribution, and do **not** feed it into
  `normalizedScore` or any khazana-computed composite — a No-Derivs source needs a third
  posture the Spine's two-tier model doesn't quite name (`derived-only` still implies
  khazana computes *something*); flag this as a small Spine-level nuance worth a one-line
  `Provenance` note ("citation-only, no derived figure") rather than a new licenseTier
  value outright, since RSF may be the only source that needs it.
- **Spine schema:** `Indicator` (new field, likely reusing `governance` rather than
  inventing a new one — RSF's index is conceptually adjacent to Freedom House, which
  already lives under `governance`, though its raw score renders as a citation pointer,
  not a `normalizedScore`-bearing figure, per the correction above) + `Outlet` (as a
  per-outlet annotation keyed by `Outlet.country`).
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
originally scoped globally via **ParlGov**, with India constituency-level drill-down via
**Lok Dhaba** (already named in spec 1 §7, not blocked on anything new this spec
introduces, and confirmed by verified 2026-07-08 research as a clean
`redistribute-raw-ok` source — TCPD states its data "can be freely downloaded and used for
any purpose"). Shipping the global slice first means the Ledger's existing `elections`
field (already in `INDICATOR_FIELDS`, spec 1 §3.2 — no vocab change needed) gets populated
broadly before India's harder, constituency-grain depth lands.

**ParlGov corrected by verified 2026-07-08 research** (`.superpowers/research/atlas/
gov-structure.json`, cross-referenced here since ParlGov surfaced there too): this entry's
"broad coverage, ships now" framing overstates it. ParlGov's actual coverage is **~50 EU/
OECD democracies only** — a useful cabinet-coalition-depth source for rich democracies, not
the "global slice" name implies — and its **license could not be confirmed**: the research
pass hit repeated fetch failures on ParlGov's Harvard Dataverse listing and found no
alternative documentation of its reuse terms. Two consequences: (1) rename the ambition
here from "global slice" to "OECD/EU comparator slice," and pair it with IPU Parline
(mentioned in the Government Structure research as a broader-coverage alternative for
basic election/party facts) for country coverage ParlGov doesn't reach; (2) treat
`redistribute-raw-ok` as **unconfirmed, not assumed** — this needs an actual successful
fetch of ParlGov's license page before ingestion, not the "worth a confirmation" hedge the
original text used, which reads more settled than the research found it to be.

- **Data source(s):** **ParlGov** — new `WorldSourceEntry`, scoped to ~50 EU/OECD
  democracies per the correction above, not global coverage. License tier genuinely
  unconfirmed — do not default to `redistribute-raw-ok` without a successful license-page
  fetch at implementation time. **IPU Parline** — new `WorldSourceEntry` candidate for the
  country coverage ParlGov's OECD/EU scope misses, surfaced by the Government Structure
  research as a broader (if shallower) alternative; worth evaluating alongside ParlGov
  rather than treating ParlGov as the only global-election source. **Lok Dhaba** for India
  depth is already a named spec-1 source, confirmed clean — per the amended Spine (§3.6),
  it's sequenced into the main build alongside the Spine's own ingest, not a deferred
  phase, so no new amendment needed there.
- **Spine schema:** `Indicator` (`field: "elections"`), `CountryProfile.subnational` for
  India's constituency grain once Lok Dhaba lands.
- **Impact / Effort:** Medium / Medium for the global slice (one new fetcher, existing
  field); the India depth piece inherits the Spine's own India-depth build effort, not new
  effort this spec adds.
- **Depends on:** spec 4 (Government Ledger); India depth additionally depends on the
  Spine's own Lok Dhaba ingest landing (spec 1 §7).

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
  raw passthrough, is what actually reaches the UI. **Confirmed by verified 2026-07-08
  research** (`.superpowers/research/atlas/density-indicators.json`): the official
  registry (unfccc.int/NDCREG) has no documented bulk API — browsable/RSS only — and its
  own reuse license is unstated; the only programmatic route is an unofficial community
  mirror (`openclimatedata/ndcs` on GitHub), whose code license doesn't extend to the
  underlying UNFCCC content and whose freshness needs a last-commit check before relying
  on it. This confirms the original text's caution and settles §6's open question in favor
  of the original lean: **hand-curate v1's target figures** (a small, high-value set of
  major-emitter NDC pledges, entered once and updated as the community mirror or official
  registry changes) rather than building a PDF/prose extraction pipeline against a source
  with no stable programmatic surface.
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

**Cross-reference to spec 6 (Conflict Theaters).** This entry's own EU consolidated
sanctions list is not just a Sanctions Tracker input — spec 6 §5/§9 independently names
**EU sanctions (EUR-Lex)** as one of three triangulation sources (alongside DOJ FARA and
Wikidata P127) for `OutletStateAffiliation`, the state-media labeling that drives wartime
editorial physics on theater pages and the escalated event card. The two features should
share one fetcher for the EU consolidated list rather than each maintaining an independent
one — this entry owns the country-pair sanctions-event/rollup use, spec 6 owns the
outlet-affiliation use, both read the same ingested `WorldSourceEntry`.

- **Data source(s):** **OFAC SDN list** (US federal government data, public domain →
  `redistribute-raw-ok`); **EU consolidated sanctions list** (EU open-data reuse terms,
  likely `redistribute-raw-ok`, worth a quick confirmation — shared fetcher with spec 6's
  state-affiliation triangulation, per the cross-reference above); **UN Security Council
  sanctions list** (UN materials sometimes carry more restrictive reuse terms than EU/US
  federal data — flag as a ToS check before assuming tier a, same posture as spec 1 §8's
  reference-rater ToS question). All three new `WorldSourceEntry`s.
- **Spine schema:** `WorldEvent` (imposition/lifting events) + `Indicator` (`field:
  "governance"`, active-sanctions-count per country).
- **Impact / Effort:** Medium / Medium — three new fetchers (three different list
  formats), but each is a straightforward structured/CSV-shaped government list, not a
  scrape; the EU list's fetcher cost is partly shared with spec 6.
- **Depends on:** spec 2 (Globe, for event display) + spec 4 (Ledger, for the rollup
  indicator); spec 6 (Conflict Theaters) for the shared EU-sanctions fetcher, if built
  jointly.

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
  work: it's a `WorldContractSource` exactly like USAspending/TED/OCDS. **Not covered by
  either research dossier** (`.superpowers/research/atlas/density-indicators.json` and
  `.superpowers/research/atlas/india-depth.json` skim neither IATI nor aid-flow data
  specifically) — the license claim above is this spec's original, unverified judgment,
  not a research-confirmed one; treat it as needing the same dedicated ToS check at
  implementation time that every other Spine amendment gets (§0 hard rule 1), rather than
  as more settled than it is.
- **Spine schema:** `Contract` (no schema change — a genuine "just add a fetcher" win).
- **Impact / Effort:** Medium / Medium — the fetcher and IATI's XML/JSON activity format
  take real mapping work, but the schema and (if §3.7 ships first) the UI are both reuse.
- **Depends on:** spec 4's `Contract`-consuming pattern (Government Ledger) and, for best
  effort economy, sequencing after §3.7 so the flow-diagram component already exists.

---

## 4. Wave v3 — committed, sequenced after India-depth data lands (formerly "stretch")

Everything in this wave is greenlit per D3, same as every other wave — "wave v3" is no
longer a hedge about whether these get built, only a statement that each has a real
prerequisite in front of it (India-depth data landing, a schema-design pass, or an
editorial-framing review) that v1/v2 entries don't carry.

### 4.14 Budget Explorer

Union, state, and ULB (urban local body) budget line-items for India, via **Open Budgets
India** — where does public money actually go, drillable from headline outlay down to
line item. This was originally gated on the Spine's own India-depth phase 2 (spec 1 §7:
"NITI SDG Index, RBI DBIE, Lok Dhaba, Open Budgets India... all have workable APIs/bulk
data — these are NOT the blocker" for the Spine itself, but they *were* sequenced after
comparators-first in spec 1's own phasing); D3 removes the phase framing but keeps the
sequencing — this Atlas feature is committed, waiting on the same India-depth data landing,
not waiting on a founder decision about whether to build it. The UI itself — a
waterfall/treemap line-item drill-down — is also a genuinely new pattern, distinct from
the Ledger's cell-based indicator view.

- **Data source(s):** Open Budgets India — **confirmed by verified 2026-07-08 research**
  (`.superpowers/research/atlas/india-depth.json`) as CC BY 4.0, `redistribute-raw-ok`,
  with a real documented API and CSV/Excel/PDF downloads; the CBGA/CivicDataLab
  machine-readable Union Budget pipeline specifically parses official Budget Day PDFs into
  clean data within ~24 hours, making it the recommended route over scraping
  indiabudget.gov.in directly. This strengthens, rather than reassesses, spec 1's original
  judgment.
- **Spine schema:** `Indicator` (`field: "fiscal"`).
- **Impact / Effort:** Medium / High — no new source-acquisition risk, but a genuinely
  new drill-down UI pattern (treemap/waterfall) not shared with anything else in this
  backlog.
- **Depends on:** spec 4 (Government Ledger) + the Spine's own India-depth data landing
  (spec 1 §7) — this is a downstream consumer, not a blocker on that build.

### 4.15 Leader / Politician Profiles

**Status: greenlit (D3) — build at all is closed; the framing-review requirement is not.**
D1 lowers the *risk posture* here (private-indefinitely audience, no public exposure until
a deliberate future toggle) but does not lower the *discipline* — D1 is explicit that the
balanced-framing contract stays fully binding "despite the private audience," and this is
the single feature in the whole backlog where that matters most.

Per-representative dossiers — criminal-case counts and asset declarations, cross-referenced
with legislative attendance/bill-participation data, framed as data, responsibly. This is
simultaneously the highest-impact and highest-risk feature in the whole backlog: it's the
closest thing Atlas has to "here is a dossier on a named individual," and it must ship with
the same methodology-transparency discipline as everything else — every figure sourced,
dated, and never editorialized into a verdict — or it becomes a liability rather than an
asset. It should not ship without an explicit editorial-framing review pass (methodology
note visible on every profile: "these are public affidavit filings, not khazana's own
assessment"), separate from normal code review — this requirement is unchanged by D1.

**Source picture corrected by verified 2026-07-08 research**
(`.superpowers/research/atlas/india-depth.json`). The original text treated MyNeta/ADR and
PRS Legislative Research as a matched pair, "both provisionally `derived-only` pending a
ToS read." The research found the two are not alike at all:

- **MyNeta/ADR** — no public bulk CSV/API (ADR reportedly offers one to media houses only,
  not publicly available); the public site is per-candidate HTML requiring enumeration
  (real scraping difficulty, no listing endpoint); its license is **disclaimer-only** ("in
  the public domain... ADR not responsible for misuse" — not an explicit reuse grant), with
  anecdotal signs the maintainers prefer the data stay on-platform. Genuinely `unclear`
  tier, and the harder of the two sources to build against.
- **PRS Legislative Research** — confirmed **CC BY 4.0** in the site footer, "the cleanest
  confirmed license in the entire legislative/political-data corner" of the dossier. This
  is a real upgrade from the original's shared "provisionally derived-only" framing — PRS
  should be treated as `redistribute-raw-ok`, not lumped with MyNeta's caution. It still
  needs a scraper (no bulk export exists), but the legal question is settled where MyNeta's
  isn't.
- **SHRUG** (Development Data Lab) — not named in the original text, but the research
  flags it as the actually-better historical source for exactly this feature's core claim:
  a village/town-level panel covering, among much else, politician asset/liability/
  criminal-charge data across all of India, 1990–2013 (elections to 2018). The research's
  explicit recommendation: "prefer SHRUG for historical coverage and use MyNeta only as a
  light supplement for the latest election cycle." **The catch:** SHRUG is CC BY-NC-SA
  4.0 — Non-Commercial — which the research flags as "the single biggest legal flag in the
  whole India research sweep," in direct tension with D1's public-ready-by-construction
  requirement if khazana is ever monetized. This needs an explicit founder/legal call
  before treating SHRUG as usable, same posture spec 1 took toward its own ambiguous-ToS
  sources — it should not be auto-ingested as `redistribute-raw-ok`, and if the founder
  declines it, the feature falls back to MyNeta-only for both historical and current
  coverage, with the scraping-difficulty cost that implies.

- **Data source(s):** **PRS Legislative Research** (`redistribute-raw-ok`, confirmed CC BY
  4.0, needs a scraper). **MyNeta/ADR** (`unclear` tier, disclaimer-only license, real
  scraping difficulty, use for the latest election cycle only per the research's own
  recommendation). **SHRUG** (candidate primary source for historical politician
  asset/criminal-charge data, 1990s–2018 — `unclear`/NC-gated pending an explicit founder
  call, not auto-ingestable). Three `WorldSourceEntry`s where the original named two, with
  three different tiers rather than one shared hedge.
- **Spine schema:** `Indicator` (per-representative facts don't cleanly fit any existing
  key shape — likely needs a `subnational`-scoped `Indicator` keyed by constituency,
  reusing `CountryProfile.subnational`) + depends on the Election Tracker's (§3.10) India
  constituency mapping to resolve "which representative for which seat."
- **Impact / Effort:** High / High — three India-specific fetchers now (not two), real
  editorial weight, a dependency on the Election Tracker's constituency resolution already
  existing, and one open licensing question (SHRUG) that needs a founder call before this
  feature's historical depth can be built as scoped.
- **Depends on:** §3.10's India constituency depth + spec 4 (`CountryProfile.subnational`)
  + a founder/legal call on SHRUG's NC clause before that source specifically is ingested.

### 4.16 Who-Funds-Whom (think-tank / lobbying map) *(new — the schema pass is a
prerequisite task, not an open question, per D3)*

**Status: greenlit (D3).** The founder-decisions record settles what §6 originally posed
as a question ("worth a schema-design pass, or drop from the backlog entirely?"): D3's
open-question ledger records this explicitly — "Who-Funds-Whom: schema pass worth it? →
D3 (yes — schema pass is a prerequisite task)." The US-only data ceiling described below is
unchanged and still real; it no longer gates *whether* this gets built, only *when* — after
the schema-design pass that's now a scheduled prerequisite, not a founder call still
pending.

Who funds which think tanks, who lobbies for what, rendered as a relationship graph
rather than a table — the one feature in this backlog that genuinely doesn't fit any of
the five existing Spine schemas. `Contract` almost works (it's a buyer→supplier flow) but
its semantics are procurement-specific (`method`, `status: planned|active|complete|
cancelled`) in ways that don't map onto "Foundation X gave $2M to Think Tank Y, who
testified in favor of Bill Z." This needs either a genuinely new schema (something like a
`FundingRelationship` — funder, recipient, amount, purpose, disclosure source) or a
deliberate decision to bend `Contract` semantics rather than add a sixth schema — either
way, that's a real design conversation, now a committed prerequisite task rather than a
checkbox on this backlog. Free data is also US-only in any buildable v1: **OpenSecrets**
bulk data and **Senate LDA (Lobbying Disclosure Act)** filings are both public-record/
public-domain US sources, but there is no equivalent clean global dataset for think-tank
funding — this feature ships US-only in v1; that ceiling is now a known, accepted scope
limit rather than a reason to reconsider building it at all.

- **Data source(s):** **OpenSecrets** bulk data (historically reusable with attribution,
  worth a current-ToS check) + **Senate LDA disclosures** (US government public record →
  `redistribute-raw-ok`). Neither is covered by the density or India-depth research
  dossiers — this spec's original judgment stands unverified pending a dedicated pass, same
  caveat as IATI (§3.13). Global think-tank funding: no clean free source identified — this
  would need investigative-journalism-sourced data (patchy, license-uncertain) or stay
  US-only.
- **Spine schema:** **none of the existing five cleanly fit** — flagged explicitly per
  this spec's §0 hard rule 2. Needs its own schema-design pass before a build starts — a
  scheduled prerequisite task (D3), not an open question of whether to do it.
- **Impact / Effort:** Medium / High — the "medium" impact reflects the accepted US-only v1
  ceiling; the "high" effort reflects both the missing schema and the harder-to-source
  global data.
- **Depends on:** the schema-design pass (prerequisite, scheduled per D3, not out of scope
  — see §6) + likely reuses the Money Map's (§3.7) flow-diagram component once that schema
  exists.

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
  reused as-is by the Aid Flows Map (§3.13) and, once its schema-design prerequisite lands
  (§4.16), Who-Funds-Whom. All three are the same buyer→recipient flow shape.
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

**Closed by the founder-decisions record** (`2026-07-07-atlas-founder-decisions.md`):

- **Which 2–3 extras ride along with the core pages, not after?** Closed by D3: all
  sixteen are greenlit, not a 2–3 pick. The original question's underlying concern —
  sequencing — survives as the wave assignments (§1, §1a) and each entry's own
  "Depends on" line; six features (§2.1–§2.6) remain the ones with near-zero incremental
  cost the day specs 2–4 ship, so they're still first in line, just no longer the *only*
  ones scheduled.
- **Blindspot Feed vs. Same-Story Diff — build both, or start with one?** Closed by D3:
  both. They share a computation module (§5) and represent genuinely different reader
  intents (Same-Story Diff is "show me the divergence on a story I'm already reading";
  Blindspot Feed is "surface a story I wouldn't have found because my side under-covered
  it") — worth keeping in sequence rather than parallel, since both are blocked on *both*
  other specs existing simultaneously (§3.9's note), which makes them a natural
  v2-kickoff pair once the Globe and Bias Lab are both live.
- **Leader/Politician Profiles (§4.15) — build at all, or hold pending a framing review?**
  Closed by D3: build it. D1 additionally lowers this feature's risk profile specifically
  (private-indefinitely audience, no public exposure absent a deliberate future toggle) —
  but D1 is explicit that the framing-review requirement stays fully binding regardless.
  What was an open "build at all?" question is now a closed "build it, with the review
  gate intact" instruction (§4.15).
- **Who-Funds-Whom (§4.16) — worth a schema-design pass, or drop from the backlog
  entirely given the US-only data ceiling?** Closed by D3, recorded in its own
  open-question ledger entry: "yes — schema pass is a prerequisite task." The US-only
  ceiling is an accepted scope limit, not a reason to reconsider.

**Still genuinely open** (implementation-time, not vision-level):

- **The Who-Funds-Whom schema-design pass itself.** D3 settles *whether* (yes), not *how*
  — the actual `FundingRelationship`-vs-bend-`Contract` decision (§4.16) is real design
  work still to be done, scheduled as a prerequisite rather than resolved here.
- **NDC parsing (§3.11) — hand-curate v1's target figures, or build the PDF/prose
  extraction pipeline immediately?** Recommended, not mandated: **hand-curate v1**, per
  the original lean and now reinforced by verified 2026-07-08 research (§3.11) — the
  official UNFCCC registry has no documented bulk API, so a small, high-value hand-entered
  set of major-emitter targets is the honest first ship; automating extraction from the
  full registry (or leaning further on the unofficial `openclimatedata/ndcs` mirror) stays
  a later refinement, not a blocker.
- **SHRUG's Non-Commercial clause (§4.15).** Not closed by D3 — D3 greenlit Leader
  Profiles as a feature, but didn't adjudicate this specific source's license tension with
  D1's public-ready-by-construction requirement. Needs an explicit founder/legal call
  before SHRUG is ingested; MyNeta-only is the fallback if the founder declines it.
- **ParlGov's actual license (§3.10).** Not closed — the research pass couldn't confirm
  it (repeated fetch failures on ParlGov's Harvard Dataverse listing). Needs a fresh
  attempt at implementation time before any ParlGov data is ingested as
  `redistribute-raw-ok`.
