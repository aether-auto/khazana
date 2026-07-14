# Field Notes — worked exemplars & annotated patterns

## Canonical full-length exemplars (study these first)

Field-notes is the deliberately-short format, so the canonical reference is a **set of three
complete short briefings** — read all three as a group:

- `references/exemplars/fusion-ignition-is-now-routine.mdx` (355w, science) — NIF's 10th
  ignition; the *repeatability*, not the yield, is the story.
- `references/exemplars/what-the-battery-papers-agree-on.mdx` (373w, science) — three unrelated
  solid-state results converge: the *interface*, not the electrolyte, is the bottleneck.
- `references/exemplars/the-scaling-axis-quietly-turned.mdx` (358w, ai) — two independent 2025
  results agree: the marginal AI dollar now buys *thinking*, not parameters.

Together they are the **gold standard** for the short-digest craft: complete, fact-checked
briefings you should read in full and emulate. The annotated snippet-patterns below (Exemplars
A–C) remain useful for individual moves; these three files are the whole shape done right.

What makes them exemplary — the moves to copy:

1. **~360 words, exactly TWO component types (one `Annotation` + one `Callout`).** Each hangs
   on a single cited number and one framed "Watch for:" box — nothing from the knowledge-carrying
   long-form kit. This *is* the demonstration of "one Callout, used once."
2. **Synthesis, not summary.** Each lede states a *connection* no single source states ("the
   tenth ignition was a Tuesday — that silence is the milestone"), connecting a real cluster of
   results into one second-order insight (the frontier moved to *manufacturing* / the *interface*
   / a *per-query cost you can dial*) — the sentence a reader screenshots.
3. **A specific, timed, falsifiable watch-for close.** Not "it'll be interesting": a *1 Hz
   cadence* result, the *disappearance of the stack-pressure rig*, the *"reasoning-effort" API
   primitive* — each a concrete checkable indicator, living in the single `Callout`.
4. **Models RESTRAINT — the anti-pattern is padding / over-componentizing.** No preamble, no
   flourish; opens on the fact, ends on the watch-for; each could be *shorter*, never padded
   toward 500. A future writer sees exactly how little a great briefing needs.

**How to use them:** read all three during the **Internalize** phase to calibrate the bar —
before you draft. Do **not** copy the topics; match the compression, synthesis, and grounding.

---

## Exemplar A — full briefing (the whole shape, ~140 words)

> The EU's AI Act enforcement body issued its first guidance on general-purpose model
> obligations Tuesday, and the thresholds are lower than the draft implied.
>
> This matters for anyone shipping models into the EU on the embedded side: the
> compute threshold that triggers systemic-risk obligations now catches mid-size
> open-weight models, not just frontier labs, per
> <Annotation client:load term="10^25 FLOPs" note="The training-compute threshold for 'systemic risk' GPAI obligations in the published guidance — unchanged from the Act but now with concrete reporting duties attached." />.
> If you fine-tune at scale, you may be in scope.
>
> **Watch for:** the first compliance deadline — 2 August — and whether any
> open-weight provider publicly declines to register.

**Why it works:** the lede is the first sentence, no preamble. "Why it matters" is
channel-specific (embedded model shippers) and cited. One crystallizing, contextualized
number (`10^25 FLOPs`) carries the citation. The "Watch for:" line is specific and
timed. The whole thing is ~140 words and complete.

## Exemplar B — the lede, three ways (no preamble)

> ✅ "Nvidia cut the price of its Jetson edge module 40% on Monday, the first cut in
>    two years."
> ✅ "A leaked Netflix engineering post describes collapsing three network hops into
>    one programmable edge tier — and the latency numbers are striking."
> ❌ "In an era where edge computing is becoming ever more important, it's worth
>    asking what recent developments mean for the industry."

**Why the third fails:** it's all preamble and says nothing. The first two state what
happened, who, and when, in one sentence — and earn the next line.

## Exemplar C — "why it matters", specific vs vague

> ❌ "This is a significant development for the technology sector."
> ✅ "This directly hits the latency budget on the on-device inference stack you've
>    been tracking: what needed a 200ms server round-trip now runs locally in under
>    40ms, which changes what's feasible on a battery-powered sensor."

**Why the second works:** it names *this* reader's specific concern (the on-device
stack), gives the concrete mechanism (round-trip eliminated), and quantifies the
stake (200ms → 40ms) — all of which would be cited to the source.

## Anti-patterns to avoid
- **Preamble.** Anything before the lede. Cut it.
- **Padding.** Stretching 320 good words to 500 mediocre ones. Stop when done.
- **Vague stakes.** "Big for the industry." Make it specific to the reader.
- **Vague watch-for.** "It will be interesting to see what happens." Name an
  indicator and a date.
- **Closing flourish.** No "only time will tell." End on the watch-for and sources.
