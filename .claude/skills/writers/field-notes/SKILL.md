---
name: writers/field-notes
description: This skill should be used to author a FIELD NOTES post for khazana — a ruthlessly short, sharp news briefing on a fast-moving cluster, in the spirit of Stratechery's Daily Update or Axios. Trigger when a brief's "Format:" line is `field-notes`, or when asked to "write field notes", "brief me on this", or produce a short sharp news synthesis MDX post. Produces one MDX file (Annotation/DataTable) that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Field Notes writer

Author one **field-notes** post: a ruthlessly short, sharp briefing in the spirit
of Stratechery's Daily Update, The Browser, and Axios. No preamble. What happened →
why it matters to *this reader specifically* → the one crystallizing number → what
to watch. Every word justified; links to sources are the product, not decoration.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and a
**Source items** block — the real article(s) that are the verifiable source of
truth. Output is one MDX file at the brief's path. This is the only **brief**-length
format (~300–500 words).

## Grounding mandate (non-negotiable)

A briefing's entire value is that it's *accurate and current*. Every fact — what
happened, who did it, when, the number — traces to a brief source item and is cited
inline with `<Annotation>` or a Markdown link. No fact, figure, or attribution that
isn't in a source. Every cited source URL goes in `sources[]`. With so few words,
there is nowhere to hide an unsupported claim — cut anything you can't cite.

## Craft rubric (4 imperatives)

1. **No preamble.** The first sentence is the lede. No "In today's increasingly
   complex landscape…". Open with what happened.
2. **Why it matters to the founder specifically.** Not "this is big for tech" but
   "this directly affects the embedded stack you care about, because…". Use the
   brief's channel/rationale to make it specific.
3. **One crystallizing number or data point.** A single `<Annotation>` figure, or a
   small `<DataTable>` if a comparison helps. It makes the piece citable and
   sharable.
4. **"Watch for:" line last.** One concrete, ideally timed thing to monitor — a
   specific indicator, date, or name. Not a vague prediction.

Full detail: **`references/craft.md`**.

## Structural template (~300–500 words)

Lede (2–3 sentences: what happened, who, when) → why it matters (2–3 sentences,
channel-specific, one cited source) → the number (1 sentence + `<Annotation>` or a
small `<DataTable>`) → "Watch for:" (1 sentence, specific) → sources (the cited
links). Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`Annotation`, `DataTable` — nothing else. `<Annotation>` carries the crystallizing
figure and inline citations; `<DataTable>` is used *only* if a small comparison
(2–4 rows) sharpens the story. Most of the piece is prose. Exact props:
**`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice, at maximum compression: every sentence earns its place; no padding to
hit a length; no hedging; first person allowed here (the author is a sharp observer);
don't start consecutive sentences with "The"; no closing flourish, no "in summary".
The brevity *is* the craft — do not pad a 350-word piece to 500.

## Authoring chain — run in strict order, tag each phase

### `<phase>Internalize</phase>`
Read the brief. Output 4–6 lines: (a) the single lede — what happened, in one
sentence; (b) the channel-specific reason it matters to the founder; (c) the one
crystallizing number and its source id; (d) the watch-for indicator. List every fact
with its source. Anything unsourced → cut it (no room for `[UNSUPPORTED]` in a
briefing). Do not write prose yet.

### `<phase>Outline</phase>`
Confirm the four beats (lede / why-it-matters / number / watch-for) each map to a
source, the piece will land at ~300–500 words, and only `Annotation`/`DataTable`
appear (and `<DataTable>` only if it earns its place). Confirm every cited source is
used.

### `<phase>Draft</phase>`
Write the MDX: lede first (no preamble), channel-specific stakes, the crystallizing
number cited with `<Annotation>` (or a tight `<DataTable>`), the "Watch for:" line,
then the source links. Cut every word that isn't load-bearing. Match voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5: every `sources[].url` verbatim +
non-empty; every fact cited; only `Annotation`/`DataTable` used; word count in
range; no preamble or closing flourish; frontmatter valid. Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write and print
`DONE: <slug>`. Else `FAIL: <slug> — <reason>` and do not write.

## Resources
- `references/craft.md` — deep craft rubric (Stratechery/Axios technique).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
