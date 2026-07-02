# Dispatch — worked exemplars & annotated patterns

## Exemplar A — the hook: question, then chart, then the answer

> Three things happened this week that look unrelated until you line them up.
>
> <Chart client:load mark="line" x="month" y="costPerMTok" series="tier" height={300}
>   caption="Marginal inference cost ($/M tokens), datacenter vs edge NPU"
>   data={[
>     { month: "2025-09", costPerMTok: 1.2, tier: "datacenter" },
>     { month: "2026-06", costPerMTok: 0.85, tier: "datacenter" },
>     { month: "2025-09", costPerMTok: 3.1, tier: "edge-npu" },
>     { month: "2026-06", costPerMTok: 0.6, tier: "edge-npu" }
>   ]} />
>
> The edge curve crossed the datacenter curve this spring.

**Why it works:** the chart arrives *second sentence*, before any explanation, and
the prose beat under it names exactly what to notice (the crossover) in one line.
The conclusion is legible from the figure alone. In a real post these values come
from `fetch-data.py` or a cited source, never invented.

## Exemplar B — Scrolly revelation (one variable per step)

> <Scrolly client:visible caption="Three signals, one shift">
>   <ScrollyStep graphic={ <Chart client:visible mark="bar" x="model" y="activeParams"
>     caption="Active params per token (B)" data={[
>       { model: "dense-7B", activeParams: 7 },
>       { model: "moe-16x3B", activeParams: 0.9 } ]} /> }>
>     **Signal one — the paper.** Sparse routing cuts *active* parameters per token
>     4–8×. Cheaper to run well, which matters most where compute is scarce.
>   </ScrollyStep>
>   <ScrollyStep graphic={ <Chart client:visible mark="area" x="month" y="costPerMTok"
>     caption="Edge NPU $/M tokens" data={[
>       { month: "2025-09", costPerMTok: 3.1 },
>       { month: "2026-06", costPerMTok: 0.6 } ]} /> }>
>     **Signal two — the price.** A commodity edge NPU dropped below a threshold
>     that a year ago looked like a 2028 problem.
>   </ScrollyStep>
> </Scrolly>

**Why it works:** each step adds exactly one new thing and pairs it with one calm,
fully-readable prose beat. The mark type changes with intent (bar for the
comparison, area for the cumulative price decline). The reader builds the argument
by scrolling.

## Exemplar C — the "so what" payoff and methodology

> The throughline is economics, not novelty. When the marginal cost of inference at
> the edge falls below the datacenter — and this spring it did,
> <Annotation client:load term="−81%" note="Edge NPU cost per million tokens fell from $3.10 to $0.60 over nine months, per the cited price index." /> —
> the architecture follows the cost curve. Compute moves to where it is cheapest to
> run, and right now that is the edge.
>
> **Methodology.** Cost figures from the cited NPU price index, Sep 2025–Jun 2026,
> in USD per million tokens at int8. This does not capture energy or amortized
> hardware cost, only marginal compute.

**Why it works:** the payoff names the *meaning* (economics drives architecture),
reserves the sharpest number for last, and cites it inline. The methodology note is
honest about what the data omits — the credibility move.

## Exemplar D — a data figure leads, prose interprets

Reaching past Chart+DataTable: a `<Slopegraph>` carries the whole "who moved past whom"
beat, then one prose line interprets it.

> <Slopegraph client:visible
>   left="2019" right="2025"
>   caption="Share of global public-cloud AI-inference spend, by provider (%)"
>   data={[
>     { label: "Hyperscaler A", start: 41, end: 29 },
>     { label: "Hyperscaler B", start: 33, end: 31 },
>     { label: "Specialist GPU clouds", start: 6, end: 24 },
>     { label: "Everyone else", start: 20, end: 16 }
>   ]} />
>
> The specialist clouds didn't grow a lane — they took one. The two incumbents held
> roughly flat in absolute terms while the pie quadrupled, so the *ranking* is the news:
> the challenger crossed both by 2025.

**Why it works:** the slopegraph carries a block of knowledge — four reorderings across
six years — that prose would need 200–400 words to assert line by line. The figure leads;
the single prose beat *interprets* (it's a rank shift, not a growth story), it does not
restate the numbers. The mark fits the intent: reordering across two columns, not a trend
line. In a real post these values come from `fetch-data.py` or a cited ledger source,
never invented — a slopegraph of made-up shares fails grounding exactly like a Chart would.

## Anti-patterns to avoid
- **Prose-first.** Explaining the pattern, then showing the chart. Always reverse.
- **Bare numbers.** "Cost dropped a lot." Give the baseline, the unit, the
  direction.
- **One mark for everything.** Match line/bar/area/dot to the question.
- **Invented data.** If you can't fetch or cite it, use a `<DataTable>` of sourced
  numbers, not a made-up `<Chart>`.
- **Two-chart minimalism.** Reaching the 20–25 min floor with a couple of line charts
  and lots of prose instead of earning depth with SmallMultiples / Distribution /
  Slopegraph / RangePlot. A data essay averaging ~2 heavy figures is under-built — aim
  for one knowledge-carrying island per ~800–1,000 words.
