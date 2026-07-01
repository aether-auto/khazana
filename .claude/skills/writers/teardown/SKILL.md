---
name: writers/teardown
description: This skill should be used to author a TEARDOWN post for khazana — a deep "how X actually works" technical deconstruction with runnable code and interactive diagrams, for a sophisticated reader. Trigger when a brief's "Format:" line is `teardown`, or when asked to "write a teardown", "deconstruct how X works", or produce a deep technical explainer MDX post. Produces one MDX file (RunnableCode/Chart/Annotation/StatBand/Pullquote) targeting ~15-min rendered depth that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Teardown writer

Author one **teardown** post: a deep technical deconstruction in the tradition of
Dan Luu, Julia Evans, Cloudflare's engineering blog, and 3Blue1Brown's
intuition-first pedagogy. Assume a sophisticated reader. Start with the problem and
the intuition, then go *all the way down* — no hand-waving the hard part. Code is
runnable; the reader modifies it and watches the effect.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and the
**curated cluster** — the real seed article(s)/docs. The verifiable source of truth is
the **citation ledger** the research phase builds out from that cluster (ideally to the
primary spec, RFC, or paper behind the coverage). Output is one MDX file at the brief's
path.

## Grounding mandate (non-negotiable)

A teardown's authority rests on accuracy. Every design decision, parameter,
benchmark, and trade-off must trace to a **citation-ledger source** (see
`writers/researcher`):

- Mechanism claims (how it works, why a constant has that value, what the failure
  mode is) trace to a ledger source and are cited inline with `<Annotation>`. Prefer
  the **primary spec / RFC / standard / paper** the research surfaced over a secondary
  write-up — follow the citation chain to the authoritative document.
- **Load-bearing mechanism claims and performance numbers** — the central design
  decision, the benchmark the argument rests on — must be **corroborated by ≥2
  independent ledger sources** and should rest on a **High-tier** source (spec / paper /
  primary). Where credible sources disagree (contested benchmark, debated cause), show
  the disagreement rather than asserting one figure.
- Performance numbers come from `scripts/fetch-data.py` where a public series fits,
  or are quoted verbatim from a ledger source and cited. **Never invent a
  benchmark.** If you can't source a number, render the real-but-illustrative
  `<RunnableCode>` the reader can run themselves instead of asserting a figure.
- `<RunnableCode>` examples must be correct, self-contained JavaScript that actually
  runs (the worker executes JS only) — a broken example destroys trust.
- Every cited source URL goes in `sources[]` and is cited inline — and every such URL
  is in the ledger.

Shared tier rubric, triangulation rules, and gate definitions live once in
**`writers/researcher/SKILL.md`** — referenced here, not restated.

## Craft rubric (5 imperatives)

1. **Intuition-first, mechanism-second.** Open with the problem X solves in one
   concrete sentence, then go deep. Visual/runnable intuition before abstraction.
2. **No hand-waving.** The hard part — where most posts say "and then magic
   happens" — is where the teardown earns its name. Slow down there.
3. **Runnable code at the moment of confusion.** Every key example is a live
   `<RunnableCode>` the reader edits and runs. Understanding locks in when they see
   the effect of a change.
4. **Name the failure modes and trade-offs.** What breaks, under what conditions,
   and why the designers accepted it. This is what separates a teardown from a
   tutorial.
5. **Diagrams/charts over prose for structure.** A `<Chart>` of the performance
   cliff or boundary condition replaces three paragraphs.

Full detail: **`references/craft.md`**.

## Structural template (target ~15-min rendered read / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for ~3000–4000 words + runnable code. Reach depth through deeper mechanism coverage,
more runnable examples, more failure modes — never padding.

The problem (150–200w) + a `<Chart>` of the cliff/failure that motivates X → optional
`<StatBand>` if the key constants frame why the mechanism matters (earn it: only if those
numbers set up everything that follows) → intuition layer (400–600w) with the simplest
`<RunnableCode>` → optional `<Pullquote>` of a key spec line or design-doc excerpt (earn it:
only when the verbatim primary source is essential) → the actual mechanism (600–900w), going
line-by-line, `<RunnableCode>` of a real example, `<Annotation>` for each design decision →
failure modes + trade-offs (400–600w) with a `<Chart>` of boundary conditions → practical
takeaway (200–300w). Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`RunnableCode`, `Chart`, `Annotation`, `StatBand`, `Pullquote` — nothing else.
(A richer scrollytelling component is pending a rebuild — do not use yet.)

**Every component must be earned.** Technical reads: the runnable code and interactive
chart ARE the argument. Reach depth through more runnable examples, deeper mechanism
coverage, more failure modes — not by adding components. A teardown with only
`RunnableCode`, `Chart`, and `Annotation` is often the strongest.

- **`<RunnableCode client:visible>`** — live JS examples; `console.log` for traces, `return` for result. Mentally execute each one before writing it.
- **`<Chart client:visible>`** — performance/boundary data. Vary mark by intent.
- **`<Annotation client:load>`** — cites every design decision and number inline.
- **`<StatBand client:visible>`** — earn it when key constants frame the stakes. Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)** — earn it when a verbatim spec line or failure-mode quote is essential. Props: `cite?`, `href?`, `kind?` (try `kind="document"` for spec excerpts).

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice for a technical reader: precise over fancy ("the CPU stalls waiting
for cache", not "performance implications"); domain terms welcome when they carry
meaning; no hedging; vary rhythm; don't start consecutive sentences with "The".
Open with the problem, not a definition. End on a sharp practical takeaway, not a
recap.

## Authoring chain — run in strict order, tag each phase

### `<phase>Research</phase>`
**Run before Internalize. Do not draft without a populated citation ledger + claims
table.** Invoke the `writers/researcher` methodology: plan 5–8 research questions,
search out from the curated seeds to the **primary spec/RFC/standard/paper** behind the
mechanism (follow citation chains to the authoritative document), appraise each into the
ledger with its tier, and triangulate every load-bearing mechanism claim and benchmark
to ≥2 independent sources, surfacing conflicts. Use `fetch-data.py` for any public
performance series. Output the research dossier, the citation ledger, and the claims
table. If the gates can't be met at budget, take the `RESEARCH THIN` handoff and scope down.

### `<phase>Internalize</phase>`
Read the brief and the research dossier. Output 5–10 lines: (a) the one-sentence problem
X solves; (b) the 2–3 hardest mechanism points that most explanations skip, and their
ledger URLs (prefer the primary spec/paper); (c) which `<RunnableCode>`/`<Chart>` carries
which idea. Confirm every mechanism claim, number, and constant you intend to use is a
claims-table row citing a ledger URL — load-bearing ones corroborated. Anything not in the
table → `[UNSUPPORTED]` (research or cut). Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading + intent + which component + which
source. Confirm target ~3000–4000 words (~15-min rendered read), that the *hard part*
gets the most space, and that every cited source appears at least once. Confirm only
kit components. For each `<StatBand>` or `<Pullquote>`, state in one sentence why it
earns its place — if you can't, cut it.

### `<phase>Draft</phase>`
Write each `<RunnableCode>` first and mentally execute it — it must run and produce
the stated result. For performance charts, run `scripts/fetch-data.py` or cite a
brief number. Then write the MDX: problem → intuition → mechanism (slowest here) →
failure modes → takeaway. Cite every design decision with `<Annotation>`. Match
voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5 **and the fact-check gates**: every
`sources[].url` is a **verbatim ledger URL** + non-empty; **≥90% of claims/numbers cite
a ledger source** or are cut; **≥60% of load-bearing mechanism claims/benchmarks
corroborated by ≥2 independent ledger sources** (check the claims table); no invented
benchmark; conflicts surfaced; `<RunnableCode>` is valid self-contained JS; only kit
components; frontmatter valid. Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write and print
`DONE: <slug>`. Else `FAIL: <slug> — <reason>` and do not write.

## Resources
- `writers/researcher/SKILL.md` — the research phase: literature search, tier rubric,
  triangulation, the ledger + claims-table shapes, and the fact-check gates (shared).
- `references/craft.md` — deep craft rubric (Dan Luu / 3B1B technique).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/fetch-data.py` — REAL performance data from public sources (`--help`).
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
