# Theater — craft rubric (deep)

Models: John Keegan (*The Face of Battle*, *The Second World War*), Rick Atkinson
(*The Liberation Trilogy*), Antony Beevor (*Stalingrad*, *D-Day*), Cornelius Ryan
(*The Longest Day*), Barbara Tuchman (*The Guns of August*) — and, for the pure
strategy/geopolitics contests, Lawrence Freedman and Thomas Schelling. The shared
move: rigorously-researched military fact — orders of battle, strengths, movements,
casualties — delivered as an immersive, phase-by-phase reconstruction, with the
apparatus of citation kept out of the reader's eyeline and the *ground* always
legible.

## The defining tension

A theater reads like a war film and is true to the order of battle. Both halves are
load-bearing. Drop the immersion and it's a staff study; drop the grounding and it's
a war movie — which khazana does not publish. The whole craft is delivering the
tension and sweep of a battle while every formation, strength, position, and
casualty figure remains independently verifiable. The single most dangerous
sentence in the format is a confident, specific, *uncited* military number.

## The five imperatives, expanded

### 1. Open in the moment of decision, not the textbook
The first two sentences put the reader *inside the contest at the hour it turns*. A
place, a time, a formation, a commander's problem. Compare:
- ❌ "The Battle of Gettysburg was the turning point of the American Civil War."
- ✅ "It is nearly ten on the morning of 1 July 1863, and John Buford's dismounted
  cavalry is buying minutes it does not have on the ridges west of a Pennsylvania
  crossroads town, waiting for the infantry that may not come in time."
The second earns the next paragraph. The strategic overview can wait 200 words — and
when it comes, it comes as a `<Map>` or an `<OrderOfBattle>`, not a paragraph of
summary.

### 2. Name the formations and their commanders — and give the commander a problem
Readers attach to a named corps with a named commander facing a real constraint, not
to "the attackers". Where a source names the formation, the commander, the objective
— use them, and render the operational stake. "Guderian must cross the Meuse at
Sedan before the French seal the gap" beats "the Germans advanced rapidly." A
commander with a problem turns an arrow on a map into a scene.

### 3. One citeable military fact per paragraph
Every paragraph should carry at least one specific, only-a-source-could-know-this
military fact: the corps strength (≈22,000), the frontage (a mile and a half), the
casualty count, the name of the ridge, the hour of the assault. This detail does
double duty — it makes the reconstruction vivid *and* it proves the research. It is
also exactly what gets an `<Annotation>`. A paragraph with no citeable military fact
is probably invented color; tighten or cut it.

### 4. Pace: phase → consequence → phase
Alternate. An immersive phase (300–500w: what happens on the ground, present tense,
the `<BattleMap>` on that phase) earns a short analytic beat (100–200w) that reads
the phase — how the force ratio shifted, why the ground mattered, what the commander
now knows — then drops back into the next phase. The `<BattleMap>` phases and the
prose beats are the SAME sequence: never let the map show phase 4 while the prose is
still in phase 2. Analytic beats are fast and quantitative; phase scenes are slow and
tactical. The alternation is what keeps a long reconstruction from either dragging
(all analysis) or disorienting (all action).

### 5. End with the strategic verdict, not a body count
Never "In conclusion" or a casualty recap. The last beat lifts from the field to the
war: what this contest decided, what it cost in blood and materiel, what it set in
motion. A `<ForceComparison>` or a `<Sankey>` can carry the ledger of cost; a
`<Timeline>` can carry the aftermath; the final *sentence* is short, declarative,
and returns to the larger arc. "The road to Berlin now runs only one way."

## Grounding technique specific to military reconstruction

- **Orders of battle are the skeleton — get them exactly right.** Strengths,
  formations, and commanders are the facts most often inflated in popular accounts
  and most rewarded by primary sources. Build the `<OrderOfBattle>` from an official
  history or a primary OOB table, corroborate strengths across ≥2 sources, and
  attribute disputed figures rather than picking one.
- **Casualties are contested — show the range, cite the count.** Military casualty
  figures vary by source, by definition (killed vs killed+wounded+missing), and by
  political incentive. Never state a single false-precise figure when sources
  disagree; render "≈28,000, by the Confederate returns" or a range, and let the
  `<ForceComparison>`'s `higherIsWorse` bars carry the comparison honestly.
- **Every map position is a claim.** A unit's `at`, a movement's `from`/`to`, a
  front line's `points` on a `<BattleMap>` each assert *this force was here at this
  hour*. Place a unit only where a source's map or narrative puts it. When sources
  disagree on a position or a timing, surface it in the phase `note` or an
  `<Annotation>` — do not silently pick the tidy version.
- **Quote only what a source records.** Never invent an order, a signal, or a
  general's line. If a war diary or a dispatch records it, use it (a `<Pullquote>`
  with `kind="telegram"` or `"document"`) and cite it; otherwise render the decision
  as observed action, not invented speech.
- **"Must have / surely / presumably" is a tell.** If the prose reaches for a
  speculative connective to explain a movement, the underlying position or timing is
  probably unsupported. Cut it or cite it.
- **The margin note is the citation.** Because `<Annotation>` renders as a margin
  note / popover, and because `<BattleMap>`/`<OrderOfBattle>`/`<ForceComparison>`
  carry `sourceUrl`/`href`, the citation never interrupts the reconstruction — this
  is what lets the spell hold while every number stays verifiable.

## How BattleMap phases map to the narrative beats

The `<BattleMap>` is theater's spine, and its `phases` array IS your scene list.
Design them together:

- **One phase = one narrative beat.** Each `PhaseSpec` (`title`, `time`, `note`,
  `units`, `movements`, `fronts`) corresponds to one prose beat. The reader steps the
  scrubber and reads the matching paragraph; the two advance in lockstep. A 5-phase
  battle is a 5-beat core.
- **`title` + `time` are the beat's dateline** — "Jackson's flank march, ~17:00".
  Keep them terse; the prose carries the drama.
- **`note` is a one-line HTML string, not the scene.** It's the caption the reader
  reads *on the map* ("Lee sends **Jackson** on a wide march around the Union
  right"). The full beat lives in the prose beside it. `note` takes a short HTML
  string (`<strong>`), NOT MDX children.
- **`units` place the forces** — `{ side, type, label?, strength?, at: [x,y] }`,
  coords 0..1 over the base image. Only place a unit where a source puts it; a
  `strength` on a glyph is a cited claim.
- **`movements` are the arrows** — `{ side, from, to, kind: "advance"|"attack"|
  "retreat"|"supply", label? }`. The arrow *is* the sentence "XIX Panzer Corps
  crosses at Sedan"; the prose interprets why it mattered.
- **`fronts` are the lines / control areas** — `{ side?, kind: "line"|"area",
  points }`. Use them to show how the front bent phase to phase — the visual argument
  of an encirclement or a breakthrough.
- **Lead with the map, interpret in prose.** For each beat, the reader sees the phase
  (units moved, front bent) *before* the paragraph reads it. The paragraph explains
  the *why* and the *cost* — it never just re-lists the arrows the map already drew.
- **Design the phase list in Outline, not Draft.** By the end of Outline you should
  have the full `phases` array sketched (title/time/units/movements/fronts + a ledger
  URL for every position), so drafting is interpretation, not invention.

## Reconstructing across the whole range

Theater spans more than the set-piece land battle. Adapt the spine:

- **Single battle** — one `<BattleMap>` carrying the tactical phases; OOB + going-in
  and coming-out `<ForceComparison>`.
- **Campaign** — a `<RouteMap>` or `<Map>` for the strategic sweep; a `<BattleMap>`
  zooming into the decisive engagement; a `<Timeline>` threading the campaign;
  optionally a second BattleMap for a second decisive action.
- **Siege** — `<BattleMap>` phases as the tightening ring / the lines of
  circumvallation; a `<Sankey>` or `<Chart>` of the attrition (rations, garrison
  strength over time); a `<Timeline>` of the siege's length.
- **Naval / air** — `<BattleMap>` with `naval`/`air` unit glyphs and movement across
  water/sky; `<RouteMap>` for the approach/interception; `<ForceComparison>` of
  hulls/aircraft and losses.
- **Modern operation** — the same, with `armor`/`air`/`hq` glyphs, a `<Diagram>` of
  the command structure or the deception plan, a `<Sankey>` of the force allocation.
- **Pure strategy / geopolitics contest** (a blockade, an arms race, a deterrence
  standoff) — lean on `<ForceComparison>` (arsenals, throw-weight), `<Sankey>`
  (budget / force allocation), `<EventCascade>` (the escalation logic), `<Diagram>`
  (the strategic decision tree), and `<Map>`/`<RouteMap>` (the geography of the
  contest). A `<BattleMap>` may still carry a hypothetical or a single flashpoint,
  but here the *ratio* and the *escalation logic* are the spine, not a tactical map.

## Sentence-craft (founder voice)
- Present tense in the phase scenes; simple past acceptable for analytic beats.
- Short declaratives are beats — use them to land a strength, a casualty, or a turn.
- One long, momentum-building sentence may precede a short one; never three long in a
  row.
- No hedging. No "The"-starting consecutive sentences. Military terms of art are
  welcome — earn a `<Definition>` on first use of an unfamiliar one.

## Component choreography
- The component **LEADS**; prose wraps around it to *interpret*. Lead with the
  BattleMap phase / the order of battle / the force ratio, then let the paragraph
  read it — never restate what the component already carries.
- `<Map>` or `<RouteMap>` appears *early*, to situate the theater, before the
  `<BattleMap>` narrows to the tactical.
- `<OrderOfBattle>` and a going-in `<ForceComparison>` establish the forces *before*
  the fighting — the reader needs the ratio in hand to feel the odds.
- `<BattleMap>` carries the contest itself, one phase per beat, in lockstep with the
  prose. Usually one per piece; a very large campaign may warrant two.
- `<Sankey>` and a coming-out `<ForceComparison>` carry the reckoning — where the
  force went, what it cost.
- `<EventCascade>` carries the decision logic (the breakthrough → encirclement →
  surrender chain); `<Timeline>` carries the campaign's or the aftermath's calendar.
- Instrument for **density, not minimalism**: at least one knowledge-carrying island
  per ~800–1000 words — a 6,000-word theater carries ~6–8 substantive islands
  (BattleMap, OrderOfBattle, ForceComparison, Sankey, RouteMap, Figure, EventCascade,
  Timeline — not merely an Annotation or Callout). Reach the depth through MORE
  earned components, never padding.
