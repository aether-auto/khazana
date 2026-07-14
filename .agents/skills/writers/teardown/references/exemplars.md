# Teardown — worked exemplars & annotated patterns

## Canonical full-length exemplar (study this first)

**Read the full piece — `references/exemplars/how-shazam-works.mdx`** ("How Shazam
Recognizes Any Song in Seconds", ~6,900 words). This is the **gold standard** for the
format: a complete, fact-checked teardown you should read in full and emulate. The
annotated snippet-patterns below (Exemplars A–D) remain useful for individual moves; this
file is the whole shape done right.

What makes it exemplary — the moves to copy:

1. **The crux gets the most space and the key code.** The anchor→target-zone→pair→hash
   mechanism — the one place every other explainer hand-waves — is derived from first
   principles: a verbatim Pullquote, a Diagram, the 30-bit entropy Math, a *runnable*
   32-bit `pairHash`, a narrated CodeWalkthrough, the F² speedup, and the
   p·[1−(1−p)^F] survival-probability math — then a Quiz to lock it in.
2. **11 heavy knowledge-carrying islands, ~1 per ~614 words** — beats the density floor
   decisively; components LEAD, prose interprets, throughout.
3. **Every RunnableCode is real and verified.** All four were executed in Node and the
   prose corrected to match actual output (peaks=3, histogram spike=8); the bit-packing is
   reversible. The discipline: *run the code, then write the sentence about its output.*
4. **The "aha" is made crystalline.** The apparent paradox — pairing squares your per-hash
   risk (p²) yet barely dents survival because fan-out gives F redundant pairs and
   1−(1−p)^F≈1 — is walked through the equation line by line. That's *why* throwing away 98%
   of hashes still works.
5. **Robustness framed as "what you choose to ignore."** Dropping amplitude and keeping only
   spectral peaks is presented as the *source* of noise/EQ immunity, via a causal
   EventCascade grounded in three sources — not a detail.
6. **Real measured data, never invented.** The noise-cliff Chart uses Wang's actual Figs 4–5
   numbers; the failure-modes DataTable names the trade Wang *accepted* for each limit — the
   teardown-vs-tutorial distinction.

**How to use it:** read it in full during the **Internalize** phase to calibrate the bar —
before you draft. Do **not** copy its topic; match its rigor, density, prose, and grounding.

---

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

## Exemplar D — a structural component leads, prose interprets

> <StateMachine client:visible caption="TCP connection setup — the three-way handshake"
>   states={["CLOSED", "SYN-SENT", "ESTABLISHED"]}
>   transitions={[
>     { from: "CLOSED", to: "SYN-SENT", on: "send SYN" },
>     { from: "SYN-SENT", to: "ESTABLISHED", on: "recv SYN-ACK, send ACK" }
>   ]}
>   note={<Annotation client:load term="three-way handshake" note="Client SYN, server SYN-ACK, client ACK — the sequence that establishes a connection, per RFC 793 §3.4." href="https://www.rfc-editor.org/rfc/rfc793#section-3.4" />} />
>
> The handshake is not a formality — it is how both ends agree on a starting sequence
> number before a single byte of data moves. The client's `SYN` proposes its number; the
> server's `SYN-ACK` acknowledges it *and* proposes its own; the client's final `ACK`
> closes the loop. Only in `ESTABLISHED` is either side allowed to send data — which is
> exactly why a half-open connection (server never got the final `ACK`) can silently rot.

**Why it works:** the `StateMachine` arrives FIRST and carries the mechanism — three states,
two labeled transitions — that the prose would otherwise spend 300 words asserting. The prose
then *interprets* (why the numbers matter, what `ESTABLISHED` gates, how it rots) rather than
restating the states. Component leads, prose wraps; the states are grounded to RFC 793 via an
inline `<Annotation>`. This is the density move: a structural carrier per major mechanism, not
a paragraph.

## Anti-patterns to avoid
- **Prose-only mechanism.** Describing an architecture or protocol in paragraphs when a
  `<Diagram>`, `<StateMachine>`, or `<LayerStack>` would carry it. A teardown averaging ~2
  heavy islands is under-built for its length floor.
- **Definition-first opening.** Lead with the problem and a runnable example, not a
  formula.
- **Hand-waving the crux.** The hard part gets the most words and the key code.
- **Asserted benchmarks.** Let `<RunnableCode>` produce the number, or cite it.
- **Broken example code.** Mentally execute every `<RunnableCode>` — it must run.
