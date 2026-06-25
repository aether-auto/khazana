---
name: writers/primer
description: This skill should be used to author a PRIMER post for khazana — an evergreen, foundational explainer that will still be valuable in five years, built on progressive scaffolding with interactive sandboxes. Trigger when a brief's "Format:" line is `primer`, or when asked to "write a primer", "explain the fundamentals of X", or produce a timeless foundational explainer MDX post. Produces one MDX file (RunnableCode/Chart/Annotation) that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Primer writer

Author one **primer** post: an evergreen foundational explainer in the tradition of
betterexplained.com, Khan Academy's lesson structure, the Feynman technique, and
3Blue1Brown. The piece a smart generalist will still find valuable in five years.
It opens with the underlying *question*, not this week's news; it scaffolds
progressively; it surfaces and breaks the common misconception before teaching the
right model; and it lets the reader test intuition in interactive sandboxes.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and a
**Source items** block — the real article(s)/references that are the verifiable
source of truth. Output is one MDX file at the brief's path.

## Grounding mandate (non-negotiable)

Evergreen does not mean ungrounded. Every factual claim, definition, parameter, and
worked-example result traces to a brief source item and is cited inline with
`<Annotation>`. Even foundational claims ("entropy is the log of the number of
microstates") have a source — cite it. If a claim cannot be grounded in the brief's
sources, cut it. Every cited source URL goes in `sources[]` and is cited inline.
Worked examples in `<RunnableCode>` must be correct, self-contained JavaScript that
actually runs — a primer's whole job is to be trustworthy bedrock.

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

## Structural template (~1500–2000 words + sandboxes)

Opening question (100–150w, no jargon, no current events) → common misconception
(150–200w) with a `<RunnableCode>` sandbox that *breaks* it → concept 1 / foundation
(300–400w), definition + worked example + a `<Chart>` → concept 2 / build on
foundation (300–400w), `<RunnableCode>` the reader tweaks → concept 3 / the
interesting part (300–400w), the "aha" → synthesis + where to go next (150–200w, a
mental model, links to cited deeper resources, one question to sit with). Annotated
skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`RunnableCode`, `Chart`, `Annotation` — nothing else. `<RunnableCode>` is the
intuition sandbox (place it *before* the explanation); `<Chart>` visualizes the
concept; `<Annotation>` cites every definition and number inline. Exact props:
**`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice for a curious generalist: accessible but substantial; trust the reader
to keep up; no hedging; second person sparingly for invitations ("imagine you
are…"); vary rhythm; don't start consecutive sentences with "The". Build
understanding, don't show off. End each section on an earned insight, not a preview.

## Authoring chain — run in strict order, tag each phase

### `<phase>Internalize</phase>`
Read the brief. Output 5–10 lines: (a) the single underlying question the primer
answers; (b) the common misconception to break and the 2–3 concepts that scaffold
to the "aha", with source ids; (c) which sandbox/chart carries which concept. List
every definition/number with its source. Anything unsourced → `[UNSUPPORTED]`. Do
not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading + intent + component placement +
source. Confirm the scaffold is strictly ordered (each section depends only on
prior ones), ~1500–2000 words, no current-events examples, every cited source used.
Confirm only kit components.

### `<phase>Draft</phase>`
Write each `<RunnableCode>` sandbox first and mentally run it; place it *before* its
explanation. Write the MDX: question → misconception (broken by a sandbox) →
concept 1 → 2 → 3 (each concrete-example-first) → synthesis. Cite every definition
with `<Annotation>`. Use only timeless examples. Match voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5: every `sources[].url` verbatim +
non-empty; every claim cited; sandboxes are valid self-contained JS; no
current-events hooks; only kit components; frontmatter valid. Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write and print
`DONE: <slug>`. Else `FAIL: <slug> — <reason>` and do not write.

## Resources
- `references/craft.md` — deep craft rubric (Feynman / scaffolding pedagogy).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
