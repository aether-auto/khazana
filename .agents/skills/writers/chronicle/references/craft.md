# Chronicle — craft rubric (deep)

Models: Erik Larson (*The Devil in the White City*, *The Splendid and the Vile*),
Simon Winchester, Robert Caro's scene-writing, Barbara Tuchman (*The Guns of
August*). The shared move: rigorously-researched fact, delivered as immersive
present-or-vivid-past narrative, with the apparatus of citation kept out of the
reader's eyeline.

## The defining tension

A chronicle reads like fiction and is true to the citation. Both halves are
load-bearing. Drop the immersion and it's a textbook; drop the grounding and it's
historical fiction — which khazana does not publish. The whole craft is delivering
emotional immersion while every concrete detail remains independently verifiable.

## The five imperatives, expanded

### 1. Open in scene, not context
The first two sentences must put the reader *inside a moment*. A person, a place, a
time, a sensory detail, a tension. Compare:
- ❌ "The siege of Leningrad was one of the longest and most destructive in history."
- ✅ "The metronome never stops. From a loudspeaker bolted to a lamppost on Nevsky
  Prospekt, it ticks through the dark — sixty beats a minute when the city is calm,
  faster when the bombers come. Tonight it is slow."
The second earns the next paragraph. Context can wait 200 words.

### 2. Name the actors, give them motive
Readers attach to people, not forces. Where a source names the decision-maker, the
diarist, the engineer — use the name, and render the human stake. "Anna listens
past the metronome for the groan of truck engines" beats "supplies were transported
across the lake." Motive turns a fact into a scene.

### 3. One citeable detail per paragraph
Every paragraph should carry at least one specific, only-a-source-could-know-this
detail: the exact ration (125 grams), the exact date, the name of the road, the
temperature. This detail does double duty — it makes the scene vivid *and* it
proves the research. It is also exactly what gets an `<Annotation>`. If a paragraph
has no citeable detail, it is probably invented color; tighten or cut it.

### 4. Pace: scene → context → scene → context
Alternate. An immersive present-tense scene (300–400w) earns a short third-person
context beat (100–200w) that tells the reader where they are in time and why this
matters causally — then drop back into scene. Context beats are fast and factual;
scenes are slow and sensory. The rhythm is what keeps a long narrative — this format
runs 5,000–7,000+ words — from either dragging (all context) or disorienting (all scene);
sustain the alternation across every scene, not just the first few.

### 5. End with consequence, not summary
Never "In conclusion" or a recap. The last beat lifts out of the moment to the long
arc: what this night, this decision, this person set in motion. A `<Timeline>` of
the legacy can carry the facts; the final *sentence* is short, declarative, and
returns to the present tense or the enduring echo. "The city, impossibly, holds."

## Grounding technique specific to narrative

- **Quote only what a source quotes.** Never invent dialogue. If a diary records a
  line, use it and cite it; otherwise render interiority as observed action, not
  invented speech.
- **Numbers are anchors and must be exact and cited.** Rations, distances, dates,
  casualty figures — each gets an `<Annotation>`.
- **"Must have / surely / one imagines" is a tell.** If the prose reaches for a
  speculative connective, the detail underneath is probably unsupported. Cut it or
  cite it.
- **The margin note is the citation.** Because `<Annotation>` renders as a margin
  note / popover, the citation never interrupts the sentence — this is what lets the
  spell hold while the piece stays fully verifiable.

## Sentence-craft (founder voice)
- Present tense in scenes; simple past acceptable for context beats.
- Short declaratives are beats — use them to land a fact or a turn.
- One long, momentum-building sentence may precede a short one; never three long in
  a row.
- No hedging. No "The"-starting consecutive sentences. No decorative em-dashes —
  use them to set off a clarifying phrase or a sharp aside.

## Component choreography
- The component **LEADS**; prose wraps around it to *interpret*. Lead with the
  figure / map / cascade, then let the paragraph read it — never restate what the
  component already carries.
- `<Map>` or `<Timeline>` appears *early*, right after the hook, so the reader has
  the geography or chronology in hand before the narrative deepens.
- `<Figure>` / `<AnnotatedFigure>` carry archival images and portraits — chronicle is
  visual history. Reach for a Figure when a real photograph or period image *is* the
  evidence; reach for AnnotatedFigure when a single image rewards guided attention.
- `<CastGrid>` holds the cast — reach for it when the reader must track several named
  actors (people, places, factions) at once, instead of re-introducing each in prose.
- `<CompareSlider>` shows before/after (a face, a place, a front line transformed);
  `<EventCascade>` carries a causal chain (X → because → Y → therefore → Z) where the
  point is causality, not calendar time; `<RouteMap>` carries a march, a crossing, or
  a storm's path across geography.
- `<Scrolly>` drives the single peak sequence — one `ScrollyStep` per narrative
  beat, the pinned graphic (a `<Map>`, `<Timeline>`, or a sequence of them)
  advancing as the prose steps. Use it once, at the climax, not throughout.
- `<Timeline>` may return at the end to carry the long-arc legacy.
- Instrument for **density, not minimalism**: carry at least one knowledge-carrying
  island per ~800–1000 words — a 6,000-word chronicle carries ~6–8 substantive
  islands (Figure, RouteMap, CastGrid, EventCascade, CompareSlider, Scrolly, Map,
  Timeline, Chart, DataTable — not merely an Annotation or Callout). Reach the depth
  through MORE knowledge-carrying components, each earned — never padding.
