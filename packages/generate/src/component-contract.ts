// packages/generate/src/component-contract.ts
//
// The canonical, machine-readable set of components the writer mdx-contract docs
// document. This is the single source of truth that the per-format
// `.claude/skills/writers/<format>/references/mdx-contract.md` allow-list blocks
// mirror in prose.
//
// The `contract set equals KNOWN_COMPONENTS` drift test (validate.test.ts) fails
// if this list ever diverges from `KNOWN_COMPONENTS` — killing the historical
// "writers told 10, 16 legal" class of bug permanently. When a component is
// added to the barrel + `KNOWN_COMPONENTS`, it MUST be added here too (and the
// contract docs updated), atomically.
export const CONTRACT_COMPONENTS = [
  "Annotation",
  "Chart",
  "Timeline",
  "DataTable",
  "Scrolly",
  "ScrollyStep",
  "ScrollyTimeline",
  "RunnableCode",
  "Map",
  "ControlledChart",
  "KellyChart",
  "Model3D",
  "Sidenote",
  "DrawChart",
  "StatBand",
  "Pullquote",
  // P0 wave: image + math primitives + shared connective tissue.
  "Figure",
  "Math",
  "Callout",
  "Detail",
  "Definition",
  // P1 wave: knowledge-carrier + teardown/build primitives.
  "Diagram",
  "Simulation",
  "Stepper",
  "Quiz",
  "CodeWalkthrough",
  "AnnotatedFigure",
  // P2 wave: dispatch data-viz depth + chronicle visuals.
  "SmallMultiples",
  "Distribution",
  "Scatter",
  "Slopegraph",
  "RangePlot",
  "CompareSlider",
  "CastGrid",
  "EventCascade",
  // P3 wave: teardown/primer + build-log + chronicle/dispatch kit.
  "StateMachine",
  "LayerStack",
  "Checklist",
  "GanttStrip",
  "RouteMap",
  // X + military/strategy wave: flow diagram + theater kit.
  "Sankey",
  "BattleMap",
  "OrderOfBattle",
  "ForceComparison",
  // X wave: generalized reader-controlled model.
  "ParameterPlay",
] as const;

export type ContractComponentName = (typeof CONTRACT_COMPONENTS)[number];

/** A format that has a curated component kit (mirrors `@khazana/core` FORMAT_NAMES). */
export type FormatKit =
  | "chronicle"
  | "dispatch"
  | "field-notes"
  | "teardown"
  | "primer"
  | "build-log"
  | "theater";

export interface ComponentMetadata {
  /** One-line "what it is / when to reach for it" — the catalog's palette entry. */
  blurb: string;
  /** Compact prop summary (names + types), NOT the exhaustive mdx-contract.md shape. */
  props: string;
  /** Which format(s) this component belongs to per that format's SKILL.md kit + `references/mdx-contract.md`. */
  kits: readonly FormatKit[];
}

/**
 * Per-component metadata for the writer-facing catalog (`generate catalog` /
 * `component-catalog.ts`). Keys MUST equal `CONTRACT_COMPONENTS` exactly (see
 * the parity test in `component-contract.test.ts`) — this is the SAME source
 * of truth extended with the kit + blurb the catalog needs, not a second list
 * that can drift from it.
 *
 * `kits` is hand-curated from each format's `SKILL.md` "Your interactive kit" /
 * "Density target" prose and cross-checked against that format's
 * `references/mdx-contract.md` (the authoritative prop-exact list) and real
 * corpus usage in `content/blog/*.mdx`. field-notes is the deliberate
 * exception: its kit is Annotation + DataTable (primary), StatBand/Pullquote/
 * Callout (sparingly, at most once) — nothing else, per its own SKILL.md.
 */
export const COMPONENT_METADATA: Record<ContractComponentName, ComponentMetadata> = {
  Annotation: {
    blurb: "Inline cited term — the primary citation apparatus; renders as marginalia without breaking prose.",
    props: "term, note",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater", "field-notes"],
  },
  Chart: {
    blurb: "Declarative line/bar/area/dot chart (Observable Plot). Reach for it for a trend, comparison, or relationship.",
    props: "mark: line|bar|area|dot, x, y, data[], series?, height?, caption?",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater"],
  },
  Timeline: {
    blurb: "Horizontal SVG timeline of dated events. Reach for it to anchor chronology or a consequence arc.",
    props: "events: { date, label, detail }[], caption?",
    kits: ["chronicle", "dispatch", "teardown", "primer", "theater"],
  },
  DataTable: {
    blurb: "Sortable/filterable table, optional summed footer (BOM totals). Reach for it for the structured detail a chart can't hold.",
    props: "columns: { key, label, type, align? }[], rows[], total?, caption?",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater", "field-notes"],
  },
  Scrolly: {
    blurb: "Sticky-graphic, stepped-prose scrollytelling shell. Reach for it for the single climactic sequence.",
    props: "caption?; children are <ScrollyStep> blocks",
    kits: ["chronicle", "dispatch", "teardown", "primer", "theater"],
  },
  ScrollyStep: {
    blurb: "One step of a <Scrolly> sequence: a pinned graphic + prose that scrolls past it.",
    props: "graphic: JSX (usually <Chart>/<Map>/<Timeline>); children = step prose",
    kits: ["chronicle", "dispatch", "teardown", "primer", "theater"],
  },
  ScrollyTimeline: {
    blurb: "A scroll/drag-driven playhead walking a long dated arc, each stop with its own prose panel. Reach for it for a long chronology with a distinct beat per date.",
    props: "events: { date, label, detail, prose }[], caption?",
    kits: ["chronicle"],
  },
  RunnableCode: {
    blurb: "Editable, runnable JS sandbox (CodeMirror + worker). Reach for it at the moment of confusion, when running beats describing.",
    props: "code: JS template-literal string, caption?, timeoutMs? (default 2000)",
    kits: ["dispatch", "teardown", "primer", "build-log"],
  },
  Map: {
    blurb: "World/regional choropleth (ISO3 keys). Reach for it to situate the geography before the narrative deepens.",
    props: "values: Record<iso3, number>, labels?: Record<iso3, string>, caption?",
    kits: ["chronicle", "dispatch", "theater"],
  },
  ControlledChart: {
    blurb: "Reader-controlled decay-curve instrument (a slider recomputes the curve live) — the bespoke predecessor to ParameterPlay. Reach for it for a cost/decay argument the reader should steer.",
    props: "start?, floor?, rate?, span?, threshold?, unit?, caption?",
    kits: ["dispatch"],
  },
  KellyChart: {
    blurb: "Reader-controlled Kelly-criterion growth-rate curve — two sliders (win probability, payoff odds) recompute f* live. Reach for it for a betting/sizing argument.",
    props: "p?, b?, caption?",
    kits: ["dispatch"],
  },
  Model3D: {
    blurb: "The RARE inline 3D viewer (drag-to-rotate). ONE per article max, only when the subject is genuinely spatial — a printed part or physical mechanism.",
    props: "src? (committed .glb from getImage-style pipeline), alt?, label?, detail?, caption?",
    kits: ["teardown", "build-log"],
  },
  Sidenote: {
    blurb: "Margin aside / numbered footnote — the everyday marginalia primitive. Reach for it for a caveat or aside that would clutter the line.",
    props: "n, href?, source?; children = the note body",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater"],
  },
  DrawChart: {
    blurb: "Draw-on-scroll line chart; each stroke draws itself as the figure enters the viewport. Reach for it for a trajectory that should feel drawn, not static.",
    props: "series: { id, label, points: {x,y}[] }[] (or single data[]), logY?, xLabel?, yLabel?, duration?, caption?",
    kits: ["dispatch"],
  },
  StatBand: {
    blurb: "Dramatic figure row that counts up on scroll-in. Earn it when scale/rate/delta genuinely IS the lede.",
    props: "stats: { value, prefix?, suffix?, decimals?, group?, label, sub?, href? }[], caption?, duration?",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater", "field-notes"],
  },
  Pullquote: {
    blurb: "Static, dramatic primary-source block (quote/document/telegram/headline). Earn it only when the verbatim original beats paraphrase.",
    props: "cite?, href?, kind?: quote|document|telegram|headline; children = quote text",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater", "field-notes"],
  },
  Figure: {
    blurb: "The image primitive — local, committed, build-optimized asset with caption/credit/sourceUrl. Reach for it wherever the subject is genuinely visual.",
    props: "src: ImageMetadata (imported), alt, caption?, credit?, sourceUrl?, zoom?, bleed?, aspect?",
    kits: ["chronicle", "primer", "build-log", "theater"],
  },
  Math: {
    blurb: "Display equation / numbered derivation (KaTeX). Reach for it instead of spelling math out in prose.",
    props: "tex, steps?: { tex, note? }[], label?, caption?, numbered?",
    kits: ["dispatch", "teardown", "primer"],
  },
  Callout: {
    blurb: "Boxed key-insight/warning/note, single left hairline. Reach for it to set apart the one line that must not be missed.",
    props: "kind: note|warning|key-insight|aside|caution, title?; children = note body",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater", "field-notes"],
  },
  Detail: {
    blurb: "Progressive-disclosure \"go deeper\" block (native <details>, zero JS). Reach for it to add depth without bloating the linear read.",
    props: "summary, defaultOpen?; children = expandable body",
    kits: ["chronicle", "dispatch", "teardown", "primer", "build-log", "theater"],
  },
  Definition: {
    blurb: "Glossary tooltip that TEACHES a term (vs Annotation, which cites). Reach for it the first time a term of art appears.",
    props: "term, def, children? (rich popover body)",
    kits: ["chronicle", "dispatch", "teardown", "primer", "theater"],
  },
  Diagram: {
    blurb: "Node-edge architecture/flow figure. The core primitive for showing how the parts of a system connect.",
    props: "nodes: { id, label, x, y, kind? }[], edges: { from, to, label?, kind? }[], caption?, highlightOnHover?",
    kits: ["dispatch", "teardown", "primer", "build-log", "theater"],
  },
  Simulation: {
    blurb: "Interactive canvas sandbox with reader sliders (built-in kernels: walk/sir/wave/life). Reach for it when the reader should tune parameters and watch.",
    props: "kind: walk|sir|wave|life, params?: { key, label, min, max, default, step }[], caption?, height?",
    kits: ["dispatch", "primer"],
  },
  Stepper: {
    blurb: "Numbered step sequence, one step visible at a time. Reach for it for a \"first this, then this\" mechanism or build sequence.",
    props: "steps: { title, body, figure? }[] (body/figure are HTML strings), mode?: reveal|tabs|all, caption?",
    kits: ["teardown", "primer", "build-log"],
  },
  Quiz: {
    blurb: "Check-your-understanding at the crux. Reach for it to make the reader commit to a prediction before the reveal.",
    props: "questions: { prompt, choices?, answer, explain, kind? }[], caption?",
    kits: ["dispatch", "teardown", "primer"],
  },
  CodeWalkthrough: {
    blurb: "Narrated, syntax-highlighted STATIC code where narration steps highlight line ranges. Complements RunnableCode for code too large/non-JS to run.",
    props: "code: string, lang?, steps: { lines: [start,end], note }[], caption?",
    kits: ["teardown", "primer", "build-log"],
  },
  AnnotatedFigure: {
    blurb: "Numbered pins over an image — \"here is what to look at.\" Reach for it when a photo rewards guided attention.",
    props: "src (from getImage()), width, height, alt, caption?, credit?, sourceUrl?, pins: { x, y, label, note }[]",
    kits: ["chronicle", "theater"],
  },
  SmallMultiples: {
    blurb: "A grid of the same chart faceted by category (the Tufte staple). Reach for it when one pattern should hold or break across many series at once.",
    props: "data[], mark: line|bar|area|dot, x, y, facet, columns?, sharedY?, caption?, height?",
    kits: ["dispatch"],
  },
  Distribution: {
    blurb: "Histogram/density with an optional threshold marker line. Reach for it when the spread or a cutoff — not the mean — is the point.",
    props: "data[], value, bins?, marker?: { at, label }[], mark?: hist|density, caption?, valueLabel?, height?",
    kits: ["dispatch"],
  },
  Scatter: {
    blurb: "X/Y relationship with an optional linear fit. Reach for it to show a correlation and how tight it is.",
    props: "data[], x, y, size?, color?, fit?: linear|none, caption?, xLabel?, yLabel?, height?",
    kits: ["dispatch"],
  },
  Slopegraph: {
    blurb: "Before/after ranking or value reordering across two columns. Reach for it when who moved past whom is the story.",
    props: "data: { label, before, after }[], beforeLabel, afterLabel, caption?",
    kits: ["dispatch"],
  },
  RangePlot: {
    blurb: "Dot-plus-range (CI / min-max / IQR) by category — the honest alternative to bars-with-error-caps.",
    props: "data: { label, low, mid, high, n? }[], caption?, unit?",
    kits: ["dispatch"],
  },
  CompareSlider: {
    blurb: "Before/after image or map wipe. Reach for it when the insight IS the difference between two states.",
    props: "before, after (from getImage()), width, height, alt, beforeLabel?, afterLabel?, caption?, orientation?",
    kits: ["chronicle", "teardown", "build-log", "theater"],
  },
  CastGrid: {
    blurb: "Static cast-of-characters/commanders card grid. Reach for it when the reader must hold several named actors at once.",
    props: "cast: { name, role, note, img?, sourceUrl? }[], caption?",
    kits: ["chronicle", "theater"],
  },
  EventCascade: {
    blurb: "Vertical causal chain (X → because → Y → therefore → Z), distinct from time-scaled Timeline. Reach for it for a chain of consequences.",
    props: "nodes: { label, detail, kind?: cause|effect|turning-point }[], caption?",
    kits: ["chronicle", "dispatch", "teardown", "theater"],
  },
  StateMachine: {
    blurb: "A token walked through states/transitions (a handshake, a parser, a protocol). Reach for it whenever the mechanism IS a set of states and transitions.",
    props: "states: { id, label, x, y }[], transitions: { from, to, on }[], start, sequence?, caption?",
    kits: ["teardown", "primer"],
  },
  LayerStack: {
    blurb: "An exploded/stacked layer view (OSI model, a rendering pipeline). Reach for it for any layered system where the layering is the point.",
    props: "layers: { label, note, detail? }[], orientation?, caption?",
    kits: ["teardown", "primer"],
  },
  Checklist: {
    blurb: "Interactive, persistent reproduce-this checklist the reader ticks off. Perfect for a closing \"Reproduce this\" section.",
    props: "items: { label, note?, href? }[], title?, caption?",
    kits: ["build-log"],
  },
  GanttStrip: {
    blurb: "A phase/timeline strip of bars. Reach for it to lay out build phases or a rollout over time.",
    props: "tasks: { label, start, end, note? }[], unit?: day|hr, caption?",
    kits: ["dispatch", "build-log"],
  },
  RouteMap: {
    blurb: "Map + great-circle routes/arcs/points. Reach for it for movement across geography — a march, a crossing, a supply line.",
    props: "routes?: { from: [lng,lat], to: [lng,lat], label?, kind? }[], points?: { at, label }[], values?, labels?, caption?",
    kits: ["chronicle", "dispatch", "theater"],
  },
  Sankey: {
    blurb: "Flow/allocation diagram. Reach for it when the breakdown of a total is the point (budget, force strength, casualties).",
    props: "nodes: { id, label? }[], links: { source, target, value }[] (DAG), unit?, caption?",
    kits: ["dispatch", "teardown", "theater"],
  },
  BattleMap: {
    blurb: "Phase-by-phase tactical map over a committed base image, with a phase scrubber. Theater's spine — one phase per narrative beat.",
    props: "src/width/height (from getImage()), alt, caption?, sides: { id, label, tone? }[], phases: PhaseSpec[]",
    kits: ["theater"],
  },
  OrderOfBattle: {
    blurb: "Static force-structure roster (sides → formations → units), expandable via native <details>. Reach for it for command/formation structure.",
    props: "sides: { id, label, commander?, tone?, formations: Formation[] }[], caption?",
    kits: ["theater"],
  },
  ForceComparison: {
    blurb: "Head-to-head diverging-bar comparison of forces/casualties. Reach for it twice — the strength ratio going in, the butcher's bill coming out.",
    props: "sides: { label, tone? }[], metrics: { label, values: number[], unit?, higherIsWorse? }[], caption?",
    kits: ["theater"],
  },
  ParameterPlay: {
    blurb: "N reader sliders bound to an author-supplied formula, live curve + readouts — the generalized reader-controlled model. Reach for it for a NEW tunable relationship a fixed component doesn't cover.",
    props: "params: { key, label, min, max, default, step, unit? }[], expr, xRange, readouts?: { label, expr, unit? }[], caption?",
    kits: ["dispatch", "primer"],
  },
};
