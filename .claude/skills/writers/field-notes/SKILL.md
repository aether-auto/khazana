---
name: writers/field-notes
description: This skill should be used to author a FIELD NOTES post for khazana — a ruthlessly short, sharp news briefing on a fast-moving cluster, in the spirit of Stratechery's Daily Update or Axios. Trigger when a brief's "Format:" line is `field-notes`, or when asked to "write field notes", "brief me on this", or produce a short sharp news synthesis MDX post. Produces one MDX file (Annotation/DataTable; sparingly StatBand/Pullquote) that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Field Notes writer

Author one **field-notes** post: a ruthlessly short, sharp briefing in the spirit
of Stratechery's Daily Update, The Browser, and Axios. No preamble. What happened →
why it matters to *this reader specifically* → the one crystallizing number → what
to watch. Every word justified; links to sources are the product, not decoration.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and the
**curated cluster** — the real seed article(s). The verifiable source of truth is the
**citation ledger** the (light) research pass builds from that cluster. Output is one
MDX file at the brief's path. This is the only **brief**-length format (~300–500 words).

**Field Notes is the explicit EXEMPTION to the long-form doctrine.** The five long-form
formats now target a **20–25 min / 5,000–7,000-word FLOOR** with the full expanded
component kit and a ≥1-knowledge-carrying-island-per-~800–1,000-words density target.
**None of that applies here.** Field-notes stays a deliberately brief ~300–500-word
synthesis/digest: the length floor does NOT apply, the density target does NOT apply, and
the expanded kit does NOT apply. A writer must **NOT pad a field-note toward the floor** —
padding a briefing is a failure, not a fix. Brevity is the whole craft; keep it cut.

## Grounding mandate (non-negotiable)

A briefing's entire value is that it's *accurate and current*. Every fact — what
happened, who did it, when, the number — traces to a **citation-ledger source** (see
`writers/researcher`) and is cited inline with `<Annotation>` or a Markdown link. No
fact, figure, or attribution that isn't in the ledger. The **crystallizing number and
the core "what happened"** are load-bearing — corroborate them against a **≥2
independent, reputable (Med+) sources**, since a briefing that gets the headline fact
wrong is worse than no briefing. Every cited source URL goes in `sources[]` and is in
the ledger. With so few words, there is nowhere to hide an unsupported claim — cut
anything you can't cite.

Shared tier rubric, triangulation rules, and gate definitions live once in
**`writers/researcher/SKILL.md`** — referenced here, not restated.

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

`Annotation`, `DataTable` — primary kit. `<Annotation>` carries the crystallizing
figure and inline citations; `<DataTable>` is used *only* if a small comparison
(2–4 rows) sharpens the story. Most of the piece is prose.

Sparingly, if — and only if — they earn their place in a tight briefing:
- **`StatBand` (`client:visible`)**: one crystallizing figure, if the number IS the whole
  story. Use at most one; omit if `<Annotation>` or `<DataTable>` already carries it.
  Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`.
- **`Pullquote` (static `.astro`, NO `client:` directive)**: one striking primary-source
  line if it anchors the lede and is more powerful verbatim than paraphrased. At most one.
  Props: `cite?`, `href?`, `kind?`.
- **`Callout` (static `.astro`, NO `client:` directive)**: the ONE component the
  long-form expansion adds to this format — a single `kind="key-insight"` "watch for" /
  key-insight box, used **at most once** to frame the one thing that matters. Nothing else
  from the expanded kit (no Chart/Diagram/Figure/Simulation/Timeline/…) belongs in a
  field-note — those are knowledge-carriers for the long formats, and this format is a
  briefing, not a deep read. Props: `kind`, `title?`, children = the note body (MDX).

**Default: use none of the above.** The prose, one Annotation, and a source link are almost
always enough. Components must be earned; brevity is this format's whole craft.
Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice, at maximum compression: every sentence earns its place; no padding to
hit a length; no hedging; first person allowed here (the author is a sharp observer);
don't start consecutive sentences with "The"; no closing flourish, no "in summary".
The brevity *is* the craft — do not pad a 350-word piece to 500.

## Authoring chain — run in strict order, tag each phase

### `<phase>Research</phase>`
**Run before Internalize — a light, currency-focused pass** (this format is short; the
research is proportionate). Invoke the `writers/researcher` methodology at reduced scope:
2–4 questions, a hard cap of ~4–6 sources, prioritising **currency and a second
independent confirmation** of the core fact and the crystallizing number over deep
literature search. Appraise each source into the ledger with its tier; corroborate the
load-bearing facts. Output a short dossier, the citation ledger, and a compact claims
table. Do not over-research a briefing — get the facts confirmed and move.

### `<phase>Internalize</phase>`
Read the brief and the short dossier. Output 4–6 lines: (a) the single lede — what
happened, in one sentence; (b) the channel-specific reason it matters to the founder;
(c) the one crystallizing number and its ledger URL; (d) the watch-for indicator.
Confirm every fact is a claims-table row citing a ledger URL — the lede and the number
corroborated. Anything not in the table → cut it (no room for `[UNSUPPORTED]` in a
briefing). Do not write prose yet.

### `<phase>Outline</phase>`
Confirm the four beats (lede / why-it-matters / number / watch-for) each map to a
source, the piece will land at ~300–500 words, and only `Annotation`/`DataTable`
appear by default (`<DataTable>` only if it earns its place; `<StatBand>`/`<Pullquote>`
only if you can state in one sentence why prose + Annotation isn't enough). Confirm
every cited source is used.

### `<phase>Draft</phase>`
Write the MDX: lede first (no preamble), channel-specific stakes, the crystallizing
number cited with `<Annotation>` (or a tight `<DataTable>`), the "Watch for:" line,
then the source links. Cut every word that isn't load-bearing. Match voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5 **and the fact-check gates**: every
`sources[].url` is a **verbatim ledger URL** + non-empty; **every fact cites a ledger
source** (in a briefing the coverage bar is effectively 100% — there are too few words
to hide an uncited claim); the **lede and crystallizing number corroborated by ≥2
independent sources**; only `Annotation`/`DataTable` used (StatBand/Pullquote only where
earned); word count in range; no preamble or closing flourish; frontmatter valid. Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write and print
`DONE: <slug>`. Else `FAIL: <slug> — <reason>` and do not write.

## Resources
- `writers/researcher/SKILL.md` — the research phase: literature search, tier rubric,
  triangulation, the ledger + claims-table shapes, and the fact-check gates (shared).
- `references/craft.md` — deep craft rubric (Stratechery/Axios technique).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
