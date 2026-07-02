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
] as const;
