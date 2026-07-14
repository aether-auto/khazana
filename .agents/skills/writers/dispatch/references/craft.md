# Dispatch — craft rubric (deep)

Models: The Pudding's visual essays, Distill.pub's interactive articles, NYT The
Upshot. The shared doctrine: **the figure is the atomic unit, and the prose serves
the figure.** A dispatch is not an article with charts dropped in; it is a sequence
of figures, each set up and paid off by a short prose beat.

## The Pudding rule
"The data has to speak and be able to provide a conclusion." If the chart needs a
paragraph to mean anything, the chart is wrong — fix the chart, not the paragraph.
The reader should be able to read the figures alone and get the spine of the story.

## The six imperatives, expanded

### 1. Data-first, prose-second
Structure every beat as: **figure → one short prose beat telling the reader what to
notice.** Never explain a pattern and then show it; show it, then name it. This is
the single highest-leverage rule and the one most often violated.

### 2. One clear, quantifiable conclusion
A dispatch answers one specific question with a number. Write that answer as a
sentence *before* you start — if you can't, you don't have a dispatch yet. The
opening chart should make the answer legible at a glance; the rest of the piece
earns and complicates it.

### 3. Scrolly for revelation
`<Scrolly>` introduces data incrementally — each `ScrollyStep` adds *one* thing: a
variable, a filter, a normalization, a comparison series. The reader discovers the
pattern step by step instead of being handed the finished chart. This is the
interactive-article superpower: comprehension built, not asserted. Use one Scrolly
per "context layer", with 3–4 steps.

### 4. Contextualize every number
A bare number is noise. Every number needs a reference frame the reader already
holds:
- a baseline ("from 120ms to 72ms", "vs the 2019 average of X"),
- a unit and a direction ("−40%", "+18% · 7d"),
- a comparison ("twice the next-largest category").
"Improved", "significantly", "a lot" are banned. Quantify or cut.

### 5. Methodology note
Every dispatch ends with a short methodology block: where the data came from (the
exact dataset and vintage), what it covers, and what it *can't* show. This is what
separates credible data journalism from a chart with a vibe. Cite the
`fetch-data.py` SOURCE lines here and in `sources[]`.

### 6. Vary chart types by intent
- **line** — a trend over time.
- **bar** — comparison across discrete categories.
- **area** — a cumulative quantity or a part-of-whole over time.
- **dot** — a relationship between two variables (scatter).
Using one mark for everything flattens the story. Match the mark to the question.

## Data sourcing (this is where grounding lives)
- Reach for `scripts/fetch-data.py` first: `fred <SERIES>`, `wb <INDICATOR> <ISO3>`,
  `owid <csv-url> <entity> <column>`, or `csv <url> <x> <y> [series]`. It returns
  `[{x, y[, series]}]` ready for a `<Chart>` and prints the citation to stderr.
- Map the returned `x`/`y` fields to the chart's `x=`/`y=` props (rename in the
  JSON if a cleaner field name reads better — but never change a value).
- For a number stated in a brief source item (not a public series), quote it
  exactly and cite it inline with `<Annotation>`.
- **Failure path:** if the fetch errors (offline, source down) or no real series
  fits, render a `<DataTable>` of the specific numbers cited from the brief sources
  instead. Fabricated chart data is a grounding failure — never do it.

## Sentence-craft (founder voice)
- Open with a question or a sledgehammer stat, not a throat-clear.
- Short declaratives land the conclusion; longer sentences carry the nuance — never
  three long in a row.
- No hedging. No "The"-starting consecutive sentences. Em-dashes structural only.
- The "so what" section is a *payoff*, not a summary — it tells the reader what the
  pattern means for them, with the sharpest number reserved for last.

## Component choreography
- The hook chart is `client:load` (above the fold); deeper figures `client:visible`.
- One `<Scrolly>` per context layer; the pinned `graphic` is usually a `<Chart>`
  that updates per step.
- `<DataTable>` for the "complication" — the detailed breakdown the headline chart
  hides.
- **Density doctrine, not minimalism.** At least one knowledge-carrying island per
  ~800–1,000 words; a 6,000-word dispatch carries ~6–8 substantive figures. Reach depth
  through MORE data figures (SmallMultiples, Distribution, Scatter, Slopegraph,
  RangePlot), each earned and grounded — never padding, never decorative.
- **Reach for the newly-available data carriers by intent:**
  - `<SmallMultiples>` when one pattern repeats (or breaks) across many categories —
    facet the same chart rather than overplotting a dozen series on one axis.
  - `<Distribution>` when the spread or a threshold is the point, not the mean — drop
    the marker line where the argument lives.
  - `<Slopegraph>` for before/after reordering — when *who moved past whom* is the story.
  - `<RangePlot>` for honest uncertainty — a dot plus its CI/IQR beats a bar with error caps.
  - `<Scatter>` for a relationship plus a fit line — correlation and how tight it is.
- The figure is still the atomic unit; the prose between islands stays short. This is the
  model for all formats now, not a dispatch quirk.
