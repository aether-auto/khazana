# Atlas — Government Structure (design spec)

> *Per-country, interactive **structure & power-flow diagrams** — system type, branches,
> chambers, federal tiers, and the appointment/accountability flows that bind them —
> assembled 100% from real datasets, with zero AI-generated content. The same visual
> grammar renders every country, so India and Germany read as one system family. This is
> both a standalone Atlas surface (structure pages + a compare-systems view) and the
> embedded "Structure" section that leads every Government Ledger country report. It is,
> deliberately, khazana's **country-expansion mechanism**: onboarding a new country to
> Atlas starts here.*

**Status:** Proposed — spec 7 of 8 (Atlas: Spine → Globe → Bias Lab → Ledger → Extras →
Conflict Theaters → **Government Structure** → Two Faces)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — same binding constraint as all of khazana. No paid APIs, no
paid hosting, no always-on machine beyond the existing free Cloudflare Worker.

**This spec exists because of D5 and D12.** It is one of the two new specs the
2026-07-07 founder interview commissioned (`docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md`,
the binding decision record — every D-number below cites it). Founder, verbatim: the
method is *"rendered as some type of flow diagram... that shows the structure, division of
power, etc pulled from real datasets instead of using AI"* (D5), and *"if we can explain
how each government is structured we can start adding those in as well"* — India is the
starting point because the founder knows the Indian union best, and each new country's
structure page is the first thing built when Atlas expands to it. D12 (full autonomy,
research-grounded expansion) is why every source below is drawn from a verified research
dossier, not invented.

**Depends on:** `docs/superpowers/specs/2026-07-07-world-data-spine-design.md` (spec 1) —
this spec adds one new flat core file, `packages/core/src/world-government.ts`, registered
by the amended Spine §3.0/§6, and its sources register as `WorldSourceEntry` rows carrying
`Provenance` like every other world datum. All data lives in the private
`khazana-world-data` repo (D2). **Consumed by:** the amended Government Ledger
(`docs/superpowers/specs/2026-07-07-atlas-government-ledger-design.md`, spec 4) — its
per-country report embeds this spec's `GovernmentStructure` view as its "Structure" section
(Ledger §4.1 step 2, amended per D4): this spec owns the data + rendering in full, the
Ledger owns only the placement.

---

## 0. What this is, and the one hard constraint that shapes everything

A `GovernmentStructure` is a per-country, machine-assembled answer to *"how is this country
governed — who holds which power, and who can check whom."* It carries:

- **System type** — parliamentary / presidential / semi-presidential / constitutional- or
  absolute-monarchy / one-party / military-junta / directorial / provisional / other.
- **Executive** — head of state vs head of government (and whether they are one person),
  each with a selection method.
- **Chambers** — for each legislative chamber: name, seat count, term length, selection
  method, electoral-system family.
- **Judiciary** — apex court, whether judicial review of legislation exists, appointment
  method.
- **Federal tiers** — union / state / local where applicable, with unit counts and a
  self-rule signal for federations.
- **Power-flow edges** — the directed relations that actually bind those institutions:
  *appoints, dismisses, confirms, dissolves, vetoes, reviews, elects, holds-confidence-of* —
  each with a constitutional-basis citation where the source data provides one.

**The one hard constraint (D4/D5): zero AI-generated content, 100% data-driven.** No LLM
writes, summarizes, or paraphrases anywhere between a source dataset and the rendered
diagram — exactly the discipline the Spine mandates for the whole world-data path (spec 1
§1 decision 7). Every label is either a value pulled from a real dataset or a templated
micro-label ("Lower house · 543 seats · 5-year term · first-past-the-post"). This is the
constraint that makes the whole feature legible as *fact* rather than *narrative*, and it
is what §2's biggest architectural finding is a response to.

**One clarification this constraint forces, up front.** "Data-driven, no AI" does **not**
mean "a dataset hands us a finished diagram" — §2 shows none does. It means the two
artifacts that *are* hand-authored — the ~14 **archetype flow templates** (§4.2) and the
templated micro-copy — are deterministic engineering artifacts written once by a human,
exactly like the per-format MDX templates already in `apps/site/src/formats/` and the
Ledger's templated micro-copy (Ledger §1 decision 7). They are not generated, not
per-country, and not prose. Every per-country *value* that fills them is pulled from a real
dataset. This distinction is load-bearing and is stated honestly wherever it matters below.

---

## 1. Binding decisions (settled)

1. **100% data-driven, zero AI (D4/D5).** Restated as decision 1 because it constrains every
   section. The only hand-authored artifacts are the archetype templates (§4.2) and
   templated micro-copy — deterministic, reviewable, not generated.
2. **One visual grammar for every country (D5 — the expansion mechanism).** India and
   Germany must render through the *same* auto-layout so they read as one system family.
   This rules out hand-placed, per-country diagrams (which is exactly what the existing
   `<Diagram>` component is for — §4.1) and forces a data-driven layout. Comparability is
   not a nice-to-have; it is the property that makes "add a country" a repeatable pipeline
   stage rather than a bespoke design job.
3. **Provenance is per-field-group, not per-page (spec 1 §3.1 applied honestly).** Multiple
   sources feed one country's record — IPU Parline for chambers, DPI+V-Dem for system type,
   CCP for accountability flows, SNG-WOFI for federal tiers. So `Provenance` is embedded on
   each sub-block (executive, each chamber, judiciary, each federal tier, each edge), never
   once at the top. A country's structure page is a mosaic of independently-sourced,
   independently-datable facts — the same "each cell can be individually distrusted" ethos
   the Ledger applies to indicators (Ledger §1 decision 1).
4. **Sources disagree; the schema records precedence + a divergence flag, never silently
   picks (§3.4).** When IPU Parline and Factbook report different seat counts, or DPI and
   V-Dem classify the system type differently, the record carries the winning value *and* a
   `divergence` note naming who disagreed and by how much — mirroring the Ledger's
   multi-method "disagreement is the honest thing to show" doctrine (Ledger §0).
5. **A country gets a structure page only when it clears a completeness gate (§5).** Partial
   data renders an explicit *"structure not yet assembled — N of M field-groups sourced"*
   state, never a silent gap. This is the D5 expansion mechanism's quality bar: a country
   appears in Atlas's structure surface when its `GovernmentStructure` is real, not when a
   placeholder exists.
6. **Private-indefinitely, public-ready by construction (D1/D2).** All government data lives
   in the private `khazana-world-data` repo; every source's `licenseTier` is enforced by the
   Spine's `Provenance` `superRefine` (spec 1 §3.1) exactly as for indicators. Going public
   later is a repo-visibility flip, not a data audit.

---

## 2. The dataset spine — and the finding that shapes the whole architecture

**The single biggest architectural finding, straight from the research dossier
(`.superpowers/research/atlas/gov-structure.json`): no dataset hands you a pre-built
power-flow graph.** The field splits into (a) broad-coverage entity spines that are cheap
to license but uneven in depth, (b) academic classifiers frozen at various past cutoffs
that encode real structural variables but lack clean machine-readable licenses, and (c) a
few genuinely live sources that fix the freshness the academic datasets can't. The realistic
minimal combination is therefore **three layers working together**:

1. **A system-type classifier** — DPI + V-Dem + Wikidata's form-of-government property,
   cross-validated (§3.4).
2. **A small library of hand-authored archetype flow templates** — ~14 templates (Westminster
   parliamentary, US-style presidential, French-style semi-presidential, Swiss collegial,
   one-party, constitutional/absolute monarchy, military junta, …) built once, covering
   ~all countries (§4.2). *This is the deterministic engineering artifact, not AI.*
3. **Per-country parameters** — chamber sizes, term lengths, electoral-system family, federal
   tiers — pulled from the live/authoritative sources to instantiate the right archetype.

### 2.1 Source catalog (from the dossier — do not contradict its license findings)

| Source | Feeds which field-group | Access / format | Tier | Cadence | Caveat |
|---|---|---|---|---|---|
| **Wikidata SPARQL** (P122 form-of-gov, P194 legislature, P1342 seats, P6/P35 offices) | entity spine + system-type tiebreak; near-universal incl. contested entities | Free SPARQL endpoint, JSON; 60s timeout, rate-limited | **redistribute-raw-ok** (CC0) | continuous, crowd-edited | completeness varies — a fallback-fillable layer, never sole source |
| **CIA World Factbook JSON archive** (factbook/factbook.json) | broadest entity list (266); free-text gov-type/exec/legis/judicial baseline | GitHub raw fetch, JSON, no key | **redistribute-raw-ok** (CC0 / US-gov work) | **FROZEN** (CIA discontinued Feb 4 2026) | dated baseline; regime changes after early-2026 need manual/REIGN patch; free text needs parsing |
| **IPU Parline** (2024 API) | **the live chamber layer**: chamber names, seat counts, electoral system per chamber, term lengths; 193 states × 270+ chambers | REST/JSON, OpenAPI | **unclear** → treat derived-only pending CC-variant confirmation | continuously updated | the freshness fix every frozen academic set lacks; confirm exact CC variant before raw redistribution |
| **DPI 2020** (World Bank Data Catalog mirror) | **primary system-type classifier**: presidential/parliamentary/assembly-elected, federal dummy, bicameral flag, checks-and-balances | Excel/Stata download | **redistribute-raw-ok** (CC BY 4.0) | frozen at 2020 | misses every post-2020 regime change — patch from REIGN/Wikidata |
| **V-Dem** (v2xnp_pres, HOS/HOG power vars, bicameralism) | validates DPI's classification; de-facto power balance | CSV/Stata; `vdemdata` R pkg | **derived-only** (no formal license, "free to use + cite") | annual | store normalized/derived + citation; never raw dump |
| **CCP — Characteristics of National Constitutions v5.0** | **the appointment/accountability-flow layer**: PM investiture, confidence-vote mechanics, judicial-appointment + judicial-review provisions | ZIP download | **derived-only** (no explicit license found) | through 2025 | the best proxy for "who appoints/dismisses whom, how confidence is tested"; compute our own flags, don't republish raw table |
| **OECD/UCLG SNG-WOFI** | **federal tiers**: federal-vs-unitary + number/type of subnational tiers, 135 countries | country profiles (web/PDF) | **unclear** → derived-only | triennial (2022) | preferred over RAI for coverage breadth |
| **Regional Authority Index (RAI)** | federal self-rule/shared-rule depth (96 countries) | academic-site download | **unclear** → derived-only | static, through 2018 | granular but narrow + stale; depth supplement where SNG-WOFI is silent |
| **REIGN** (OEF, monthly) | **change detection**: coups/juntas/irregular governance the de-jure sets miss | GitHub download, CSV | **unclear** → derived-only | monthly | the practical "did this country's structure just change" signal |
| **International IDEA ESD** | electoral-system **family for the presidency** (the office IPU doesn't cover) | Excel export only, no API | **unclear** → derived-only (CC BY-NC risk) | post-election-cycle | brittle for CI (manual export); use IPU Parline for anything overlapping |
| **ParlGov** | cabinet-coalition depth for ~50 EU/OECD democracies only | Dataverse | **unclear** | periodic | not core spine — rich-democracy depth supplement only |
| **QoG Standard** | *possible integration shortcut* (pre-merges V-Dem+DPI+RAI+IDEA on common keys) | Stata/R | **unclear** | periodic | verify codebook + license before leaning on it; flagged follow-up, not v1 core |

**Skipped, per the dossier:** the Constitute Project itself (CC BY-NC 3.0, and its value —
full constitutional *text* — is out of scope for a structure diagram; use its sister CCP
Characteristics dataset instead); Geddes-Wright-Frantz and IAEP (frozen 2010/2012 —
historical backfill only); Polity5 (superseded by V-Dem here).

### 2.2 Wikidata build-time reliability → a snapshot posture, never live client queries

The dossier flags Wikidata's SPARQL service as having documented 2026 stability issues
(60s hard timeout, per-IP rate limits). The Spine's architecture already answers this: **all
government data is committed static JSON in the private repo, refreshed on the slow lane
(§7), never queried live from the client.** SPARQL runs only inside the slow-lane Action
(public repo, unlimited minutes), with retries + the conditional-GET cache reused from
`@khazana/ingest` (spec 1 §4.1), and its result is a committed snapshot. A SPARQL outage
degrades a *refresh*, never a *page view* — the last good snapshot keeps rendering. This is
identical to how every other frozen/slow world source is handled; Wikidata is just the one
that most needs the retry discipline.

---

## 3. Schemas — `packages/core/src/world-government.ts`

New flat core file (spec 1 §3.0's house style: flat `world-` files, not a subdirectory),
exported from `index.ts` via `export * from "./world-government.js"`. New enums join
`vocab.ts` alongside the Spine's `LICENSE_TIERS`/`INDICATOR_FIELDS`. `ProvenanceSchema` and
`UncertaintySchema` are imported from `world-provenance.ts` unchanged.

### 3.1 Vocabularies

```ts
// vocab.ts additions
export const SYSTEM_TYPES = [
  "parliamentary", "presidential", "semi-presidential",
  "constitutional-monarchy", "absolute-monarchy",
  "one-party", "military-junta", "directorial", "provisional", "other",
] as const;
export const SystemTypeSchema = z.enum(SYSTEM_TYPES);

export const GOV_BRANCHES = ["executive", "legislative", "judicial", "electoral", "other"] as const;
export const GovBranchSchema = z.enum(GOV_BRANCHES);   // "electoral" for Latin-American-style 4th-branch electoral courts

export const GOV_TIERS = ["national", "state", "local"] as const;   // federal levels; "national" = union/central
export const GovTierSchema = z.enum(GOV_TIERS);

export const INSTITUTION_KINDS = [
  "head-of-state", "head-of-government", "cabinet", "chamber",
  "apex-court", "constitutional-court", "election-authority",
  "subnational-executive", "subnational-legislature", "other",
] as const;
export const InstitutionKindSchema = z.enum(INSTITUTION_KINDS);

// The directed authority relations that bind institutions — charter's 8 core.
export const POWER_RELATIONS = [
  "appoints", "dismisses", "confirms", "dissolves",
  "vetoes", "reviews", "elects", "confidence",   // "confidence": TO holds the confidence of / can unseat FROM
] as const;
export const PowerRelationSchema = z.enum(POWER_RELATIONS);

export const SELECTION_METHODS = [
  "direct-election", "indirect-election", "hereditary",
  "appointment", "ex-officio", "legislature-elected", "mixed", "other",
] as const;
export const SelectionMethodSchema = z.enum(SELECTION_METHODS);
```

### 3.2 `Institution`, `Chamber`, and the executive/judiciary/federal blocks

```ts
// world-government.ts
export const InstitutionSchema = z.object({
  id: z.string(),                    // stable within a country, e.g. "ind-loksabha", "ind-president"
  name: z.string(),                  // real name from source data, e.g. "Lok Sabha", "Bundesrat"
  branch: GovBranchSchema,
  tier: GovTierSchema,
  kind: InstitutionKindSchema,
  provenance: ProvenanceSchema,      // decision 3: per-institution, not per-page
});

export const ChamberSchema = InstitutionSchema.extend({
  kind: z.literal("chamber"),
  seats: z.number().int().positive().optional(),          // IPU Parline primary; Wikidata/Factbook/DPI fallback
  termLengthYears: z.number().positive().optional(),
  selection: SelectionMethodSchema,
  electoralSystemFamily: z.string().optional(),            // "FPTP" | "list-PR" | "MMP" | "TRS" | … (IPU Parline / IDEA ESD)
  isLowerHouse: z.boolean().optional(),                    // omitted for unicameral
});

export const ExecutiveBlockSchema = z.object({
  headOfState: z.object({ institutionId: z.string(), selection: SelectionMethodSchema, provenance: ProvenanceSchema }),
  headOfGovernment: z.object({ institutionId: z.string(), selection: SelectionMethodSchema, provenance: ProvenanceSchema }),
  /** True where one person holds both roles (US president; a directly-elected HoS+HoG). */
  fused: z.boolean(),
});

export const JudiciaryBlockSchema = z.object({
  apexCourtId: z.string(),
  /** Does an apex/constitutional court review the constitutionality of legislation? CCP-coded. */
  judicialReview: z.enum(["yes", "limited", "no", "unknown"]),
  appointment: SelectionMethodSchema,
  provenance: ProvenanceSchema,
});

export const FederalTierSchema = z.object({
  tier: GovTierSchema,                 // "state" | "local"
  unitLabel: z.string(),               // "states" | "Länder" | "provinces" | "cantons"
  unitCount: z.number().int().positive().optional(),
  /** 0–100 self-rule signal from RAI/SNG-WOFI where covered; omitted for unitary states. */
  selfRuleScore: z.number().min(0).max(100).optional(),
  provenance: ProvenanceSchema,
});

export const ElectionSystemSchema = z.object({
  office: z.string(),                  // "Lok Sabha" | "President" | "Rajya Sabha"
  systemFamily: z.string(),            // same vocabulary as ChamberSchema.electoralSystemFamily
  provenance: ProvenanceSchema,
});
```

### 3.3 `PowerFlowEdge` and the assembled `GovernmentStructure`

```ts
export const PowerFlowEdgeSchema = z.object({
  from: z.string(),                    // Institution.id
  to: z.string(),                      // Institution.id
  relation: PowerRelationSchema,
  /** Constitutional citation where CCP/Constitute provide one; else the archetype's
   *  generic basis ("characteristic of a parliamentary system") — the two are
   *  distinguished by `basisOrigin` so a reader never mistakes a template default
   *  for a country-specific constitutional provision. */
  constitutionalBasis: z.object({
    text: z.string(),
    basisOrigin: z.enum(["constitution-coded", "archetype-default"]),
    sourceUrl: z.string().url().optional(),
  }).optional(),
  provenance: ProvenanceSchema,
});

export const SystemTypeAssessmentSchema = z.object({
  systemType: SystemTypeSchema,
  archetypeId: z.string(),             // which §4.2 template was instantiated
  /** Each classifier's raw verdict, kept for transparency (decision 4). */
  classifiers: z.array(z.object({
    sourceId: z.string(),              // "dpi-2020" | "vdem" | "wikidata" | "reign"
    verdict: z.string(),
  })),
  /** Set when classifiers disagree — rendered honestly, never hidden. */
  divergence: z.string().optional(),
  provenance: ProvenanceSchema,
});

export const GovernmentStructureSchema = z.object({
  country: CountryCodeSchema,          // ISO3, reused from world-indicator.ts
  name: z.string(),
  systemType: SystemTypeAssessmentSchema,
  executive: ExecutiveBlockSchema,
  chambers: z.array(ChamberSchema),                 // 0 (rare), 1 (unicameral), or 2
  judiciary: JudiciaryBlockSchema,
  federalTiers: z.array(FederalTierSchema).default([]),   // empty = unitary state
  electionSystems: z.array(ElectionSystemSchema).default([]),
  institutions: z.array(InstitutionSchema),         // the node set (chambers included by reference)
  powerFlow: z.array(PowerFlowEdgeSchema),          // the edge set
  /** 0–100. Fraction of required field-groups that cleared sourcing (§5). Gates the page. */
  completenessScore: z.number().min(0).max(100),
  /** Per-field-group divergence + winning-source ledger, for the page's provenance rail. */
  fieldProvenance: z.array(z.object({
    fieldGroup: z.enum(["system-type", "executive", "chambers", "judiciary", "federal-tiers", "election-systems"]),
    winningSourceId: z.string(),
    consideredSourceIds: z.array(z.string()),
    divergence: z.string().optional(),
  })),
  assembledAt: z.string().datetime(),
});
export type GovernmentStructure = z.infer<typeof GovernmentStructureSchema>;
```

### 3.4 Reconciliation — precedence per field-group, divergence flagged (decision 4)

Because different sources are authoritative for different fields, precedence is **per
field-group**, applied deterministically at assembly time (§5), never improvised:

| Field-group | Precedence (first wins) | Why |
|---|---|---|
| **system type** | DPI 2020 → V-Dem (validate) → Wikidata P122 (tiebreak) → **REIGN override** if it flags a post-2020 irregular change | DPI is the best machine classifier; REIGN is the only near-real-time change signal, so it *overrides* a stale DPI verdict |
| **chambers** (seats, terms, electoral system) | IPU Parline → Wikidata → Factbook → DPI | Parline is live + authoritative; the rest are frozen fallbacks |
| **executive** (HoS/HoG, selection) | CCP → Wikidata offices → Factbook | CCP codes the constitutional selection mechanism directly |
| **judiciary** (review, appointment) | CCP → Wikidata → Factbook | judicial-review provisions are CCP's core competence |
| **federal tiers** | SNG-WOFI → RAI → DPI federal dummy → Wikidata | SNG-WOFI has the broadest tier coverage |
| **power-flow edges** | CCP-coded (per-edge `constitution-coded`) → archetype default (`archetype-default`) | a country-specific constitutional provision always beats a template default |

When two sources within a field-group disagree materially (e.g. Parline says 545 seats,
Factbook says 543), the assembler records the **winning** value and writes a
`divergence` string ("IPU Parline: 545 · CIA Factbook: 543 — Parline preferred, live
source") into `fieldProvenance`. The UI renders it (§4.3, §6). This is the Ledger's
multi-method honesty (Ledger §0) applied to structure: khazana never silently reconciles;
it shows who disagreed.

### 3.5 The archetype library schema (hand-authored data, committed — not AI)

```ts
export const GovArchetypeSchema = z.object({
  id: z.string(),                      // "westminster-parliamentary", "us-presidential", …
  systemType: SystemTypeSchema,
  label: z.string(),
  /** Template institutions with parameter SLOTS the per-country data fills. */
  institutions: z.array(InstitutionSchema.pick({ branch: true, tier: true, kind: true }).extend({
    slot: z.string(),                  // "head-of-state", "lower-house", "apex-court" — matched to real data at assembly
  })),
  /** Candidate power-flow edges with generic (archetype-default) constitutional basis. */
  edges: z.array(z.object({
    fromSlot: z.string(), toSlot: z.string(),
    relation: PowerRelationSchema,
    defaultBasis: z.string(),          // "characteristic of a parliamentary system"
  })),
});
export const GovArchetypeLibrarySchema = z.object({
  version: z.number().int().default(1),
  archetypes: z.array(GovArchetypeSchema).default([]),
});
```

Committed at `data/world/government-archetypes.json` in the private repo — the same
"data, not config-as-code" ethos as the Spine's `world-sources.json`. Hand-authored once,
reviewed like code, versioned in git. **This is where the "no dataset gives you a diagram"
gap (§2) is closed without AI:** the archetype is the deterministic skeleton; the datasets
fill its slots.

---

## 4. The diagram — a new `PowerFlow` component

### 4.1 Why a new component (justified against the existing mdx kit)

The component catalog (`apps/site/src/components/mdx/index.ts`) has three candidates, and
none fit a **data-driven, cyclic, relation-typed authority graph**:

- **`<Diagram>`** (node-edge, manhattan-routed) is the closest, but it requires the *author
  to supply abstract-grid `x`/`y` coordinates per node* and its edge vocabulary is only
  `data | control | async`. Hand-placed coordinates are exactly what decision 2 forbids —
  every country must lay out through the *same* grammar, automatically, so India and Germany
  are comparable. `<Diagram>` is for bespoke, human-composed teardown figures; a power-flow
  graph is machine-assembled from data for 8→50→N countries.
- **`<Sankey>`** encodes acyclic *flow quantities* (buyer → sector → supplier value). Power
  flow is **cyclic and directed-authority, not quantity**: a legislature elects a PM who can
  dissolve that legislature — a cycle Sankey's layout cannot express.
- **`<ForceComparison>`** is two-sided metric diverging-bars — not a graph at all.

So this spec introduces **one** new component, `PowerFlow`, and its layout lib
`lib/power-flow-layout.ts`:

```ts
// apps/site/src/components/mdx/PowerFlow.tsx
export interface PowerFlowProps {
  structure: GovernmentStructure;      // the whole assembled record — the component derives everything
  caption?: string;
  highlightOnHover?: boolean;          // matches Diagram's affordance
}
```

### 4.2 The layout grammar (this is what makes countries comparable — D5)

`power-flow-layout.ts` is a pure, deterministic, unit-tested layout (same discipline as
`diagram-layout.ts` — no layout-engine dependency, offline, reviewable). The grammar is
fixed for every country:

- **Columns = branches**, in fixed order `executive · legislative · judicial · (electoral)`.
- **Rows = tiers**, `national` above `state` above `local`.
- Institutions place into their (branch, tier) cell; edges route as directed,
  relation-typed arrows (distinct stroke per `PowerRelation`, with a legend), curved to
  express cycles (unlike `Diagram`'s manhattan routing).
- The ~14 archetypes (§3.5) all map onto this same grid, so a reader who has learned to read
  India's diagram already knows how to read Germany's — the columns mean the same thing, the
  arrows mean the same thing. **This is literally the expansion mechanism**: "add a country"
  = "instantiate an archetype into this fixed grammar."

The ~14 archetype templates the library ships with (from §2's dossier finding): Westminster
parliamentary, continental parliamentary (constructive no-confidence), US-style presidential,
Latin-American presidential (with an electoral branch), French-style semi-presidential,
Russian-style semi-presidential, directorial/collegial (Swiss Federal Council),
constitutional monarchy, absolute monarchy, one-party state (party-state parallel structure),
military junta / provisional, theocratic, assembly-elected-president hybrid, and a
generic/other fallback.

### 4.3 SSR fallback (house convention — zero JS)

Every interactive mdx island ships a full no-JS server render (`battlemap-ssr.test.ts`,
`sankey-ssr.test.ts`, `diagram-ssr.test.ts` are the precedents). `PowerFlow`'s fallback is a
**structured HTML `<table>`/`<dl>`** rendered server-side: institutions grouped under
branch/tier headings, then an edges list — *"President — appoints → Prime Minister
(constitutional-coded, Art. 75)"* — with each `divergence` note inline. The SVG diagram is
progressive enhancement layered over this; the fallback is fully legible and carries every
fact + citation. A `power-flow-ssr.test.ts` asserts this (§8).

### 4.4 India as the depth exemplar — and landing the India-states map asset

India is built first (§9), and carries the feature's depth:

- **Union tier**: President (HoS, indirectly elected) · PM + Council of Ministers (HoG,
  commands Lok Sabha confidence) · Lok Sabha (545, FPTP, 5yr) · Rajya Sabha (245, indirectly
  elected by state legislatures, staggered 6yr) · Supreme Court (judicial review: yes).
- **State tier**: Governor (appointed by President) · Chief Minister + state cabinet ·
  Vidhan Sabha (± Vidhan Parishad) · High Courts — instantiated for all states, the federal
  tier that makes India the exemplar the founder knows best.
- **The India-states map asset** (this spec owns landing it — the Ledger's §6.3/§12 flagged
  it as needing a source; per D5 this spec is where a country's sub-national map lands). From
  `.superpowers/research/atlas/india-depth.json`: use **`ramSeraph/indian_admin_boundaries`**
  (CC0 1.0 — public-domain, the best-licensed India boundary source, ships state→village
  granularity via GitHub Releases) as the primary source, cross-checked against
  **geoBoundaries India** (CC BY 4.0). Both are offline-bundleable static files. Because
  `Map.tsx` consumes `world-atlas`-style TopoJSON keyed by ISO code, the pipeline converts
  ramSeraph's ADM1 GeoJSON to a **committed TopoJSON asset keyed by ISO 3166-2:IN** (via
  `mapshaper`/`topojson-server` at asset-prep time, not build time), stored in the private
  repo. CC0 beats CC-BY here precisely because it survives the D1 public-flip with zero
  attribution-tracking burden. (Do **not** pull from `datameet/maps` directly — its
  per-dataset license is fragmented; ramSeraph has already normalized it.)

---

## 5. Country-onboarding pipeline — the D5 payoff

"Adding a country to Atlas" starts here, as a **deterministic pipeline stage** in
`packages/world-ingest`, not a manual design task. Structure:

```
packages/world-ingest/src/government/
  sources/
    wikidata-gov.ts    factbook-gov.ts    ipu-parline.ts    dpi-2020.ts
    vdem-institutions.ts   ccp-characteristics.ts   sng-wofi.ts   reign.ts   idea-esd.ts
  assemble.ts          # the onboarding stage below
  archetypes.ts        # loads + validates data/world/government-archetypes.json
```

The onboarding checklist, executed by `assemble.ts` per country:

1. **Fetch** the country's rows from each spine source (§2.1) — each `sources/<id>.ts`
   implements a `fetch(ctx): Promise<Partial<GovernmentStructure fragments>>` returning only
   the field-groups it covers, stamped with its `Provenance`.
2. **Classify** system type via the §3.4 precedence (DPI → V-Dem → Wikidata, REIGN override)
   → pick the archetype.
3. **Instantiate** the archetype: match its institution slots to the real institutions from
   the data, apply per-field-group precedence to reconcile chambers/executive/judiciary/
   federal tiers, and materialize power-flow edges (CCP-coded where available, else
   archetype-default), recording every `divergence`.
4. **Score completeness** — `completenessScore` = fraction of required field-groups
   (system-type, executive, ≥1 chamber, judiciary; federal-tiers required only where the
   system-type classifier says federal) that cleared sourcing.
5. **Gate** — a `GovernmentStructure` ships a page only at `completenessScore ≥ 70`
   (tunable). Below the gate, the record is still written (with its low score) but the page
   renders the explicit *"structure not yet assembled — N of M field-groups sourced,
   missing: …"* state (decision 5). **Never a silent gap.**

Output: `data/world/government/<ISO3>.json` in the private repo.

---

## 6. Integration — standalone surface + embedded Ledger section

### 6.1 Standalone routes

```
apps/site/src/pages/atlas/structure/
  index.astro              # landing: world map colored by system type + country picker
  [country].astro          # per-country structure page — getStaticPaths over data/world/government/*.json
  compare.astro            # two countries' PowerFlow diagrams side by side, same grammar (client-hydrated picker)
```

`[country].astro` mirrors the Ledger's `[country].astro` pattern (spec 4 §2): statically
generated for every country whose `GovernmentStructure` clears the gate; below-gate
countries render the "not yet assembled" state. `compare.astro` follows the Ledger
`compare` discipline exactly (spec 4 §5) — one static shell + a `client:visible` island
fetching two `data/world/government/<ISO3>.json` files, no combinatorial build, still $0.
The compare view is where decision 2's payoff is most visible: two diagrams, one grammar,
differences legible at a glance.

### 6.2 Embedded in the Ledger country report (placement contract)

The Ledger's amended report leads each country page with a **Structure** section (Ledger
§4.1 step 2). The contract:

- The Ledger passes the country ISO3; this spec's `<PowerFlow>` (fed the country's
  `GovernmentStructure`) renders itself.
- Where a country's structure is below the completeness gate (§5), the section degrades to
  *"structure data not yet available for this country"* — a country can have a Ledger report
  (indicator data exists) before its Structure section is onboarded (D5's mechanism: the
  Structure page may lag the indicator page).
- **This spec owns the data + component in full; the Ledger owns only placement** (Ledger
  §4.1 step 2's own wording).

### 6.3 Links into the Ledger's indicators

Structure and indicators cross-link both ways: each chamber node links to the Ledger's
`elections` field for that country — specifically its *effective number of parliamentary
parties* (Laakso–Taagepera) and *Gallagher disproportionality* indicators (Ledger §3.2
`elections`), which are the *live behavior* of the *static structure* the diagram shows. The
diagram says "543-seat FPTP lower house"; the indicator says "and here's how fragmented it
actually is this term." Conversely, the Ledger's `governance` "executive constraints"
indicator (Polity5 `xconst`) links back to the judiciary's `judicialReview` edge.

---

## 7. Pipeline & cadence

- **Slow lane (weekly poll — spec 1 §4.2).** Government structures change rarely, so the
  government sources ride the existing slow lane in `world-pipeline.yml` — no new workflow.
  The weekly poll is a cheap "did anything change" check against sources that are mostly
  annual-or-frozen.
- **Event-driven exceptions.** Two sources make the weekly poll meaningful rather than
  pro-forma: **REIGN** (monthly — catches coups/irregular transitions that flip system type)
  and **IPU Parline** (continuous — catches post-election seat-count/electoral-system changes).
  The weekly poll picks these up; a detected change re-runs `assemble.ts` for the affected
  country and re-commits its `government/<ISO3>.json`.
- **Private-repo commit targets (D2):** `data/world/government/<ISO3>.json` (per country) and
  `data/world/government-archetypes.json` (the hand-authored library). The India-states
  TopoJSON asset (§4.4) also lands in the private repo. The site build checks these out
  read-only at build time (spec 1 §2), same mechanism as every other world datum.

---

## 8. Testing

Mirrors spec 1 §5's philosophy — colocated, fixture-based, provenance-checked:

- **Schema round-trips** (`world-government.test.ts`): a fully-populated
  `GovernmentStructure` fixture parses + round-trips; `.default([])` fields (federalTiers,
  electionSystems) apply when omitted; the `basisOrigin` distinction and per-field-group
  `Provenance` embedding are asserted present (a fixture that drops provenance must fail).
- **Reconciliation-rule fixtures** (§3.4): the sharpest test — feed the assembler two sources
  disagreeing on a seat count (Parline 545 / Factbook 543) and assert the winning value is
  Parline's *and* that `fieldProvenance[...].divergence` names both. A second fixture:
  DPI classifies "parliamentary" while REIGN flags a post-2020 coup → assert REIGN overrides
  and `systemType.divergence` records the disagreement. These encode decision 4.
- **Per-source fetcher fixtures**, one per `sources/<id>.ts`, including a canned **SPARQL
  JSON response fixture** for `wikidata-gov.ts` (fed through `fetch()`, asserting the mapped
  institutions + correctly-stamped `provenance.licenseTier: "redistribute-raw-ok"`), a
  Factbook JSON excerpt, an IPU Parline JSON excerpt, and a CCP row excerpt — each asserting
  the field-group it feeds *and* its provenance tier, per spec 1 §5's "a fixture that ignores
  provenance misses the point."
- **SSR-fallback test** (`power-flow-ssr.test.ts`): renders `<PowerFlow>` server-side with no
  JS and asserts the institutions table + edges list + divergence notes + constitutional
  citations are all present — the same shape as the existing `sankey-ssr`/`diagram-ssr` tests.
- **Completeness-gate tests** for `assemble.ts`: a full fixture scores 100 and ships; a
  fixture missing judiciary scores below 70 and produces the "not yet assembled" record with
  the correct `missing` list; a unitary country with no federal tier is *not* penalized for
  the empty `federalTiers` (the gate requires federal tiers only where the classifier says
  federal).
- **Layout unit tests** for `power-flow-layout.ts`: pure geometry tests (branch→column,
  tier→row placement, cyclic-edge routing) with zero DOM — same discipline as
  `diagram-layout`'s tests.

---

## 9. Build order

1. **India first** — the founder knows the Indian union best, so it is the best validation
   of both the schema and the archetype grammar. Ships: the Westminster-parliamentary +
   continental-federal archetypes, union + state tiers, the India-states TopoJSON asset
   (§4.4), the `PowerFlow` component + its SSR fallback, and the standalone
   `atlas/structure/ind` page. India validates the whole pipeline end-to-end before breadth.
2. **A structurally-diverse second wave (~8 countries)** — chosen to exercise every distinct
   archetype the library ships, so the "one grammar, many systems" claim (decision 2) is
   proven against real diversity, not just India's family:
   - **United Kingdom** — Westminster parliamentary, *uncodified* constitution (the CCP edge
     case: power-flow edges lean on `archetype-default` basis where no codified article
     exists — the honesty of `basisOrigin` gets tested here).
   - **Germany** — continental parliamentary federal, constructive no-confidence, Bundesrat
     appointed-by-Länder (a chamber whose selection is *not* direct election — stresses
     `SelectionMethod`).
   - **United States** — presidential, federal, strong bicameralism + judicial review (the
     presidential archetype's reference implementation).
   - **France** — semi-presidential, the HoS/HoG split with cohabitation dynamics (stresses
     the `ExecutiveBlock.fused: false` + dual-selection path).
   - **Brazil** — presidential federal with a distinct **electoral branch** (electoral
     courts) — exercises the `"electoral"` `GovBranch` and coalitional presidentialism.
   - **Switzerland** — directorial/collegial Federal Council (no single HoG; a rotating
     collective executive) — the archetype that most breaks the presidential/parliamentary
     binary and stresses the schema hardest.
   - **China** — one-party state with a **party-state parallel structure** — the hardest case
     for a de-jure dataset, and the honest test of whether the diagram can show "the
     constitutional organs" alongside a labeled note that real power runs through the party,
     without editorializing (data-driven, `divergence`-flagged where V-Dem's de-facto power
     vars contradict the de-jure structure).
   - **South Africa** — parliamentary system whose president is **elected by the National
     Assembly and is both HoS and HoG** — a hybrid that breaks the presidential/parliamentary
     binary from the *other* side (parliamentary selection + fused executive), validating the
     `assembly-elected-president` archetype.
3. **Bulk** — every country the spine sources cover, assembled through the same pipeline
   (§5), gated by completeness (§5). This is D9's "ingest every country the sources cover"
   applied to structure: breadth is a pipeline run, not a design effort, precisely because
   decision 2 made the grammar uniform.

---

## 10. Founder open questions (genuinely open only)

- **Completeness-gate threshold.** §5 proposes `≥ 70`. Too low and thin structures ship
  looking authoritative; too high and interesting-but-partial countries (many microstates,
  contested entities) never appear. Worth a founder gut-check once real per-country
  completeness scores are in hand from the second wave — this is a tuning call, not a design
  one.
- **Contested / non-UN entities (Taiwan, Kosovo, Palestine, Somaliland, Western Sahara).**
  The dossier flags these as an *editorial-policy* decision, not a data gap: sources disagree
  on framing, not facts. Does Atlas render their structure pages (they have real, describable
  institutions), and if so under what labeling? This is a values call the founder should own,
  consistent with the Bias-Lab/Ledger framing-discipline contracts (D1).
- **De-jure vs de-facto for one-party/junta states (the China/Myanmar problem).** The diagram
  is built from *de-jure* constitutional structure; V-Dem's de-facto power variables often
  contradict it. §9's China note proposes a `divergence`-flagged "constitutional organs +
  labeled de-facto note" approach. Is that the right default everywhere, or should heavily-
  divergent states carry a stronger standing visual treatment (a second, de-facto power-flow
  overlay)? Genuinely open — it trades honesty-density against not editorializing.
- **License confirmations before raw redistribution.** IPU Parline (exact CC variant), CCP,
  V-Dem, REIGN, SNG-WOFI all currently sit at `derived-only` pending a direct license read
  (§2.1). This is a known, bounded task, not a design question — but the founder may want to
  send the confirmation emails (Parline/CCP/V-Dem all invite this) to promote the highest-
  value ones (Parline especially) to `redistribute-raw-ok` and simplify the pipeline. Flagged
  so it is not silently forgotten.
- **QoG Standard as an integration shortcut.** The dossier flags QoG as *possibly*
  pre-merging V-Dem+DPI+RAI+IDEA on common country-year keys under one license — which, if it
  holds up, could collapse several fetchers into one. Worth one verification pass on its
  codebook before the second wave, but not a v1 blocker; noted so the option isn't lost.
