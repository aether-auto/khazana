---
name: writers/dispatch
description: This skill should be used to author a DISPATCH post for khazana — a data-driven, Pudding/Distill-style interactive explainer where real charts lead the prose. Trigger when a brief's "Format:" line is `dispatch`, or when asked to "write a dispatch", "explain this with data", or produce a data-storytelling MDX post. Uses scripts/fetch-data.py for REAL numbers (FRED/World Bank/OWID). Produces one MDX file (Chart/Scrolly/DataTable/Annotation/StatBand/Pullquote) targeting ~15-min rendered depth that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Dispatch writer

Author one **dispatch** post: a data-driven explainer in the tradition of The
Pudding and Distill.pub. **The chart arrives before the prose that explains it.**
The story *is* the pattern in the data; the reader discovers it through scroll-
driven reveals, then understands it. Every number has a baseline.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and the
**curated cluster** — the real seed article(s). The verifiable source of truth is the
**citation ledger** the research phase builds out from that cluster. Output is one MDX
file at the brief's path.

## Grounding mandate (non-negotiable)

Numbers are the highest-risk hallucination vector, and dispatch is all numbers, so
the discipline is: **every chart shows real, sourced data traced to the citation
ledger** (see `writers/researcher`).

- Prefer real data fetched by **`scripts/fetch-data.py`** (FRED, World Bank, Our
  World in Data — free, no API key). Cite the dataset; the script prints the
  citation line to stderr, and the dataset URL goes in the ledger.
- If a number comes from a ledger source (a paper, report, or dataset the research
  surfaced) rather than a public series, use it verbatim and cite it inline with an
  `<Annotation>` to the ledger URL.
- **Load-bearing numbers** — the headline stat, the figure the whole argument turns on
  — must be **corroborated by ≥2 independent ledger sources** and should rest on a
  **High-tier** source (dataset / peer-reviewed / primary report). Where the research
  found a **range or a conflict** (two credible sources disagree), show the range and
  attribute it — never invent a false-precision midpoint. The methodology note names the
  vintage and the disagreement.
- **If a fetch fails or no real series exists, fall back to a `<DataTable>` of
  numbers cited directly from the ledger — never fabricate chart data.** A made-up
  data point fails grounding and must not ship.
- Every cited source URL goes in `sources[]` and is cited inline — and every such URL
  is in the ledger.

Shared tier rubric, triangulation rules, and gate definitions live once in
**`writers/researcher/SKILL.md`** — referenced here, not restated.

## Craft rubric (6 imperatives)

1. **Data-first, prose-second.** Every major claim is a `<Chart>` or `<DataTable>`
   *before* the sentence explaining what to see in it.
2. **One clear, quantifiable conclusion.** Not "inflation is complex" but "the 2022
   spike was driven 60% by energy and shelter, not wages." Legible in the first
   chart.
3. **Scrolly for revelation.** Use `<Scrolly>` to introduce data incrementally —
   each step adds one variable or filter. The reader *discovers* the pattern.
4. **Contextualize every number.** "Latency dropped 40% — from 120ms to 72ms."
   Never "latency improved." Every number needs a reference frame.
5. **Methodology note at the bottom.** Sources, data vintage, what the data can't
   show. Non-negotiable for credibility (the Pudding standard).
6. **Vary chart types by intent.** Line for trend, bar for comparison, area for
   cumulative, dot for relationship. Not a bar chart for everything.

Full detail: **`references/craft.md`**.

## Structural template (target ~15-min rendered read / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for ~3000–4000 words + interactive charts. Reach depth through more data layers,
richer methodology, deeper causal cuts — never padding.

Hook question + the key `<Chart>` immediately (100–150w) → optional `<StatBand>` if the
lede IS those numbers (earn it: only when scale/rate/delta is the whole argument) →
context layer 1 as a `<Scrolly>`, one chart-update per step (400–600w) → complication
(the read the simple chart misses) with `<DataTable>` (200–300w) → optional `<Pullquote>`
if a verbatim finding or expert statement reframes the story (earn it: not decorative emphasis)
→ context layer 2 `<Scrolly>`, deeper/causal cut (400–600w) → "so what" payoff with inline
`<Annotation>` citations (200–300w) → methodology note (150–200w).
Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`Chart`, `Scrolly` / `ScrollyStep`, `DataTable`, `Annotation`, `StatBand`, `Pullquote`
— nothing else. (A richer scrollytelling component is pending a rebuild — do not use yet.)

**Every component must be earned.** Data reads: the chart or table IS the argument — lead
with it; let the prose explain what to see. Reach depth through more data layers, richer
methodology, a deeper causal cut — not by adding components.

- **`<Chart client:visible>`** — `mark="line|bar|area|dot"`, real `data={[...]}`. Vary by intent: line for trend, bar for comparison, area for cumulative, dot for relationship.
- **`<Scrolly client:visible>` / `<ScrollyStep>`** — stepped reveals; each step adds one variable or filter.
- **`<DataTable client:load>`** — detailed breakdown; the complication the simple chart misses.
- **`<Annotation client:load>`** — inline citations; every number cited here.
- **`<StatBand client:visible>`** — earn it when scale/rate/delta IS the lede. Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`, `duration?`.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)** — earn it when a verbatim finding or expert statement reframes the story. Props: `cite?`, `href?`, `kind?` (default `"quote"`).

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice: open with a sharp question or a sledgehammer stat; numbers always
contextualized against a baseline; vary sentence rhythm; no hedging; don't start
consecutive sentences with "The". Prose and figures are *woven*, not sequential —
but the prose blocks themselves stay calm and fully readable (the drama is the
chart resolving on scroll, never the text moving).

## Authoring chain — run in strict order, tag each phase

### `<phase>Research</phase>`
**Run before Internalize. Do not draft without a populated citation ledger + claims
table.** Invoke the `writers/researcher` methodology: plan 5–8 research questions,
search out from the curated seeds to the **primary data behind the coverage** (the
dataset, the paper's table, the official series — not a blog's paraphrase of a number),
appraise each source into the ledger with its tier, and triangulate every load-bearing
number to ≥2 independent sources, surfacing ranges/conflicts. Run `fetch-data.py` for
any chartable public series so the numbers are real and cited. Output the research
dossier, the citation ledger, and the claims table. If the gates can't be met at
budget, take the `RESEARCH THIN` handoff and scope down.

### `<phase>Internalize</phase>`
Read the brief and the research dossier. Output 5–10 lines: (a) the single quantifiable
question and its one-line answer; (b) the 2–3 strongest data points and each one's
ledger URL + tier (a `fetch-data.py` dataset, or a High-tier report/paper);
(c) which chart type carries which idea. Confirm every number you intend to use is a
claims-table row citing a ledger URL — load-bearing numbers corroborated. Any number not
in the table → `[UNSUPPORTED]` (research or cut). Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading + intent + which chart/component
+ which data source. Confirm target ~3000–4000 words (~15-min rendered read), a
methodology note is planned, and every cited source appears at least once. Confirm
only kit components are used. For each `<StatBand>` or `<Pullquote>`, state in one
sentence why it earns its place — if you can't, cut it.

### `<phase>Draft</phase>`
**Fetch data first.** For each chart backed by a public dataset, run
`python3 scripts/fetch-data.py <source> ...` and paste the returned JSON into the
`<Chart data={...}>`; record the printed SOURCE citation. For numbers from brief
items, cite inline. If a fetch fails, drop to a cited `<DataTable>`. Then write
the MDX with each chart *before* its explanation. Vary mark types. Match voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5 **and the fact-check gates**: every
`sources[].url` is a **verbatim ledger URL** (non-empty list); **≥90% of claims/numbers
cite a ledger source** or are cut; **≥60% of load-bearing numbers corroborated by ≥2
independent ledger sources** (check the claims table); no fabricated chart data; ranges
shown where sources disagree; only kit components; frontmatter valid; methodology note
present (naming vintage + any disagreement). Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write the file and print
`DONE: <slug>`. Else print `FAIL: <slug> — <reason>` and do not write.

## Resources
- `writers/researcher/SKILL.md` — the research phase: literature search, tier rubric,
  triangulation, the ledger + claims-table shapes, and the fact-check gates (shared).
- `references/craft.md` — deep craft rubric (Pudding/Distill technique).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/fetch-data.py` — REAL data from FRED/World Bank/OWID (`--help`).
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
