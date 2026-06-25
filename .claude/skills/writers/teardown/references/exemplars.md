# Teardown — worked exemplars & annotated patterns

## Exemplar A — problem-first opening + the runnable intuition

> A hash function has one job: take any input and scatter it across a fixed range so
> that *similar* inputs land *far apart*. That scattering is called the
> <Annotation client:load term="avalanche effect" note="A one-bit change in the input should flip about half the output bits — the hallmark of good diffusion." />.
> Let's watch it happen.
>
> <RunnableCode client:visible caption="FNV-1a 32-bit — edit the input, hit run"
>   code={`function fnv1a(str) {
>   let h = 0x811c9dc5;
>   for (let i = 0; i < str.length; i++) {
>     h ^= str.charCodeAt(i);
>     h = Math.imul(h, 0x01000193) >>> 0;
>   }
>   return h;
> }
> console.log("cat ->", fnv1a("cat").toString(16));
> console.log("cau ->", fnv1a("cau").toString(16));
> return fnv1a("cat") % 16;`} />

**Why it works:** the problem is one concrete sentence; the abstraction (avalanche)
is cited inline; and the very next thing is a *runnable* example that makes the
concept tangible. "Change one letter and watch the output churn" turns the reader
into a participant. The code is self-contained, correct JS — it runs.

## Exemplar B — not hand-waving the crux (cite the constant)

> The magic is one line: `h = Math.imul(h, 0x01000193)`. That constant is the
> <Annotation client:load term="FNV prime" note="0x01000193 for 32-bit FNV — chosen so the multiply mixes high and low bits without short cycles, per the reference parameters." />,
> and the choice is not arbitrary. Multiply mixes the high bits of the hash into the
> low bits; xor injects the new byte; doing them in that order, every byte, is what
> spreads a one-character change across the whole word. Swap the order and the
> avalanche collapses — try it above.

**Why it works:** it stops at the exact line everyone else skips and explains *why*
the constant is what it is, cited to the source. It connects the mechanism back to
the runnable example ("try it above"). No "and then it scatters" hand-wave.

## Exemplar C — the trade-off, named honestly

> FNV-1a is fast and spreads well, and it is *not* collision-resistant against an
> adversary who controls the input — flip the right bytes and you can force
> collisions. For a hash table that is the correct trade: you get speed and good
> distribution on non-adversarial keys, and you accept that a hostile input can
> degrade you to O(n). When the input is attacker-controlled — say, request headers
> — reach for a keyed hash like SipHash instead.

**Why it works:** it names what breaks (adversarial collisions), the condition
(attacker-controlled input), the consequence (O(n) degradation), and why the
designers accepted it (speed on the common case) — then gives the practical rule
(use SipHash when input is hostile). That is a teardown, not a tutorial.

## Anti-patterns to avoid
- **Definition-first opening.** Lead with the problem and a runnable example, not a
  formula.
- **Hand-waving the crux.** The hard part gets the most words and the key code.
- **Asserted benchmarks.** Let `<RunnableCode>` produce the number, or cite it.
- **Broken example code.** Mentally execute every `<RunnableCode>` — it must run.
