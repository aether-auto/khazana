# Field Notes — craft rubric (deep)

Models: Stratechery's Daily Update (sharp, opinionated, reader-specific), The
Browser's daily picks, Axios' "smart brevity". The shared move: respect the
reader's time absolutely. Say the thing, say why it matters *to them*, give one
number, point at what to watch, link the sources, stop.

## The governing constraint: brevity is the craft
300–500 words is not a small article — it is a different discipline. Every sentence
must justify itself. Padding to hit a length is a failure. If the briefing is done
in 320 words, it's done. The reader is busy and trusts you to be done.

**This format is exempt from the long-form floor.** The five long-form formats target a
20–25 min / 5,000–7,000-word floor with a dense expanded component kit; field-notes does
**not**. Do not pad toward that floor, do not reach for the knowledge-carrying kit, do not
add scenes or data layers to "hit length." The exemption is deliberate doctrine — the whole
value of a briefing is that it is short.

## The four imperatives, expanded

### 1. No preamble
The first sentence is the lede — what happened, who did it, when. Delete any
throat-clearing ("In an increasingly…", "It's no secret that…", "This week saw…").
A briefing that makes the reader wait for the point has already failed.

### 2. Why it matters to the founder specifically
This is what separates a briefing from a headline. Not "this is significant for the
industry" but a specific, channel-grounded reason *this* reader cares: "this changes
the latency budget on the embedded inference stack you've been tracking, because the
NPU now does on-device what required a round-trip." Use the brief's channel and
rationale to make the stake concrete and personal. Cite the source that supports it.

### 3. One crystallizing number
A single, well-chosen figure makes the briefing citable and sharable. Render it with
an `<Annotation>` (cited), or — only if a comparison genuinely sharpens it — a tight
2–4 row `<DataTable>`. One number, contextualized (baseline, unit, direction). Not a
table of everything; the point is the *one* number that crystallizes the story.

### 4. "Watch for:" last
End with one concrete thing to monitor: a specific indicator, a date, a name, a
metric — not a vague prediction. "Watch for: whether the Q3 guidance mentions edge
margins; the earnings call is 28 July." Actionable and, where possible, timed. This
is the line that makes the reader keep you in their feed.

## Grounding technique specific to a briefing
- With 300–500 words there is no room for an unsupported claim — every fact must be
  cited, so cut anything you can't trace to a source rather than flagging it.
- Attribution matters: "according to the cited filing/post" — say where it came from,
  inline.
- The source links are the product. A reader uses a briefing to decide what to read
  in full; make the links easy to find (an `<Annotation>` per fact and/or a sources
  line) and ensure every one resolves (`check-links.py`).

## Sentence-craft (founder voice)
- First person is allowed here — the author is a sharp observer with a point of view.
- Short, declarative, fast. One longer sentence to carry the "why it matters" nuance,
  then back to short.
- No hedging. No "The"-starting consecutive sentences. No closing flourish, no "in
  summary", no "time will tell".
- Numbers always contextualized, even in this compressed form.

## Component choreography
- Mostly prose. `<Annotation>` for the crystallizing number and inline citations.
- `<DataTable>` only when a small comparison earns its place — never as filler.
- At most **one** `<Callout kind="key-insight">` "watch for" box, if a single framed
  key insight genuinely sharpens the briefing — the only piece of the long-form expanded
  kit this format admits. Skip the rest of that kit entirely.
- Zero to two component blocks total. The brevity is the point.
