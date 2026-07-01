---
name: writers/primer
description: This skill should be used to author a PRIMER post for khazana — an evergreen, foundational explainer that will still be valuable in five years, built on progressive scaffolding with interactive sandboxes. Trigger when a brief's "Format:" line is `primer`, or when asked to "write a primer", "explain the fundamentals of X", or produce a timeless foundational explainer MDX post. Produces one MDX file (RunnableCode/Chart/Annotation/StatBand/Pullquote) targeting ~15-min rendered depth that builds in apps/site and passes validateDraft.
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

## Structural template (target ~15-min rendered read / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for ~3000–4000 words + interactive sandboxes. Reach depth through more scaffold
layers, more worked examples, a richer synthesis — never padding.

Opening question (100–150w, no jargon, no current events) → optional `<StatBand>` if
the scale/consequence genuinely motivates the question (earn it: only when those numbers
reframe why the concept matters) → common misconception (200–300w) with a `<RunnableCode>`
sandbox that *breaks* it → concept 1 / foundation (400–600w), definition + worked example +
a `<Chart>` → optional `<Pullquote>` of a foundational definition or literature framing if
the verbatim is more powerful than a paraphrase → concept 2 / build on foundation (400–600w),
`<RunnableCode>` the reader tweaks → concept 3 / the interesting part (400–600w), the "aha"
→ synthesis + where to go next (150–200w, a mental model, links, one question to sit with).
Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`RunnableCode`, `Chart`, `Annotation`, `StatBand`, `Pullquote` — nothing else.
(A richer scrollytelling component is pending a rebuild — do not use yet.)

**Every component must be earned.** The sandbox and chart ARE the argument — lead with
intuition, let readers play, then explain. Reach depth through more scaffold layers, more
worked examples — not by adding components. A primer with only `RunnableCode`, `Chart`,
and `Annotation` is often the strongest.

- **`<RunnableCode client:visible>`** — intuition sandbox; place it *before* the explanation. Mentally run it before writing.
- **`<Chart client:visible>`** — visualizes the concept; vary mark by intent.
- **`<Annotation client:load>`** — cites every definition and number inline.
- **`<StatBand client:visible>`** — earn it when the scale/consequence genuinely motivates the question. Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)** — earn it when a verbatim foundational definition or literature framing is more powerful than a paraphrase. Props: `cite?`, `href?`, `kind?` (default `"quote"`).

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
prior ones), target ~3000–4000 words (~15-min rendered read), no current-events
examples, every cited source used. Confirm only kit components. For each `<StatBand>`
or `<Pullquote>`, state in one sentence why it earns its place — if you can't, cut it.

### `<phase>Draft</phase>`
Write each `<RunnableCode>` sandbox first and mentally run it; place it *before* its
explanation. Write the MDX: question → misconception (broken by a sandbox) →
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
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
