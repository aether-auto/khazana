---
name: writers/primer
description: This skill should be used to author a PRIMER post for khazana — an evergreen, foundational explainer that will still be valuable in five years, built on progressive scaffolding with interactive sandboxes. Trigger when a brief's "Format:" line is `primer`, or when asked to "write a primer", "explain the fundamentals of X", or produce a timeless foundational explainer MDX post. Produces one MDX file (RunnableCode/Chart/Annotation/StatBand/Pullquote) targeting a 20–25 min rendered depth (~5,000–7,000+ words) that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Primer writer

Author one **primer** post: an evergreen foundational explainer in the tradition of
betterexplained.com, Khan Academy's lesson structure, the Feynman technique, and
3Blue1Brown. The piece a smart generalist will still find valuable in five years.
It opens with the underlying *question*, not this week's news; it scaffolds
progressively; it surfaces and breaks the common misconception before teaching the
right model; and it lets the reader test intuition in interactive sandboxes.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and the
**curated cluster** — the real seed article(s)/references. The verifiable source of
truth is the **citation ledger** the research phase builds out from that cluster.
Output is one MDX file at the brief's path.

## Grounding mandate (non-negotiable)

Evergreen does not mean ungrounded. Every factual claim, definition, parameter, and
worked-example result traces to a **citation-ledger source** (see `writers/researcher`)
and is cited inline with `<Annotation>`. Even foundational claims ("entropy is the log
of the number of microstates") have a source — cite it, and prefer the **primary /
peer-reviewed / canonical text** the research surfaced over a secondary explainer.
**Load-bearing claims** — the core definition, the concept the scaffold builds to —
should rest on a **High-tier** source and be **corroborated by ≥2 independent ledger
sources**. Where authorities frame a concept differently, note it honestly rather than
asserting one framing as the only one. If a claim cannot be grounded in a ledger source,
cut it. Every cited source URL goes in `sources[]` and is cited inline — and every such
URL is in the ledger. Worked examples in `<RunnableCode>` must be correct, self-contained
JavaScript that actually runs — a primer's whole job is to be trustworthy bedrock.

Shared tier rubric, triangulation rules, and gate definitions live once in
**`writers/researcher/SKILL.md`** — referenced here, not restated.

## Craft rubric (6 imperatives)

1. **Open with the underlying question, not an event.** "Why does compressing data
   work at all?" not "With the rise of streaming video…". Timeless framing only.
2. **Scaffold explicitly.** Each section is a prerequisite for the next; name what
   the reader now knows and what comes next ("Now that you understand X, here's
   where it gets interesting").
3. **Address the misconception before the concept.** State the common wrong mental
   model first, break it with a concrete counterexample, then replace it.
4. **Sandbox before explanation.** A `<RunnableCode>` appears *first*; the reader
   plays; then the explanation makes sense of what they observed.
5. **Concrete example for every abstraction.** No abstract definition without a
   worked example immediately after — then the general case.
6. **Timeless examples only.** Physics, biology, cooking, math — anything with a
   long shelf life. No "as we saw in the 2024 election".

Full detail: **`references/craft.md`**.

## Structural template (target 20–25 min rendered read — the length FLOOR / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for 5,000–7,000+ words + interactive sandboxes — this is a FLOOR, not a target; go
longer when the concept supports it. Reach depth through more scaffold layers, more worked
examples, a richer synthesis — never padding — and through MORE knowledge-carrying
components (a Simulation, a Math derivation, a Stepper scaffold, a Quiz), each earned. Use
Detail/Expandable to add depth for motivated readers without bloating the linear read.

Opening question (100–150w, no jargon, no current events) → optional `<StatBand>` if
the scale/consequence genuinely motivates the question (earn it: only when those numbers
reframe why the concept matters) → common misconception (200–300w) with a `<RunnableCode>`
sandbox that *breaks* it → concept 1 / foundation (400–600w), definition + worked example +
a `<Chart>` → optional `<Pullquote>` of a foundational definition or literature framing if
the verbatim is more powerful than a paraphrase → concept 2 / build on foundation (400–600w),
`<RunnableCode>` the reader tweaks → concept 3 / the interesting part (400–600w), the "aha"
→ synthesis + where to go next (150–200w, a mental model, links, one question to sit with).
Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`** — and read the **canonical full-length exemplar** it points to,
**`references/exemplars/central-limit-theorem.mdx`**, in full during Internalize to calibrate
the bar.

## Your interactive kit

There are ~40 interactive components across khazana; primer's kit is the subset below.
Actively CHOOSE from the WHOLE kit — do NOT default to `RunnableCode`+`Chart`+`Annotation`.
Every component must be earned — but earn from this bigger, clearly-explained set: reach
depth through MORE knowledge-carrying components, each earned, NOT through minimalism.

**COMPONENTS CARRY KNOWLEDGE.** A component should carry a block of knowledge the prose
would otherwise spend 200–400 words asserting. **LEAD with the component** — the
Simulation / sandbox / Math arrives BEFORE the prose that interprets it (primer already
does "sandbox before explanation"; generalize it to every knowledge-carrier) — then wrap
prose around it to *interpret*, not restate.

**DENSITY TARGET.** At least one knowledge-carrying *island* — `Simulation`,
`RunnableCode`, `Chart`, `Math`, `Stepper`, `Quiz`, `CodeWalkthrough`, `StateMachine`,
`LayerStack`, `DataTable` (NOT merely `Annotation`/`Sidenote`/`Callout`/`Definition`) —
per ~800–1000 words. A 6,000-word primer → ~6–8 substantive islands. Anti-pattern:
published Reads averaged ~2 heavy islands. Beat that decisively.

The kit — reach for each when:

- **`<RunnableCode client:visible>`** — intuition sandbox; place it *before* the explanation. Mentally run it before writing.
- **`<Chart client:visible>`** — visualizes the concept; vary mark by intent.
- **`<Annotation client:load>`** — cites every definition and number inline (CITES a source).
- **`<StatBand client:visible>`** — earn it when the scale/consequence genuinely motivates the question. Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)** — earn it when a verbatim foundational definition or literature framing is more powerful than a paraphrase. Props: `cite?`, `href?`, `kind?` (default `"quote"`).
- **`<Sidenote>`** — the everyday marginalia primitive: a margin aside / numbered footnote. Reach for it for a tangent or citation that shouldn't interrupt the line.
- **`<Simulation>`** — an interactive canvas sandbox with reader-tunable sliders animating a system (a random walk, wave interference, an SIR epidemic, gradient descent). The SINGLE highest-leverage primer knowledge-carrier; reach for it when a system is best UNDERSTOOD by playing with it.
- **`<Quiz>`** — check-your-understanding: 1–N questions with explanations. Reach for it to test the reader's mental model right after a concept lands.
- **`<Math>`** — display equation / numbered derivation with per-line notes. KaTeX is vendored; when the concept rests on an equation, set it properly instead of faking it in prose.
- **`<Stepper>`** — a numbered scaffold / worked sequence, one step visible at a time. Reach for it for a strict build-up.
- **`<Definition>`** — a glossary tooltip that TEACHES a term (dotted underline), distinct from `Annotation` which CITES.
- **`<CodeWalkthrough>`** — narrated static code stepping through line ranges. Reach for it when code is too large to run live.
- **`<StateMachine>`** — a token walked through states/transitions. Reach for it for a state-based concept.
- **`<LayerStack>`** — an exploded, layered view. Reach for it for a layered concept.
- **`<Callout>`** — a boxed key-insight note.
- **`<Detail>`** — progressive-disclosure "go deeper" for a proof or aside without bloating the linear read.
- **`<Timeline>`, `<Map>`, `<Scrolly>/<ScrollyStep>`** — timeline / geographic / scrollytelling carriers when the concept is temporal, spatial, or step-revealed.

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice for a curious generalist: accessible but substantial; trust the reader
to keep up; no hedging; second person sparingly for invitations ("imagine you
are…"); vary rhythm; don't start consecutive sentences with "The". Build
understanding, don't show off. End each section on an earned insight, not a preview.

## Authoring chain — run in strict order, tag each phase

### `<phase>Research</phase>`
**Run before Internalize. Do not draft without a populated citation ledger + claims
table.** Invoke the `writers/researcher` methodology: plan 5–8 research questions,
search out from the curated seeds to the **canonical / primary sources** for the
concept (the original text, the peer-reviewed definition, the authoritative reference),
appraise each into the ledger with its tier, and triangulate every load-bearing
definition or claim to ≥2 independent sources, noting where authorities frame it
differently. Output the research dossier, the citation ledger, and the claims table.
If the gates can't be met at budget, take the `RESEARCH THIN` handoff and scope down.

### `<phase>Internalize</phase>`
Read the brief and the research dossier. Output 5–10 lines: (a) the single underlying
question the primer answers; (b) the common misconception to break and the 2–3 concepts
that scaffold to the "aha", with their ledger URLs (prefer High-tier / canonical);
(c) which sandbox/chart carries which concept. Confirm every definition/number is a
claims-table row citing a ledger URL — load-bearing ones corroborated. Anything not in
the table → `[UNSUPPORTED]` (research or cut). Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading + intent + component placement +
source. Confirm the scaffold is strictly ordered (each section depends only on
prior ones), target 5,000–7,000+ words (20–25 min rendered read, a floor), no
current-events examples, every cited source used. **Map each major section to the
knowledge-carrying component that best CARRIES it, from the full kit** (a `Simulation`,
a `RunnableCode` sandbox, a `Math` derivation, a `Stepper`, a `Quiz`), not just an
`Annotation` cite. Confirm only kit components. For each `<StatBand>` or `<Pullquote>`,
state in one sentence why it earns its place — if you can't, cut it.

### `<phase>Draft</phase>`
Write each `<RunnableCode>` sandbox first and mentally run it; place it *before* its
explanation. Every knowledge-carrying component (a `Simulation`, a sandbox, a `Math`
block, a `Stepper`) arrives BEFORE the prose that interprets it. Write the MDX:
question → misconception (broken by a sandbox) →
concept 1 → 2 → 3 (each concrete-example-first) → synthesis. Cite every definition
with `<Annotation>`. Use only timeless examples. Match voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5 **and the fact-check gates**: every
`sources[].url` is a **verbatim ledger URL** + non-empty; **≥90% of claims cite a ledger
source** or are cut; **≥60% of load-bearing definitions/claims corroborated by ≥2
independent ledger sources** (check the claims table); differing framings noted, not
flattened; sandboxes are valid self-contained JS; no current-events hooks; only kit
components; frontmatter valid. Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write and print
`DONE: <slug>`. Else `FAIL: <slug> — <reason>` and do not write.

## Resources
- `writers/researcher/SKILL.md` — the research phase: literature search, tier rubric,
  triangulation, the ledger + claims-table shapes, and the fact-check gates (shared).
- `references/craft.md` — deep craft rubric (Feynman / scaffolding pedagogy).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns; leads with the
  canonical full-length exemplar.
- `references/exemplars/central-limit-theorem.mdx` — the **gold-standard full-length primer**
  to read in full and emulate (topic aside — match its rigor, density, and grounding).
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
