# Atlas — World Data Spine (design spec)

> *khazana's second face: a world-facing intelligence surface with a live news Globe, a
> news-outlet Bias Lab, a deep Government Ledger — and, post-founder-review, Conflict
> Theaters and Government Structure diagrams. This spec is the foundation all of them sit
> on — the normalized schemas + the $0 ingest architecture. Nothing here renders a pixel;
> everything downstream depends on it.*

**Status:** Proposed — spec 1 of 7 (Atlas: Spine → Globe → Bias Lab → Ledger → Extras →
Conflict Theaters → Government Structure)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — the same binding constraint as khazana v1. No paid APIs, no
paid hosting, no always-on machine beyond the existing free Cloudflare Worker.

> **Amended 2026-07-07 after founder interview.** This spec was reworked against the
> binding decision record (`2026-07-07-atlas-founder-decisions.md`), which wins wherever
> it contradicts this document's original text. What changed, integrated into the body
> below (decision IDs cited inline where each applies):
>
> - **Private world-data repo (D2)** — all world data (`data/world/`,
>   `data/world-sources.json`, `data/world-sources.seed.json`, and every downstream
>   derived layer) moves to a new **private** repo, `khazana-world-data`. Ingest
>   workflows keep running in the public repo and push outputs there via a repo-scoped
>   token; the site build checks the private repo out at build time. Rewritten: §1.2,
>   §2, §3.7, §4.2, §4.3; §8's retention question relaxed. §4.4 (Worker KV mirror)
>   unchanged.
> - **New binding decisions (§1)** — private-indefinitely / public-ready-by-construction
>   audience (D1); the density mandate: sources and indicators are open-ended floors,
>   not ceilings (D3); zero AI prose anywhere in the world-data path (D4).
> - **Density-mandate consequences (D3)** — §3.7 and §5 recast the ~15 hand-curated
>   sources as the seed, not the boundary; §3.6/§7 pull the GeM/CPPP India procurement
>   scraper forward into the main build; §8's GeM timing question is closed.
> - **Two new downstream specs (§6)** — spec 6, Conflict Theaters (D6), and spec 7,
>   Government Structure (D5); header renumbered spec 1 of 5 → spec 1 of 7.

---

## 0. What is Atlas, and why the Spine ships first

khazana v1 (`docs/superpowers/specs/2026-06-23-khazana-design.md`) is a *personal* curated
signal + AI-authored blogs. **Atlas** is khazana's second face: a *world*-facing surface
that turns public, mostly-free datasets — macro/governance indicators, news-outlet
corpora, procurement records — into three things:

1. **The Globe** — a live, spinning map of world events, each backed by *every* outlet's
   reporting of it, not one canonical wire story.
2. **The Bias Lab** — a transparent, khazana-computed lean + reliability score per news
   outlet, with third-party ratings (AllSides, Ad Fontes, MBFC) shown as attribution-only
   overlays, never redistributed as khazana's own number.
3. **The Government Ledger** — 200+ governance/macro/fiscal/corruption/conflict
   indicators per country, India carried to state/district depth where sources allow.

**One site, two faces.** Atlas is not a new app — it is a top-level switch inside the
existing `apps/site` Astro build, sharing the design-token system, the Shell chrome, and
the deploy pipeline. There is no `apps/atlas`.

This document is spec **1 of 7**. It defines nothing about any downstream UI —
it defines the data those surfaces will read: the zod schemas that make every world
datum self-describing (source, method, license, uncertainty) and the ingest architecture
that gets those data into `data/world/` — in the **private `khazana-world-data` repo**
(D2, §2) — for $0. Specs 2–4 (Globe, Bias Lab, Government Ledger), spec 5 (Extras),
spec 6 (Conflict Theaters), and spec 7 (Government Structure) are written *against* this
contract; §6 below lists exactly what each will need from it.

---

## 1. Binding decisions (settled)

These are decided, not open — every downstream spec treats them as fixed:

1. **One site, two faces.** Atlas lives inside `apps/site` as a top-level switch, sharing
   the design system. Not a separate app.
2. **$0 recurring, static + serverless.** No paid APIs, no always-on machines. Ingest runs
   in GitHub Actions cron (in the **public** repo, where Actions minutes are unlimited);
   outputs are committed static JSON under `data/` of the **private `khazana-world-data`
   repo** (D2, §2/§4.3) — never the public repo. Near-live freshness comes from a
   **high-frequency cron** + the existing **free Cloudflare Worker** summary endpoint +
   **light client polling**. "Live pinging globe" means *build-cadence data*, not
   websockets — there is no persistent connection anywhere in this system.
3. **Methodology transparency is first-class.** Every datum carries provenance: source,
   method/formula citation (URL), license tier, a computed-vs-referenced flag, and an
   uncertainty representation (CI / SE / rater-spread / sample-n). **No bare numbers ever
   reach the UI** — a number with no `Provenance` attached is a schema violation, not a
   rendering choice.
4. **Licensing tiers are enforced in the schema, not by convention.** Sources are either:
   - **(a) redistribute-raw-OK** — World Bank WDI + WGI, IMF SDMX, UCDP, GDELT,
     USAspending, TED, OCDS — CC-BY or equivalent; we may store and show the provider's
     raw table.
   - **(b) derived-only** — CPI (No-Derivs), Polity5, Freedom House, FRED, Open Budget
     Survey/BOOST, ACLED, AllSides/Ad Fontes/MBFC — we **never** store or redistribute
     the provider's raw table; we store **our own** derived/normalized 0–100 score plus
     attribution.
   Every `Provenance` carries `licenseTier` + `redistribution`, and the schema itself
   (via a `superRefine` cross-check, §3.1) makes it structurally impossible for a
   `derived-only` datum to claim raw redistribution. This is enforced at parse time, not
   left to renderer discipline.
5. **Private indefinitely, public-ready by construction (D1).** Atlas is for the founder
   alone, behind the existing site gate, indefinitely — but going public later must be a
   **repo-visibility toggle, not a rebuild or a data audit**. Concretely: the private
   audience relaxes *nothing*. License-tier enforcement (decision 4), the
   balanced-not-accusatory framing contract, and attribution-only handling of reference
   raters all remain fully binding even though nobody but the founder sees the output.
6. **The density mandate (D3).** The source list and indicator catalog in this spec are
   **open-ended floors, not ceilings**. Founder-verbatim: ingest *everything that can be
   found/calculated reliably* — full WDI/V-Dem/OWID catalogs, not hand-picked subsets.
   Every named-source enumeration below (§3.7's ~15 sources, §4.2's lane tables, §7's
   phases) is a seed set with a standing growth mechanism (§5's recipe), never a
   boundary.
7. **Zero AI prose anywhere in the world-data path (D4).** Every figure, label, and
   sentence downstream of this Spine is deterministic: computed values, templated
   micro-copy, schema-carried provenance. No LLM writes, summarizes, or paraphrases
   anywhere between a source API and the rendered Atlas surface — never stale, never
   hallucinated.

---

## 2. Architecture at a glance

```
┌─ GitHub Actions (cron — defined & run in the PUBLIC repo, unlimited free minutes) ┐
│  FAST lane   (~every 20 min)  GDELT events/GKG → geocode/dedupe → WorldEvent    │
│  MEDIUM lane (daily)          ACLED · USAspending/TED/OCDS/GeM → Contract       │
│                                outlet corpus scan → BiasProfile recompute        │
│  SLOW lane   (weekly poll —   WDI · WGI · IMF SDMX · UCDP · CPI · Polity5 ·     │
│               upstreams are    Freedom House · FRED · Open Budget Survey/BOOST · │
│               quarterly/annual) NITI SDG Index · RBI DBIE · Lok Dhaba ·          │
│                                Open Budgets India → Indicator / CountryProfile   │
│  → pushes static JSON to the PRIVATE data repo (D2, see §4.3)                   │
│  → fast lane also PUTs latest rollup to the Worker KV mirror (§4.4) ────────────┼──┐
└──────────────────────────────────────────────────────────────────────────────────┘  │
        │ push via repo-scoped fine-grained token (Actions secret)                    │
        ▼                                                                             │
┌─ khazana-world-data (NEW, PRIVATE repo — D2) ─────────┐                             │
│ data/world-sources.json · data/world-sources.seed.json │                            │
│ data/world/**  +  all downstream derived layers        │                            │
└─────────────────────────────────────────────────────────┘                           │
        │ checked out at site-build time (actions/checkout + same token)              │
        ▼                                                                             ▼
┌─ GitHub Pages (free, existing) ────────┐   ┌─ Cloudflare Worker + KV (existing, free) ─────┐
│ Atlas: Globe / Bias Lab / Ledger        │──▶│ GET /world/latest  (public, cached rollup)    │
│ shares Shell + design tokens w/ v1      │   │ PUT /world/ingest  (token-gated, fast lane)   │
└──────────────────────────────────────────┘   └────────────────────────────────────────────────┘
```

Same ethos as v1's architecture: **data lives in a repo** — but per D2, not the *public*
one. All world data (`data/world/`, `data/world-sources.json`, `data/world-sources.seed.json`,
and every downstream derived layer) lives in a new **private** repo, `khazana-world-data`.
The rationale is that the site gate protects the *site*, not the data: anything committed
to the public repo is world-readable regardless of the gate. Compute and data split
cleanly along the free-tier boundary — the ingest **workflows stay in the public repo**,
because public repos get unlimited free Actions minutes while private repos get only
2,000/month, nowhere near enough for a ~20-minute fast lane — and push their outputs to
the private repo via a repo-scoped fine-grained token (or GitHub App installation token)
held as an Actions secret. The public repo's site build checks the private repo out at
build time (`actions/checkout` with the same token) to read `data/world/`. Two bonuses
fall out of this split: the fast lane's 20-minute-cadence commits no longer bloat the
public repo's git history, and going public later (D1) is just flipping
`khazana-world-data`'s visibility — the license-tier discipline (§1.4) already guarantees
everything in it is legally redistributable per its tier.

The only new piece of *external* state is a small KV mirror of the fast lane's latest
`WorldEvent` rollup — it exists purely so the Globe can show something newer than the
last full site build without adding a live-connection dependency. It is a read-through
cache of committed data, not a second source of truth, and it is unchanged by D2 (§4.4).

---

## 3. Schemas (destined for `@khazana/core`)

### 3.0 House-style note (deviates from the brief on file layout, on purpose)

The brief suggested `packages/core/src/world/`. Reading the actual package
(`packages/core/src/*.ts`) shows **zero subdirectories** — every cross-subsystem shape is
one flat file (`feed-item.ts`, `citation-ledger.ts`, `candidate-slate.ts`, …), re-exported
from `index.ts`. To match house style, this spec instead specifies **flat files with a
`world-` prefix**:

```
packages/core/src/world-provenance.ts       # Provenance, Uncertainty
packages/core/src/world-indicator.ts        # Indicator, makeIndicatorId
packages/core/src/world-country-profile.ts  # CountryProfile
packages/core/src/world-outlet.ts           # Outlet, BiasProfile, ReferenceRating
packages/core/src/world-event.ts            # WorldEvent, Reporting
packages/core/src/world-contract.ts         # Contract
packages/core/src/world-source.ts           # WorldSourceEntry, WorldRegistry
```

New enums (`INDICATOR_FIELDS`, `LICENSE_TIERS`, `WORLD_EVENT_CATEGORIES`,
`EVENT_SEVERITIES`, `REFERENCE_RATERS`) are added to the existing `vocab.ts` alongside
`CHANNELS`/`SOURCE_TYPES`/`ITEM_KINDS`/`FORMAT_NAMES` — it is already the single source of
truth for canonical vocabularies per `CLAUDE.md`. **Implementation follow-up:** when this
spec is built, append these new vocabularies to CLAUDE.md's "Canonical vocabularies"
section, exactly as `CHANNELS` etc. are documented today.

All new files export from `packages/core/src/index.ts` via `export * from "./world-*.js"`,
matching the existing pattern.

### 3.1 `Provenance` — the shared sub-object every datum embeds

```ts
// vocab.ts additions
export const LICENSE_TIERS = ["redistribute-raw-ok", "derived-only"] as const;
export const LicenseTierSchema = z.enum(LICENSE_TIERS);
export type LicenseTier = z.infer<typeof LicenseTierSchema>;

// world-provenance.ts
export const UncertaintySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("confidenceInterval"), low: z.number(), high: z.number(), level: z.number().min(0).max(1).default(0.95) }),
  z.object({ kind: z.literal("standardError"), se: z.number().nonnegative() }),
  z.object({ kind: z.literal("raterSpread"), min: z.number(), max: z.number(), raterCount: z.number().int().positive() }),
  z.object({ kind: z.literal("sampleSize"), n: z.number().int().positive() }),
  z.object({ kind: z.literal("none") }), // e.g. a single administrative headcount with no stated error
]);
export type Uncertainty = z.infer<typeof UncertaintySchema>;

export const ProvenanceSchema = z
  .object({
    sourceId: z.string(),                 // WorldSourceEntry.id, e.g. "world-bank-wdi", "allsides"
    sourceUrl: z.string().url(),           // the specific page/API call this datum came from
    methodUrl: z.string().url(),           // citation for the formula/methodology, not just the homepage
    licenseTier: LicenseTierSchema,
    /** True iff `value` is the provider's raw published number, redistributed as-is. */
    redistribution: z.boolean(),
    /** Did khazana compute this figure, or is it copied straight from a published table? */
    origin: z.enum(["computed", "referenced"]),
    retrievedAt: z.string().datetime(),
    uncertainty: UncertaintySchema,
  })
  .superRefine((p, ctx) => {
    // Decision #4, enforced at parse time: a derived-only source can NEVER claim raw
    // redistribution, and every datum it produces must be khazana-computed — we are
    // schema-forbidden from ever storing CPI/Polity5/Freedom House/FRED/ACLED/
    // AllSides/AdFontes/MBFC's raw table.
    if (p.licenseTier === "derived-only" && p.redistribution) {
      ctx.addIssue({ code: "custom", path: ["redistribution"], message: "derived-only sources must never redistribute raw values" });
    }
    if (p.licenseTier === "derived-only" && p.origin !== "computed") {
      ctx.addIssue({ code: "custom", path: ["origin"], message: "derived-only sources must carry a khazana-computed origin" });
    }
  });
export type Provenance = z.infer<typeof ProvenanceSchema>;
```

**Field-by-field rationale:**

- `sourceId` — points at a `WorldSourceEntry` (§3.7), mirroring how `FeedItem.source`
  points at a `SourceEntry` today. Keeps "who said this" one hop away, never inlined.
- `sourceUrl` vs `methodUrl` — two different citations that get conflated in practice.
  `sourceUrl` is *where this specific value lives* (an API response, a table row);
  `methodUrl` is *how it was computed* (WGI's aggregation methodology PDF, CPI's
  Corruption Perceptions Index technical note, AllSides' rating methodology page).
  Decision #3 requires the method citation to be independently checkable — collapsing
  these into one URL would silently drop that.
- `licenseTier` / `redistribution` — **not redundant**, despite looking it. `licenseTier`
  is the *ceiling* (what this source, in general, permits). `redistribution` is the *fact*
  about this one datum (did we, in fact, republish the provider's raw number for it). A
  `redistribute-raw-ok` source can still carry `redistribution: false` datums — e.g. a
  khazana-computed percentile rank built *from* WDI's permissively-licensed raw values is
  itself a derived figure, not a raw passthrough, even though the underlying source
  allows raw redistribution. The `superRefine` above only forbids the *illegal*
  direction (`derived-only` + `redistribution: true`); the legal-but-derived combination
  is intentionally allowed. Downstream renderers can trust the invariant unconditionally
  because it is validated at parse time, not by convention.
- `origin` — mirrors the naming already established in `citation-ledger.ts`'s
  `SourceOriginSchema` (`curated` | `researched`), reused here with values appropriate to
  data (`computed` | `referenced`) — this *is* decision #3's "computed-vs-referenced
  flag."
- `retrievedAt` — when khazana fetched it, distinct from the datum's own `period` (§3.2).
  Staleness is computable without re-fetching.
- `uncertainty` — a discriminated union rather than four optional fields, so a consumer
  can exhaustively `switch` on `kind` and the compiler catches an unhandled case. Chosen
  over "just always show a CI" because the five source families genuinely report
  different things: WGI ships a standard error; AllSides/Ad Fontes/MBFC disagreement is a
  rater spread; ACLED fatality counts often ship a bare sample size; a few administrative
  figures (e.g., a headcount) ship no uncertainty at all — `none` says so honestly instead
  of fabricating a CI.

### 3.2 `Indicator` — one metric, one country, one time

```ts
// vocab.ts addition
export const INDICATOR_FIELDS = [
  "macro", "governance", "corruption", "wellbeing",
  "procurement", "fiscal", "elections", "conflict",
] as const;
export const IndicatorFieldSchema = z.enum(INDICATOR_FIELDS);
export type IndicatorField = z.infer<typeof IndicatorFieldSchema>;

// world-indicator.ts
export const CountryCodeSchema = z.string().regex(/^[A-Z]{3}$/, "expected ISO 3166-1 alpha-3");
export type CountryCode = z.infer<typeof CountryCodeSchema>;

/** "2024" (annual) · "2024-Q3" (quarterly) · "2024-06" (monthly) · full ISO date (event-grain, e.g. an election or a conflict incident). */
export const PeriodSchema = z.string().regex(/^\d{4}(-Q[1-4]|-\d{2}(-\d{2})?)?$/, "expected YYYY | YYYY-Qn | YYYY-MM | YYYY-MM-DD");

export const SubnationalRefSchema = z.object({
  level: z.enum(["state", "district"]),
  code: z.string(),   // e.g. ISO 3166-2:IN state code, or a Lok Dhaba/BOOST district id
  name: z.string(),
});
export type SubnationalRef = z.infer<typeof SubnationalRefSchema>;

export const IndicatorSchema = z.object({
  id: z.string(),                        // makeIndicatorId(sourceId, field, key, country, period[, subnational.code])
  field: IndicatorFieldSchema,
  key: z.string(),                        // provider's own indicator code, e.g. "NY.GDP.MKTP.CD", "cpi-score", "polity2"
  label: z.string(),                      // human label for the key, e.g. "GDP (current US$)"
  value: z.number(),                      // native-unit value (raw for tier-a, khazana-derived for tier-b)
  unit: z.string(),                       // "current US$", "score (0–100)", "index points (−10..10)", …
  /**
   * Cross-country, cross-time comparable score, 0–100. For sources that are
   * ALREADY a 0–100 score (CPI, Freedom House), normalizedScore === value. For raw
   * macro/fiscal series (GDP $, budget outlays), it's khazana's own percentile rank
   * against the cross-country distribution for that (key, period) — computed at
   * build time, `origin: "computed"` even when the underlying source is tier-a.
   * Required on every Indicator so the Ledger's cross-field views (radar charts,
   * heatmaps mixing 8 fields on one country) have one common axis to plot, while
   * `value` + `unit` remain the source of truth for the detail/tooltip view.
   */
  normalizedScore: z.number().min(0).max(100),
  country: CountryCodeSchema,
  subnational: SubnationalRefSchema.optional(),
  period: PeriodSchema,
  provenance: ProvenanceSchema,
});
export type Indicator = z.infer<typeof IndicatorSchema>;

export function makeIndicatorId(
  sourceId: string, field: IndicatorField, key: string,
  country: string, period: string, subnationalCode?: string,
): string {
  const parts = [sourceId, field, key, country, period, subnationalCode ?? ""].join("::");
  return createHash("sha1").update(parts).digest("hex").slice(0, 16); // mirrors makeFeedItemId
}
```

This backs the Government Ledger's "200+ indicators, ~4–5 per field per country, each
showing its own bias" requirement: every one of those 200+ numbers is an `Indicator`, and
every `Indicator` drags its own `Provenance` — there is no shared "trust the whole page"
assumption, each cell can be individually distrusted.

### 3.3 `CountryProfile` — the aggregation view

```ts
// world-country-profile.ts
export const IndicatorGroupSchema = z.object({
  field: IndicatorFieldSchema,
  indicators: z.array(IndicatorSchema),
});

export const SubnationalProfileSchema = z.object({
  level: z.enum(["state", "district"]),
  code: z.string(),
  name: z.string(),
  fields: z.array(IndicatorGroupSchema),
});

export const CountryProfileSchema = z.object({
  country: CountryCodeSchema,
  name: z.string(),
  region: z.string().optional(),
  updatedAt: z.string().datetime(),
  fields: z.array(IndicatorGroupSchema),
  /** Populated only where a source ships it — India in v1 (Lok Dhaba, Open Budgets
   *  India, NITI SDG Index, RBI DBIE); the shape is general so any country can gain
   *  this depth later without a schema change. */
  subnational: z.array(SubnationalProfileSchema).default([]),
});
export type CountryProfile = z.infer<typeof CountryProfileSchema>;
```

`CountryProfile` is a **build-time aggregation, not a second source of truth** — it's
assembled by grouping the country's `Indicator` records (already committed under
`data/world/indicators/` in the private data repo, §4.3) by `field`, plus the
subnational rows for countries where
a source ships that grain. It is regenerated whenever the slow lane runs; nothing writes
to it directly.

### 3.4 `Outlet` + `BiasProfile`

```ts
// vocab.ts addition
export const REFERENCE_RATERS = ["allsides", "adfontes", "mbfc"] as const;
export const ReferenceRaterSchema = z.enum(REFERENCE_RATERS);

// world-outlet.ts
export const ReferenceRatingSchema = z.object({
  rater: ReferenceRaterSchema,
  leanLabel: z.string(),              // the rater's OWN label, e.g. "Lean Left" — attribution only
  reliabilityLabel: z.string().optional(),
  url: z.string().url(),
  retrievedAt: z.string().datetime(),
});
export type ReferenceRating = z.infer<typeof ReferenceRatingSchema>;

export const BiasProfileSchema = z.object({
  /** khazana's OWN computed lean, −1 (far-left) .. +1 (far-right). This is what renders. */
  lean: z.object({ score: z.number().min(-1).max(1), uncertainty: UncertaintySchema, provenance: ProvenanceSchema }),
  /** khazana's OWN computed reliability, 0–100. */
  reliability: z.object({ score: z.number().min(0).max(100), uncertainty: UncertaintySchema, provenance: ProvenanceSchema }),
  /** Attribution-only overlay. Never redistributed as khazana's number — decision #4:
   *  AllSides/Ad Fontes/MBFC are all derived-only tier. */
  referenceRaters: z.array(ReferenceRatingSchema).default([]),
  /** Spread across referenceRaters' own lean labels, mapped to a common −1..1 scale
   *  purely for spread computation (not stored as anyone's official score). Informs
   *  how much to trust khazana's own lean estimate when raters strongly disagree. */
  crossRaterSpread: z.object({ min: z.number(), max: z.number(), raterCount: z.number().int().positive() }).optional(),
  /** Number of articles/reportings khazana's own lean+reliability were computed from. */
  sampleN: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});
export type BiasProfile = z.infer<typeof BiasProfileSchema>;

export const OutletSchema = z.object({
  id: z.string(),          // slug, e.g. "reuters", "the-hindu"
  name: z.string(),
  domain: z.string(),      // canonical domain for matching Reporting.url → outlet
  country: CountryCodeSchema.optional(),
  bias: BiasProfileSchema,
});
export type Outlet = z.infer<typeof OutletSchema>;
```

The load-bearing distinction: `lean`/`reliability` are khazana's own computed numbers
(each still carrying full `Provenance`, `origin: "computed"`) — those are what the Bias
Lab renders as *the* number. `referenceRaters` is purely an attribution overlay: "AllSides
independently calls this outlet Lean Left" shown *next to* khazana's number, never
substituted for it, and never stored/rendered as if it were khazana's own score — this is
decision #4's derived-only constraint applied to a whole class of sources at once.

### 3.5 `WorldEvent` + `Reporting`

```ts
// vocab.ts additions
export const WORLD_EVENT_CATEGORIES = [
  "conflict", "diplomacy", "politics", "economy", "disaster", "society", "science-tech",
] as const;
export const WorldEventCategorySchema = z.enum(WORLD_EVENT_CATEGORIES);
export const EVENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const EventSeveritySchema = z.enum(EVENT_SEVERITIES);

// world-event.ts
export const ToneSchema = z.enum(["positive", "negative", "neutral", "mixed"]);
export const StanceSchema = z.enum(["supportive", "critical", "neutral", "mixed"]);

export const ReportingSchema = z.object({
  outletId: z.string(),                 // Outlet.id
  url: z.string().url(),
  headline: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  tone: ToneSchema,                     // sentiment of the piece
  stance: StanceSchema,                 // the outlet's stance toward the event's subject
  frame: z.string(),                    // short phrase, e.g. "economic fallout" vs "humanitarian crisis"
  provenance: ProvenanceSchema,
});
export type Reporting = z.infer<typeof ReportingSchema>;

export const WorldEventSchema = z.object({
  id: z.string(),
  headline: z.string(),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    country: CountryCodeSchema.optional(),
  }),
  time: z.string().datetime(),
  category: WorldEventCategorySchema,
  /** The provider's own native taxonomy code (e.g. GDELT CAMEO root code), kept
   *  alongside our coarse `category` bucket for anyone who wants the granular code. */
  sourceCategoryCode: z.string().optional(),
  severity: EventSeveritySchema,
  reportings: z.array(ReportingSchema).default([]),
  provenance: ProvenanceSchema,          // provenance of the EVENT record itself (e.g. a GDELT GKG row)
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;
```

`reportings[]` is deliberately raw material, not a pre-digested verdict: the Globe reads
it to show "N outlets covered this, here's how their framing diverges"; the Bias Lab
computes a **same-story divergence index** from it. That index is **not** stored on
`WorldEvent` — it's a Bias Lab-owned derived view over `reportings[]` (spec 3 defines the
exact formula). Keeping it out of the Spine schema means the Spine stays the stable,
source-of-truth layer while the divergence *methodology* can iterate freely downstream.

`category`/`severity` are intentionally a small, human-legible v1 enum (not GDELT's ~300
CAMEO codes) — the Globe spec may refine the mapping from `sourceCategoryCode` →
`category`, but the coarse bucket is what ships to the UI.

### 3.6 `Contract` — a government/procurement award (OCDS-aligned)

```ts
// world-contract.ts
export const ContractSchema = z.object({
  id: z.string(),                        // OCDS `ocid` where available, else a stable hash
  buyer: z.object({ name: z.string(), id: z.string().optional() }),
  supplier: z.object({ name: z.string(), id: z.string().optional() }),
  value: z.object({ amount: z.number().nonnegative(), currency: z.string().length(3) }), // ISO 4217
  country: CountryCodeSchema,
  sector: z.string().optional(),         // free-text in v1 (CPV/UNSPSC mapping is a phase-2 refinement)
  date: z.string().datetime(),           // award date
  method: z.string().optional(),         // "open tender" | "limited" | … — provider's own vocabulary, kept free-text
  status: z.enum(["planned", "active", "complete", "cancelled"]).optional(),
  provenance: ProvenanceSchema,
});
export type Contract = z.infer<typeof ContractSchema>;
```

**Comparators-first sequencing — but GeM/CPPP is in the main build (D3).** USAspending,
TED, and OCDS-native feeds ship structured, queryable APIs today — those are the first
`Contract` fetchers built. India (GeM/CPPP) is genuinely harder: neither exposes an
OCDS-native API, so India procurement needs a bespoke scraper + an OCDS mapper (prior
art: the `mcp-india-tenders` project — worth studying its scraping approach and mapping
choices before building khazana's own). Per the density mandate, that harder build is
**part of the main initiative, not a deferred phase 2**: it is sequenced *after* the
API-backed comparator fetchers so it never blocks the Ledger's procurement view, but it
is a scheduled task inside this build, not a someday follow-up. See §7 for the full
phasing; the original open timing question this raised is closed (§8, D3).

### 3.7 `WorldSourceEntry` + `WorldRegistry` — the world-data source registry

Mirrors `SourceEntrySchema`/`RegistrySchema` (`packages/core/src/registry.ts`) one-for-one,
in a new file because the shape a world source produces (`Indicator` | `WorldEvent` |
`Contract`, not `FeedItem`) is disjoint from the ingest registry's `Source` contract.

```ts
// world-source.ts
export const CADENCE_LANES = ["fast", "medium", "slow"] as const;
export const CadenceLaneSchema = z.enum(CADENCE_LANES);

export const WorldSourceEntrySchema = z.object({
  id: z.string(),                          // e.g. "world-bank-wdi", "gdelt-gkg", "usaspending", "allsides"
  name: z.string(),
  homepage: z.string().url(),
  licenseTier: LicenseTierSchema,           // the CEILING this source permits — see §3.1 rationale
  cadenceLane: CadenceLaneSchema,
  fields: z.array(IndicatorFieldSchema).default([]),   // which Indicator fields this source feeds (empty for event/outlet/contract sources)
  countries: z.array(CountryCodeSchema).optional(),     // omitted = global coverage
  enabled: z.boolean().default(true),
  trustScore: z.number().min(0).max(1).default(0.5),   // same semantics as SourceEntry.trustScore
  addedAt: z.string().datetime().optional(),
  lastFetchedAt: z.string().datetime().optional(),
  failureCount: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});
export type WorldSourceEntry = z.infer<typeof WorldSourceEntrySchema>;

export const WorldRegistrySchema = z.object({
  version: z.number().int().default(1),
  sources: z.array(WorldSourceEntrySchema).default([]),
});
export type WorldRegistry = z.infer<typeof WorldRegistrySchema>;

export function parseWorldRegistry(json: unknown): WorldRegistry {
  return WorldRegistrySchema.parse(json);
}
```

Lives at `data/world-sources.json` **in the private `khazana-world-data` repo** (D2 —
parallel in spirit to the public repo's `data/sources.json`), seeded from a
`data/world-sources.seed.json` in the same repo, same "data, not config-as-code" ethos as
the existing Source Scout registry — though Scout-style *automatic* discovery is
explicitly **out of scope for v1**: each world source requires a bespoke fetcher/mapper
(SDMX, OCDS, CSV bulk downloads, scraped HTML), not the generic "any RSS/Reddit/HN feed
qualifies" model Scout was built for.

The ~15 world sources named in this spec are hand-curated — but per the density mandate
(D3) they are the **seed, not the boundary**. The registry is expected to grow
continuously: full WDI/V-Dem/OWID catalogs rather than hand-picked subsets, plus every
further source that can be ingested reliably. §5's "How to add a world source" recipe is
the standing mechanism for that growth — each addition is one registry entry + one
fetcher + one fixture test, no schema change required — and the Ledger spec's
**Indicator Browser** is the downstream surface designed to absorb unbounded catalog
growth (thousands of keys × countries × periods) without bloating the curated country
reports.

---

## 4. Ingest architecture

### 4.1 Package placement: new `packages/world-ingest`

Not an extension of `packages/ingest`. Rationale:

- **Different shape.** `packages/ingest`'s whole contract (`Source.fetch(ctx): FeedItem[]`)
  is built around one normalized item type. World sources produce three entirely
  different shapes (`Indicator[]`, `WorldEvent[]`, `Contract[]`) via entirely different
  wire formats (SDMX XML, OCDS JSON, CSV bulk downloads, scraped HTML) — forcing them
  through the `FeedItem` contract would mean either a lossy shim or a parallel contract
  living inside the same package, which is worse than just having two packages.
- **Isolation principle** (CLAUDE.md: "each source, each surface, each pipeline stage is a
  small, independently testable unit"). `packages/ingest` already carries ~2000 tests and
  is on the record as a laptop-safety concern (see `EXPLORER.md`'s "Laptop safety &
  cloud-verify" note — parallel local builds have crashed the founder's Mac). A second,
  large, independent dataset pipeline belongs in its own package with its own test run,
  not folded into an already-heavy one.
- **Precedent for cross-package reuse already exists.** `packages/scout/package.json`
  already depends on both `@khazana/core` and `@khazana/ingest` (`workspace:*`).
  `packages/world-ingest` follows that exact pattern: it depends on `@khazana/core` (for
  the schemas in §3) and `@khazana/ingest` (to reuse the conditional-GET cache
  (`cache/conditional.ts`, `cache/store.ts`) and the fetch-error classifier
  (`fetch-result.ts`'s `classifyOk`/`classifyError`/`isPermanent`) rather than
  reimplementing ETag handling and permanent-vs-transient failure classification from
  scratch).

Structure, mirroring `packages/ingest`'s own layout:

```
packages/world-ingest/src/
  sources/
    world-bank-wdi.ts      world-bank-wgi.ts     imf-sdmx.ts
    ucdp.ts                gdelt-gkg.ts          usaspending.ts
    ted.ts                 ocds.ts               transparency-cpi.ts
    polity5.ts             freedom-house.ts      fred.ts
    open-budget-survey.ts  acled.ts              allsides.ts
    adfontes.ts            mbfc.ts               gem-india.ts   # main build, sequenced after comparators (§7, D3)
    niti-sdg.ts            rbi-dbie.ts           lok-dhaba.ts
    open-budgets-india.ts
  aggregate/
    country-profile.ts     # builds CountryProfile from committed Indicator shards
    bias-profile.ts        # computes Outlet.bias from outlet corpus + reference-rater overlay
  registry-io.ts            # read/write data/world-sources.json (mirrors ingest's registry-io.ts)
  index.ts
```

Each `sources/<id>.ts` implements one small interface per output shape:

```ts
export interface WorldIndicatorSource {
  id: string;
  cadenceLane: CadenceLane;
  fetch(ctx: FetchContext): Promise<Indicator[]>;
}
export interface WorldEventSource {
  id: string;
  cadenceLane: "fast";
  fetch(ctx: FetchContext): Promise<WorldEvent[]>;
}
export interface WorldContractSource {
  id: string;
  cadenceLane: CadenceLane;
  fetch(ctx: FetchContext): Promise<Contract[]>;
}
```

(`FetchContext` is imported unchanged from `@khazana/core`/`@khazana/ingest`'s existing
`{ now, limit? }` shape — no reason to invent a second one.)

### 4.2 Cron cadence tiers

| Lane | Sources | Frequency | Why this cadence |
|---|---|---|---|
| **Fast** | GDELT GKG/events, outlet reportings for dedup | ~every 20 min | GDELT's own upstream updates every 15 min; this is the "live pinging globe" data. Committed JSON + mirrored to Worker KV (§4.4) so the Globe can show something newer than the last full Astro build. |
| **Medium** | ACLED, USAspending/TED/OCDS/GeM contract awards, outlet corpus scan → `BiasProfile` recompute | daily | These update at most daily upstream; a daily job is both sufficient and cheap. |
| **Slow** | WDI, WGI, IMF SDMX, UCDP, CPI, Polity5, Freedom House, FRED, Open Budget Survey/BOOST, NITI SDG Index, RBI DBIE, Lok Dhaba, Open Budgets India | weekly poll | Every one of these upstreams is quarterly-or-slower in practice; a weekly cron is a cheap "did anything change" check, not a meaningful cadence requirement. |

Two new workflows, mirroring the existing `feed-refresh.yml` / `pipeline.yml` split.
Both are **defined and run in the public repo but commit to the private
`khazana-world-data` repo** (D2): public repos get unlimited free Actions minutes while
private repos get only 2,000/month — not enough for a ~20-minute fast lane — so compute
lives public and data lives private. Each job authenticates its push with the repo-scoped
fine-grained token (or GitHub App token) held as an Actions secret (§2).

- **`world-refresh.yml`** (fast lane, ~every 20 min): fetch → push `data/world/events/`
  to the private repo → PUT the latest rollup to the Worker (§4.4). **No Astro rebuild,
  no Pages deploy** — this is a cheap commit-only job, and its 20-minute-cadence commits
  now land in the private repo's history, not the public one's (D2).
- **`world-pipeline.yml`** (medium + slow lanes, daily): fetch → push
  `data/world/{contracts,outlets,indicators,countries}/` to the private repo → full
  Astro rebuild (the build job checks the private repo out via `actions/checkout` + the
  same token to read `data/world/`) → Pages deploy (Atlas surface picks up the day's
  indicators/contracts/bias profiles).

Both use their **own concurrency group** (`khazana-world-ingest`), deliberately separate
from the existing `khazana-pages-deploy` group that `pipeline.yml`/`feed-refresh.yml`
share. Two reasons: (1) a 20-minute-cadence job racing the existing Feed/Reads deploy slot
would either starve the Feed refresh or get starved by it; (2) `world-refresh.yml` doesn't
deploy at all, so it has no reason to serialize against Pages deploys in the first place.
`world-pipeline.yml`, which *does* deploy, should still be considered for folding into the
existing `khazana-pages-deploy` group at implementation time if daily-cadence collisions
turn out to matter in practice — flagged as an implementation-time call, not a spec
decision, since it depends on observed Actions run overlap.

Public-repo Actions minutes are free and unlimited (per `RUNBOOK.md`) — which is exactly
why the workflows stay in the public repo even though every byte they produce lands in the
private one (D2). Cost is therefore not the constraint — job *count* and *overlap
discipline* are (see §8's open question on exact fast-lane frequency vs. GDELT's own rate
limits).

### 4.3 Static JSON layout — rooted in the private `khazana-world-data` repo (D2)

```
khazana-world-data/                    # NEW, PRIVATE repo — all world data lives here (D2)
  data/
    world-sources.json            # WorldRegistry — mirrors the public repo's data/sources.json in spirit
    world-sources.seed.json
    world/
      indicators/<ISO3>/<field>.json   # Indicator[] for that country+field, all periods
      countries/<ISO3>.json            # CountryProfile — build-time aggregation (§3.3)
      outlets/outlets.json              # Outlet[] with BiasProfile
      events/
        <YYYY-MM-DD>.json               # daily WorldEvent shard, fast lane, rolling window
        latest.json                     # small rollup of most recent N events (mirrors the Worker mirror payload)
      contracts/<ISO3>/<YYYY>.json      # Contract[] shards, comparators first (§3.6, §7)
```

Downstream derived layers (the Bias Lab's divergence outputs, Conflict Theaters' theater
layers, Government Structure's diagrams — specs 3, 6, 7) also commit under this repo, not
the public one: the D2 boundary is "all world data, including everything derived from it,
is private". The ingest workflows (§4.2) push here from the public repo; the site build
checks this repo out read-only at build time (§2).

Sharding by country (and by year for contracts, by day for events) follows the same
reasoning as the existing `data/feed/archive.json` rolling-window pattern: bounded file
size, cheap incremental merge (union by `id`, fresh wins), and a retention window for the
fast lane's event shards (see §8 — the private repo removes the public-history bloat
pressure the original spec worried about, but the exact window is still tunable, likely
mirroring the existing `ARCHIVE_WINDOW_DAYS`/`RETENTION_DAYS` knobs).

### 4.4 Worker summary-endpoint contract for near-live hydration

Extends `apps/worker` (not a new Worker — same free tier, same deployment). Two new
routes in `handler.ts`, alongside the existing `/health`, `/event`, `/events`, `/summary`:

```
GET  /world/latest
     Public, read-only, no auth. Returns the fast lane's most recent WorldEvent
     rollup (small, capped count — mirrors the existing MAX_SUMMARY_EVENTS pattern
     in handleSummary). This is what the Globe polls client-side between full
     site rebuilds.
     200 { updatedAt: string; events: WorldEvent[] }   // events.length capped, newest-first

PUT  /world/ingest
     Token-gated (Authorization: Bearer <WORLD_INGEST_TOKEN>, a new secret — same
     fail-secure pattern as the existing EXPORT_TOKEN gate on /events). Called ONLY
     by world-refresh.yml's Action after it commits the fast lane's JSON, to mirror
     that same rollup into KV. Not writable from the client.
     202 { ok: true }   |   401 unauthorized   |   503 WORLD_INGEST_TOKEN not configured
```

Same CORS/no-PII/founder-only ethos as the existing Worker: `/world/latest` is public
because it carries no personal data (it's the same `WorldEvent` rollup committed to the
private data repo, just fresher), and `/world/ingest` is write-gated exactly like the
existing `/events` export endpoint, just inverted (push instead of pull). No new
always-on component — same Worker, same KV namespace, two new key-prefixes
(`world:latest`, mirroring the existing `evt:` prefix convention). **This contract is
unchanged by D2**: the mirror already carries only the small capped rollup, and the site
consuming it is gated anyway — moving the full dataset to a private repo doesn't change
what this endpoint exposes.

---

## 5. Testing approach

- **Zod round-trip tests, one file per schema, colocated** (`world-indicator.test.ts` next
  to `world-indicator.ts`, etc.) — mirrors `feed-item.test.ts`/`registry.test.ts`:
  - a valid, fully-populated fixture parses and round-trips unchanged;
  - `.default()` fields (e.g. `CountryProfile.subnational`) apply when omitted;
  - each `superRefine` constraint is exercised **both ways**: assert that
    `licenseTier: "derived-only"` + `redistribution: true` throws, and that the same
    tier with `redistribution: false` does not — the enforcement in §3.1 is only real if
    a test would fail on a regression;
  - the `UncertaintySchema` discriminated union is tested for all five `kind` variants,
    including that a wrong shape for a given `kind` (e.g. `standardError` without `se`)
    is rejected.
- **Fixture-based fetcher tests, one per source**, mirroring
  `packages/ingest/src/fetchers/rss.test.ts`'s pattern: a canned response fixture (SDMX
  XML, OCDS JSON, CSV excerpt, scraped-HTML excerpt) under
  `packages/world-ingest/src/__fixtures__/<source-id>/`, fed through the source's
  `fetch()`, asserting the mapped `Indicator`/`WorldEvent`/`Contract` fields **and** that
  `provenance.licenseTier`/`redistribution`/`origin` come out correctly stamped for that
  source's known tier — a fixture test that only checks `value` and ignores `provenance`
  would miss the entire point of this spec.
- **Aggregation tests** for `aggregate/country-profile.ts` and `aggregate/bias-profile.ts`:
  given a fixed set of committed `Indicator`/reportings fixtures, assert the exact grouped
  `CountryProfile`/`BiasProfile` output — these are pure functions over already-fetched
  data, so no network fixture is needed, just deterministic input/output pairs.

### How to add a world source (mirrors CLAUDE.md's "How to add a source")

This recipe is not just onboarding documentation — per the density mandate (D3) it is the
**standing growth mechanism** for the registry: the ~15 seed sources are a floor, and
this four-step loop is how the catalog grows continuously toward "everything that can be
found/calculated reliably".

1. Add an entry to `data/world-sources.json` (or `.seed.json`) **in the private
   `khazana-world-data` repo** (§4.3, D2) matching `WorldSourceEntrySchema` — set
   `licenseTier` correctly per decision #4's two buckets (get this wrong and the
   `Provenance` schema will reject every datum the fetcher produces).
2. Create `packages/world-ingest/src/sources/<id>.ts` implementing the matching
   `WorldIndicatorSource` / `WorldEventSource` / `WorldContractSource` interface — one
   file, one `fetch(ctx)`.
3. Add a fixture + test under `src/__fixtures__/<id>/` per §5 above.
4. Register it in `packages/world-ingest/src/index.ts`. Run `pnpm test` to verify.

---

## 6. Dependency note — this is spec 1 of 7

Everything downstream is written *against* this contract. The sequence is Spine → Globe →
Bias Lab → Ledger → Extras → Conflict Theaters → Government Structure. What each spec
will pull from the Spine:

- **Spec 2, the Globe** — `WorldEvent` (incl. `geo`, `time`, `category`, `severity`,
  `reportings[]`) for map placement and event clustering; `Outlet` (via
  `reportings[].outletId`) to badge each reporting; the `/world/latest` Worker endpoint
  (§4.4) for near-live hydration between builds; `data/world/events/latest.json` as the
  static fallback.
- **Spec 3, the Bias Lab** — `Outlet`/`BiasProfile` in full, including the
  attribution-only `referenceRaters[]` overlay and `crossRaterSpread`; `WorldEvent.
  reportings[]` as the raw material for the same-story divergence index (computed here,
  not in the Spine, per §3.5); the `licenseTier`/`redistribution` invariant on
  `Provenance` to keep AllSides/Ad Fontes/MBFC data attribution-only in the UI.
- **Spec 4, the Government Ledger** — `Indicator` and `CountryProfile` in full, including
  `normalizedScore` as the common cross-field plotting axis and `subnational[]` for
  India depth; `Contract` for the procurement view (comparators first, per §7); every
  `Provenance` field for the "each indicator shows its own bias" transparency
  requirement, incl. rendering `uncertainty` per its `kind`.
- **Spec 5, Extras** — whatever cross-cutting polish (search, digest, taste-integration
  for Atlas, etc.) turns out to need; likely reads `WorldSourceEntry`/`WorldRegistry` for
  a Sources-explorer-style Atlas equivalent, and `Provenance` for a shared "methodology"
  UI component reusable across Globe/Bias Lab/Ledger.
- **Spec 6, Conflict Theaters** (`2026-07-07-atlas-conflict-theaters-design.md`, D6) —
  reads `WorldEvent` in full: the `conflict` category, `severity`, `geo`, and
  `reportings[]` are its raw material for theater pages, the globe-wide conflict lens,
  and escalated event cards. It adds its own theater-owned schemas in a new flat core
  file, `packages/core/src/world-theater.ts` (front-line/control-area layers, OSINT
  source entries) — owned by spec 6, following the same "the derived layer owns its own
  schemas" discipline as the Bias Lab's divergence index (§3.5) and its
  `world-bias-lab.ts`: the Spine stays the stable source-of-truth layer while the
  theater methodology iterates freely downstream.
- **Spec 7, Government Structure** (`2026-07-07-atlas-government-structure-design.md`,
  D5) — adds a new flat core file, `packages/core/src/world-government.ts`
  (structure/power-flow schemas: system type, branches, chambers, federal levels,
  appointment/accountability flows), owned by spec 7 under the same discipline. Its
  dataset spine (Comparative Constitutions Project, DPI, V-Dem institutional variables,
  ParlGov, IDEA) registers through `WorldSourceEntry` and carries `Provenance` like
  every other world datum.

---

## 7. Build order / phasing

1. **This Spine**: schemas (§3) + `packages/world-ingest` skeleton + registry + tests.
2. **Comparators-first data**: World Bank WDI/WGI, IMF SDMX, UCDP, GDELT, USAspending,
   TED, native-OCDS feeds, CPI, Polity5, Freedom House, FRED, Open Budget Survey/BOOST,
   ACLED, AllSides/Ad Fontes/MBFC — all have queryable APIs or clean bulk downloads.
   Ships the Globe, Bias Lab, and a *global* Government Ledger without touching India's
   harder sources.
3. **India depth**: NITI SDG Index, RBI DBIE, Lok Dhaba, Open Budgets India
   (all have workable APIs/bulk data — these are NOT the blocker) feed
   `CountryProfile.subnational[]` for India. The genuinely hard piece is **GeM/CPPP
   procurement**, which needs a bespoke scraper + OCDS mapper (study `mcp-india-tenders`
   first) — **pulled forward into the main build (D3)**, no longer a deferred phase 2.
   It is sequenced after comparators-first `Contract` data is live so it never gates
   shipping the rest of India's depth, but it is a scheduled task inside this
   initiative, not a someday follow-up.
4. **Continuous densification (D3)**: beyond the named seed sources, ingestion is
   open-ended — the full WDI/V-Dem/OWID catalogs and any further reliably-ingestable
   source get added continuously via §5's "How to add a world source" recipe, with the
   Ledger spec's Indicator Browser absorbing the resulting catalog growth.

---

## 8. Open questions — status after the 2026-07-07 founder review

- **Fast-lane frequency — still open.** ~20 min is this spec's proposal, balanced against
  GDELT's own update cadence (~15 min) and Actions runner overhead per invocation. Worth
  confirming against GDELT's actual rate-limit/ToS once the fetcher is being built, not
  assumed here.
- **India GeM/CPPP scraper timing — CLOSED (D3).** Pulled forward into the main build:
  sequenced after the API-backed comparator fetchers (§3.6, §7) but a scheduled task
  inside this initiative, not a deferral. The "study `mcp-india-tenders` first" note
  stands.
- **Reference-rater ToS — still open.** AllSides/Ad Fontes/MBFC each have their own terms
  of use for fetching/caching their ratings, even as attribution-only overlay data (never
  redistributed as khazana's own score). Worth a quick ToS read — possibly a Sonnet
  credibility-reasoning pass mirroring how Source Scout handles borderline sources —
  before `outlet-ingest` fetchers are built against them.
- **`Contract.value` currency normalization — still open.** Store native currency only (as
  specified in §3.6), or also carry a USD-normalized figure with its own `Provenance` (FX
  rate source + date)? Cross-country procurement comparison in the Ledger likely wants the
  latter; this spec left `Contract` single-currency to keep v1 buildable and defers the
  normalized-USD field to whichever downstream spec first needs cross-country contract
  comparison.
- **Fast-lane retention window — RELAXED by D2.** `data/world/events/<date>.json` still
  needs a bound (mirrors the existing `ARCHIVE_WINDOW_DAYS`/`RETENTION_DAYS` pattern), but
  the original tension — "how far back can the Globe scroll" vs. bloating the *public*
  repo's committed history — is mostly gone now that event shards land in the private
  `khazana-world-data` repo (§4.3). The exact window is still tunable, a call better made
  once real event volume is observed, but it is now a housekeeping knob, not an
  architecture pressure.
- **`world-pipeline.yml`'s concurrency group — still open.** §4.2 flags folding the daily
  medium/slow-lane deploy job into the existing `khazana-pages-deploy` group as an
  implementation-time call rather than settling it here — depends on observed overlap
  between it and the existing `pipeline.yml`/`feed-refresh.yml` runs.
