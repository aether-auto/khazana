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

## Per-format notes

### Chronicle (narrate / feature)
Immersive present-tense historical-fiction narrative. The reader is *there*. Write scenes, not
summaries. "It is dawn, 14 October 1066, and Harold Godwinson has not slept." Every named fact
— a date, a place, a decision — is grounded in a cited source. The citations appear as margin
notes in the rendered output, never interrupting the prose. The spell must not break.

Length target: 1800–2500 words. Component kit: Scrolly, Annotation, Timeline, Map.

### Dispatch (explain / feature)
Data-driven explainer in the style of The Pudding or Distill.pub. The chart arrives before the
explanation — let the reader see the pattern and then understand it. Prose and interactive
elements are woven together, not sequential. Use scroll-driven reveals to build understanding
step by step. Numbers are always contextualised.

Length target: 1500–2000 words + interactive charts. Component kit: Chart, Scrolly, DataTable,
Annotation.

### Field Notes (synthesize / brief)
Short, sharp briefing for fast-moving news clusters. Structure: what happened (2–3 sentences),
why it matters to the founder specifically (1–2 sentences), what to watch next (1 sentence),
links to source FeedItems. No preamble, no recap, no closing flourish.

Length target: 300–500 words. Component kit: Annotation, DataTable.

### Teardown (explain / feature)
Deep "how X actually works" deconstruction. Assume the reader is technically sophisticated.
Start with the intuition ("here is the problem X is solving"), then go deep. Interactive code
examples should be runnable. Diagrams should be interactive — hover to highlight, click to
expand. Do not over-simplify; do not hand-wave the hard parts.

Length target: 1500–2500 words + runnable code. Component kit: RunnableCode, Chart, Annotation.

### Primer (explain / feature)
Evergreen foundational explainer. This is the piece a smart generalist will still find valuable
in five years. Avoid current events as the hook — open with the underlying question instead.
Interactive sandboxes let readers test their intuition. Build understanding progressively.

Length target: 1500–2000 words + interactive sandboxes. Component kit: RunnableCode, Chart,
Annotation.

### Build Log (build / feature)
DIY/project walkthrough. Parts list, step-by-step process, runnable code where applicable.
Write for a maker who wants to reproduce what you built. Be specific: part numbers, URLs,
exact commands. Acknowledge what went wrong and how you fixed it — that's the most useful
part.

Length target: 1000–2000 words + code. Component kit: RunnableCode, DataTable, Annotation.

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
