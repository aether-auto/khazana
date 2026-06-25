# Primer — worked exemplars & annotated patterns

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

## Anti-patterns to avoid
- **Current-events hook.** "With AI models exploding in size…" — date-stamped. Open
  with the timeless question.
- **Definition-first.** Concept name → worked example, never definition in a vacuum.
- **Sandbox as a bonus.** Put it before the explanation, not after.
- **Unbroken misconception.** If you don't surface the wrong model, readers keep it.
