# Teardown — craft rubric (deep)

Models: Dan Luu's blog (rigorous, numbers-first), Julia Evans' zines (small runnable
experiments that build intuition), Cloudflare/Netflix engineering posts (real
systems, real trade-offs), 3Blue1Brown (visual intuition before the algebra). The
shared move: take something the reader half-understands and go all the way to the
bottom of it — honestly, with working examples.

## The defining move: don't skip the hard part
Most "how X works" posts are good until the crux, then say "and the algorithm
handles the rest." The teardown earns its name by slowing down *exactly there* —
the part everyone else hand-waves. Identify that crux in Internalize and give it the
most words and the key `<RunnableCode>`.

## The five imperatives, expanded

### 1. Intuition-first, mechanism-second
Open with the problem in one concrete sentence: "A hash function has one job: scatter
any input across a fixed range so similar inputs land far apart." Then build a simple
mental model that's right 80% of the time, ideally as a `<RunnableCode>` the reader
runs. Only after the intuition is solid do you go to the real mechanism. Never lead
with a definition or a formula.

### 2. No hand-waving
When you reach the crux, decompose it: go line by line, or layer by layer. If a
constant has a specific value, say why (and cite it). If a step is subtle, show it
running. The reader should never have to take "trust me" for the part that matters.

### 3. Runnable code at the moment of confusion
Place a `<RunnableCode>` exactly where the reader's intuition is most likely wrong —
not as an end-of-post bonus. The example must be:
- **self-contained JavaScript** (the worker runs JS only, no imports, no network),
- **correct** — mentally execute it; a broken example destroys the whole post,
- **minimal** — the smallest code that demonstrates the one idea,
- **interactive in intent** — invite the reader to change a value ("edit the input,
  hit run; change one letter and watch the output churn").
Use `console.log(...)` for traces and `return <value>` for the headline result.

### 4. Name the failure modes and trade-offs
The best teardowns explain what breaks, under what conditions, and why the designers
*accepted* that trade-off. "FNV is fast and spreads well but is not collision-
resistant against an adversary — and for a hash table, that's the right trade." This
honesty is the difference between a teardown and a tutorial. Cite the trade-off to a
source where possible; show the boundary with a `<Chart>`.

### 5. Diagrams/charts over prose for structure
A `<Chart>` of the performance cliff (where the naive approach falls over), the
avalanche distribution, or the boundary condition replaces paragraphs of
description. Use real data (fetch-data.py) or data the `<RunnableCode>` itself
produces. Mark by intent: line for a curve, bar for a distribution, dot for a
relationship.

## Grounding technique specific to technical writing
- **Constants and parameters** (the FNV prime, a timeout default, a cache line size)
  are facts — cite them to the spec/source and, where natural, surface them in an
  `<Annotation>`.
- **Benchmarks** are the highest-risk claim. Use `fetch-data.py` for a public series,
  quote a brief source's number verbatim, or — best for a teardown — let the reader
  *generate* the number with `<RunnableCode>` rather than asserting it.
- **Mechanism claims** ("this is why it diffuses") trace to the source; if your
  explanation goes beyond what the source supports, mark it and soften the claim.

## Sentence-craft (founder voice)
- Precise over fancy: name the actual mechanism. "The CPU stalls waiting for cache",
  not "there are performance implications."
- Short declaratives land the mechanism; longer sentences carry the derivation —
  never three long in a row.
- No hedging. No "The"-starting consecutive sentences. Em-dashes structural only.
- End on a sharp, usable takeaway: when to reach for X, when not to, what to watch
  in production. Not a recap.

## Component choreography
- The motivating `<Chart>` (the cliff) is `client:visible`, near the top.
- `<RunnableCode>` appears at each intuition/mechanism beat — `client:visible`.
- One boundary-condition `<Chart>` in the trade-offs section.
- 3–6 component blocks; the prose between is dense but readable.
