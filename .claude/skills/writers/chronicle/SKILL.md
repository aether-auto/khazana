---
name: writers/chronicle
description: This skill should be used to author a CHRONICLE post for khazana — an immersive, present-tense historical-fiction narrative grounded in real cited sources. Trigger when a brief's "Format:" line is `chronicle`, or when asked to "write a chronicle", "narrate this history as a scene", or produce immersive narrative history MDX for the site. Produces one MDX file (Scrolly/Annotation/Timeline/Map/Pullquote/StatBand) targeting ~15-min rendered depth that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Chronicle writer

Author one **chronicle** post: an immersive, present-tense historical narrative in
the tradition of Erik Larson, Simon Winchester, and Robert Caro's scene-writing.
The reader is *there* — in the scene, with named actors doing named things. The
craft tension that defines the format: it reads like fiction but **every named
detail is real and cited.** The spell never breaks, and it never fabricates.

Input is an authoring brief on stdin (from `buildBrief()`): title, slug, channel,
the founder voice guide, and the **curated cluster** — the real seed article(s) plus
the assignment. The verifiable source of truth is the **citation ledger** the
research phase builds *out* from that cluster. Output is one MDX file at the brief's path.

## Grounding mandate (non-negotiable)

Every scene detail — a date, a place, a name, a number, a decision, a quote — must
trace to a **citation-ledger source** (see `writers/researcher`). Chronicle is the
*hardest* format to ground because invented detail feels native to narrative. So the
discipline is strictest here:

- If a detail is not supported by a ledger source, **cut it or mark it
  `[UNSUPPORTED]`** for the verify pass. Never invent a name, figure, or quote to
  make a scene vivid.
- **Load-bearing detail** — the decisive date, the central figure, the turning-point
  fact the scene pivots on — must be corroborated by **≥2 independent ledger sources**
  and should rest on a **High-tier** source (peer-reviewed / primary document /
  first-hand account) where one exists. Incidental colour needs one ledger source; the
  spine of the story needs corroboration. A first-hand primary account, attributed in
  the prose, may carry a load-bearing detail alone — but prefer a second record.
- Where the research surfaced **conflicting accounts** (disputed dates, contested
  figures), do not smooth them over: present the range or attribute the positions
  honestly, exactly as the claims table flags them.
- If the ledger lacks enough grounded detail to build real scenes (a `RESEARCH THIN`
  handoff), say so in Internalize and emit a thinner, honestly-scoped piece rather than
  hallucinating. Flag with `FAIL: <slug> — insufficient source detail for chronicle`.
- Every cited source URL goes in `sources[]` **and** is cited inline as an
  `<Annotation>` at the point its fact is used — and every such URL is in the ledger.

Shared tier rubric, triangulation rules, and the gate definitions live once in
**`writers/researcher/SKILL.md`** — this skill references them, never restates them.

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

## Structural template (target ~15-min rendered read / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for ~3500–4500 words when source depth supports it. Reach the length through more scenes,
more cited detail, a deeper consequence arc — never padding. The scoring Gaussian peaks at
15 min; a 1800-word piece scores half as well as one that earns the full depth.

Hook scene (200–300w, present tense, anchor with `<Map>`) → optional `<StatBand>` with the key
figures of the story (casualties, date, distance, cost — each cited with `href`; earn it: only
if those numbers set up the stakes) → context beat 1 (150–200w) → core scene (400–600w,
`<Scrolly>` reveals the sequence, every named fact an `<Annotation>`) → optional `<Pullquote>`
of a period primary source if one exists (`kind="telegram"`, `"document"`, `"headline"`, or
`"quote"`; earn it: only if the verbatim source is more powerful than paraphrase) → context beat
2 (100–150w) → aftermath scene (400–600w) → consequence (300–400w, `<Timeline>` of legacy).
Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`Scrolly` / `ScrollyStep`, `Annotation`, `Timeline`, `Map`, `Pullquote`, `StatBand`
— and nothing else. (A richer scrollytelling component is pending a rebuild — do not use yet.)

**Every component must be earned.** Don't add a component because it seems dramatic; add it
because the story is poorer without it. Narrative reads: Map anchors geography, Timeline anchors
chronology, Scrolly drives the peak sequence, Pullquote surfaces the primary source, StatBand
makes the scale visceral. A Chronicle with only Annotation, Map, and Timeline is often stronger
than one cluttered with every available component.

- **`<Annotation>`** — carries every citation (renders as marginalia, never breaking prose).
- **`<Map client:visible>`** — anchors geography early. Props: `values` (iso3 → number), `labels` (iso3 → name), `caption?`.
- **`<Timeline client:load>`** — anchors chronology or shows the long-arc legacy at the end.
- **`<Scrolly client:visible>` / `<ScrollyStep>`** — drives the peak sequence one beat per step; `graphic` prop takes a pinned `<Chart>`, `<Map>`, or `<Timeline>`.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)**: period primary-source block — a wire dispatch, treaty line, newspaper headline. Props: `cite?`, `href?`, `kind?: "quote"|"document"|"telegram"|"headline"`. Children = the quote text. Earn it: only when the verbatim original is more powerful than a paraphrase.
- **`<StatBand client:visible>`**: row of big figures counting up on scroll-in. Props: `stats=[{ value, prefix?, suffix?, decimals?, group?(default true), label, sub?, href? }]`, `caption?`, `duration?`. `href` cites a source. Earn it: only when the numbers genuinely set the stakes.

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice (from the brief / STYLE.md): vary sentence rhythm — short
declaratives as beats, one long sentence before a short reset, never three long in
a row. No hedging ("it seems", "arguably"). Don't start consecutive sentences with
"The". Present tense in scenes; third person in context beats; second person only
for a deliberate "imagine you are…" invitation. The drama lives in the scene; the
prose itself stays clean and readable — no animation gimmicks in the text.

## Authoring chain — run in strict order, tag each phase

### `<phase>Research</phase>`
**Run before Internalize. Do not draft without a populated citation ledger + claims
table.** Invoke the `writers/researcher` methodology on this brief: plan 5–8 research
questions, search *out* from the curated seeds to primary sources (papers, dated
first-hand accounts, official records), appraise each into the ledger with its tier,
and triangulate every load-bearing narrative fact to ≥2 independent sources. Chronicle
depends on **dated, named, first-hand primary detail** — bias the search toward
period documents, archival transcriptions, and the original record, not modern
retellings. Output the research dossier, the citation ledger, and the claims table.
If the gates can't be met at budget, take the `RESEARCH THIN` handoff and scope down.

### `<phase>Internalize</phase>`
Read the brief and the research dossier fully. Output 5–10 lines: (a) the single narrative spine (whose
story, what turning point); (b) the 2–3 strongest *citeable* scene details and
their ledger URLs (prefer High-tier / primary); (c) which component anchors which beat
(`<Map>`/`<Timeline>` early, `<Scrolly>` at the peak). Then confirm **every** fact you
intend to dramatize is a row in the claims table with a ledger URL — load-bearing spine
facts corroborated. Any fact not in the table → mark `[UNSUPPORTED]` now (research it or
cut it). If the ledger can't support real scenes, stop and plan a `FAIL`. Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading/beat + 1-line intent + component
placement + which source(s) each beat draws on. Confirm target ~3500–4500 words
(~15-min rendered read) and that every cited source appears at least once. Confirm
only kit components are used. For each `<StatBand>` or `<Pullquote>`, state why it
earns its place — if you can't say why in one sentence, cut it.

### `<phase>Draft</phase>`
Write the full MDX. The anchoring `<Map>`/`<Timeline>` arrives before the prose it
grounds. Every named fact gets an inline `<Annotation term=... note=... />`. Hold
present tense in scenes. Match founder voice. Cut any detail you cannot cite.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5 **and the fact-check gates**:
(1) every `sources[].url` is a **verbatim ledger URL** (curated ∪ researched) and the
list is non-empty; (2) **≥90% of factual claims cite a ledger source** — every named
fact carries an inline `<Annotation>` tracing to the ledger, or it is cut; (3) **≥60%
of load-bearing claims are corroborated by ≥2 independent ledger sources** (check
against the claims table); (4) no fabricated or uncited detail; conflicts surfaced, not
smoothed; (5) only kit components appear; (6) frontmatter matches the schema.
Then run `python3 scripts/check-links.py <file>.mdx`. If all pass, write the file
and print `DONE: <slug>`. If any gate fails, print `FAIL: <slug> — <reason>` and do not
write.

## Resources
- `writers/researcher/SKILL.md` — the research phase: literature search, tier rubric,
  triangulation, the ledger + claims-table shapes, and the fact-check gates (shared).
- `references/craft.md` — deep craft rubric and narrative-nonfiction technique.
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help` for usage).
