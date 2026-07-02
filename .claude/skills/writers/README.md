# khazana writer skills

Six specialized **per-format writer skills** plus a shared **`writers/researcher`**
skill that runs the research phase before any of them draft. Each writer turns an
authoring *brief* (produced by `packages/generate`'s `buildBrief()`) into one
publishable MDX file in `apps/site/src/content/blog/` — a deep, genuinely educational,
data-rich, **fully-grounded, thesis-grade** interactive blog post in the founder's voice.

| Skill | Format | Intent | Length | Component kit (full list in each format's `references/mdx-contract.md`) |
|---|---|---|---|---|
| `writers/researcher` | (all) | research | — (produces dossier + ledger + claims table) | WebSearch, WebFetch, fetch-data.py |
| `writers/chronicle` | chronicle | narrate | **20–25 min FLOOR (~5,000–7,000+ w)** | Scrolly/ScrollyStep/ScrollyTimeline, Timeline, EventCascade, Map/RouteMap, Figure/AnnotatedFigure/CompareSlider, CastGrid, Pullquote, StatBand, Annotation, Sidenote, + shared Callout/Detail/Definition |
| `writers/dispatch` | dispatch | explain | **20–25 min FLOOR (~5,000–7,000+ w)** + real-data viz | Chart, SmallMultiples, Distribution, Scatter, Slopegraph, RangePlot, DrawChart, ControlledChart, Scrolly, DataTable, StatBand, Pullquote, Annotation, Sidenote, Math, + shared Callout/Detail |
| `writers/teardown` | teardown | explain | **20–25 min FLOOR (~5,000–7,000+ w)** + code/diagrams | Diagram, StateMachine, LayerStack, CodeWalkthrough, RunnableCode, Stepper, Chart, Model3D, Math, StatBand, Pullquote, Annotation, Sidenote, + shared Callout/Detail/Definition |
| `writers/primer` | primer | explain | **20–25 min FLOOR (~5,000–7,000+ w)** + sandboxes | Simulation, Quiz, ParameterPlay, ControlledChart, Math, Diagram, CodeWalkthrough, Stepper, Chart, RunnableCode, Figure, Definition, StatBand, Pullquote, Annotation, Sidenote, + shared Callout/Detail |
| `writers/build-log` | build-log | build | **20–25 min FLOOR (~5,000–7,000+ w)** + code | Figure/CompareSlider, Checklist, Stepper, GanttStrip, CodeWalkthrough, RunnableCode, DataTable (BOM total footer), Model3D, StatBand, Pullquote, Annotation, Sidenote, + shared Callout |
| `writers/field-notes` | field-notes | synthesize | **~300–500 w (short exception — floor does NOT apply)** | Annotation, DataTable (sparingly StatBand/Pullquote); the ONE expansion allowed is a single `Callout` "watch for" box |

> The five long-form formats are the **20–25 min / 5,000–7,000+ word** deep reads. **field-notes
> is the deliberate short exception** — the length floor, the density target, and the expanded kit
> do NOT apply to it; never pad a briefing toward the floor. The kit cells above **summarize** each
> format's expanded kit (there are now ~40 authorable components in the allow-list); the
> authoritative, prop-exact list per format is that format's **`references/mdx-contract.md`**.

### Authoring doctrine (binding for the five long-form formats)

**Components carry knowledge; prose wraps around them.** A component should carry a block of
knowledge the prose would otherwise spend 200–400 words asserting — lead with the chart / diagram /
simulation / figure / table, then wrap prose around it to *interpret*, not to restate. Every
long-form Read must sustain **at least one knowledge-carrying island (Chart / Diagram / Simulation /
Figure / Stepper / Table / Scrolly / StateMachine / …) per ~800–1,000 words of prose** — so a
6,000-word read carries ~6–8 substantive islands, not two. Reach the 20–25 min depth through *more
knowledge-carrying components and more real material* (scenes, data layers, mechanism coverage,
worked examples), never through padding or hedging. **Know and use the FULL per-format kit** — the
authoritative set is each format's `references/mdx-contract.md`, not a memorized subset.

## The one rule above all others: GROUNDING (via the citation ledger)

Every post is **researched like a PhD thesis and grounded in the citation ledger** —
the appraised, triangulated evidence base the **`writers/researcher`** phase builds by
searching *out* from the curated seed cluster to primary sources (papers, datasets,
official records, first-hand accounts). The writer *enhances* massively (depth,
real-data charts, interactivity, cross-source synthesis) but **never invents an
ungrounded topic, fact, number, name, date, or quote.** Every factual claim traces to a
**ledger source** (curated ∪ researched); every `sources[].url` in the frontmatter is a
ledger URL. This is enforced in each skill's **Research**, **Internalize**, and
**Verify** phases and re-checked by the pipeline's `validateDraft` + `factChecker`
against the fact-check gates: **≥90% of claims cite a ledger source** and **≥60% of
load-bearing claims corroborated by ≥2 independent sources.** The tier rubric
(High/Med/Low), triangulation rules, and gate arithmetic live once in
`writers/researcher/SKILL.md`.

## The five-phase authoring chain (every writer skill)

Each skill drives the same explicit, tagged chain. Phases run in strict order and
are marked with `<phase>` tags so the verify step can confirm they ran:

0. **`<phase>Research</phase>`** — invoke the `writers/researcher` methodology: plan
   5–8 questions, literature-search out to primary sources, appraise each into the
   **citation ledger** with its tier, triangulate load-bearing claims to ≥2 independent
   sources. Produces the research dossier + ledger + claims table. **No drafting until
   these exist and clear the gates** (or a `RESEARCH THIN` handoff scopes the piece down).
1. **`<phase>Internalize</phase>`** — read the brief + dossier; extract the single
   thesis, the 2–3 strongest data points / scenes / code examples, and which components
   carry which ideas. Confirm every fact is a claims-table row citing a ledger URL; mark
   anything not in the table `[UNSUPPORTED]` now.
2. **`<phase>Outline</phase>`** — section-by-section outline (heading + intent +
   component placement) against the format's structural template; confirm length
   target and that every cited ledger source appears at least once.
3. **`<phase>Draft</phase>`** — write the full MDX. Data/diagrams arrive *before*
   the prose that explains them. Every named fact carries an inline `<Annotation>`
   or link to a ledger URL. Match founder voice. Run `fetch-data.py` (dispatch/teardown)
   for real numbers before writing any `<Chart>`.
4. **`<phase>Verify + Emit</phase>`** — self-check the frontmatter contract, the
   grounding **fact-check gates** (≥90% claims sourced to the ledger; ≥60% load-bearing
   corroborated; no fabricated/uncited facts; every `source.url` in the ledger), and the
   component allow-list; run `check-links.py`; write the file; print `DONE: <slug>` (or
   `FAIL: <slug> — <reason>` and do not write).

## How the GitHub Action invokes a writer

The generate pipeline plans assignments and writes one brief per post. The Action
selects the matching skill by the brief's `Format:` line and pipes the brief in:

```bash
for brief in data/generation/briefs/*.md; do
  FORMAT=$(grep -m1 '^\*\*Format:\*\*' "$brief" | sed 's/.*: //' | cut -d' ' -f1)
  claude --skill "writers/$FORMAT" < "$brief"
done
pnpm generate verify   # runVerify(): validateDraft + factChecker, blocks bad drafts
```

The skill supplies *craft* (rubric, template, voice, phases); the brief supplies
the *assignment* (title, slug, channel, the curated seed cluster, the exact
frontmatter to emit); the **research phase** supplies the grounded evidence base
(dossier + citation ledger + claims table). Together they produce MDX that builds in
the site and passes `validateDraft` + the fact-check gates.

## What keeps the MDX valid (the contract)

Authoritative contract: **`references/mdx-contract.md`** (one copy per skill).
Summary:

- **Frontmatter** must satisfy `apps/site/src/content.config.ts` *and*
  `packages/generate/src/validate.ts` (they mirror each other): `title`,
  `format` (exact format name), `channels` (non-empty, from the channel vocab),
  `summary`, `publishedAt` (ISO 8601), `sources` (non-empty `{title, url}`; every
  url must be a **citation-ledger source** — curated ∪ researched), `draft: false`.
- **Components**: import from `../../components/mdx`; use *only* names in the
  allow-list (`KNOWN_COMPONENTS` in `packages/generate/src/validate.ts`, now ~40
  components — see each format's `references/mdx-contract.md` for the authoritative,
  prop-exact list) — and within that, only this format's kit. `NarrativeScene` is
  **retired** — do not use it. Interactive islands need a client directive
  (`client:visible` or `client:load`); static Astro components (`Pullquote`, `Figure`,
  `Callout`, `Detail`) take no directive.

## Scripts (stdlib-only, $0, no API keys)

- **`scripts/check-links.py`** (all six) — validates that every `sources[].url`
  in a finished MDX file is reachable; non-zero exit blocks a draft that cites a
  dead link. `python3 scripts/check-links.py path/to/post.mdx`.
- **`scripts/fetch-data.py`** (dispatch + teardown) — pulls real series from FRED,
  World Bank, and Our World in Data into `<Chart>`-ready JSON. On failure, the
  writer falls back to a `<DataTable>` citing numbers directly from the brief —
  never fabricated data. `python3 scripts/fetch-data.py fred UNRATE`.

## Layout

```
writers/
  README.md                  # this file
  researcher/                # the shared RESEARCH phase (runs before every writer)
    SKILL.md                 # methodology: literature search, tier rubric, triangulation,
                             #   convergence, ledger + claims-table shapes, fact-check gates
    references/methodology.md# deep-research adaptation in depth + worked artifact examples
    scripts/fetch-data.py    # REAL numeric series (shared)
  <format>/
    SKILL.md                 # craft rubric + template + 4-phase chain + contract
    references/
      craft.md               # the format's craft imperatives, deep
      template.mdx           # annotated structural skeleton
      exemplars.md           # 2–3 worked exemplars / annotated patterns
      mdx-contract.md        # the frontmatter + component contract (shared copy)
    scripts/
      check-links.py         # (all)
      fetch-data.py          # (dispatch, teardown)
```
