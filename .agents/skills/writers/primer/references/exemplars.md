# Primer — worked exemplars & annotated patterns

## Canonical full-length exemplar (study this first)

**Read the full piece — `references/exemplars/central-limit-theorem.mdx`** ("The Central
Limit Theorem: Why the Bell Curve Rules the World", ~4,760 reader-facing words, a full
20–25+ min read carried by 14 heavy islands). This is the **gold standard** for the format:
a complete, fact-checked primer you should read in full and emulate. The annotated
snippet-patterns below (Exemplars A–D) remain useful for individual moves; this file is the
whole shape done right.

What makes it exemplary — the moves to copy:

1. **The misconception is broken by a sandbox whose output the wrong model cannot predict.**
   "You need a bell-ish source to get a bell" is destroyed by averaging a *perfectly flat*
   source and watching a bell appear at n=12 — run, observed, *then* explained. This
   flat-source-sandbox-before-explanation is the single highest-leverage primer move.
2. **Every RunnableCode is real and was executed; prose matches actual output.** The
   flat→bell breaker, the editable skewness sampler (2.01→0.90→0.35, matching 2/√n), and the
   Cauchy IQR-won't-shrink demo (pinned ≈2.0 across n=1…1000) were all run in Node; the prose
   is written to match. The Chart's 400k-sample densities are real simulation output.
3. **The aha is made mechanical, not mystical.** "Why specifically a bell" is answered by the
   characteristic-function argument (averaging erases all but mean+variance) in four explicit
   moves, then a Detail proves *why exactly two moments survive* — the √n rescaling balances
   the quadratic and crushes cubic-and-higher into the o(t²) remainder.
4. **"What it does NOT say" carries real weight.** The n≥30 folklore is flagged as folklore
   (Berry–Esseen ties required n to source skew); LLN is distinguished from the CLT; the
   finite-variance and independence conditions each get a Detail; **the Cauchy failure is
   SHOWN, not asserted**; and a "reading the world" section teaches the additive-vs-
   multiplicative (log-normal) diagnostic — the theorem as a lens, including its misuse.
5. **Components carry knowledge the prose would otherwise assert.** 14 heavy islands / ~4,760
   words = 1 per ~340 words (>2× the density floor): the Stepper carries the coin→binomial→bell
   mechanism, the Chart the convergence, the ParameterPlay the rate law as a tunable
   relationship, six Math blocks every equation in KaTeX — each LEADS, prose interprets.
6. **Voice + grounding.** Opens on a timeless concrete scene (heights, loaves, errors — no
   current events); ends not on a recap but on a usable diagnostic question. Grounded in 11
   sources (CLT, Berry–Esseen, Cauchy, de Moivre–Laplace, Galton's 1889 primary quote, Feller
   Vol. II), all URLs verified, load-bearing claims triangulated ≥2 ways.

**How to use it:** read it in full during the **Internalize** phase to calibrate the bar —
before you draft. Do **not** copy its topic; match its rigor, density, prose, and grounding.

---

## Exemplar A — opening with the underlying question (no current events)

> Why does compressing a file work at all? You start with a megabyte, you run a
> program, and out comes something a third the size — and then you can get the
> original back, exactly, every bit. Nothing was thrown away. So where did the space
> go? The answer is one of the most useful ideas in all of computing, and it has
> nothing to do with making things smaller. It has to do with *surprise*.

**Why it works:** the hook is a genuine question a curious person would ask, framed
without jargon and without any reference to a product, year, or news event. It
promises a payoff ("one of the most useful ideas") and plants the real concept
(surprise / entropy) as a teaser. It will read the same in five years.

## Exemplar B — break the misconception with a sandbox, then explain

> Most people think compression finds repeated chunks and stores them once. That's
> part of it — but it can't be the whole story, because you can compress a file with
> *no* repeats. Run this:
>
> <RunnableCode client:visible caption="Predict the compressed size, then check"
>   code={`const a = "abcdefabcdef";       // repeats
> const b = "qwertyuiopas";       // no repeats, same length
> // a naive 'find repeats' model says only a compresses.
> // entropy says: it depends on the symbol distribution.
> function shannonBits(s) {
>   const f = {}; for (const c of s) f[c] = (f[c]||0)+1;
>   let H = 0; for (const c in f) { const p = f[c]/s.length; H -= p*Math.log2(p); }
>   return Math.round(H * s.length);
> }
> console.log("a:", shannonBits(a), "bits");
> console.log("b:", shannonBits(b), "bits");
> return shannonBits(b);`} />
>
> The "repeats" model predicts `b` is incompressible. It's wrong. What actually
> bounds the size is the <Annotation client:load term="entropy" note="The average number of bits needed per symbol, set by how surprising each symbol is — Shannon, 1948." /> of the symbol distribution, not the visible repeats.

**Why it works:** it states the wrong model, shows a runnable case the wrong model
mispredicts, *then* names the right concept (entropy) with a citation. The reader
formed a prediction and saw it fail — the concept lands because it resolves a tension
they personally felt.

## Exemplar C — concrete before abstract; end on an earned insight

> Take a coin. A fair flip carries exactly one bit — heads or tails, maximally
> surprising. A coin that lands heads 99% of the time carries almost none: you can
> guess it and be right nearly always, so each result tells you little. That is the
> whole idea, made concrete. In general, the entropy of a source is the average
> surprise of its symbols, and no lossless compressor can ever beat it. Compression
> isn't about removing repetition. It's about spending fewer bits on the outcomes you
> could already predict.

**Why it works:** the abstraction (entropy bounds compression) arrives *after* a
concrete, timeless example (the biased coin). The section ends on an earned insight
that reframes the opening question — the reader now knows something they didn't.

## Exemplar D — an interactive component leads, prose interprets

> Before defining a single term, hand the reader the system itself. Let them tune the
> transmission rate and watch the curve bend:
>
> <Simulation client:visible kind="sir-epidemic"
>   params={{ beta: 0.3, gamma: 0.1, population: 1000, initialInfected: 1 }}
>   controls={[{ key: "beta", label: "transmission rate β", min: 0.05, max: 0.6, step: 0.01 },
>              { key: "gamma", label: "recovery rate γ", min: 0.02, max: 0.3, step: 0.01 }]}
>   caption="Drag β and γ. Watch the infected curve rise, peak, and fall." />
>
> Push β up and the curve spikes early and tall; nudge γ up and it flattens. You just
> discovered the single number epidemiologists chase — the ratio of the two. That ratio
> has a name and an exact form:
>
> <Math display note="R₀ is the basic reproduction number — the average secondary infections per case in a fully susceptible population. Kermack & McKendrick, 1927."
>   tex="R_0 = \dfrac{\beta}{\gamma}" />
>
> When R₀ > 1 each case more than replaces itself and the epidemic grows; at R₀ < 1 it
> burns out. You didn't take that on faith — you *felt* it in the sliders before you saw
> the fraction. <Annotation client:load term="R₀" note="Kermack & McKendrick, 1927 — the SIR compartmental model." />

**Why it works:** the `<Simulation>` LEADS and the prose *interprets* rather than
restates — the reader forms the intuition by tuning β and γ, and only then does the
`<Math>` name what they felt. Each component carries a block of knowledge (the dynamics,
the exact ratio) the prose would otherwise spend 300+ words asserting. Both are grounded:
the Math note and the `<Annotation>` cite the canonical source.

## Anti-patterns to avoid
- **Current-events hook.** "With AI models exploding in size…" — date-stamped. Open
  with the timeless question.
- **Definition-first.** Concept name → worked example, never definition in a vacuum.
- **Sandbox as a bonus.** Put it before the explanation, not after.
- **Unbroken misconception.** If you don't surface the wrong model, readers keep it.
- **Explainer-with-one-sandbox.** Reaching the 20–25 min floor with prose and a single
  `RunnableCode` instead of earning depth with a `Simulation`, a `Math` derivation, a
  `Quiz`, and multiple sandboxes. A primer averaging ~2 heavy islands is under-built.
