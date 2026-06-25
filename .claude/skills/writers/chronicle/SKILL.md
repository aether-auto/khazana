---
name: writers/chronicle
description: This skill should be used to author a CHRONICLE post for khazana — an immersive, present-tense historical-fiction narrative grounded in real cited sources. Trigger when a brief's "Format:" line is `chronicle`, or when asked to "write a chronicle", "narrate this history as a scene", or produce immersive narrative history MDX for the site. Produces one MDX file (Scrolly/Annotation/Timeline/Map) that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Chronicle writer

Author one **chronicle** post: an immersive, present-tense historical narrative in
the tradition of Erik Larson, Simon Winchester, and Robert Caro's scene-writing.
The reader is *there* — in the scene, with named actors doing named things. The
craft tension that defines the format: it reads like fiction but **every named
detail is real and cited.** The spell never breaks, and it never fabricates.

Input is an authoring brief on stdin (from `buildBrief()`): title, slug, channel,
the founder voice guide, and a **Source items** block — the real article(s) that
are the verifiable source of truth. Output is one MDX file at the brief's path.

## Grounding mandate (non-negotiable)

Every scene detail — a date, a place, a name, a number, a decision, a quote — must
trace to a brief source item. Chronicle is the *hardest* format to ground because
invented detail feels native to narrative. So the discipline is strictest here:

- If a detail is not supported by a source item, **cut it or mark it
  `[UNSUPPORTED]`** for the verify pass. Never invent a name, figure, or quote to
  make a scene vivid.
- If the source items lack enough body detail to build real scenes, say so in the
  Internalize phase and emit a thinner, honestly-scoped piece rather than
  hallucinating. Flag with `FAIL: <slug> — insufficient source detail for chronicle`.
- Every cited source URL goes in `sources[]` **and** is cited inline as an
  `<Annotation>` at the point its fact is used.

## Craft rubric (5 imperatives)

1. **Open in scene, not context.** "It is dawn, 14 October 1066, and Harold
   Godwinson has not slept." Never "The Battle of Hastings was pivotal."
2. **Name the actors and give them motive.** People, not abstractions. Use the
   real names the sources supply.
3. **One concrete, citeable detail per paragraph.** The specific detail only a
   source could supply is what separates narrative history from fiction — it
   *proves the research*.
4. **Pace scene → context → scene.** Alternate immersive present-tense scenes with
   short third-person context beats that locate the reader in time and causality.
5. **End with consequence, not summary.** The final beat returns to the long arc —
   why this moment echoes forward. Short, declarative, present tense.

Full detail: **`references/craft.md`**.

## Structural template (~1800–2500 words)

Hook scene (200–300w, present tense, anchor with `<Map>` or `<Timeline>`) →
context beat 1 (150–200w) → core scene (300–400w, `<Scrolly>` reveals the
sequence, every named fact an `<Annotation>`) → context beat 2 (100–150w) →
aftermath scene (300–400w) → consequence (200–300w, `<Timeline>` of legacy).
Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`Scrolly` / `ScrollyStep`, `Annotation`, `Timeline`, `Map` — and nothing else.
`<Annotation>` carries every citation (renders as marginalia, never breaking
prose). `<Map>` anchors geography early; `<Timeline>` anchors chronology or shows
the long-arc legacy at the end; `<Scrolly>` drives the peak sequence one beat per
step. Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice (from the brief / STYLE.md): vary sentence rhythm — short
declaratives as beats, one long sentence before a short reset, never three long in
a row. No hedging ("it seems", "arguably"). Don't start consecutive sentences with
"The". Present tense in scenes; third person in context beats; second person only
for a deliberate "imagine you are…" invitation. The drama lives in the scene; the
prose itself stays clean and readable — no animation gimmicks in the text.

## Authoring chain — run in strict order, tag each phase

### `<phase>Internalize</phase>`
Read the brief fully. Output 5–10 lines: (a) the single narrative spine (whose
story, what turning point); (b) the 2–3 strongest *citeable* scene details and
their source ids; (c) which component anchors which beat (`<Map>`/`<Timeline>`
early, `<Scrolly>` at the peak). Then list **every** fact you intend to dramatize
with its source id. Any fact without a source → mark `[UNSUPPORTED]` now. If
sources can't support real scenes, stop and plan a `FAIL`. Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading/beat + 1-line intent + component
placement + which source(s) each beat draws on. Confirm ~1800–2500 words and that
every cited source appears at least once. Confirm only kit components are used.

### `<phase>Draft</phase>`
Write the full MDX. The anchoring `<Map>`/`<Timeline>` arrives before the prose it
grounds. Every named fact gets an inline `<Annotation term=... note=... />`. Hold
present tense in scenes. Match founder voice. Cut any detail you cannot cite.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5: (1) every `sources[].url` is a
verbatim brief URL and the list is non-empty; (2) every named fact has an inline
citation; (3) only kit components appear; (4) frontmatter matches the schema.
Then run `python3 scripts/check-links.py <file>.mdx`. If all pass, write the file
and print `DONE: <slug>`. If any fail, print `FAIL: <slug> — <reason>` and do not
write.

## Resources
- `references/craft.md` — deep craft rubric and narrative-nonfiction technique.
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help` for usage).
