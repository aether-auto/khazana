---
name: writers/teardown
description: This skill should be used to author a TEARDOWN post for khazana — a deep "how X actually works" technical deconstruction with runnable code and interactive diagrams, for a sophisticated reader. Trigger when a brief's "Format:" line is `teardown`, or when asked to "write a teardown", "deconstruct how X works", or produce a deep technical explainer MDX post. Produces one MDX file (RunnableCode/Chart/Annotation/StatBand/Pullquote/NarrativeScene) targeting ~15-min rendered depth that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Teardown writer

Author one **teardown** post: a deep technical deconstruction in the tradition of
Dan Luu, Julia Evans, Cloudflare's engineering blog, and 3Blue1Brown's
intuition-first pedagogy. Assume a sophisticated reader. Start with the problem and
the intuition, then go *all the way down* — no hand-waving the hard part. Code is
runnable; the reader modifies it and watches the effect.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and a
**Source items** block — the real article(s)/docs that are the verifiable source of
truth (a spec, an engineering post, a paper). Output is one MDX file at the brief's
path.

## Grounding mandate (non-negotiable)

A teardown's authority rests on accuracy. Every design decision, parameter,
benchmark, and trade-off must trace to a source:

- Mechanism claims (how it works, why a constant has that value, what the failure
  mode is) trace to the brief's source spec/post/paper and are cited inline with
  `<Annotation>`.
- Performance numbers come from `scripts/fetch-data.py` where a public series fits,
  or are quoted verbatim from a brief source and cited. **Never invent a
  benchmark.** If you can't source a number, render the real-but-illustrative
  `<RunnableCode>` the reader can run themselves instead of asserting a figure.
- `<RunnableCode>` examples must be correct, self-contained JavaScript that actually
  runs (the worker executes JS only) — a broken example destroys trust.
- Every cited source URL goes in `sources[]` and is cited inline.

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

Opening `<StatBand>` with the key performance constants or design numbers that frame why
the mechanism matters → the problem (150–200w) + a `<Chart>` of the cliff/failure →
`<Pullquote>` of a key spec line or design-doc excerpt → intuition layer (400–600w) with
the simplest `<RunnableCode>` → the actual mechanism (600–900w), going line-by-line,
`<RunnableCode>` of a real example, `<Annotation>` for each design decision, optionally
`<NarrativeScene>` if the performance boundary unfolds in steps → failure modes +
trade-offs (400–600w) with a `<Chart>` of boundary conditions → practical takeaway
(200–300w). Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`RunnableCode`, `Chart`, `Annotation`, `StatBand`, `Pullquote`, `NarrativeScene`
— nothing else.

`<RunnableCode>` carries the live JS examples (use `console.log` for traces, `return`
for the result); `<Chart>` shows performance/boundary data; `<Annotation>` cites every
design decision and number inline.

New narrative components — use where they deepen the technical story:
- **`StatBand` (`client:visible`)**: key performance constants or design figures up front
  — the numbers that frame why the mechanism matters before the teardown begins. Props:
  `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`.
- **`Pullquote` (static `.astro`, NO `client:` directive)**: a spec line, design-doc excerpt,
  or memorable failure-mode quote. Props: `cite?`, `href?`, `kind?` (try `kind="document"`
  for spec excerpts).
- **`NarrativeScene` (`client:visible`)**: when the performance boundary or failure cliff
  unfolds in stages — each step adds a variable to a pinned chart. Props:
  `steps=[{ panel, prose:"<html>" }]`, `caption?`. Panel: `{kind:"chart", ...ChartProps}`.

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice for a technical reader: precise over fancy ("the CPU stalls waiting
for cache", not "performance implications"); domain terms welcome when they carry
meaning; no hedging; vary rhythm; don't start consecutive sentences with "The".
Open with the problem, not a definition. End on a sharp practical takeaway, not a
recap.

## Authoring chain — run in strict order, tag each phase

### `<phase>Internalize</phase>`
Read the brief. Output 5–10 lines: (a) the one-sentence problem X solves; (b) the
2–3 hardest mechanism points that most explanations skip, and their source ids;
(c) which `<RunnableCode>`/`<Chart>` carries which idea. List every mechanism
claim, number, and constant you intend to use with its source. Anything unsourced →
`[UNSUPPORTED]`. Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading + intent + which component + which
source. Confirm target ~3000–4000 words (~15-min rendered read), that the *hard part*
gets the most space, and that every cited source appears at least once. Confirm only
kit components. Note placement of `<StatBand>`, `<Pullquote>`, and `<NarrativeScene>`
if used.

### `<phase>Draft</phase>`
Write each `<RunnableCode>` first and mentally execute it — it must run and produce
the stated result. For performance charts, run `scripts/fetch-data.py` or cite a
brief number. Then write the MDX: problem → intuition → mechanism (slowest here) →
failure modes → takeaway. Cite every design decision with `<Annotation>`. Match
voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5: every `sources[].url` verbatim
+ non-empty; every claim/number cited; `<RunnableCode>` is valid self-contained JS;
only kit components; frontmatter valid. Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write and print
`DONE: <slug>`. Else `FAIL: <slug> — <reason>` and do not write.

## Resources
- `references/craft.md` — deep craft rubric (Dan Luu / 3B1B technique).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/fetch-data.py` — REAL performance data from public sources (`--help`).
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
