# Primer — craft rubric (deep)

Models: betterexplained.com (intuition before formalism), Khan Academy (strict
scaffolding), the Feynman technique (explain it so a smart beginner gets it),
3Blue1Brown (visual intuition), Paul Graham's essays-on-ideas (timeless framing).
The shared move: build a durable mental model from the ground up, surfacing and
breaking the wrong models the reader arrives with.

## What "evergreen" demands
A primer is judged in five years. That forces two disciplines: **timeless framing**
(open with the underlying question, use examples with a long shelf life) and
**foundational grounding** (the claims are still true because they were sourced to
durable references, not a news cycle). Evergreen is not a license to be vague — it is
a demand for the parts that don't expire.

## The six imperatives, expanded

### 1. Open with the underlying question
The hook is a question a curious person would actually ask, with no jargon and no
current event: "Why does compressing data work at all?" "What is temperature, really?"
The reader should feel the question is worth a smart person's time before any
machinery appears.

### 2. Scaffold explicitly
Each section is a prerequisite for the next, and you *say so*. "Now that you can
predict X, here's the case that breaks your prediction." Naming the scaffold turns a
sequence of facts into a build. Never use a concept before you've established it.

### 3. Address the misconception before the concept
Most readers arrive with a wrong mental model, and they will filter your explanation
through it unless you surface and break it first. State the wrong model plainly, hit
it with a concrete counterexample (ideally a `<RunnableCode>` whose output the wrong
model can't predict), *then* replace it. This is the single highest-leverage
pedagogical move.

### 4. Sandbox before explanation
Put the interactive `<RunnableCode>` *first*: let the reader play and form a
prediction, then explain what they observed. "Run this. Notice the output doesn't do
what you'd expect. Here's why." Prompting the reader's own prediction before the
answer measurably improves recall. Placing the sandbox at the end as a bonus wastes
its power.

### 5. Concrete example for every abstraction
No abstract definition stands alone. Definition → worked example *immediately* → then
the general case. "A hash maps arbitrary data to a fixed-size output — `sha256('hi')`
is always the same 64 hex digits — and in general, any deterministic function from a
large domain to a small one." Concrete first, then abstract; never the reverse.

### 6. Timeless examples only
Draw from physics, biology, cooking, geometry, music — domains that won't date.
Avoid current events, product versions, this year's anything. If an example would
read as quaint in five years, replace it.

## Grounding technique specific to foundational writing
- Even bedrock claims have sources — cite the reference the brief supplies for each
  definition, constant, and result, surfaced via `<Annotation>`.
- Worked-example outputs in `<RunnableCode>` are *demonstrated*, not asserted: the
  reader runs the code and sees the result, which is the most grounded possible claim.
- If your explanation generalizes beyond what a source supports, soften it or cut it —
  a primer that overreaches stops being trustworthy bedrock.

## Sentence-craft (founder voice)
- Accessible but substantial; trust the reader to keep up; never condescend.
- Second person sparingly, for invitations ("imagine you are compressing a photo…").
- Short declaratives anchor definitions; longer sentences carry the build — never
  three long in a row.
- No hedging. No "The"-starting consecutive sentences.
- End each section on an *earned insight* — something the reader knows now that they
  didn't at the section's start.

## Component choreography
- The misconception-breaking `<RunnableCode>` comes before its explanation.
- Each concept that has a parameter to vary gets a `<RunnableCode>` the reader tweaks.
- `<Chart>` visualizes the concept (a curve, a distribution) where a picture beats
  prose.
- 4–6 component blocks; the sandbox-before-explanation rhythm is the backbone.
