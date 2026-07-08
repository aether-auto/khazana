# Atlas — The Bias Lab (design spec)

> *Atlas's transparency engine: a news-outlet Bias Lab that computes its own lean and
> reliability scores from real, published, reproducible methods — and shows the bias of
> that rating as prominently as the rating itself. Third-party raters (AllSides, Ad
> Fontes, MBFC) appear only as an attributed overlay, never as khazana's own number. This
> spec renders pixels and defines the analytics that produce them; spec 1 (the Spine)
> defines the data contract it consumes verbatim, and spec 2 (the Globe) hands it its
> flagship view's raw material.*

**Status:** Proposed — spec 3 of 8 (Atlas: Spine → Globe → **Bias Lab** → Ledger → Extras →
Conflict Theaters → Government Structure → Two Faces)
**Date:** 2026-07-07
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring — same binding constraint as khazana v1, the Spine, and the
Globe. No paid APIs, no paid hosting, no GPU, no always-on machine beyond the existing free
Cloudflare Worker.

**Amended 2026-07-07 after founder interview** — see
`docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md` (binding; D1–D12 cited
inline below). Changes: renumbered into an eight-spec family (D5, D6, D11); outlet seed
closed to global majors + a deep India set (D8, §0.3); reference-rater overlay settled
default-visible (D9, §3.2); flagship divergence engine gains a corroborated-core
sub-computation that now feeds the Globe's event card too (D7, §0.1, §4.5, §6.1); new
wartime editorial physics for conflict-category events (D6.4, §4.7); world data moved to
the private `khazana-world-data` repo (D2, §2, §6.3); §12 closed accordingly.

**Reads first:** `docs/superpowers/specs/2026-07-07-world-data-spine-design.md` (spec 1 —
the `Outlet`/`BiasProfile`/`WorldEvent`/`Reporting` schemas and the `Provenance`
uncertainty union this spec consumes verbatim, plus the derived-only vs.
redistribute-raw license tiers that make Layer 2 attribution-only a *schema-enforced*
fact, not a convention), `docs/superpowers/specs/2026-07-07-atlas-globe-design.md` (spec
2 — the Globe hands this spec's flagship view a `WorldEvent.id` + resolved
`reportings[].outletId[]`, §6.3's handoff contract, and — after D7 — receives the
corroborated core back for its own event card, §0.1), the forthcoming spec 6, Conflict
Theaters (`2026-07-07-atlas-conflict-theaters-design.md`), which §4.7's wartime editorial
physics draws its theater/belligerent data from, `docs/superpowers/specs/2026-06-23-khazana-design.md`
(house vision/voice/altitude), and the Reads component kit under
`apps/site/src/components/mdx/` (Chart/Scatter/Distribution/Slopegraph/RangePlot/
ForceComparison/DataTable/… — every visualization in this spec reuses one of these; none
is reinvented).

---

## 0. What the Bias Lab is, and what it is not

Every existing outlet-bias product — AllSides, Ad Fontes, MBFC, Ground News — publishes a
rating and asks the reader to trust the panel behind it. The Bias Lab does something
different: it **computes its own lean and reliability score from real, published, $0-
reproducible methods**, and it treats the *uncertainty of that computed score* as
first-class content, not a footnote. The title is literal — this is a lab page for "the
bias of the bias rating," not just a bias rating.

**The binding two-layer model** (settled per the founder's brief, elaborated in full in
§3):

1. **Layer 1 — khazana's own computed scores.** What renders as *the* number. Built from
   five published-method families (§4): a free-signal outlet predictor (Baly et al.
   2018), unsupervised text-scaling on khazana's own corpus (Wordfish), always-fresh
   outlet-level tone timelines (GDELT DOC 2.0), an explainable content-feature reliability
   classifier (NELA-GT), and the flagship same-story divergence/corroboration engine.
   Every one of these produces a khazana-computed `Provenance.origin: "computed"` datum,
   never a copied third-party number.
2. **Layer 2 — reference-rater overlay, attribution only.** AllSides, Ad Fontes, and MBFC
   shown side by side via outbound links, never mirrored or redistributed as khazana's
   own score (spec 1 §3.1's `superRefine` makes this a schema violation, not a rendering
   discipline the Bias Lab has to remember to honor). Their **spread across the three** is
   itself rendered as a built-in "how much do even the professionals disagree" bar — the
   Ground News precedent, inverted: Ground News *averages* the three raters into one
   blended number; this page instead **exposes the disagreement**, because averaging away
   disagreement is itself a form of false precision.

**What it is not:**

- **Not a media-bias-chart clone.** The whole point is that every number on this page
  cites its own method, its own sample size, and its own error bars — none of the three
  reference products does this for their own ratings.
- **Not a redistribution of AllSides/Ad Fontes/MBFC's data.** Never stored raw, never
  shown as khazana's number — spec 1 §1 decision 4's `derived-only` license tier is why.
- **Not (in v1) a fine-tuned bias/factuality classifier.** Off-the-shelf model
  *inference* (Sentence-BERT embeddings, an NLI checkpoint) is in scope for v1; *training*
  a bespoke transformer classifier on labeled bias data is deferred to v2 (§4, rank
  table) because it breaks the $0-in-GH-Actions-cron reproducibility this whole system is
  built on.
- **Not a Read format.** Unlike the flagship MDX blogs (khazana v1 §6), the Bias Lab is a
  hand-built Astro/React page tree under `apps/site/src/pages/atlas/bias-lab/`, exactly
  like the Globe (spec 2 §3.1). It sits outside the richness-gate/`FormatKit`
  machinery (`packages/generate/src/component-contract.ts`) entirely — but it imports
  directly from the same `apps/site/src/components/mdx/` barrel (`index.ts`) as its
  visualization primitives, a workspace-internal reuse, not a duplicate component tree.
  The Globe already sets this precedent (`GlobeFallback` reuses `mdx/Map.tsx`'s d3-geo
  primitives instead of a new map asset); the Bias Lab reuses `Scatter`, `RangePlot`,
  `DataTable`, `ForceComparison`, `Chart`, `SmallMultiples`, and `StatBand` the same way
  (§9's full mapping table).

### 0.1 Relationship to the Globe (spec 2) — the handoff, honored exactly

Spec 2 §6.3 commits to a precise contract: the Globe's event card, on "see the full
divergence," passes forward exactly two things — **`WorldEvent.id`** and **the list of
`reportings[].outletId` already resolved on that card** — so the Bias Lab can compute its
same-story divergence index without re-deriving which outlets covered the story. This
spec's flagship view (§8.4) is the receiving end of that handoff: it resolves by
`WorldEvent.id` against the committed event shard (or the Worker's near-live mirror, spec
1 §4.4), reads the already-known `reportings[].outletId` list straight off that event, and
does not re-cluster or re-discover which outlets are in play — that work is Globe/Spine's,
not this spec's, per spec 1 §3.5's explicit note that the divergence index is
Bias-Lab-owned but `reportings[]` themselves are Spine-owned raw material.

**The handoff now runs both ways (D7).** Once this spec's divergence engine computes a
`corroboratedCore` (§4.5) for an event, that output feeds back to the Globe's own event
card as its headline line (spec 2 §6, amended) — the Globe still owns event
discovery/clustering and this spec still owns the divergence methodology, but the
computed result now flows upstream to the surface that started the handoff, not just
downstream to this spec's own story page (§8.4).

### 0.2 Relationship to the Government Ledger (spec 4)

No direct data dependency — the Ledger's `Indicator`/`CountryProfile` schemas (spec 1
§3.2–3.3) are disjoint from `Outlet`/`BiasProfile`. The only shared surface is the Shell
chrome, design tokens, and the general "every number carries its own `Provenance`"
discipline spec 1 established once for all three specs to inherit.

### 0.3 The outlet seed set (D8 — closes §12)

The founder interview closed §12's "which outlets to seed first" question: **~30–50
global wire/major outlets** (Reuters, AP, AFP, BBC, NYT, WaPo, Guardian, Al Jazeera,
Economist, FT, …) **plus a deep India set** (The Hindu, Times of India, Hindustan Times,
Indian Express, NDTV, Republic, WION, Zee News, India Today, OpIndia, The Wire, Scroll,
The Print, ANI, PTI, …) — D8.

The rationale is specific to why the Bias Lab exists at all: AllSides, Ad Fontes, and
MBFC's Layer 2 coverage (§3.2) barely reaches Indian outlets, so khazana's own Layer 1
computation (§3.1) is doing the most work exactly where the reference-rater overlay is
thinnest. In practice this means **India outlet profiles will often be Layer-1-only** —
no Layer 2 attribution row, no cross-rater spread — for the foreseeable future, and every
page that renders the Layer 2 row (§8.3) must present a Layer-1-only India profile as the
**normal state**, not as missing or incomplete data.

Per D3's density mandate, this seed is a **floor, not a ceiling**: any outlet that recurs
in ingested `WorldEvent.reportings[]` beyond the seed list earns a provisional profile
once it clears the §5.3 sample-size floor — the same "put in literally everything that
can be found/calculated reliably" posture as the rest of Atlas. §4's per-outlet
computations run identically over seeded and provisional outlets alike.

---

## 1. Binding decisions (settled)

1. **Two-layer model is structural, not conventional.** Layer 1 (khazana-computed)
   renders as *the* number; Layer 2 (AllSides/Ad Fontes/MBFC) is attribution-only,
   enforced by spec 1's `Provenance.superRefine` (`derived-only` + `redistribution: true`
   is a parse-time error) — a Bias Lab renderer cannot accidentally treat a reference
   rating as khazana's own score even under a coding mistake, because the datum's own
   schema would already have rejected that shape.
2. **All Layer 1 computation is $0 and runs inside the existing GH Actions medium lane**
   (spec 1 §4.2's daily "outlet corpus scan → `BiasProfile` recompute" job), inside the
   existing `packages/world-ingest` package (spec 1 §4.1) — no new package, no paid
   inference API, no GPU. Embedding/NLI inference (§4.5) runs as CPU-only WASM inference
   inside the Actions runner, not a hosted model API.
3. **Uncertainty is first-class, everywhere, always visible** — inherits spec 1 §1
   decision 3's "no bare numbers ever reach the UI" and applies it specifically and
   aggressively to bias/reliability scores: every rendered score carries a visible
   range/spread/n, and a **persistent uncertainty strip** (§5.5) sits on every Bias Lab
   page, not just a dedicated methodology page nobody clicks.
4. **Dual-axis over single left-right axis for this page's own primary chart.** A single
   −1..+1 lean creates **false symmetry**: an outlet scoring exactly 0 could be genuinely
   neutral, or could be equally hostile toward *both* sides — the single axis cannot tell
   these apart (the BiasLab 2025 precedent named in the brief). This spec's flagship
   leaderboard chart (§8.2) instead plots **tone-toward-left** and **tone-toward-right**
   as independent x/y axes. Spec 1's `BiasProfile.lean` (a single −1..1 score, schema
   settled and binding) remains the one-number summary used everywhere a compact chip is
   needed (the Globe's per-reporting badge, spec 2 §6.1; a sortable table column, §8.2) —
   the dual-axis pair is a **Bias-Lab-owned derived presentation**, computed from the same
   underlying signals but *not* a Spine schema field, mirroring spec 1 §3.5's own
   precedent that the same-story divergence index lives outside `WorldEvent` precisely so
   the Spine stays stable while methodology iterates downstream (§6 defines exactly where
   this new derived data lives).
5. **Same-story divergence + corroboration is the flagship view, and it is Bias-Lab-owned**
   per spec 1 §3.5's explicit note — computed over `WorldEvent.reportings[]`, never stored
   on `WorldEvent` itself, fed by the Globe's handoff (§0.1).
6. **No Spine schema changes.** `Reporting` (spec 1 §3.5) carries only `headline` (optional),
   `url`, `tone`, `stance`, `frame` — no article body. Where the divergence engine needs
   deeper text than a headline, this spec adds its **own** small cache
   (`data/world/bias-lab/reporting-snippets/`, §6.2) fetched from `Reporting.url`, not a
   change to the Spine's `Reporting` schema — the same "Bias-Lab owns its own derived
   layer" discipline as decision 4 and 5.
7. **No new visualization primitive.** Every view in this spec maps onto an existing
   `apps/site/src/components/mdx/` component (§9's mapping table is exhaustive for v1) —
   the brief's instruction to reuse the Reads kit rather than invent one is treated as
   settled, not aspirational.

---

## 2. Architecture at a glance

```
┌─ data/world/ (committed, spec 1 §4.3) ─────────────────────────────────────────────┐
│  outlets/outlets.json          # Spine — BiasProfile (Layer 1 + Layer 2), UNCHANGED │
│  events/<date>.json            # Spine — WorldEvent.reportings[], read-only input   │
└──────────────────────────────────────────────────────────────────────────────────────┘
        │ consumed by ↓
┌─ packages/world-ingest/src/bias-lab/ (NEW subtree, same package as spec 1 §4.1) ────┐
│  baly-classifier.ts    gdelt-tone.ts      nela-apply.ts      wordfish.ts             │
│  divergence.ts         claim-check.ts     dual-axis.ts                              │
│  (offline, one-time)   scripts/train-nela-classifier.ts, scripts/train-baly-classifier.ts │
└──────────────────────────────────────────────────────────────────────────────────────┘
        │ commits ↓ (medium lane, daily, spec 1 §4.2)
┌─ data/world/bias-lab/ (NEW, Bias-Lab-owned derived layer, §6.1) ────────────────────┐
│  dual-axis.json   wordfish.json   nela-features/<id>.json   nela-classifier.json    │
│  divergence/<eventId>.json   reporting-snippets/<eventId>.json   baly-classifier.json│
└──────────────────────────────────────────────────────────────────────────────────────┘
        │ static build (Astro, Atlas surface)
        ▼
┌─ apps/site/src/pages/atlas/bias-lab/ ─────────────────────────────────────────────────┐
│  index.astro (leaderboard)   outlets/[outletId].astro   story/[eventId].astro         │
│  methodology.astro (bias-of-the-bias)                                                 │
│  → apps/site/src/components/atlas/BiasLab*.tsx → imports mdx/{Scatter,RangePlot,      │
│    DataTable,ForceComparison,Chart,SmallMultiples,StatBand} DIRECTLY, no new kit       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Repo boundary note (D2):** the diagram above shows logical data flow; physically,
`data/world/` and `data/world/bias-lab/` now live in the private `khazana-world-data`
repo, read by the public site's build at fetch time via a scoped token (spine §2/§4
amendment) — orthogonal to the flow shown here.

Same ethos as spec 1 and spec 2: **the page works from committed data with zero client-side
ML inference** — every embedding/NLI/classifier computation happens once, in the cron, and
is committed as static JSON; the browser only ever renders precomputed numbers.

---

## 3. The two-layer model, precisely

### 3.1 Layer 1 — khazana's own computed scores (recap; full depth in §4)

| # | Method | What it computes | Real citation |
|---|---|---|---|
| 1 | Baly et al. 2018 free-signal predictor | outlet-level factuality + lean, from public metadata only | Baly, Karadzhov, Alexandrov, Glass, Nakov, *Predicting Factuality of Reporting and Bias of News Media Sources*, EMNLP 2018 — aclanthology.org/D18-1389 |
| 2 | GDELT DOC 2.0 tone timelines | per-outlet/topic tone over time, always-fresh | api.gdeltproject.org/api/v2/doc/doc, `timelinetone` mode |
| 3 | NELA-GT content-feature classifier | explainable reliability score from readability/subjectivity/hedging/clickbait features | Horne, Khedr, Adali et al., NELA-GT dataset + feature toolkit (ICWSM 2018 origin, annual NELA-GT-20xx releases) |
| 4 | Wordfish text-scaling | unsupervised outlet positioning from khazana's own corpus, native SEs | Slapin & Proksch, *A Scaling Model for Estimating Time-Series Party Positions from Texts*, AJPS 2008; `quanteda::textmodel_wordfish` |
| 5 | Same-story divergence + corroboration | tone/frame variance + entail/contradict corroboration across outlets covering one event | Sentence-BERT (Reimers & Gurevych, EMNLP 2019) clustering; FrameAxis (Kwak, An & Ahn, PeerJ CS 2020) tone/frame variance; `roberta-large-mnli` NLI |
| 6 | ClaimBuster + fact-check corroboration | check-worthiness triage + existing fact-check matches | Hassan, Arslan, Li, Tremayne, *ClaimBuster*, KDD 2017 — idir.uta.edu/claimbuster; Google Fact Check Tools API; Duke Reporters' Lab fact-checker directory — reporterslab.org/fact-checking |

Every one of these produces a `Provenance` with `origin: "computed"` — spec 1 §3.1's
field, unmodified. §4 gives each its own depth, dependency, and uncertainty mapping; §7
gives each its cron lane and runtime budget.

### 3.2 Layer 2 — reference-rater overlay, attribution only

`Outlet.bias.referenceRaters[]` and `Outlet.bias.crossRaterSpread` (spec 1 §3.4, schema
unchanged) hold AllSides, Ad Fontes, and MBFC's own published lean/reliability *labels* —
fetched as small metadata (rating label + methodology URL + retrieval date), never their
underlying article corpus or scoring detail, and rendered as **outbound attribution
links**, never as inline khazana content. Their methodology pages are worth reading before
building the fetchers (flagged, not resolved, in spec 1 §8's "reference-rater ToS" open
question, restated here because it's this spec's UI that has to honor it): AllSides
(allsides.com/media-bias/media-bias-rating-methods), Ad Fontes
(adfontesmedia.com/how-ad-fontes-ranks-news-sources), MBFC
(mediabiasfactcheck.com/methodology). `crossRaterSpread` — the numeric spread across the
three raters' own lean labels, mapped to a common −1..1 scale purely for spread
computation (spec 1 §3.4's own caveat: "not stored as anyone's official score") — is what
this spec renders as the "uncertainty of the reference raters themselves" bar (§5.4, §8.3).

**Default visibility: shown by default, not opt-in (D9 — closes §12).** The founder
interview settled §12's "default vs. opt-in" question in Claude's favor per D9's grant of
complete control: the reference-rater row renders **default-visible** on every outlet
profile (§8.3). Rationale — transparency is the whole product here, and the audience is
the founder alone for the foreseeable future (D1), so the anchoring risk of showing the
more-familiar third-party labels alongside khazana's own (arguably more transparent)
score is accepted rather than hedged against with an opt-in toggle. The accepted
mitigation is layout, not concealment: §8.3's row order already places khazana's own
lean/reliability row first and visually primary, with the reference-rater row and its
`crossRaterSpread` bar directly beneath it, never above or beside it.

---

## 4. Computed indicators — ranked v1 lineup vs. v2-deferred

| Rank | Indicator | Ships | Real dependency (why this rank) |
|---|---|---|---|
| 1 | Baly et al. 2018 free-signal predictor | v1, day one | none — Wikipedia/X/URL/traffic signals exist for any seeded outlet from day one |
| 2 | GDELT DOC 2.0 tone timelines | v1, day one | none — a public API call per outlet domain |
| 3 | NELA-GT explainable reliability classifier | v1, early | one-time offline training against public NELA-GT labels; cheap per-article application thereafter |
| 4 | Wordfish text-scaling | v1, once corpus exists | needs khazana's own ingested outlet-text corpus at real volume — a real time dependency, not a build-order preference |
| 5 | Same-story divergence + corroboration (**flagship**) | v1, once the Globe's fast lane is flowing | needs `WorldEvent.reportings[]` with real multi-outlet coverage (spec 2's fast lane); heaviest compute of the v1 set |
| 6 | ClaimBuster + Fact Check Tools + Reporters' Lab | v1.5 / last in v1 | an add-on enrichment on top of #5's output, not a standalone score |
| — | Fine-tuned transformer bias/factuality classifiers | **v2, deferred** | *training* (not inference) a bespoke transformer needs compute this system cannot reproduce at $0 inside a GH Actions cron — revisit only if a genuinely free, reproducible training path exists |

The rank order is a **dependency** order, not a preference order — #1 and #2 ship
identically on day one because neither needs anything khazana doesn't already have;
#4 and #5 are gated on data the system has to *grow into*, not on engineering effort.

### 4.1 Baly et al. 2018 free-signal outlet predictor

**Inputs, per outlet:** Wikipedia infobox/content signals, X/Twitter public profile
metadata (follower count, verified status, bio text), URL structure heuristics (has-HTTPS,
has-comment-section, has-contact-page — the paper's own feature family), and web-traffic
rank via **Tranco** (tranco-list.eu) — the modern free, reproducible replacement for the
original paper's Alexa-rank feature, since Alexa was discontinued in 2022.

**Output:** a simple, interpretable classifier — logistic regression or linear SVM,
matching the paper's own modeling choice, deliberately *not* a transformer (binding
decision 2, §1) — trained once, offline, against a public bias/factuality-labeled seed
set, producing a factuality score (mapped 0–100) and a lean bucket for every outlet in
khazana's registry — the registry's seed set is closed (D8, §0.3); training-label
supervision for the classifier itself is a separate, still-open question. **Which public
label set to bootstrap the classifier's training supervision from is a genuine open
question, not resolved here** — see §12.

**Uncertainty:** a `confidenceInterval` from k-fold cross-validation resampling of the
training fit — the cheapest calibrated interval available for a from-scratch classifier,
and honest about the fact that this is model uncertainty, not per-outlet measurement
uncertainty.

**Cadence:** medium lane (daily), though the underlying signals (Wikipedia edits, X
metadata, traffic rank) move slowly enough that most daily runs are a no-op re-check —
folded into the existing daily "outlet corpus scan" job rather than justifying its own
cadence tier.

### 4.2 GDELT DOC 2.0 tone timelines

A direct API call per outlet domain, `timelinetone` mode, no API key required. **Tier-a
(redistribute-raw-ok)** per spec 1 §1 decision 4 — the raw tone-over-time series can be
stored and shown *as-is*, no khazana-computed transform required to be allowed to display
it (unlike Layer 1's other four methods, which are all `origin: "computed"` even where
their upstream source is itself tier-a, per spec 1 §3.1's rationale on `Indicator.
normalizedScore`).

**Uncertainty:** a `sampleSize` variant — GDELT's tone metric doesn't ship a native
standard error, so honesty here means gating by the article count each timeline point
aggregates, not fabricating a confidence interval GDELT itself doesn't provide.

**Feeds:** the per-outlet profile page's timeline chart (§8.3), reusing `Chart` or
`SmallMultiples` faceted by topic.

### 4.3 NELA-GT content-feature reliability classifier

NELA-GT ships roughly a hundred lexical/stylistic features per article — readability
grade, subjectivity-lexicon hit rate, hedging-cue density, clickbait phrasing scores,
quote density — alongside source-level veracity labels contributed across its annual
releases (Horne, Khedr, Adali and successive NELA-GT-20xx collaborators). khazana trains
**one** simple, explainable classifier (logistic regression or shallow gradient-boosted
trees over the ~100 named features, per binding decision 2's "not a transformer in v1")
**once, offline**, against NELA-GT's public labels; the fitted coefficients are committed
to the repo (`data/world/bias-lab/nela-classifier.json`) and applied cheaply per newly
ingested article at feature-extraction cost only — the cron never retrains, it only
scores.

**Uncertainty:** the classifier's own cross-validated holdout error rate is reported
*once*, prominently, on the methodology page (§8.5) as an "expect ~X% misclassification"
caveat — not fabricated per-article, since a single classifier's calibration doesn't vary
outlet to outlet.

**Feeds:** `BiasProfile.reliability`'s contributing signal, plus an explainable
per-feature breakdown ("high hedging-cue rate," "low readability grade") shown on the
outlet profile page (§8.3) as a short list, not a chart — the point here is legibility of
*why*, not another number to plot.

### 4.4 Wordfish unsupervised text-scaling

Runs entirely on khazana's **own** ingested corpus of outlet text — the one method in this
lineup with zero dependence on any third party's labels; it positions outlets purely
relative to each other from their own word-choice distributions. This is a real
methodological strength (an outlet's score here cannot be accused of inheriting anyone
else's political priors) and a real dependency: it needs a critical mass of ingested text
per outlet before the fitted positions mean anything — an open threshold, not fixed here
(§12).

**Uncertainty:** ships per-position standard errors **natively** — Wordfish's underlying
Poisson-IRT-style model produces an SE on every estimated position as a direct output of
the fit, mapped straight into `Uncertainty`'s `standardError` variant. This is, as the
brief puts it, the cheapest calibrated CI in the whole lineup — no bootstrap needed.

**Build choice, deliberately left open:** reimplement Wordfish's (fairly compact) EM
algorithm directly in TypeScript, or shell out to R's `quanteda::textmodel_wordfish` from
inside the GH Actions job (R is preinstalled on `ubuntu-latest` runners, so this stays
$0) — an implementation-time call, not resolved here, mirroring how spec 2 §3.2 left the
cobe-vs-hand-rolled-OGL question open until someone actually writes the hit-test layer.

### 4.5 Same-story divergence + corroboration (FLAGSHIP)

Three sub-computations over a single `WorldEvent`'s `reportings[]`:

1. **Divergence index.** Embed each reporting's available text — the `headline` field
   guaranteed by the Spine, or a Bias-Lab-owned cached lead-paragraph snippet fetched from
   `Reporting.url` when a deeper signal is warranted (§6.2) — via **Sentence-BERT** (a
   small model such as `all-MiniLM-L6-v2`, run through `transformers.js`'s WASM runtime
   inside the Actions runner: CPU-only, no external API call, $0). Apply **FrameAxis**-
   style tone/frame-variance scoring (Kwak, An & Ahn 2020) across the resulting embedding
   cluster to produce one divergence number (0–100), with a bootstrap CI from resampling
   the embedding pairs.
2. **Corroboration %.** Run an off-the-shelf NLI checkpoint (`roberta-large-mnli`)
   pairwise across every reporting's available text, classifying each pair
   entail/contradict/neutral; corroboration % is the share of pairs that mutually entail
   (or at least don't contradict) the event's core claim.
3. **Corroborated core (D7 — new, resolves Globe spec §12's biggest open).** From the
   same pairwise NLI pass, select the claim-sentences that outlets **across the
   spectrum** — not just any X of Y outlets, but X of Y whose `BiasProfile.lean` values
   (§3.1) span both sides where coverage allows — mutually entail. Each selected claim is
   emitted as a short **quoted/selected sentence from the source reportings' own text**
   (the same headline-or-snippet depth already fetched for #1, §6.2) plus the list of
   confirming outlets — never a generatively synthesized sentence, consistent with D4's
   zero-AI-prose rule for the whole world-data path. Every rendering of this list is
   labeled as **measured agreement, not khazana-asserted truth** — "corroborated by 9 of
   12 outlets," never "this happened." It feeds two downstream views: the Globe's event
   card headline line (spec 2 §6, amended per D7 — §0.1's handoff now runs both ways) and
   this spec's own story page (§8.4).

This automates exactly what AllSides does by hand in its "Headline Roundups" — the
flagship's explicit positioning per the brief.

**Real runtime honesty:** pairwise NLI is O(n²) in reportings count. A genuine
breaking-news event can accumulate 30+ reportings (the Globe spec's own open question,
spec 2 §12, about how many reportings to even *show* on the event card) — running a full
n² NLI sweep for such an event is not a reasonable daily-cron cost. The divergence engine
must cap pairwise comparisons (sample a bounded subset, or cluster embeddings first and
run NLI only across cluster *representatives* rather than every pair) — the exact cap is
an implementation/founder call, not assumed here (§12), and this question should probably
be resolved jointly with spec 2 §12's own open "how many reportings to show" question
rather than as two independent guesses.

**Ships once the Globe's fast lane (spec 2) is actually flowing with real multi-outlet
coverage** — a genuine data dependency, not a build-order nicety (§11).

### 4.6 ClaimBuster + Google Fact Check Tools API + Duke Reporters' Lab

`ClaimBuster` scores individual sentences 0–1 for check-worthiness (free API key
required, still $0). The **Google Fact Check Tools API** cross-references check-worthy
claims against the ClaimReview markup ecosystem; **Duke Reporters' Lab**'s fact-checker
directory is used to confirm a matched ClaimReview publisher is a recognized,
non-partisan fact-checking organization — an extra trust filter on top of the API match,
not a second API. This is the **lowest-priority v1 indicator** — an add-on enrichment
badge on the divergence view (§8.4: "already fact-checked, see X"), not a standalone
score, and the natural candidate to ship as v1.5 rather than blocking the rest of v1.

### 4.7 Wartime editorial physics (D6.4)

For events whose category is `"conflict"`, or that belong to an active conflict theater
(spec 6, Conflict Theaters), the founder interview settled a genuinely different
methodology from §4.5's default civilian-news physics — propaganda is the norm in
wartime coverage, and the divergence/corroboration engine has to be honest about that
rather than treating a conflict event's `reportings[]` like any other story. This section
is owned by the Bias Lab, not spec 6, because it's methodology over `reportings[]` — the
same "methodology lives here, theater/belligerent data lives there" split spec 1 §3.5
already drew for the divergence index in general.

1. **Corroboration weighted toward opposing sides.** For conflict-category events, the
   §4.5 corroborated-core computation weights confirmation toward claims entailed by
   outlets on **opposing sides** of the conflict — outlet→side alignment is derived from
   the new `OutletStateAffiliation` annotation (§6.1) plus each outlet's home country
   against the theater's belligerents (spec 6's data). A `corroboratedCore` entry whose
   confirming outlets all sit on one side (`spectrumSpan: false`, §6.1) is still displayed
   — density over silence, per D3 — but rendered visually discounted and labeled
   **"confirmed only within one side's media"**, never presented with the same weight as
   a spectrum-spanning entry.
2. **Single-sourced claims are skeptical-by-default.** A reporting whose claims have no
   entailing edge (`CorroborationEdgeSchema.relation: "entails"`, §6.1) to any other
   outlet's reporting on the same event renders with an explicit **"single-source claim"**
   badge on the story page (§8.4) — not the neutral, unbadged presentation a single-
   sourced claim gets outside conflict mode. No new field is needed for this: the badge is
   derived directly from an absence of entailing edges touching that outlet in the
   existing `DivergenceIndex.edges` array.
3. **State-affiliated outlets carry an explicit label chip everywhere their reportings
   render** — the Globe's event card, the story page's per-outlet rows (§8.4), and the
   outlet profile header (§8.3) — sourced from the new `OutletStateAffiliation` annotation
   (§6.1).

**New derived data:** an illustrative `OutletStateAffiliation` annotation joins the
Bias-Lab-owned derived layer (`data/world/bias-lab/state-affiliation.json`, §6.1, §6.3),
sourced from free authoritative lists (the exact source list is being researched as part
of spec 6, which also owns the theater/belligerent data this section consumes — see spec
6 for both once it exists). Flagged explicitly, per §5's own discipline: **state-
affiliation lists are themselves sources with provenance**, subject to the same
sample-size/uncertainty honesty as every other Layer 1 signal in this spec, not a bare
fact khazana asserts without a citation trail.

---

## 5. Uncertainty as a first-class column — "the bias of the bias"

### 5.1 Every rendered score carries

A bootstrap CI or estimator-native SE (per §4's per-method mapping), a sample-size gate
("n articles this quarter"), and a citation to the field's own known reliability ceiling —
never a bare number, per binding decision 3.

### 5.2 Inter-coder-reliability floors — a standing citation, not a per-outlet stat

A fixed reference table lives on the methodology page (§8.5), permanently visible, citing
what the *whole field's* agreement ceiling looks like — not derived per outlet, but a
constant reminder that no score on this page should read as more precise than the
underlying research allows:

| Source | What it measures | Reported figure |
|---|---|---|
| Media Frames Corpus (Card, Boydstun, Gross, Resnik, Smith, ACL 2015) | inter-coder reliability on frame annotation | ICR ≈ 0.60 |
| BABE — Bias Annotations By Experts (Spinde et al., EMNLP Findings 2021) | expert annotator agreement on sentence-level bias | reported inter-annotator agreement figures (cite the paper directly on the methodology page rather than restating a single number out of context) |
| BiasLab (2025) | human-vs-automated-label agreement on outlet bias classification | ~48% agreement |

The honest reading of this table: **even the best human-annotated corpora in this field
top out well short of perfect agreement.** Every khazana-computed score inherits that
ceiling — this is exactly why the uncertainty strip (§5.5) is pinned to every page rather
than filed under a methodology link.

### 5.3 Sample-size gating — the floor-and-widen rule

Adopts MBFC's and Ad Fontes' own practice of not treating a low-review-count outlet's
score as equally trustworthy as a well-reviewed one. Proposed default: below a floor
sample size (a concrete number is a founder open question, §12 — MBFC and Ad Fontes both
enforce their own minimum-review floors internally, without publishing an exact number),
a score is shown with a **visibly widened CI** (a stated multiplier applied to the
displayed range, not the underlying estimate) and a **"provisional" badge**, rather than
either hiding the score entirely or showing it with false confidence.

### 5.4 Dual-axis over single-axis — the full rationale

A single −1..+1 lean cannot distinguish "genuinely neutral" from "equally hostile to both
sides" — both read as 0. The Bias Lab's flagship chart instead plots **tone-toward-left**
and **tone-toward-right** as independent axes (the BiasLab 2025 precedent named in the
brief), so these two very different outlets are visually distinct rather than collapsed
onto the same point. This dual-axis pair is computed *from* the same underlying signals
(entity-level sentiment from `Reporting.stance` cross-referenced against a left/right
entity-coding seed list, §6, §12) but is **not** a Spine schema field — `BiasProfile.lean`
stays the single-axis Spine-owned summary for compact contexts (the Globe's chip, a
sortable table column), while the dual-axis pair lives in a Bias-Lab-owned derived file
(§6.1), per binding decision 4.

### 5.5 The persistent uncertainty strip

A small, always-visible component — reusing `RangePlot` in miniature, or a compact
dedicated readout built from the same underlying layout primitive
(`lib/rangeplot-scale.js`) — present on **every** Bias Lab page: the leaderboard, every
outlet profile, every story-divergence view. It shows, inline, the sample n, the CI/SE/
spread for whatever score is on screen, and a one-line pointer to §5.2's ICR-floor
caveat. This is an explicit binding decision honoring the brief's "not a footnote"
instruction literally: there is no version of this spec where the uncertainty strip is a
separate page nobody visits.

---

## 6. Data model — the Bias-Lab-owned derived layer

### 6.1 New schemas, new flat file in `@khazana/core`

Following spec 1 §3.0's established house style (flat files, `world-` prefix, zero
subdirectories), a new file `packages/core/src/world-bias-lab.ts` holds schemas that are
cross-subsystem (world-ingest writes them, `apps/site` reads them) but methodologically
owned by the Bias Lab, not the Spine — the same distinction spec 1 §3.5 already drew for
the divergence index in general terms; this spec makes it concrete:

```ts
// packages/core/src/world-bias-lab.ts  (illustrative — implementation detail, not literal)
export const DualAxisScoreSchema = z.object({
  outletId: z.string(),
  towardLeft: z.object({ score: z.number().min(-1).max(1), uncertainty: UncertaintySchema }),
  towardRight: z.object({ score: z.number().min(-1).max(1), uncertainty: UncertaintySchema }),
  /** which left/right entity-coding seed list this was computed against — see §12. */
  entitySeedListId: z.string(),
  provenance: ProvenanceSchema,
});

export const WordfishPositionSchema = z.object({
  outletId: z.string(),
  position: z.number(),
  se: z.number().nonnegative(),        // native Wordfish standard error
  corpusN: z.number().int().nonnegative(), // documents this position was fit from
  provenance: ProvenanceSchema,
});

export const NelaFeatureVectorSchema = z.object({
  outletId: z.string(),
  features: z.record(z.string(), z.number()), // named NELA features -> averaged values
  reliabilityContribution: z.number().min(0).max(100),
  classifierCvError: z.number().min(0).max(1), // holdout error — the §4.3 caveat, once, not per-outlet
  provenance: ProvenanceSchema,
});

export const CorroborationEdgeSchema = z.object({
  outletA: z.string(),
  outletB: z.string(),
  relation: z.enum(["entails", "contradicts", "neutral"]),
  confidence: z.number().min(0).max(1),
});

export const CorroboratedCoreClaimSchema = z.object({
  /** selected/quoted claim-sentence text from the source reportings — never generated, D7 + D4. */
  claim: z.string(),
  confirmingOutletIds: z.array(z.string()),
  /** do confirming outlets' BiasProfile.lean values span both sides where coverage allows? */
  spectrumSpan: z.boolean(),
});

export const DivergenceIndexSchema = z.object({
  eventId: z.string(),                  // WorldEvent.id — the Globe handoff key, §0.1
  divergence: z.object({ score: z.number().min(0).max(100), uncertainty: UncertaintySchema }),
  corroborationPct: z.number().min(0).max(100),
  edges: z.array(CorroborationEdgeSchema),
  outletIds: z.array(z.string()),
  /** the flagship's D7 output — always measured agreement, never khazana-asserted truth. */
  corroboratedCore: z.array(CorroboratedCoreClaimSchema),
  /** honest about text depth used — never silently assume snippet depth, §6.2. */
  computedFrom: z.enum(["headline-only", "headline+snippet"]),
  provenance: ProvenanceSchema,
});

/** D6.4's wartime editorial physics input — see §4.7. Illustrative, like the rest of this block. */
export const OutletStateAffiliationSchema = z.object({
  outletId: z.string(),
  affiliation: z.enum(["state-controlled", "state-funded", "state-aligned", "none"]),
  affiliatedCountry: z.string().optional(), // ISO country code, when known
  /** which free authoritative list this was sourced from — provenance discipline applies here too. */
  sourceListId: z.string(),
  provenance: ProvenanceSchema,
});
```

Every schema embeds `ProvenanceSchema` unmodified from spec 1 — this layer adds new
*shapes*, not a new uncertainty or licensing model.

### 6.2 The reporting-snippet cache — why it exists, and why it isn't a Spine change

`Reporting` (spec 1 §3.5, settled) carries only `headline` (optional), `url`, `tone`,
`stance`, `frame` — no article body. Headline-only embeddings are cheap and always
available, but coarse: two outlets can write similar headlines over substantially
different framing in the body. Where the divergence engine wants a deeper signal, this
spec's own aggregation step fetches a short lead-paragraph snippet from `Reporting.url` —
reusing the same readability/full-text-extraction precedent already established in
`packages/ingest` (the recent "self-healing source re-probe + HN full-text extraction"
work) — and caches it under `data/world/bias-lab/reporting-snippets/<eventId>.json`,
keyed by `outletId` + `url`. This is a **Bias-Lab-owned cache**, not a `Reporting` schema
change: `DivergenceIndex.computedFrom` is the honest flag that tells the UI whether a
given event's index used headline-only or headline+snippet depth, so the story page
(§8.4) can caveat accordingly rather than implying uniform depth across every event.

### 6.3 File layout under `data/world/bias-lab/`

**Private repo note (D2):** everything under `data/world/` — including this whole
subtree — now lives in the private `khazana-world-data` repo, not the public
`aether-auto/khazana` repo; the path below is unchanged, only the repo boundary moves
(spine §2/§4 amendment).

```
data/world/
  outlets/outlets.json                    # Spine (spec 1) — BiasProfile, UNCHANGED
  events/<date>.json                      # Spine (spec 1) — WorldEvent.reportings[], read-only input
  bias-lab/                                # NEW — Bias-Lab-owned derived layer
    baly-classifier.json                   # committed classifier coefficients + fold CIs (§4.1)
    dual-axis.json                         # DualAxisScore[] — one per outlet (§5.4)
    wordfish.json                          # WordfishPosition[] (§4.4)
    nela-classifier.json                   # committed classifier coefficients + cv error (§4.3, trained once offline)
    nela-features/<outletId>.json          # NelaFeatureVector per outlet
    divergence/<eventId>.json              # DivergenceIndex — top-N events/day only (§7), now carries corroboratedCore (D7)
    reporting-snippets/<eventId>.json      # cached lead-paragraph snippets (§6.2)
    state-affiliation.json                 # OutletStateAffiliation[] — one per outlet (§4.7, D6.4)
```

`CountryProfile`-style sharding discipline (one file per natural unit, bounded size)
applies here too, following spec 1 §4.3's own reasoning.

---

## 7. Where the compute runs

All new aggregation modules live inside the **existing** `packages/world-ingest` package
(spec 1 §4.1's boundary: these are aggregations over already-fetched Spine data, exactly
the same category spec 1 already placed `aggregate/bias-profile.ts` and
`aggregate/country-profile.ts` in) — no new package, in a new `src/bias-lab/` subtree:

| Method | Lane | New module | Note |
|---|---|---|---|
| Baly et al. classifier | medium (daily) | `bias-lab/baly-classifier.ts` | signals move slowly; most daily runs are a no-op re-check |
| GDELT tone timeline | medium (daily) | `bias-lab/gdelt-tone.ts` | GDELT itself is near-real-time, but the consuming views (profile timelines) don't need 20-minute granularity — no reason to put this on the fast lane |
| NELA classifier application | medium (daily, per newly ingested article) | `bias-lab/nela-apply.ts` + one-time `scripts/train-nela-classifier.ts` (hand-run, documented, not cron) | training happens once; the cron only *scores* |
| Wordfish scaling | medium (daily) or weekly — **open, §12** | `bias-lab/wordfish.ts` | the refit is the expensive step; daily is likely wasteful once the corpus stabilizes |
| Same-story divergence + corroboration | medium (daily), **capped to the day's top-N events by reportings count** | `bias-lab/divergence.ts` | not the full fast-lane firehose — most GDELT-sourced events never accumulate enough reportings to be a "same story" case worth the compute; also emits `corroboratedCore` (D7) and applies §4.7's wartime weighting for conflict-category events |
| State-affiliation annotation | medium (daily) or on-demand refresh — low churn, no reason for tighter cadence | `bias-lab/state-affiliation.ts` (NEW) | sourced from free authoritative lists (§4.7); the belligerent/theater side of the annotation is owned by spec 6 |
| ClaimBuster/fact-check triage | medium (daily), bolted onto the divergence job's output | `bias-lab/claim-check.ts` | |

**Runtime honesty:** `transformers.js` WASM inference (Sentence-BERT + `roberta-large-
mnli`) inside a GH Actions runner is CPU-only and meaningfully slower than a GPU host —
this, not engineering taste, is why the divergence job is capped to a bounded top-N rather
than every event with ≥2 reportings. The exact N, and whether `roberta-large-mnli` (355M
parameters) is the right size for this runtime budget versus a smaller distilled NLI
checkpoint, is an implementation-time tuning call once real Actions runtime is measured —
mirroring spec 1 §8's own "measure once building, don't assume" epistemics for the
fast-lane frequency question.

---

## 8. Page views

### 8.1 Route map

```
apps/site/src/pages/atlas/bias-lab/
  index.astro                 # outlet leaderboard / comparison (§8.2) — the dual-axis flagship chart
  outlets/[outletId].astro    # per-outlet profile (§8.3)
  story/[eventId].astro       # same-story divergence — THE flagship, Globe handoff target (§8.4)
  methodology.astro           # the bias-of-the-bias deep dive (§8.5)
```

### 8.2 Outlet leaderboard / comparison (`index.astro`)

- **Flagship chart:** `Scatter` (reused, `apps/site/src/components/mdx/Scatter.tsx`) with
  `x = towardLeft`, `y = towardRight` (§6.1's `DualAxisScore`), point size = sample n,
  color = reliability tier. Hover tip shows outlet name, both axis values, and n — the
  direct implementation of §5.4's dual-axis rationale, no new component needed since
  `Scatter` already supports size/color encodings.
- **Below:** `DataTable` (reused), sortable/filterable, columns: outlet, khazana lean
  (the single −1..1 `BiasProfile.lean` value — the compact one-number fallback for
  readers who want a quick sort), khazana reliability, sample n, reference-rater spread
  (rendered compactly per row), attribution links.
- **Persistent uncertainty strip** (§5.5) pinned above the fold.

### 8.3 Per-outlet profile (`outlets/[outletId].astro`)

- **Header:** name, domain, country, khazana lean + reliability, each rendered via
  `RangePlot` — the honest low/mid/high-with-dot presentation, switched per the datum's
  `Uncertainty.kind` (`confidenceInterval` → RangePlot's low/high directly; `standardError`
  → mid ± 1.96·se computed once server-side into a low/high pair for the same component;
  `raterSpread` → its own RangePlot row; `sampleSize` → a plain "n=" badge, no fabricated
  range; `none` → an explicit "no uncertainty reported" caveat string, never a fabricated
  bar).
- **GDELT tone timeline:** `Chart` (time series) or `SmallMultiples` faceted by topic —
  reused directly.
- **NELA feature breakdown:** a short `DataTable` or bar list of the top contributing
  features ("hedging-cue rate: high," "clickbait score: low"), with the classifier's
  holdout error rate caveat (§4.3) shown inline, once, not per feature.
- **Wordfish position:** a single `RangePlot` row (position ± native SE), plotted
  alongside a couple of comparator outlets for context — `RangePlot`'s multi-row nature
  makes this a natural fit with no extra work.
- **Reference-rater row (Layer 2, default-visible — D9, §3.2):** three attribution chips
  (AllSides/Ad Fontes/MBFC labels + outbound links), plus their spread rendered as
  **another** `RangePlot` row directly beneath khazana's own lean row — so "the
  uncertainty of the reference raters themselves" sits visually adjacent to khazana's own
  uncertainty, exactly as the brief specifies, not hidden in an appendix. This ordering is
  the accepted mitigation for D9's anchoring-risk trade-off: khazana's own row is always
  first and visually primary.

### 8.4 Same-story divergence (`story/[eventId].astro`) — THE FLAGSHIP

- Reads the `WorldEvent` by `id` from the day's committed shard (or the Worker's
  `/world/latest` mirror, spec 1 §4.4 — the same read pattern the Globe already uses,
  spec 2 §9.1–9.2) plus the precomputed `DivergenceIndex`
  (`data/world/bias-lab/divergence/<eventId>.json`) **if one exists** — only the day's
  top-N events get one computed (§7). If absent, the page renders the `reportings[]`
  side-by-side without a divergence score, an honest "not yet analyzed" state, rather than
  computing on demand in the browser (already ruled out on cost/latency grounds, §7).
- **Corroborated core line (D7):** when a `DivergenceIndex` exists, its
  `corroboratedCore` claims render as a short lead list above the per-outlet rows — each
  claim quoted verbatim from source text, tagged with its confirming-outlet count and a
  "corroborated by N of M outlets" label, never phrased as khazana asserting the claim is
  true. For conflict-category events (§4.7), same-side-only entries (`spectrumSpan:
  false`) render visually discounted with the "confirmed only within one side's media"
  label instead of the standard spectrum-spanning treatment.
- **Per-outlet reporting rows:** headline, tone, stance, frame, a lean/reliability chip
  (via `Outlet.bias`), link out — the same content the Globe's event card already showed
  (spec 2 §6.1), but **all of them, unabridged**: Globe's own §6.2 open question ("how
  many reportings to show") is resolved *differently* on this dedicated page, where "the
  full spread" is the job, not "a glance." Conflict-category events (§4.7) add two
  possible chips per row: a **"single-source claim"** badge (derived from an absence of
  entailing edges touching that outlet in `DivergenceIndex.edges`) and a
  **state-affiliation label chip** (from `OutletStateAffiliation`, §6.1) where applicable.
- **Divergence index:** `RangePlot` (bootstrap CI, §4.5).
- **Corroboration matrix:** `DataTable` rendered as an outlet × outlet grid (rows/columns
  = outlets, cells = entails/contradicts/neutral + confidence) — reuses `DataTable`
  rather than inventing a heatmap primitive, per binding decision 7.
- **Frame-split view:** `ForceComparison` (reused) shows "N outlets framing as [frame A]"
  vs. "N outlets framing as [frame B]" when exactly two dominant frames exist — falls back
  to a plain list when more than two frames are present, since `ForceComparison` is
  deliberately a two-sided primitive and shouldn't be stretched past that.
- **Fact-check badges:** inline per reporting row where a check-worthy claim matched an
  existing ClaimReview (§4.6).
- **Persistent uncertainty strip** + a visible `computedFrom: headline-only |
  headline+snippet` caveat (§6.2) — the honesty about text depth surfaces here, on the
  page that actually depends on it.

### 8.5 Bias-of-the-bias / methodology (`methodology.astro`)

- The ICR-floor citation table (§5.2), permanently visible.
- The sample-size floor-and-widen rule (§5.3), stated with its current live floor value.
- **A worked example:** one seeded outlet, walked through its **entire** uncertainty
  chain — bootstrap CI → estimator SE → rater spread → ICR floor — stacked as successive
  `RangePlot` rows, so a reader can see, concretely, end to end, exactly how much to trust
  one specific number.
- A single clickable list of every method's real `methodUrl` citation (spec 1 §3.1's
  field) — the page's own "show your work," in the same spirit as the transparency this
  whole spec exists to demonstrate.

---

## 9. Reuse of the Reads component kit — the exhaustive mapping

| View need | Component | Why this one, not a new one |
|---|---|---|
| dual-axis flagship scatter (§8.2) | `Scatter` | already supports x/y + size + color encodings + an optional fit line — exactly the shape needed, no new prop surface required |
| leaderboard table / corroboration matrix (§8.2, §8.4) | `DataTable` | sortable/filterable, already handles a totals footer; an outlet×outlet grid is just rows keyed by outlet with per-cell relation labels |
| any CI / SE / rater-spread row (§8.3, §8.4, §8.5) | `RangePlot` | "the honest alternative to bars-with-error-caps," per its own source comment — built for exactly this job: a hairline low→high range with a mid dot, never implying a value at a bar's top |
| GDELT tone timeline (§8.3) | `Chart` / `SmallMultiples` | time-series line/area with multi-series or topic-faceting already solved |
| two-frame split (§8.4) | `ForceComparison` | a diverging paired-bar comparison is literally "N outlets framing as A vs. N as B" |
| big top-line figures (e.g. a leaderboard header stat band) | `StatBand` | count-up big numbers, reduced-motion-safe by construction |
| corroborated-core lead list (§4.5, §8.4) | plain labeled list, no chart | claim-sentence + confirming-outlet-count pairs read better as short quoted text than as a visualization — not a chart need at all, consistent with binding decision 7's "no new primitive" |
| a reader-adjustable clustering-threshold slider, if ever built (§12) | the `ControlledChart` **architecture** (visx + live slider + stable readout), not its literal component | Bias Lab would need its own bespoke instance over a different underlying model — the pattern transfers, the component itself doesn't |

No new visualization primitive is proposed for v1 — stated explicitly, since the brief
requires reuse over invention and this table is the receipt.

---

## 10. Testing & verification approach

- **Zod round-trip tests** for every new `world-bias-lab.ts` schema, mirroring spec 1 §5's
  pattern exactly: a valid fixture round-trips; `.default()` fields apply when omitted;
  the `computedFrom` enum and `relation` enum are exercised for every literal value.
- **Aggregation tests**, one per new `bias-lab/*.ts` module — pure-function tests over
  fixed fixture inputs (a fixed `Reporting[]` → an expected `DivergenceIndex`), needing no
  network or live model call for the geometry/aggregation logic itself. The one place a
  real model call would otherwise leak into CI — the embedding/NLI step inside
  `divergence.ts` — is tested against **recorded fixture outputs** (canned embedding
  vectors, canned NLI relation labels) rather than invoking the real WASM model in tests,
  mirroring how `packages/ingest`'s fetcher tests use canned response fixtures instead of
  live network calls.
- **SSR tests** for every new Bias Lab Astro/React view, following the existing
  `*-ssr.test.ts` convention already used across `apps/site/src/components/mdx/` (e.g.
  `battlemap-ssr.test.ts`) — `bias-lab-story-ssr.test.ts` asserts the story page's
  fallback tables render fully with no client JS, the same "never blank" contract every
  reused mdx component already guarantees.
- **Browser-verified**, per khazana's standing convention (CLAUDE.md, EXPLORER.md): the
  dual-axis scatter's hover, the corroboration matrix, and the persistent uncertainty
  strip all confirmed live in a real browser before being considered done.
- **A regression floor on the one-time classifiers:** the NELA and Baly classifiers'
  training step (`scripts/train-*-classifier.ts`, hand-run, not cron) commits its own
  held-out accuracy/CV-error number into `nela-classifier.json`/`baly-classifier.json`
  (§4.1, §4.3); a test asserts that number doesn't silently drift below a stated floor if
  either classifier is ever retrained.

---

## 11. Build order (phasing)

1. **Layer 2 overlay first** (cheapest, ships something real fastest): AllSides/Ad
   Fontes/MBFC attribution fetchers populating `ReferenceRating[]`/`crossRaterSpread`
   (spec 1 schema, already defined) — honest that it's attribution-only from day one.
2. **Baly et al. classifier + GDELT tone timelines** — the two v1 indicators with zero
   dependency on khazana's own corpus size; this is khazana's first genuinely computed
   lean+reliability number.
3. **NELA-GT classifier** (one-time offline training, then cheap per-article
   application) — adds the explainable reliability breakdown.
4. **Leaderboard + per-outlet profile pages** (`index.astro`,
   `outlets/[outletId].astro`), wired to steps 1–3's outputs — the first two full page
   views ship here.
5. **Wordfish text-scaling**, once the ingest corpus is large enough per outlet — gated
   on real ingest volume, not a fixed calendar date.
6. **Same-story divergence + corroboration** (the flagship), once the Globe's fast lane
   (spec 2) is live and `reportings[]` coverage is real — deliberately last among the
   analytics because it has a genuine upstream data dependency, not because it's less
   important; it is, in fact, the single most product-defining view in this spec.
7. **The bias-of-the-bias / methodology page** + retrofitting the persistent uncertainty
   strip (§5.5) through every earlier page — a retrofit, not a bolt-on at the very end,
   since §5.5 requires it on every page, not just a dedicated one.
8. **ClaimBuster/fact-check triage**, bolted onto step 6's output.

---

## 12. Founder open questions

**Closed by the 2026-07-07 founder interview** (full record:
`docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md`):

- ~~Which outlets to seed first?~~ **Closed — D8, §0.3.** Global majors + a deep India
  set; the seed is a density floor, not a ceiling (D3).
- ~~Reference-rater overlay shown by default, or opt-in?~~ **Closed — D9, §3.2.**
  Default-visible; anchoring risk accepted, mitigated by layout (khazana's row visually
  primary, rater rows beneath).

**Still genuinely open** (implementation-time, not vision-level):

- **Same-story clustering threshold aggressiveness.** How tight should the embedding-
  similarity cutoff be for "these are the same story"? Too loose merges genuinely distinct
  stories (false corroboration); too tight fragments one real story into many
  single-outlet `WorldEvent`s and the flagship view never triggers at all. No literature
  standard exists for this specific pairing of GDELT-event-level dedup + Sentence-BERT
  re-clustering — needs founder judgment against real examples once the pipeline is live,
  and should probably be resolved jointly with spec 2 §12's own open "how many reportings
  to show" question rather than as two independent guesses.
- **Which public label set trains the Baly-style classifier's supervision (§4.1)?** A
  public academic replication corpus, or bootstrapping directly from MBFC's own public
  labels used strictly as training signal (never redistributed, only trained on) — and
  whether that latter path is clean under MBFC's terms even though it never republishes
  their raw table, only trains khazana's own model on it.
- **Entity-coding seed list for the dual-axis computation (§5.4, §6.1).** Which
  countries/party lists to seed first, who maintains the (inevitably political) left/right
  entity tagging, and how transparently to disclose that list — it arguably needs its own
  methodology sub-page, mirroring the very transparency precedent this whole spec is built
  to improve on.
- **Sample-size floor for the "provisional" badge (§5.3).** A fixed number (e.g. 20
  articles this quarter), or a rule that scales with an outlet's actual publication
  volume?
- **Wordfish refit cadence (§7).** Daily (likely wasteful once the corpus stabilizes) vs.
  weekly (the stated likely-right default) — worth confirming once real corpus growth is
  observed rather than fixed here.
- **Pairwise NLI cap for large-reportings events (§4.5, §4.7, §7).** What N, and what
  fallback clustering strategy, for a 30+-outlet breaking-news event? The same cap now
  also bounds the corroborated-core (D7) and wartime-weighting (D6.4) computations, since
  both ride the same pairwise NLI pass. Mirrors spec 2 §12's own unresolved question — the
  two specs should converge on one shared answer.
- **Is the reader-adjustable clustering-threshold slider (§9) worth building in v1 at
  all?** It exposes methodology tuning to readers rather than just the founder — could
  instead be a founder-only debug view, not a public-facing control.
