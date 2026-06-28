---
name: writers/dispatch
description: This skill should be used to author a DISPATCH post for khazana — a data-driven, Pudding/Distill-style interactive explainer where real charts lead the prose. Trigger when a brief's "Format:" line is `dispatch`, or when asked to "write a dispatch", "explain this with data", or produce a data-storytelling MDX post. Uses scripts/fetch-data.py for REAL numbers (FRED/World Bank/OWID). Produces one MDX file (Chart/Scrolly/DataTable/Annotation/StatBand/Pullquote/NarrativeScene) targeting ~15-min rendered depth that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Dispatch writer

Author one **dispatch** post: a data-driven explainer in the tradition of The
Pudding and Distill.pub. **The chart arrives before the prose that explains it.**
The story *is* the pattern in the data; the reader discovers it through scroll-
driven reveals, then understands it. Every number has a baseline.

Input is an authoring brief on stdin: title, slug, channel, founder voice, and a
**Source items** block — the real article(s) that are the verifiable source of
truth. Output is one MDX file at the brief's path.

## Grounding mandate (non-negotiable)

Numbers are the highest-risk hallucination vector, and dispatch is all numbers, so
the discipline is: **every chart shows real, sourced data.**

- Prefer real data fetched by **`scripts/fetch-data.py`** (FRED, World Bank, Our
  World in Data — free, no API key). Cite the dataset; the script prints the
  citation line to stderr.
- If a number comes from a brief source item rather than a public dataset, use it
  verbatim and cite it inline with an `<Annotation>`.
- **If a fetch fails or no real series exists, fall back to a `<DataTable>` of
  numbers cited directly from the brief — never fabricate chart data.** A made-up
  data point fails grounding and must not ship.
- Every cited source URL goes in `sources[]` and is cited inline.

## Craft rubric (6 imperatives)

1. **Data-first, prose-second.** Every major claim is a `<Chart>` or `<DataTable>`
   *before* the sentence explaining what to see in it.
2. **One clear, quantifiable conclusion.** Not "inflation is complex" but "the 2022
   spike was driven 60% by energy and shelter, not wages." Legible in the first
   chart.
3. **Scrolly for revelation.** Use `<Scrolly>` to introduce data incrementally —
   each step adds one variable or filter. The reader *discovers* the pattern.
4. **Contextualize every number.** "Latency dropped 40% — from 120ms to 72ms."
   Never "latency improved." Every number needs a reference frame.
5. **Methodology note at the bottom.** Sources, data vintage, what the data can't
   show. Non-negotiable for credibility (the Pudding standard).
6. **Vary chart types by intent.** Line for trend, bar for comparison, area for
   cumulative, dot for relationship. Not a bar chart for everything.

Full detail: **`references/craft.md`**.

## Structural template (target ~15-min rendered read / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for ~3000–4000 words + interactive charts. Reach depth through more data layers,
richer methodology, deeper causal cuts — never padding.

Opening `<StatBand>` with the key figures of the story (cited with `href`) → hook
question + the key `<Chart>` immediately (100–150w) → context layer 1 as a `<Scrolly>`
or `<NarrativeScene>`, one chart-update per step (400–600w) → complication (the read the
simple chart misses) with `<DataTable>` (200–300w) → `<Pullquote>` of a striking data
finding or expert statement → context layer 2 `<Scrolly>`, deeper/causal cut (400–600w)
→ "so what" payoff with inline `<Annotation>` citations (200–300w) → methodology note
(150–200w). Annotated skeleton: **`references/template.mdx`**. Worked excerpts:
**`references/exemplars.md`**.

## Components (this format's kit only)

`Chart`, `Scrolly` / `ScrollyStep`, `DataTable`, `Annotation`,
`StatBand`, `Pullquote`, `NarrativeScene` — nothing else.

`<Chart mark="line|bar|area|dot">` with real `data={[...]}`; `<Scrolly>` with a pinned
`<Chart>` per step for stepped reveals; `<DataTable>` for the detailed breakdown;
`<Annotation>` for inline citations.

New narrative components — use where they deepen the data story:
- **`StatBand` (`client:visible`)**: leads the piece with the key figures (scale, rate,
  delta). Props: `stats=[{ value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`,
  `caption?`, `duration?`. Every `href` cites a source.
- **`Pullquote` (static `.astro`, NO `client:` directive)**: a striking finding or expert
  framing pulled out for visual weight. Props: `cite?`, `href?`, `kind?` (default `"quote"`).
- **`NarrativeScene` (`client:visible`)**: when the story moves geographically or needs a
  pinned visual that evolves per scroll step. Props: `steps=[{ panel, prose:"<html>" }]`,
  `caption?`. Panel: `{kind:"map", regions, weights?}` | `{kind:"chart", ...ChartProps}` |
  `{kind:"scene", headline, sub?, kicker?}`.

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice: open with a sharp question or a sledgehammer stat; numbers always
contextualized against a baseline; vary sentence rhythm; no hedging; don't start
consecutive sentences with "The". Prose and figures are *woven*, not sequential —
but the prose blocks themselves stay calm and fully readable (the drama is the
chart resolving on scroll, never the text moving).

## Authoring chain — run in strict order, tag each phase

### `<phase>Internalize</phase>`
Read the brief. Output 5–10 lines: (a) the single quantifiable question and its
one-line answer; (b) the 2–3 strongest data points and where each comes from
(a `fetch-data.py` source, or a specific brief source item) — list source ids;
(c) which chart type carries which idea. List every number you intend to use and
its source. Any number without a source → `[UNSUPPORTED]`. Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading + intent + which chart/component
+ which data source. Confirm target ~3000–4000 words (~15-min rendered read), a
methodology note is planned, and every cited source appears at least once. Confirm
only kit components are used. Note placement of `<StatBand>`, `<Pullquote>`, and
`<NarrativeScene>` if used.

### `<phase>Draft</phase>`
**Fetch data first.** For each chart backed by a public dataset, run
`python3 scripts/fetch-data.py <source> ...` and paste the returned JSON into the
`<Chart data={...}>`; record the printed SOURCE citation. For numbers from brief
items, cite inline. If a fetch fails, drop to a cited `<DataTable>`. Then write
the MDX with each chart *before* its explanation. Vary mark types. Match voice.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5: every `sources[].url` is a
verbatim brief URL (non-empty list); every number/claim cited; only kit
components; frontmatter valid; methodology note present. Run
`python3 scripts/check-links.py <file>.mdx`. If all pass, write the file and print
`DONE: <slug>`. Else print `FAIL: <slug> — <reason>` and do not write.

## Resources
- `references/craft.md` — deep craft rubric (Pudding/Distill technique).
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars and annotated patterns.
- `references/mdx-contract.md` — exact frontmatter + component contract.
- `scripts/fetch-data.py` — REAL data from FRED/World Bank/OWID (`--help`).
- `scripts/check-links.py` — Verify-phase link validator (`--help`).
