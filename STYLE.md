# STYLE.md — khazana writing-voice guide

> This document drives flagship blog generation (P7+). Every AI-authored blog is prompted
> against these guidelines. Fill the "Example paragraphs" section with the founder before P7.

---

## Voice

**Tone:** Confident, curious, precise. Not academic — accessible. Not casual — substantial.
The author knows the subject and trusts the reader to keep up. No hedging, no filler, no
padding. Every sentence earns its place.

**Person:** Second person sparingly for invitations ("imagine you are..."). Third person for
narration. First person only in Field Notes, where the author is a sharp observer commenting
on events.

**Sentence rhythm:** Vary deliberately. Short declarative sentences anchor key facts — use them
as beats. Longer sentences build momentum and carry the reader through complex ideas — but
only one long sentence before a short one resets the pace. Never three long sentences in a row.

**Vocabulary:** Precise over fancy. Prefer the specific word over the generic. "The CPU stalls
waiting for cache" not "there are performance implications." Domain terms are welcome when they
carry meaning; jargon that substitutes for thinking is cut.

**Numbers:** Always quantified and contextualized. "Latency dropped 40% — from 120ms to 72ms"
not "latency improved significantly." Comparisons need a baseline. Big numbers need a reference
frame.

---

## Do

- Open with a scene, a number, or a question that earns the reader's attention in the first
  two sentences.
- Cite claims: every factual assertion links to the source FeedItem(s) it came from. Readers
  should be able to verify anything.
- Let data lead in Dispatch and Teardown — the interactive chart or diagram should arrive before
  the prose tries to explain it.
- Use whitespace and section breaks. Dense walls of text are a design failure.
- End sections with a payoff. The reader should feel they learned something real, not just read
  something.
- For Chronicle: ground every scene detail in a cited source. The narrative spell must never
  break, but it must also never fabricate.

## Don't

- Don't hedge with "it seems," "it appears," "arguably," "one might say." If you're not sure,
  cut the claim or flag it explicitly.
- Don't pad to hit a word count. Brief formats are brief for a reason.
- Don't use passive voice as a way to avoid saying who did what. "The team shipped X" not
  "X was shipped."
- Don't start consecutive sentences with "The."
- Don't bury the lede. The most important fact or insight goes in the first paragraph, not
  revealed at the end as a conclusion.
- Don't write "in conclusion" or "in summary." Just say it.
- Don't use em-dashes decoratively — use them structurally, to set off a clarifying phrase
  or introduce a sharp aside.

---

## Visual drama & length

Every Read must be **visually dramatic and alive** — not a wall of prose with a chart bolted on.
Reach depth through the rich interactive + narrative component palette, not word count alone.

**Target the reading-time peak.** The ranking Gaussian peaks at `GAUSSIAN_DEFAULTS.peakMin = 15`
minutes (σ=10, from `packages/core/src/scoring.ts`). Long-form feature formats (Chronicle,
Dispatch, Teardown, Primer, Build Log) should aim for a ~15-minute rendered read. Reach that
length through **genuine grounded depth** — more cited scenes, richer data layers, deeper
mechanism coverage, more runnable examples — never through padding or repetition. STYLE.md's
prohibition on filler is absolute: every sentence earns its place.

**Field Notes is the deliberate exception.** It is a short, sharp briefing format by design; the
peak-read-time target does not apply. Brevity is its craft.

**Components must be earned.** Never add a component to hit a quota, to look busy, or to "use
the palette." Prefer fewer, well-chosen components that each serve the narrative. A component
that doesn't sharpen the story is clutter; removing it is an edit. Match the component to the
read's nature: DATA/technical reads (Dispatch, Teardown, Primer) lead with interactive charts,
runnable demos, and tables — the data IS the argument. NARRATIVE reads (Chronicle,
history/politics) use Map, Timeline, and inline Pullquotes for primary sources — the scene is
the argument. Hitting the ~15-min peak comes from genuine grounded depth — more scenes, richer
data layers, deeper mechanism coverage — not from stacking components or padding.

**New components available:** `Pullquote` and `StatBand` join the existing kit. A scrollytelling
component with a richer panel model is pending a rebuild — do not use yet.

---

## Per-format notes

### Chronicle (narrate / feature)
Immersive present-tense historical-fiction narrative. The reader is *there*. Write scenes, not
summaries. "It is dawn, 14 October 1066, and Harold Godwinson has not slept." Every named fact
— a date, a place, a decision — is grounded in a cited source. The citations appear as margin
notes in the rendered output, never interrupting the prose. The spell must not break.

Length target: target the reading-time peak — ~15 min rendered (`GAUSSIAN_DEFAULTS.peakMin`);
aim for ~3500–4500 words when source depth supports it. Reach it through more scenes, more
cited detail, a deeper consequence arc — never padding.

Component kit: Scrolly, Annotation, Timeline, Map, **Pullquote, StatBand**.
— `Pullquote`: period primary sources — a wire dispatch, a treaty line, a headline — rendered
  dramatically (`kind="telegram"`, `kind="document"`, `kind="headline"`, `kind="quote"`).
— `StatBand`: a row of big dramatic figures for the key numbers of the story (casualties,
  distances, durations, dates). Count-up animation on scroll; cites sources via `href`.
Each component must earn its place: `<Map>` anchors geography, `<Timeline>` anchors
chronology, `<Scrolly>` drives the peak sequence, `<Pullquote>` surfaces a primary source,
`<StatBand>` makes the scale visceral. Don't add one because it seems dramatic — add it
because the story is poorer without it.

### Dispatch (explain / feature)
Data-driven explainer in the style of The Pudding or Distill.pub. The chart arrives before the
explanation — let the reader see the pattern and then understand it. Prose and interactive
elements are woven together, not sequential. Use scroll-driven reveals to build understanding
step by step. Numbers are always contextualised.

Length target: target the reading-time peak — ~15 min rendered (`GAUSSIAN_DEFAULTS.peakMin`);
aim for ~3000–4000 words + interactive charts. Reach it through deeper data layers, more
causal cuts, a richer methodology note — never padding.

Component kit: Chart, Scrolly, DataTable, Annotation, **StatBand, Pullquote**.
— `StatBand`: the key figures of the story up front, big and dramatic, counting up. Immediately
  shows the reader the scale before the charts explain it. Earned when the numbers ARE the lede.
— `Pullquote`: a striking data finding or expert statement pulled out for visual weight. Earned
  when it reframes what the reader just saw in a chart — not decorative emphasis.
Data reads: the chart or table is the argument. Lead with it; let the prose explain what to see.

### Field Notes (synthesize / brief)
Short, sharp briefing for fast-moving news clusters. Structure: what happened (2–3 sentences),
why it matters to the founder specifically (1–2 sentences), what to watch next (1 sentence),
links to source FeedItems. No preamble, no recap, no closing flourish.

Length target: 300–500 words. Field Notes is intentionally brief — the reading-time peak target
does not apply here. Brevity is the format's craft; do not pad.

Component kit: Annotation, DataTable. Sparingly: **StatBand** (one crystallizing figure if it
sharpens the story), **Pullquote** (one striking primary-source line if it anchors the lede).
Never add components to hit a length; every component must earn its place in a tight briefing.

### Teardown (explain / feature)
Deep "how X actually works" deconstruction. Assume the reader is technically sophisticated.
Start with the intuition ("here is the problem X is solving"), then go deep. Interactive code
examples should be runnable. Diagrams should be interactive — hover to highlight, click to
expand. Do not over-simplify; do not hand-wave the hard parts.

Length target: target the reading-time peak — ~15 min rendered (`GAUSSIAN_DEFAULTS.peakMin`);
aim for ~3000–4000 words + runnable code. Reach it by going deeper on the mechanism, covering
more failure modes, adding more runnable examples — never padding.

Component kit: RunnableCode, Chart, Annotation, **StatBand, Pullquote**.
— `StatBand`: key performance constants or design numbers up front — the figures that frame why
  the mechanism matters. Earned when the numbers set the stage for everything that follows.
— `Pullquote`: a spec line, design-doc excerpt, or memorable failure-mode quote. Earned when
  the verbatim primary source says it better than a paraphrase ever could.
Technical reads: the runnable code and interactive chart are the argument. Lead with them.

### Primer (explain / feature)
Evergreen foundational explainer. This is the piece a smart generalist will still find valuable
in five years. Avoid current events as the hook — open with the underlying question instead.
Interactive sandboxes let readers test their intuition. Build understanding progressively.

Length target: target the reading-time peak — ~15 min rendered (`GAUSSIAN_DEFAULTS.peakMin`);
aim for ~3000–4000 words + interactive sandboxes. Reach it through more scaffold layers, more
worked examples, a richer "where to go next" — never padding.

Component kit: RunnableCode, Chart, Annotation, **StatBand, Pullquote**.
— `StatBand`: the striking numbers that motivate the concept — why this matters at scale.
  Earned when those numbers genuinely reframe the question the primer answers.
— `Pullquote`: a crisp foundational definition or memorable framing from the literature.
  Earned when the verbatim original is more powerful than a paraphrase.
The sandbox and chart are the argument. Lead with intuition, let readers play, then explain.

### Build Log (build / feature)
DIY/project walkthrough. Parts list, step-by-step process, runnable code where applicable.
Write for a maker who wants to reproduce what you built. Be specific: part numbers, URLs,
exact commands. Acknowledge what went wrong and how you fixed it — that's the most useful
part.

Length target: target the reading-time peak — ~15 min rendered (`GAUSSIAN_DEFAULTS.peakMin`);
aim for ~2500–4000 words + code. Reach it through more detail in the build steps, a thorough
failures section, a richer reproduce-this checklist — never padding.

Component kit: RunnableCode, DataTable, Annotation, **StatBand, Pullquote**.
— `StatBand`: key project stats — total cost, build time, measured output — at the top.
  Earned when those figures set the reader's expectations before the build begins.
— `Pullquote`: a spec line, datasheet excerpt, or vendor warning worth dramatizing.
  Use `kind="document"` for datasheets, `kind="headline"` for a project reveal.
The parts table and exact commands are the argument. Reproducibility is the craft.

---

## Example paragraphs

> ⚠️ TO BE PROVIDED BY FOUNDER — this section must be filled before Plan P7 (flagship generation).
>
> Instructions for the founder: Write 2–4 paragraphs of your own prose that best represents
> how you want khazana's blogs to read. They don't need to be on any particular topic — just
> representative of your rhythm, vocabulary, and voice. Paste them here. The generation prompts
> in P7 will use these as few-shot examples to calibrate Claude's output to your style.
>
> Aim for at least one "scene-style" paragraph (for Chronicle calibration) and one
> "data-forward" paragraph (for Dispatch calibration). The more examples, the better the
> calibration.

```
[Founder example paragraphs go here]
```

---

## Citations

Every factual claim in a flagship blog must link to the `FeedItem` it was derived from.
In MDX frontmatter, list source item ids in a `sources` array. In-text citations render
as superscript links to the source card. The grounding/verification pass (P7) checks
that cited items actually support the claims — uncited or unsupported claims are flagged
or cut before publish.
