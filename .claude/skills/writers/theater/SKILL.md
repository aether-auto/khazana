---
name: writers/theater
description: This skill should be used to author a THEATER post for khazana — a military/strategy narration that RELIVES a battle, campaign, siege, or strategic contest phase by phase (army movements, orders of battle, force ratios, casualties), grounded in real cited sources. Trigger when a brief's "Format:" line is `theater`, or when asked to "write a theater", "relive this battle", "narrate a campaign / siege / naval action", or produce immersive military-history MDX for the site. Produces one MDX file (BattleMap/OrderOfBattle/ForceComparison/Sankey/Map/RouteMap/Timeline/EventCascade/…) targeting a 20–25 min rendered depth (~5,000–7,000+ words) that builds in apps/site and passes validateDraft.
version: 1.0.0
---

# Theater writer

Author one **theater** post: an immersive, phase-by-phase reconstruction of a
military or strategic contest — a battle, a campaign, a siege, a naval or air
action, a modern operation, or a pure strategy/geopolitics contest (a blockade,
an arms race, a deterrence standoff). The reader watches the contest *unfold* —
formations named, ground taken, the force ratio shifting phase by phase, the
decisive order given at the decisive hour. The craft tension that defines the
format, inherited from `chronicle`: it reads like a war film but **every unit,
strength, movement, casualty figure, date, and map position is real and cited.**
The spell never breaks, and it never fabricates an order of battle.

Theater is chronicle's military sibling. Where chronicle narrates *history*,
theater narrates *conflict* — and it owns a dedicated interactive kit built for
that job: **BattleMap** (the phase-by-phase spine), **OrderOfBattle** (the force
roster), **ForceComparison** (head-to-head strength & losses), and **Sankey**
(force/casualty flows). The `<BattleMap>` is the format's beating heart: the
narrative beats ARE the phases.

Input is an authoring brief on stdin (from `buildBrief()`): title, slug, channel,
the founder voice guide, and the **curated cluster** — the real seed article(s) plus
the assignment. The verifiable source of truth is the **citation ledger** the
research phase builds *out* from that cluster. Output is one MDX file at the brief's path.

## Grounding mandate (non-negotiable)

Every military detail — a formation, a commander, a strength figure, a movement, a
date, a casualty count, a map position, a quoted order — must trace to a
**citation-ledger source** (see `writers/researcher`). Theater is *as hard as
chronicle* to ground, and in one way harder: an invented unit, an inflated
strength, or a wrong map position feels native to a war narrative and quietly
corrupts the whole reconstruction. So the discipline is strictest here:

- If a detail is not supported by a ledger source, **cut it or mark it
  `[UNSUPPORTED]`** for the verify pass. Never invent a regiment, a strength, a
  casualty figure, a unit position on the map, or a general's order to make a
  phase vivid.
- **Orders of battle, strengths, and casualties are load-bearing** — the numbers
  the reader will remember and the ratios the ForceComparison shows. Each must be
  corroborated by **≥2 independent ledger sources** and should rest on a
  **High-tier** source (official history, primary order-of-battle document,
  war-diary / after-action report, peer-reviewed campaign study) where one exists.
  Incidental colour needs one ledger source; the OrderOfBattle and the casualty
  bars need corroboration. A first-hand primary account (a war diary, a signal
  log), attributed in the prose, may carry a load-bearing detail alone — but prefer
  a second record.
- **Map positions are claims.** Every `at`, `from`, `to`, and `front` coordinate
  you place on a `<BattleMap>` asserts *this unit was here at this hour*. Place a
  unit only where a source's map or narrative puts it; when sources disagree on a
  position or a timing, do not pick one silently — surface the dispute in the phase
  `note` or an `<Annotation>`.
- Where the research surfaced **conflicting accounts** (disputed strengths,
  contested casualty figures, argued timings — common in military history), do not
  smooth them over: present the range or attribute the positions honestly, exactly
  as the claims table flags them. "Between 23,000 and 28,000 casualties, depending
  on the count" is more honest and more powerful than a false-precise single number.
- If the ledger lacks enough grounded detail to reconstruct real phases (a
  `RESEARCH THIN` handoff), say so in Internalize and emit a thinner, honestly-
  scoped piece rather than hallucinating an order of battle. Flag with
  `FAIL: <slug> — insufficient source detail for theater`.
- Every cited source URL goes in `sources[]` **and** is cited inline as an
  `<Annotation>` (or a component's `sourceUrl`/`href`) at the point its fact is
  used — and every such URL is in the ledger.

Shared tier rubric, triangulation rules, and the gate definitions live once in
**`writers/researcher/SKILL.md`** — this skill references them, never restates them.

## Craft rubric (5 imperatives)

1. **Open in the moment of decision, not the textbook.** "It is 05:30 on 6 June
   1944, and the first ramp drops in four feet of surf off Omaha." Never "The
   Normandy landings were a turning point of the war."
2. **Name the formations and their commanders — and give the commander a
   problem.** Not "the attackers advanced" but "Guderian's XIX Panzer Corps has to
   cross the Meuse at Sedan before the French can seal the gap." Forces are led by
   named people making named decisions under real constraints.
3. **One concrete, citeable military fact per paragraph** — a strength, a distance,
   a time, a casualty figure, the name of the ridge. The specific fact only a
   source could supply is what separates reconstruction from war-movie fantasy — it
   *proves the research*, and it is exactly what gets an `<Annotation>`.
4. **Pace phase → consequence → phase.** Alternate an immersive phase (what happens
   on the ground) with a short analytic beat (why it mattered, how the force ratio
   or the ground shifted). The `<BattleMap>` phases and the prose beats are the same
   sequence — walk them in lockstep.
5. **End with the strategic verdict, not a body count.** The final beat lifts from
   the field to the war: what this contest decided, what it cost, what it set in
   motion. A `<Timeline>` or `<ForceComparison>` can carry the ledger of cost; the
   final *sentence* is short, declarative, and returns to the larger arc.

Full detail: **`references/craft.md`**.

## Structural template (target 20–25 min rendered read — the length FLOOR / `GAUSSIAN_DEFAULTS.peakMin`)

Aim for 5,000–7,000+ words — this is a FLOOR, not a target; go longer when source depth supports it.
Reach the length through more phases, deeper order-of-battle detail, a fuller consequence arc — never
padding — and through MORE knowledge-carrying components (a BattleMap with real phases, an
OrderOfBattle, a ForceComparison, a Sankey of losses, a RouteMap of the strategic movement), each
earned. The scoring Gaussian peaks at the 20–25 min depth; a 1,800-word piece scores a fraction of one
that earns the full depth. Use `<Detail>` (Expandable) to fold in deep OOB minutiae for motivated
readers without bloating the linear read.

Situate (200–300w, `<Map>`/`<RouteMap>` places the theater; `<StatBand>` of the stakes — forces,
dates, what's at risk — each cited) → the forces (`<OrderOfBattle>` rosters both sides;
`<ForceComparison>` shows the ratio going in) → the contest, phase by phase (the SPINE:
`<BattleMap>` with one phase per narrative beat — units, movement arrows, front lines — the prose
walking each phase, every named fact an `<Annotation>`; optional `<Pullquote>` of a real signal /
order / dispatch if one exists) → the turn (`<EventCascade>` or a `<BattleMap>` phase carrying the
decisive move) → the reckoning (`<ForceComparison>` or `<Sankey>` of casualties; `<Timeline>` of
aftermath) → the strategic verdict (300–400w). Annotated skeleton: **`references/template.mdx`**.
Worked excerpts: **`references/exemplars.md`**.

## Your interactive kit

The site ships **~40 interactive components**. Theater's kit is the subset below, and it is the
richest military kit on the site. Actively **CHOOSE from the WHOLE kit** — do not default to
BattleMap + Annotation. Theater is *cartographic, quantitative* history: reach for the order of
battle, the force ratio, the loss flows, the strategic route map, the causal cascade — not just the
battle map plus a citation.

**Every component must be earned** — but you reach the format's depth through *MORE* knowledge-
carrying components, each earned, NOT through minimalism. Don't add a component because it seems
dramatic; add it because the reconstruction is poorer without it, then choose the one that best
*carries* that block of knowledge.

Reach for each when:

### The military spine

- **`<BattleMap client:visible>`** — the format's SPINE. A phase-by-phase tactical replay over a
  committed base-map/terrain image: NATO-style unit glyphs, movement arrows (advance/attack/retreat/
  supply), front lines, and a phase scrubber. Reach for it: for the CONTEST itself — one phase per
  narrative beat, so the map and the prose advance together. This is theater's `<Scrolly>`; most
  pieces have exactly one BattleMap carrying the core action (a very large campaign may warrant two:
  strategic sweep + a decisive tactical zoom).
- **`<OrderOfBattle>` (static Astro, NO `client:` directive)** — the force-structure roster:
  armies → corps → divisions → brigades, with commanders and strengths, sub-units in native
  `<details>`. Reach for it: to establish *who is on the field* before the fighting — the reader
  needs the two orders of battle in hand to follow the phases. One per side, or one component with
  both sides.
- **`<ForceComparison client:visible>`** — head-to-head diverging bars sharing a center baseline that
  carries the RATIO: troops, guns, tanks, aircraft — and, with `higherIsWorse`, casualties. Reach
  for it: TWICE, ideally — once going in (the strength ratio that frames the odds) and once coming
  out (the butcher's bill). The ratio is the argument.
- **`<Sankey client:visible>`** — flow / allocation diagram: where a force went, how casualties
  broke down, how a budget or a mobilization split. Reach for it: when the *breakdown of a total* is
  the point — total force → committed / reserve / lost; total casualties → killed / wounded / captured
  / missing; a war budget → theaters. Props take `nodes` + `links` + `unit`.

### Strategic movement, sequence, and causation

- **`<Map client:visible>`** — world/regional choropleth (iso3 → number). Reach for it: to situate
  the *theater* — the states involved, their relative weight — before the tactical map narrows in.
- **`<RouteMap>`** — Map + great-circle routes/arcs/points. Reach for it: the STRATEGIC movement a
  BattleMap can't hold — a fleet's crossing, an army's march to the front, a convoy route, an
  airlift, a supply line, an invasion axis across a continent.
- **`<Timeline client:load>`** — anchors chronology or the aftermath arc. Reach for it: the reader
  needs the *when* of a long campaign, or the consequence timeline at the end.
- **`<EventCascade>`** — a causal chain X → because → Y → therefore → Z (distinct from time-scaled
  Timeline). Reach for it: for the DECISION logic — why the flank collapsed, how one breakthrough
  cascaded into an encirclement, how a mobilization timetable forced a war. The point is *causality*,
  not the calendar.
- **`<Diagram>`** — a labeled node/edge diagram. Reach for it: a command structure, a chain of
  command, a decision tree, a deception plan — the *structure* of an organization or a plan.
- **`<Scrolly client:visible>` / `<ScrollyStep>`** — sticky-graphic, stepped prose. Reach for it:
  when a single sequence needs to be walked beat-by-beat with a pinned figure that is NOT a BattleMap
  (e.g. a pinned `<Chart>` of the artillery tempo, or a `<Map>` of the strategic sweep) — BattleMap's
  own scrubber usually covers the tactical replay.

### Terrain, artifacts, and cast

- **`<Figure>`** — a public-domain / archival image with caption + credit + `sourceUrl`. Reach for
  it: theater is VISUAL — the terrain photograph, the reconnaissance plate, the commander's portrait,
  the wrecked ship. Use real archival images.
- **`<AnnotatedFigure>`** — numbered pins over a photo/map: "here is what to look at." Reach for it:
  a terrain photo or aerial plate that rewards guided attention (the sunken road, the reverse slope,
  the breach in the line).
- **`<CompareSlider>`** — before/after image or map wipe. Reach for it: a front line, a city, or a
  fortification transformed — the line on D-1 vs D+1, the harbour before and after the raid.
- **`<CastGrid>` (static Astro, NO `client:`)** — cast-of-commanders card grid. Reach for it: when
  the reader must hold several named commanders / factions at once, instead of re-introducing each in
  prose. (For force *structure*, prefer OrderOfBattle; for the *people*, CastGrid.)

### The connective tissue (shared across long-form formats)

- **`<Annotation client:load>`** — carries every citation (renders as marginalia, never breaking
  prose). Reach for it: whenever a named military fact needs its source. This is the primary citation
  apparatus.
- **`<Sidenote>`** — margin aside / numbered footnote. Reach for it: a brief digression or gloss
  (a weapon's specs, a place-name note) that would clutter the line.
- **`<Callout>`** — a boxed "key-insight" / "watch-for" note. Reach for it: to flag the operational
  point the reader should carry into the next phase.
- **`<Detail>`** — progressive-disclosure "go deeper" block. Reach for it: to fold in deep OOB
  minutiae or a sourcing-dispute note without bloating the linear read.
- **`<Definition>`** — glossary tooltip that *teaches* a term (vs Annotation, which *cites*). Reach
  for it: an unfamiliar military term (defilade, envelopment, in echelon) the reader needs defined.
- **`<Pullquote>` (static `.astro`, NO `client:` directive)** — primary-source block: a signal, an
  order of the day, a war-diary line, a dispatch. Props: `cite?`, `href?`, `kind?:
  "quote"|"document"|"telegram"|"headline"`. Children = the quote text. Earn it: only when the
  verbatim order/signal is more powerful than a paraphrase.
- **`<StatBand client:visible>`** — row of big figures counting up on scroll-in. Props: `stats=[{
  value, prefix?, suffix?, decimals?, group?, label, sub?, href? }]`, `caption?`. `href` cites a
  source. Earn it: only when the numbers (forces engaged, casualties, dates, cost) genuinely set the
  stakes.
- **`<Chart>` / `<DataTable>`** — carry a distribution or a structured set of figures (a
  strength-over-time series, a casualty table by formation) the prose would otherwise list. Reach for
  them: when the *shape* of the data is the point.

**Density target.** Carry at least one *knowledge-carrying island* per ~800–1000 words — where an
island is a BattleMap, OrderOfBattle, ForceComparison, Sankey, Figure, AnnotatedFigure, Map, RouteMap,
Scrolly, Timeline, CompareSlider, CastGrid, EventCascade, Diagram, Chart, or DataTable (NOT merely an
Annotation, Sidenote, or Callout). A 6,000-word theater → **~6–8 substantive islands**, anchored by
the BattleMap. Anti-pattern to beat: published Reads averaged only ~2 heavy islands — beat that
decisively.

**Components carry knowledge.** A component should carry a block of knowledge the prose would otherwise
spend 200–400 words asserting. **LEAD with the component** — the BattleMap phase / order of battle /
force ratio arrives BEFORE the prose that interprets it — then wrap prose around it to *interpret*, not
restate. Never list an order of battle in prose that an `<OrderOfBattle>` already carries; never recite
casualty figures a `<ForceComparison>` already shows — interpret them.

Exact props: **`references/mdx-contract.md`**.

## Reading-comfort & voice

Founder voice (from the brief / STYLE.md): vary sentence rhythm — short declaratives as beats, one
long sentence before a short reset, never three long in a row. No hedging ("it seems", "arguably").
Don't start consecutive sentences with "The". Present tense in the phase scenes; third person / past in
analytic beats; second person only for a deliberate "put yourself in the commander's chair" invitation.
The drama lives in the contest and the map; the prose itself stays clean and readable — no animation
gimmicks in the text. Military terms of art are welcome but earn a `<Definition>` on first use.

## Authoring chain — run in strict order, tag each phase

### `<phase>Research</phase>`
**Run before Internalize. Do not draft without a populated citation ledger + claims table.** Invoke
the `writers/researcher` methodology on this brief: plan 5–8 research questions, search *out* from the
curated seeds to primary sources (official histories, order-of-battle documents, war diaries,
after-action reports, campaign studies), appraise each into the ledger with its tier, and triangulate
every load-bearing military fact — every strength, every casualty figure, every decisive movement,
every map position — to ≥2 independent sources. Theater depends on **grounded orders of battle,
strengths, casualties, and unit positions**: bias the search toward official histories, primary OOB
tables, and reputable military-history scholarship, not popular retellings. Output the research
dossier, the citation ledger, and the claims table. If the gates can't be met at budget, take the
`RESEARCH THIN` handoff and scope down (a smaller action, fewer phases) — never invent an order of
battle.

### `<phase>Internalize</phase>`
Read the brief and the research dossier fully. Output 6–12 lines: (a) the single contest spine (which
battle/campaign, whose decision turns it); (b) the two orders of battle and the going-in force ratio,
with ledger URLs (prefer High-tier / primary OOB documents); (c) the **phase breakdown** — the 3–7
phases the `<BattleMap>` will carry, one per narrative beat, each with the units/movements/fronts it
shows and its source; (d) which component anchors which beat (`<Map>`/`<RouteMap>` early,
`<OrderOfBattle>`/`<ForceComparison>` for the forces, `<BattleMap>` at the core, `<ForceComparison>`/
`<Sankey>` for the reckoning). Then confirm **every** strength, casualty, movement, and position you
intend to render is a row in the claims table with a ledger URL — load-bearing OOB and casualty facts
corroborated. Any fact not in the table → mark `[UNSUPPORTED]` now (research it or cut it). If the
ledger can't support real phases, stop and plan a `FAIL`. Do not write prose yet.

### `<phase>Outline</phase>`
Section-by-section against the template: heading/beat + 1-line intent + component placement + which
source(s) each beat draws on. **Draft the BattleMap phase list explicitly** — for each phase: title,
time, the units (side/type/strength/position) and movements/fronts it shows, and the ledger source for
each position. Confirm target 5,000–7,000+ words (20–25 min rendered read, a floor) and that every
cited source appears at least once. Map each major section to the knowledge-carrying component that
best CARRIES it, from the full kit (an OrderOfBattle, a ForceComparison, a Sankey, a RouteMap, a
BattleMap phase, an EventCascade), not just an Annotation cite. Confirm only kit components are used.
For each `<StatBand>` or `<Pullquote>`, state why it earns its place — if you can't say why in one
sentence, cut it.

### `<phase>Draft</phase>`
Write the full MDX. Every knowledge-carrying component (BattleMap, OrderOfBattle, ForceComparison,
Sankey, Map, RouteMap, Figure, EventCascade) arrives BEFORE the prose that interprets it; the prose
wraps around it to interpret, not restate. The `<BattleMap>` phases and the prose beats are the SAME
sequence — walk them in lockstep. Every named military fact gets an inline `<Annotation term=…
note=… />`; every OOB / casualty figure traces to the ledger. Hold present tense in the phase scenes.
Match founder voice. Cut any unit, strength, or position you cannot cite.

### `<phase>Verify + Emit</phase>`
Self-check against `references/mdx-contract.md` §5 **and the fact-check gates**: (1) every
`sources[].url` is a **verbatim ledger URL** (curated ∪ researched) and the list is non-empty; (2)
**≥90% of factual claims cite a ledger source** — every named military fact carries an inline
`<Annotation>` (or a component `sourceUrl`/`href`) tracing to the ledger, or it is cut; (3) **≥60% of
load-bearing claims are corroborated by ≥2 independent ledger sources** — with special attention to
every OOB strength, casualty figure, and decisive map position (check against the claims table); (4)
no fabricated or uncited unit, strength, position, or order; conflicts surfaced, not smoothed; (5)
only kit components appear, and every `<BattleMap>`/`<OrderOfBattle>`/`<ForceComparison>`/`<Sankey>`
matches the prop contract; (6) frontmatter matches the schema. Then run `python3
scripts/check-links.py <file>.mdx`. If all pass, write the file and print `DONE: <slug>`. If any gate
fails, print `FAIL: <slug> — <reason>` and do not write.

## Resources
- `writers/researcher/SKILL.md` — the research phase: literature search, tier rubric, triangulation,
  the ledger + claims-table shapes, and the fact-check gates (shared).
- `references/craft.md` — deep craft: reconstructing a battle faithfully + dramatically, grounding
  discipline for military claims, how BattleMap phases map to the narrative beats.
- `references/template.mdx` — annotated structural skeleton.
- `references/exemplars.md` — worked exemplars, including a BattleMap-led scene with prose interpreting.
- `references/mdx-contract.md` — exact frontmatter + component contract (incl. the military kit props).
- `scripts/check-links.py` — Verify-phase link validator (`--help` for usage).
