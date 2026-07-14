# Theater — worked exemplars & annotated patterns

## Canonical full-length exemplar (study this first)

**Read the full piece — `references/exemplars/stalingrad-uranus.mdx`** ("Stalingrad: How the
Trap Closed" — Operation Uranus → Wintergewitter → airlift → surrender, ~7,000 rendered words
/ 25-min depth carried by 11 substantive islands). This is the **gold standard** for the
format: a complete, fact-checked theater reconstruction you should read in full and emulate.
The annotated snippet-patterns below (Exemplars A–D) remain useful for individual moves; this
file is the whole shape done right.

What makes it exemplary — the moves to copy:

1. **The BattleMap is the spine, and its 7 phases are walked in lockstep with the prose.**
   City-fixing → northern pincer → southern pincer → Kalach link-up → sealed Kessel →
   Wintergewitter relief → Koltso reduction — each phase arrives *before* the beat that reads
   it, and the prose interprets the map rather than re-listing its arrows.
2. **The strategic thesis is carried structurally, not just stated.** One idea — *fix the
   strong army in the city, break the weak allies on the flanks, and the ring closes without
   fighting the strong army* — is carried by the EventCascade, the flank-mismatch
   ForceComparison, and Phase 1's "the army that could not turn."
3. **Contested figures are attributed ranges with a Detail explaining why.** Pocket
   250k–290k, air-evac 25k–42k, Axis losses 800k–1.5M, Soviet >1.1M (Krivosheev vs Pereslegin)
   — a `<Detail>` surfaces the dispute openly; single numbers only where ≥2 sources agree
   (91k surrendered, 5–6k returned). No false precision.
4. **Combined-arms glyphs apt to the operation.** Armor arrows for the mechanized pincers and
   the panzer relief, an air glyph for the airlift, artillery for the bombardments — and
   **NO naval glyph** (correctly: it's a steppe-and-air battle; naval would be a grounding
   error). Deliberate modern contrast to naval Midway and ancient-infantry Cannae.
5. **Human cost grounded, never exploited.** The Sankey and "5,000–6,000 ever came home"
   land the catastrophe through sourced arithmetic (the flows sum correctly, midpoints
   disclosed), then the closing tricolon lifts to the strategic verdict without a body-count
   wallow.
6. **Density + grounding.** 11 heavy islands / ~7,000 words ≈ 1 per ~640 words (beats the
   floor and the shipped Cannae/Midway Reads); 11 sources all verified live, every OOB
   strength and decisive map position corroborated ≥2 ways.

**How to use it:** read it in full during the **Internalize** phase to calibrate the bar —
before you draft. Do **not** copy its topic; match its rigor, density, prose, and grounding.

---

Three short patterns showing the craft. Each is ~100–160 words. The bracketed notes
are annotations *about* the technique — not part of the prose. Figures are
illustrative; in a real piece every number carries an `<Annotation>` to a ledger
source.

## Exemplar A — opening in the moment of decision (the hook)

> It is nearly ten on the morning of 1 July 1863, and John Buford's dismounted
> cavalry is spending minutes it does not have. His two brigades —
> <Annotation client:load term="≈2,700 troopers" note="Buford's First Cavalry Division, holding the ridges west of Gettysburg. — Official Records, ser. I, vol. 27." />
> — are strung along McPherson's Ridge with carbines and no illusions, and the dust
> to the west is a Confederate corps. Buford does not need to hold the ridge. He
> needs to hold the *clock*, long enough for Reynolds and the First Corps to reach
> the high ground south of town before the Confederates take it for good.

**Why it works:** present tense; a named commander (Buford) with a concrete problem
(hold the clock, not the ridge); two cited, specific military facts (the strength,
the objective) in the first three sentences; zero textbook framing — the reader is
dropped into the decision and *then* oriented. The `<Annotation>` carries the
strength and its source without breaking the sentence.

## Exemplar B — phase → analytic → phase rhythm

> [PHASE] By early afternoon the First Corps holds, but Reynolds is dead and the
> Confederate divisions are arriving faster than the Union ones. The line west of
> town begins to bend.
>
> [ANALYTIC] The arithmetic is turning. Two Confederate corps are converging on a
> position held by one and a half Union corps; the ratio west and north of town is
> running near two to one against the defenders, and no ground, however good, holds
> against that for long.
>
> [PHASE] At about half past three the northern line gives. The Eleventh Corps,
> struck in front and flank at once, comes apart, and the retreat through the streets
> becomes a race for the hills to the south.

**Why it works:** the analytic beat is fast, third-person, and quantitative (it names
the *ratio* that explains the collapse) — bracketed by two present-tense phase
scenes. The alternation is the engine of pacing, and the ratio in the middle is
exactly what a going-in `<ForceComparison>` would have shown. Every number carries an
`<Annotation>`.

## Exemplar C — a BattleMap phase LEADS, prose interprets

The component arrives *first* and carries the block of knowledge — the units, the
movement, the bent front. The prose then *reads* the phase rather than re-listing the
arrows the map already drew.

> <BattleMap client:visible
>   src={map.src} width={map.attributes.width} height={map.attributes.height}
>   alt="Ground west and north of Gettysburg, afternoon of July 1"
>   caption="July 1, ~15:30 — the convergence closes the Union line"
>   sides={[
>     { id: "usa", label: "Union (I & XI Corps)", tone: "friendly" },
>     { id: "csa", label: "Confederate (Hill & Ewell)", tone: "enemy" }
>   ]}
>   phases={[
>     { title: "The lines converge", time: "~15:30",
>       note: "Ewell's corps arrives from the <strong>north</strong> onto the Union XI Corps flank.",
>       units: [
>         { side: "usa", type: "infantry", label: "XI Corps", strength: "≈8,900", at: [0.44, 0.28] },
>         { side: "csa", type: "infantry", label: "Ewell", strength: "≈20,000", at: [0.50, 0.12] }
>       ],
>       movements: [{ side: "csa", from: [0.50, 0.14], to: [0.45, 0.30], kind: "attack", label: "flank attack" }],
>       fronts: [{ side: "usa", kind: "line", points: [[0.30, 0.45], [0.45, 0.32], [0.60, 0.40]] }]
>     }
>   ]} />
>
> The map makes the disaster legible before the prose names it. Ewell's twenty
> thousand come down from the north onto a flank the Eleventh Corps cannot refuse in
> time, and the thin Union line — barely nine thousand west and north of town —
> folds along the seam the arrow marks. What the phase shows is not a rout of nerve
> but of numbers: the front bends exactly where two converging corps meet one.

**Why it works:** the `<BattleMap>` phase **leads** and carries the tactical
knowledge — the two strengths, the flank attack, the bending front — that the prose
would otherwise burn 250 words asserting. The paragraph then *interprets* the phase
(why the line folds *there*, what the numbers mean) instead of re-listing the units
and arrows. The strengths on the glyphs and in the prose trace to the ledger; the map
and the beat are the same moment, walked in lockstep.

## Exemplar D — ending on the strategic verdict, not a body count

> The three days cost the two armies together some
> <Annotation client:load term="51,000 casualties" note="Killed, wounded, captured, and missing, both armies, July 1–3. — NPS Gettysburg battle summary." />,
> and Lee's army would never again be strong enough to invade the North. It marched
> south across the Potomac in the rain, intact but blunted, and the war's center of
> gravity shifted with it. The Confederacy did not lose the war at Gettysburg. It
> lost, there, the last version of the war it could still win.

**Why it works:** no "in conclusion", no casualty recap for its own sake. The casualty
figure is cited and then *interpreted* — it lifts from the field to the war (Lee's
strategic exhaustion) and lands on a resonant, true claim about what the contest
decided. The final sentence is short and declarative. A `<ForceComparison>` with
`higherIsWorse` casualties would carry the numbers so the prose can do the reading.

## Anti-patterns to avoid

- **Invented order of battle.** A regiment, a strength, or a commander with no ledger
  source is the most dangerous sentence in the format — it corrupts the whole
  reconstruction. Cite it or cut it.
- **False-precise casualties.** "Exactly 28,063 Confederate casualties" when sources
  give a range or disagree. Render the range and attribute it; let ForceComparison
  carry the comparison honestly.
- **Ungrounded map positions.** Placing a unit where the story wants it rather than
  where a source puts it. Every `at`/`from`/`to`/`front` coordinate is a claim.
- **Map out of lockstep with prose.** The BattleMap showing phase 4 while the prose is
  still narrating phase 2. Walk them together, one phase per beat.
- **Prose that re-lists the components.** Reciting the order of battle in a paragraph
  the `<OrderOfBattle>` already carries, or naming casualty figures the
  `<ForceComparison>` already shows. Lead with the component; interpret in prose.
- **Wall-of-text minimalism.** Reaching the 20–25 min floor with prose plus a
  BattleMap and a couple of Annotations. A military reconstruction with no order of
  battle, no force ratio, and no loss breakdown is under-built — reach the depth
  through MORE earned components (OrderOfBattle, ForceComparison ×2, Sankey, RouteMap,
  EventCascade), not more paragraphs.
