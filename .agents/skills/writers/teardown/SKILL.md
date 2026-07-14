---
name: writers/teardown
description: This skill should be used to author a TEARDOWN post for khazana — a deep "how X actually works" technical deconstruction with runnable code and interactive diagrams, for a sophisticated reader. Trigger when a brief's "Format:" line is `teardown`, or when asked to "write a teardown", "deconstruct how X works", or produce a deep technical explainer MDX post. Produces one MDX file (RunnableCode/Chart/Annotation/StatBand/Pullquote) targeting a 20–25 min rendered depth (~5,000–7,000+ words) that builds in apps/site and passes validateDraft.
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

## Structural template (target 20–25 min rendered read — the length FLOOR / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for 5,000–7,000+ words + runnable code — this is a FLOOR, not a target; go longer when
the mechanism supports it. Reach depth through deeper mechanism coverage, more runnable
examples, more failure modes — never padding — and through MORE knowledge-carrying components
(a Diagram of the architecture, a StateMachine of the protocol, a LayerStack of the stack, a
CodeWalkthrough of the hard function), each earned. Use Detail/Expandable to add depth for
motivated readers without bloating the linear read.

The problem (150–200w) + a `<Chart>` of the cliff/failure that motivates X → optional
`<StatBand>` if the key constants frame why the mechanism matters (earn it: only if those
numbers set up everything that follows) → intuition layer (400–600w) with the simplest
`<RunnableCode>` → optional `<Pullquote>` of a key spec line or design-doc excerpt (earn it:
only when the verbatim primary source is essential) → the actual mechanism (600–900w), going
line-by-line, `<RunnableCode>` of a real example, `<Annotation>` for each design decision →
failure modes + trade-offs (400–600w) with a `<Chart>` of boundary conditions → practical
takeaway (200–300w). Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`** — and read the **canonical full-length exemplar** it points to,
**`references/exemplars/how-shazam-works.mdx`**, in full during Internalize to calibrate the bar.

## Your interactive kit

khazana ships ~40 interactive components. Teardown's kit is the subset below — and you must
actively CHOOSE from the WHOLE of it, not default to `RunnableCode`+`Chart`+`Annotation`. Most
of these carry a block of knowledge the prose would otherwise spend paragraphs asserting; reach
for the one that CARRIES each mechanism.

The kit — and when to reach for each:

- **`<RunnableCode client:visible>`** — live JS examples; `console.log` for traces, `return` for result. Mentally execute each one before writing it. Reach for it at the moment of confusion, when running the thing beats describing it.
- **`<Chart client:visible>`** — performance/boundary data. Vary mark by intent. Reach for it for the cliff, the distribution, the boundary condition.
- **`<Annotation client:load>`** — cites every design decision and number inline. Reach for it to attach a source to a specific claim.
- **`<StatBand client:visible>`** — earn it when key constants frame the stakes. Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)** — earn it when a verbatim spec line or failure-mode quote is essential. Props: `cite?`, `href?`, `kind?` (try `kind="document"` for spec excerpts).
- **`<Sidenote>`** — a margin aside / numbered footnote; the everyday marginalia primitive (heavily used, long undocumented). Reach for it to park a caveat, aside, or pointer without breaking the line of the main argument.
- **`<Diagram>`** — a node-edge architecture/flow figure (boxes + labeled arrows); the CORE teardown primitive for showing how the parts connect. Reach for it whenever you'd otherwise describe an architecture, pipeline, or data-flow in prose.
- **`<CodeWalkthrough>`** — narrated, syntax-highlighted STATIC code where the narration steps highlight line ranges. Reach for it for code too large or non-JS to run — it complements `RunnableCode`, which is for code small and runnable.
- **`<Stepper>`** — a numbered step sequence for a multi-stage mechanism. Reach for it when the mechanism is "first this, then this, then this."
- **`<StateMachine>`** — a token walked through states/transitions (TCP handshake, a parser, a protocol). Reach for it whenever the mechanism IS a set of states and transitions.
- **`<LayerStack>`** — an exploded/stacked layer view (a network stack, OSI model, a rendering pipeline). Reach for it for any layered system where the layering is the point.
- **`<Math>`** — a display equation / numbered derivation (KaTeX is vendored — stop faking equations in prose). Reach for it for the derivation the mechanism rests on.
- **`<Quiz>`** — a check-your-understanding at the crux. Reach for it to lock in the one idea the reader most likely gets wrong.
- **`<CompareSlider>`** — before/after (two profiler flamegraphs, two configs). Reach for it when the insight IS the difference between two states.
- **`<EventCascade>`** — a failure cascade (X → because → Y). Reach for it to show a chain of consequences, especially in failure modes.
- **`<Callout>`** — a boxed key-insight / caution. Reach for it to set apart the one line that must not be missed.
- **`<Detail>`** — progressive-disclosure "go deeper" for a proof or caveat. Reach for it to add depth for the motivated reader without bloating the linear read.
- **`<Definition>`** — a glossary tooltip that TEACHES a term (vs `Annotation`, which CITES). Reach for it when a domain term needs a one-line definition in place.
- **`<Timeline>`, `<Map>`, `<Scrolly>/<ScrollyStep>`, `<DataTable>`** — reach for these when the material is genuinely temporal, spatial, scroll-driven, or tabular.

**Anti-pattern callout — the neglected kit.** In shipped teardowns to date, `StateMachine`,
`LayerStack`, `CodeWalkthrough`, and `Model3D` — teardown's own SIGNATURE components — have gone
almost entirely unused, while every piece defaults to the same `RunnableCode` + `Chart` +
`Annotation` trio. That is the exact anti-pattern this format exists to avoid. Before you outline,
ask: does the mechanism have states and transitions (`StateMachine`)? Is it a layered system — a
protocol stack, a rendering pipeline (`LayerStack`)? Is there a code excerpt too large or non-JS to
run (`CodeWalkthrough` instead of a plain fenced block)? Is the subject a genuinely spatial physical
part (one `Model3D`, at most)? If any answer is yes, reach for it — don't default to prose plus one
Chart/Diagram.

**Every component must be earned** — but earn from this BIGGER, clearly-explained set. Reach
depth through MORE knowledge-carrying components, each earned — NOT through minimalism. The
runnable code and interactive chart are part of the argument, but so is a `Diagram` of the
architecture, a `StateMachine` of the protocol, a `LayerStack` of the stack.

**Density target.** At least one knowledge-carrying island — a `Diagram`, `CodeWalkthrough`,
`Stepper`, `StateMachine`, `LayerStack`, `RunnableCode`, `Chart`, or `DataTable` (NOT merely
`Annotation`/`Sidenote`/`Callout`) — per ~800–1000 words. A 6,000-word teardown → ~6–8
substantive islands. Anti-pattern: published Reads averaged ~2 heavy islands; beat that
decisively.

**Components carry knowledge.** A component should carry a block of knowledge the prose would
otherwise spend 200–400 words asserting. LEAD with the component (the `Diagram`/`StateMachine`/
`LayerStack`/`CodeWalkthrough` arrives BEFORE the prose that interprets it); wrap prose around
it to interpret, not restate.

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
which idea — consult `../component-catalog.json` for the full palette + live usage before
defaulting to `RunnableCode`+`Chart`+`Annotation`. Confirm every mechanism claim, number, and constant you intend to use is a
claims-table row citing a ledger URL — load-bearing ones corroborated. Anything not in the
table → `[UNSUPPORTED]` (research or cut). Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading + intent + which component + which
source. Confirm target 5,000–7,000+ words (20–25 min rendered read, a floor), that the
*hard part* gets the most space, and that every cited source appears at least once. Confirm
only kit components. **Map each major section to the knowledge-carrying component that best
CARRIES it, from the full kit (a `Diagram`, `StateMachine`, `LayerStack`, `CodeWalkthrough`,
`Stepper`, `RunnableCode`), not just an `Annotation` cite.** For each `<StatBand>` or
`<Pullquote>`, state in one sentence why it earns its place — if you can't, cut it.

### `<phase>Draft</phase>`
Write each `<RunnableCode>` first and mentally execute it — it must run and produce
the stated result. For performance charts, run `scripts/fetch-data.py` or cite a
brief number. Then write the MDX: problem → intuition → mechanism (slowest here) →
failure modes → takeaway. The knowledge-carrying component (a `Diagram`, `StateMachine`,
`LayerStack`, `CodeWalkthrough`) arrives BEFORE the prose that interprets it — lead with
it, then wrap prose around it. Cite every design decision with `<Annotation>`. Match
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
- `references/exemplars.md` — worked exemplars and annotated patterns; leads with the
  canonical full-length exemplar.
- `references/exemplars/how-shazam-works.mdx` — the **gold-standard full-length teardown**
  to read in full and emulate (topic aside — match its rigor, density, and grounding).
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/fetch-data.py` — REAL performance data from public sources (`--help`).
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
