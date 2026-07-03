---
name: writers/researcher
description: This skill runs the RESEARCH phase that precedes every khazana Read. Trigger before any writer skill (chronicle/dispatch/teardown/primer/field-notes/build-log) drafts prose, or when asked to "research this brief", "build the citation ledger", "find primary sources for X", or "do the PhD-thesis research pass". Runs a literature search (WebSearch/WebFetch) out from the curated cluster to PRIMARY sources, appraises each source's credibility (High/Med/Low), triangulates every load-bearing claim against ≥2 independent sources, and emits a research dossier + a citation ledger + a claims table the writer grounds against and the fact-check gate audits.
version: 1.0.0
---

# Researcher

Run the **research phase** that turns a thin curated cluster into a fully-sourced,
PhD-thesis-grade evidence base *before* any writer drafts. The founder's bar: a Read
must be **researched and written like a thesis** — empirical, academic, web-searched,
fully grounded, every load-bearing claim triangulated and cited. This skill is the
methodology that produces that evidence base. The six writer skills invoke it at the
front of their chain and refuse to draft until its outputs exist.

**What this skill is NOT.** It is not the deep-research harness's plumbing. It borrows
that harness's *methodology* — plan → fan-out explore → appraise → triangulate →
converge → synthesize with quality gates — but runs entirely inside one Claude Code
Action on the subscription (Sonnet for the work, Opus only for the hardest credibility
calls), uses only free tools (`WebSearch`, `WebFetch`, `scripts/fetch-data.py`), and
writes khazana artifacts, not `ai-docs/sessions`. No Gemini, no OpenRouter, no paid
data APIs, no session-dir machinery.

## Input and the shared contract

Input is the authoring brief on stdin (from `buildBrief()`): title, slug, channel,
format, founder voice, and the **curated cluster** — the seed `FeedItem`s (id, title,
url, summary, and full text where curation supplied it) plus the assignment rationale.

Output is three artifacts, in the **exact shapes the generation harness expects**:

1. **`researchDossier`** — a free-text synthesis, organised by research question:
   findings, agreements, conflicts surfaced honestly, and remaining gaps.
2. **`citation ledger`** — an array of appraised sources:
   ```
   { url, title, tier: 'high' | 'med' | 'low', origin: 'curated' | 'researched', firstSeen? }[]
   ```
   Every source the writer may cite must be in this ledger. The grounding gate accepts
   any claim citing a **ledger** URL (curated ∪ researched). `firstSeen` is the ISO
   date/round the source entered the ledger.

   **Persist the ledger to `data/generation/research/<slug>.ledger.json`** (using this
   Read's slug), as a JSON array in exactly the `CitationLedger` shape above. Write it to
   the **per-slug** path — never the shared `data/generation/research/ledger.json` — so
   parallel writers each own their own file and never clobber one another. The deterministic
   verify gate unions every `<slug>.ledger.json` when grounding drafts.
3. **`claims table`** — the explicit claim→evidence map the draft and the fact-check
   gate both consume:
   ```
   | # | claim | load-bearing? | supporting ledger URLs | tier(s) | corroborated (≥2 indep.)? | notes |
   ```

The **fact-check gate** these must clear: **≥90% of claims cite a ledger source**, and
**≥60% of load-bearing claims are corroborated by ≥2 independent sources.** Research
until the claims table can clear both — that is the stopping rule (see Convergence).

## Source-credibility rubric (the tier system — single source of truth)

Every kept source gets a tier. This rubric is the one place tiers are defined; the
writer skills reference it, never redefine it.

- **High** — peer-reviewed paper / journal article / arXiv preprint / **primary
  document** (an original record, dataset, standard, first-hand account, official
  filing, spec) / official standards body. The MNRAS 1859 paper, an arXiv preprint,
  a NASA NTRS report, a NOAA scale definition, an RFC, a government dataset.
- **Med** — reputable secondary source: established press with a masthead and
  corrections policy (Reuters, AP, FT, major newspapers), official product/vendor
  documentation, an established encyclopedia entry, a recognised expert's technical
  blog with citations.
- **Low** — blog post, forum thread, Reddit/HN comment, unbylined content, marketing
  copy, AI-generated summaries. **Admissible only if corroborated by an independent
  Med/High source** — never load-bearing on its own.

**Provenance checks that set or lower the tier** (record the reasoning in the dossier):

- **Author expertise** — is the author identifiable and credentialed in the field? An
  anonymous claim drops a tier.
- **Venue** — where published? A peer-reviewed venue outranks a preprint outranks a
  press write-up outranks a blog.
- **Recency vs. foundational** — for fast-moving topics prefer sources <2 years old;
  for foundational/historical claims the *original* primary source outranks any recent
  secondary retelling. Note the date; flag anything stale that isn't foundational.
- **Bias / funding** — who benefits from the claim? A vendor benchmarking its own
  product, an advocacy group, a funded study — note the interest and demand independent
  corroboration before treating it as load-bearing.
- **Primary vs. secondary vs. tertiary** — always prefer the source *closest to the
  fact*. If a Med source cites a High primary, follow the citation and cite the primary.

## The research methodology — run in strict order, tag each phase

This is the operational loop. Adapt the deep-research harness's structure to khazana's
$0/Sonnet budget: fewer rounds, a hard source ceiling, convergence by claims-table
saturation rather than an expensive k=3 synthesis rerun.

### `<phase>Plan</phase>`
From the assignment (topic + curated seeds + rationale), decompose into **5–8 research
questions** that, answered, would let you write the piece with authority. Cover: the
core mechanism/event/claim; the strongest counter-evidence or complication; the
numbers/data the format needs (a Dispatch needs a real series; a Chronicle needs dated,
named primary detail); the primary sources behind the secondary coverage; and the
open/contested points. For each question note *why it matters* and *what a good answer
looks like* (a paper, a dataset, a dated first-hand account). Do not research yet.

### `<phase>Literature search</phase>`
Work the questions **outward from the curated seeds toward primary sources.** This is
the academic core — do not stop at the first secondary write-up.

1. **Start at the seeds.** `WebFetch` each curated FeedItem URL (or use its full text).
   Harvest the concrete leads: cited papers, named datasets, quoted officials, linked
   standards, DOIs, the "References" / "cited by" trail.
2. **Fan out per question.** `WebSearch` each question. Prefer queries that surface
   primary sources: add `arxiv`, `doi`, `filetype:pdf`, `dataset`, the standard's
   number, the primary author's name, the venue. When a secondary source cites a
   primary, **follow the citation and fetch the primary** — cite the paper, not the
   blog that mentioned it.
3. **Follow the chain both ways.** From a key paper, look at its references (upstream
   foundations) and, where visible, what cites it (downstream consensus/refutation).
   This is how a thesis reaches the *original* record instead of the retelling.
4. **Pull real numbers, not asserted ones.** For any numeric series a format will
   chart, run `python3 scripts/fetch-data.py <source> ...` (FRED/World Bank/OWID, free,
   no key) — it prints a `SOURCE:` citation. For numbers only in a paper/report, quote
   verbatim and record the exact source. Never let a number enter the ledger unsourced.
5. **Budget discipline ($0, daily cron).** Cap at **~2 fan-out rounds** and a **hard
   ceiling of ~12–15 distinct sources** for a feature (fewer for Field Notes). Aim for
   **≥3–5 High-tier sources** on a feature — a piece resting only on Med/Low cannot hit
   the bar. Prefer three strong primaries over ten weak secondaries. Skip stale,
   low-authority, and duplicative results fast.

### `<phase>Appraise</phase>`
For every source you keep, apply the tier rubric above and record it into the
**citation ledger** with `tier`, `origin` (`curated` for a seed, `researched` for a
discovery), and `firstSeen`. In the dossier, write one line per source justifying the
tier via the provenance checks (author, venue, recency, bias, primary/secondary).
Drop sources that add nothing over a stronger one already held — the ledger is a
curated evidence base, not a link dump.

### `<phase>Triangulate</phase>`
Build the **claims table**. Enumerate every claim the piece will assert — each number,
date, name, causal statement, quote. For each:

- Mark **load-bearing** if the argument/narrative fails without it (a headline stat, the
  central mechanism, a decisive date). Colour/incidental detail is not load-bearing.
- Map it to its **supporting ledger URLs** and their **tier(s)**.
- Mark **corroborated** only if **≥2 *independent* sources** support it — independent
  meaning genuinely separate origins, not two outlets both reprinting one wire story,
  not a paper and the blog summarising that same paper. Same underlying source = one.
- **Every load-bearing claim must be corroborated, and prefer a High tier** among its
  supports. If a load-bearing claim rests on a single source, that is a gap — go find a
  second independent source or reframe the claim as attributed/uncertain.
- **Surface conflicts, do not paper over them.** When sources disagree (different
  figures, contested causation), record both in the table and flag it for the writer to
  present honestly ("estimates range from X to Y"; "A argues…, B disputes…"). Apply the
  precedence rule to say which is better-supported: **primary/peer-reviewed > reputable
  secondary > blog/forum**, and note *why*, rather than silently picking one.

### `<phase>Converge</phase>`
Stop when the **claims table is saturated** against the gates — not on a fixed round
count. Check, in order:

1. **Coverage gate** — can ≥90% of claims cite a ledger source? Any uncited claim is
   either researched now or cut before drafting.
2. **Corroboration gate** — are ≥60% of *load-bearing* claims corroborated by ≥2
   independent sources? (Aim higher — every load-bearing claim ideally.) Under-corroborated
   load-bearing claims trigger one more targeted search.
3. **Saturation** — a fresh search round adds no new load-bearing evidence (mirrors
   deep-research's <10%-new stopping signal). If two consecutive targeted searches for a
   gap yield nothing, record the gap honestly and stop chasing it.
4. **Budget** — hard stop at the source ceiling / ~2 rounds. At the cap, if the gates
   still can't be met, **do not fabricate to fill them**: emit what you have, mark the
   piece `RESEARCH-THIN`, and let the writer scope down honestly (a shorter, fully-grounded
   piece beats a padded, under-sourced one).

### `<phase>Emit</phase>`
Produce the three artifacts. Write the citation ledger to the per-slug path
`data/generation/research/<slug>.ledger.json` (JSON array, `CitationLedger` shape) — the
per-slug file keeps parallel writers from colliding. Order the ledger by tier (High first)
so the writer reaches for the strongest support. Ensure **every claims-table URL exists in
the ledger**, and
**every load-bearing claim has its corroboration marked**. Print `RESEARCH DONE: <slug>`
with a one-line gate report (`claims: N, cited: X%, load-bearing corroborated: Y%,
sources: H high / M med / L low`). If a gate cannot be met at the budget cap, print
`RESEARCH THIN: <slug> — <which gate, what's missing>` so the writer scopes accordingly.

## Handoff to the writer

The writer skill consumes these three artifacts and grounds every drafted claim to a
**ledger URL**, preferring High-tier support for load-bearing claims and citing inline
via `<Annotation>` (and `sources[]` in frontmatter). The claims table is the writer's
checklist and the fact-check gate's audit target: if the draft asserts something not in
the table, or cites a URL not in the ledger, it fails verification. Research is the
foundation the ~15-min PhD-thesis depth is *earned* from — depth comes from real cited
evidence, never from padding.

## Resources
- `references/methodology.md` — the deep-research adaptation in depth: query craft for
  primary sources, citation-chain following, independence tests for corroboration, and
  the artifact shapes with worked examples.
- `scripts/fetch-data.py` — REAL numeric series from FRED/World Bank/OWID (`--help`).
