# Chronicle — worked exemplars & annotated patterns

Three short patterns showing the craft. Each is ~100–140 words. The bracketed
notes are annotations *about* the technique — not part of the prose.

## Exemplar A — opening in scene (the hook)

> The metronome never stops. From a single loudspeaker bolted to a lamppost on
> Nevsky Prospekt, it ticks through the dark — sixty beats a minute when the city
> is calm, faster when the bombers are coming. Tonight it is slow. Anna listens
> past it for the other sound: the groan of truck engines far to the east, out on
> the ice of
> <Annotation client:load term="Lake Ladoga" note="Largest lake in Europe; its winter ice carried the 'Road of Life' supply route into besieged Leningrad." />,
> where a road runs that should not exist.

**Why it works:** present tense; a named person (Anna) with a motive (listening for
the supply trucks); two cited, specific details (the metronome's beats, Lake
Ladoga) in the first three sentences; zero context — the reader is dropped into the
moment and *then* oriented. The `<Annotation>` carries the fact without breaking the
sentence's rhythm.

## Exemplar B — scene → context → scene rhythm

> [SCENE] He does not look at the map again. He has looked at it for three weeks.
>
> [CONTEXT] By the autumn of 1941 the Wehrmacht had severed the last rail line into
> the city; what remained was the lake, and the lake was not yet ice. The
> arithmetic was simple and merciless — so many calories in, so many mouths.
>
> [SCENE] On the ice itself, the first trucks crawl forward at walking pace, head-
> lights taped to slits. A driver counts the cracks he can hear over the engine.

**Why it works:** the context beat is fast, third-person, and causal (it explains
*why* the lake matters) — bracketed by two slow, sensory present-tense scenes. The
alternation is the engine of pacing. Every concrete number ("three weeks", "1941")
would carry an `<Annotation>` to its source.

## Exemplar C — ending on consequence, not summary

> The ration is raised to two hundred grams in late January. It is not enough, but
> it is more, and *more* is a direction. The siege will hold the city for another
> two years; when it lifts, the metronome will still be ticking, because no one
> ever thought to turn it off.

**Why it works:** no "in conclusion", no recap. It lifts from the immediate scene to
the long arc (the siege's full length) and lands on a small, resonant, *true* image
(the metronome) that ties back to the opening. The final sentence is declarative and
present-leaning. The two-year figure is cited; the metronome detail traces to a
source.

## Exemplar D — a knowledge-carrying component leads, prose interprets

The component arrives *first* and carries the block of knowledge; the prose then reads
it, rather than re-listing what it already shows. Here a `<CastGrid>` holds the cast the
reader must track, and the beat that follows *interprets* the grid instead of
re-introducing each name.

> <CastGrid client:visible
>   caption="The men on the ice, winter 1941–42"
>   sourceUrl="https://archive.org/details/road-of-life-ladoga-ledger"
>   cast={[
>     { name: "Maj. Gen. Frolov", role: "Commands the Ladoga Military Highway", note: "Orders the first convoy onto ice barely 10 cm thick." },
>     { name: "Nina Sokolova", role: "Diver-engineer", note: "Surveys the lakebed for the fuel pipeline laid under fire." },
>     { name: "The GAZ-AA drivers", role: "Convoy crews", note: "Run with cab doors roped open, to jump if the ice gives." }
>   ]}
> />
>
> None of them chose the lake; the lake is simply what is left. Frolov signs for ice a
> hand's-width thick because the alternative is a city eating its library paste, and
> Sokolova is under it before the surface will hold a truck. The drivers keep their
> doors roped open — a small, terrible arithmetic, one life weighed against a load of
> flour every time the ice groans.

**Why it works:** the `<CastGrid>` **leads** and carries the roster — three named actors,
their roles, their stakes — knowledge the prose would otherwise burn 250 words
introducing. The paragraph then *interprets* the grid (why each is on the ice, what the
roped doors mean) instead of restating the cards. Every card's `note` traces to the
ledger via `sourceUrl`; the beat wraps prose around the component, not the reverse.

## Anti-patterns to avoid

- **Invented interiority.** "She must have felt a flicker of hope" — cut it unless a
  source records her feeling. Render observed action instead.
- **Decorative context dump.** Three paragraphs of background before any scene. Open
  in scene; meter the context in.
- **Uncited specificity.** A vivid number or quote with no source is the most
  dangerous sentence in the format. Cite it or cut it.
- **Wall-of-text minimalism.** Reaching the 20–25 min floor with prose plus a couple
  of Annotations instead of earning depth through knowledge-carrying components. A
  visual history with no Figures / CastGrid / RouteMap is under-built — reach the depth
  through MORE earned components, not more paragraphs.
