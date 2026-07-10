# Atlas — Founder Interview Decisions (2026-07-07)

> The binding decision record from the founder interview held after the five Atlas specs
> (`2026-07-07-{world-data-spine,atlas-globe,atlas-bias-lab,atlas-government-ledger,atlas-extras}-design.md`)
> were written. **Every amendment to those specs, and both new specs (Conflict Theaters,
> Government Structure), cites this document as its authority.** Where this record
> contradicts a spec's original text, this record wins.

**Status:** Binding — founder-confirmed via structured interview
**Date:** 2026-07-07
**Participants:** Arnav (founder) + Claude (cofounder)

---

## D1. Audience: private indefinitely, public-ready by construction

Atlas is for the founder alone, indefinitely, behind the existing site gate. However, the
founder "would not mind hosting it as well" later — so the system must be built so that
going public is a **repo-visibility toggle, not a rebuild or a data audit**. Concretely:
the Spine's license-tier enforcement (`derived-only` vs `redistribute-raw-ok`), the
balanced-not-accusatory framing contract (Ledger §7), and the attribution-only handling of
reference raters all remain **fully binding** despite the private audience.

## D2. Private world-data repo

World data moves out of the public `aether-auto/khazana` repo into a **new private repo**
(working name `khazana-world-data`). Rationale (founder-confirmed): the site gate protects
the site, not the data — everything committed to the public repo is world-readable
regardless. Chosen over encrypted-in-public-repo and over making everything private.

Architecture consequences (Spine amendment):

- `data/world/`, `data/world-sources.json`, and all Bias-Lab/theater derived layers live
  in the private repo.
- The public repo's Actions read it at build time via a repo-scoped fine-grained token
  (or GitHub App installation token) held as an Actions secret.
- The fast lane's ~20-minute commits land in the private repo — which also solves a
  problem the original spec missed: 20-minute-cadence commits would have bloated the
  public repo's git history badly.
- Private repos get 2,000 free Actions minutes/month — **not enough for a 20-minute fast
  lane**, so world-ingest workflows keep running in the PUBLIC repo (unlimited minutes)
  and push their outputs to the private repo via the token. Compute lives public;
  data lives private.
- The Worker KV mirror (`/world/latest`) is unchanged — it already carries only the small
  rollup, and the site is gated anyway.
- Going public later = flip the private repo public (its license discipline already
  guarantees everything in it is legally redistributable per its tier).

## D3. Density mandate: "put in literally everything"

Founder, verbatim: *"PUT EVERYTHING IN, IDC if it is 2000 indicators, put in literally
everything [that] can be found/calculated reliably."* And: the goal is *"the most densely
packed app"* — Claude has **complete control** to add, restructure, and extend the plans.

Consequences:

- The Ledger's 52-key catalog is a **curated spine, not a ceiling**. Ingest is open-ended:
  every reliable source/key we can find gets ingested (full WDI/V-Dem/OWID catalogs, not
  hand-picked subsets).
- **All 16 Extras are greenlit**, including the four flagged-sensitive/expensive ones:
  Leader/Politician Profiles (private audience lowers the risk profile; framing discipline
  stays), Who-Funds-Whom (still requires its schema-design pass first — the one honest
  blocker), Budget Explorer, and the **India GeM/CPPP scraper pulled forward** into the
  main build rather than phase 2.
- A new **Indicator Browser** surface absorbs the density (see D4).

## D4. The Ledger becomes a Country Report (+ Indicator Browser)

Founder, verbatim: *"not just a ledger, it needs to be a report with charts, views,
interactive flows, etc, and numbers."*

- Each per-country page is a **data-driven report**: charts, interactive flows,
  distribution views, structure diagrams (D5), and numbers — not a table page.
- **Zero AI prose, fully deterministic** (founder-selected): the report is rebuilt by
  Actions on every data refresh; all copy is templated micro-copy
  ("GDP growth: 6.2% · 74th percentile among 43 tracked"). No LLM anywhere in the
  world-data path. Never stale, never hallucinated.
- The curated ~50–100 key report stays legible and opinionated; the **Indicator Browser**
  is a separate search/filter/facet surface over EVERYTHING ingested (thousands of keys ×
  countries × periods), every cell still carrying provenance + uncertainty.

## D5. New feature: Government Structure diagrams (new spec)

Founder: India is *"just a starting point"* — expand to more countries, and *"if we can
explain how each government is structured we can start adding those in."* Method
(founder-selected): **data-driven only** — *"rendered as some type of flow diagram...
that shows the structure, division of power, etc pulled from real datasets instead of
using AI."*

- Per-country interactive structure/power-flow diagrams: system type, branches, chambers,
  federal levels, appointment/accountability flows, term lengths.
- Candidate dataset spine (to be validated in the new spec): Comparative Constitutions
  Project, World Bank Database of Political Institutions (DPI), V-Dem institutional
  variables, ParlGov, IDEA.
- This is also the **country-expansion mechanism**: onboarding a new country to Atlas
  starts with its structure page.
- Gets its own design spec: `2026-07-07-atlas-government-structure-design.md`.

## D6. New surface: Conflict Theaters (new spec) — "war has a different mode"

Founder selected **all four** proposed war-mode elements plus more: *"also add troop
movements, impact on the world, active engagements, etc — everything that can be found;
there are a lot of open-source projects that seem to have some of this data."*

1. **Dedicated conflict theater pages** — one persistent page per major active conflict:
   front-line/control-area layers, casualty time series with uncertainty (UCDP/ACLED),
   displacement (UNHCR/HDX), event timeline, full multi-outlet coverage spread, troop
   movements and active engagements where OSINT data exists, world-impact indicators.
2. **Globe-wide conflict lens** — a mode toggle: conflict events become the primary
   layer, severity drives intensity, everything else recedes.
3. **Escalated event cards** — conflict-category events get a richer card: casualty
   figures with source disagreement shown, belligerents, claim-vs-claim from opposing
   sides' outlets.
4. **Different editorial physics** — in wartime, propaganda is the norm: corroboration
   weighted toward claims **opposing sides both confirm**; single-sourced claims
   skeptical by default; state-affiliated outlets explicitly labeled.

**OSINT ingestion posture (founder-selected): best-effort, source-flagged.** Ingest what
each OSINT project legitimately allows (e.g. DeepState publishes open GeoJSON; ISW/CTP
maps are citable), flag each layer's provenance + reliability prominently, accept that
some layers update irregularly or die. Density-first, honesty-labeled.

Gets its own design spec: `2026-07-07-atlas-conflict-theaters-design.md`.

## D7. Event card: spectrum + corroborated core (resolves Globe spec §12's biggest open)

- The card shows a **spectrum-diverse top-N** (~7) of `reportings[]` — picked to maximize
  stance/frame/lean spread, not recency or trust alone.
- It leads with a **"corroborated core"** line: the claims that X of Y outlets *across
  the spectrum* mutually confirm, labeled as measured agreement ("corroborated by 9 of 12
  outlets") — **khazana never asserts truth**, it surfaces agreement. Fact-check badges
  where ClaimReview matches exist. (Founder rejected a synthesized "truth-o-meter".)
- The full unabridged reporting list stays on the Bias Lab story page (spec 3 §8.4).
- Conflict-category events swap to the escalated card (D6.3).

## D8. Bias Lab outlet seed: global majors + deep India set

~30–50 global wire/major outlets (Reuters, AP, BBC, NYT, Guardian, Al Jazeera, …) PLUS a
deep India set (The Hindu, Times of India, Indian Express, NDTV, Republic, WION, OpIndia,
The Wire, Scroll, …). India outlet bias is poorly covered by AllSides/AdFontes/MBFC, so
khazana's own computed scores add the most value exactly there.

## D9. Calls delegated to Claude (founder granted complete control)

Made and recorded here so they're auditable:

- **Reference raters render default-visible** (transparency is the product; audience is
  the founder).
- **Ingest every country the sources cover** from day one; curation effort goes into
  report polish for India + a starter comparator set, not into limiting ingestion.
- **Build order:** Spine + fast-lane ingestion first, **headless, before any UI** — the
  `reportings[]` corpus and time-series depth are time-gated assets that only accumulate
  while the pipeline runs. Then: Globe → Country Reports → Bias Lab → Conflict Theaters,
  with the six v1 extras riding along their parent surfaces.
- Founder explicitly authorized restructuring anything in the original five specs where
  a better design exists ("feel free to completely change everything in the plan").

## D10. v1 relation: separate faces, as specced

Atlas and Feed/Reads share Shell chrome, design tokens, and the deploy pipeline — not
data. (Founder-selected, unchanged from the original specs.)

## D11. Two facets, two feels, one designed transition (added later same-day)

Founder, verbatim: *"the idea is that khazana has two main facets, each feels different
and there is a transition when you switch."* This sharpens D10: the faces share the
design **system** (tokens, type, motion doctrine) but each carries its **own atmosphere**
— the personal face (Feed/Reads/Workshop) and Atlas must be recognizably different worlds,
and switching between them is a **designed signature transition**, not a nav click. This
partially supersedes the original specs' "shares the Shell chrome" phrasing: shared bones,
distinct skin. Gets its own design spec: `2026-07-07-khazana-two-faces-design.md`
(spec 8 — face identities + the switch transition + Atlas's top-level IA, which the Globe
spec had explicitly left unowned).

## D12. Full autonomy, research-grounded expansion, model policy (added later same-day)

Founder invoked ultracode: full autonomy to improve and expand the Atlas plan using
internet research — *"add as much as you want."* Every added source/feature must be
research-verified (access, format, license → tier, cadence) before it enters a spec, per
the reliability clause in D3. Model policy for the work itself: **Sonnet 5 for
subagents; Opus only for complex work** (deep synthesis / the new-spec writing).

---

## Open-question ledger — what this record closes

| Original open question | Where | Closed by |
|---|---|---|
| How many reportings on the event card | Globe §12 | D7 |
| Default framing / India bias | Globe §12 | D9 (India-forward defaults; exact phi/theta still implementation-time) |
| Reference raters default vs opt-in | Bias Lab §12 | D9 |
| Which outlets to seed | Bias Lab §12 | D8 |
| Comparator country set for launch | Ledger §12 | D9 (ingest everything; polish India-first) |
| GeM/CPPP scraper timing | Spine §8 / Ledger §12 | D3 (pulled forward) |
| Which extras ride along | Extras §6 | D3 (all of them) |
| Leader Profiles: build at all? | Extras §6 | D3 (yes; framing discipline binding) |
| Who-Funds-Whom: schema pass worth it? | Extras §6 | D3 (yes — schema pass is a prerequisite task) |
| Fast-lane retention/repo-size trade | Spine §8 | D2 (private repo removes the public-history constraint; window still tunable) |

Still genuinely open (implementation-time, not vision-level): exact fast-lane frequency vs
GDELT limits, NLI pairwise cap + clustering threshold (Bias Lab §12, resolve jointly),
Wordfish refit cadence, India-states TopoJSON asset, NDC parsing (hand-curate v1 first),
Who-Funds-Whom schema design, `SubnationalRef` parent convention (Ledger §6.2 —
defaulting to option (a), code-namespacing).
