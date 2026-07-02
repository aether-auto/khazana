// apps/site/src/components/mdx/index.ts
// Barrel for MDX-authored interactive islands. Posts import from here.
export { default as Annotation } from "./Annotation.js";
export type { AnnotationProps } from "./Annotation.js";
export { default as Chart } from "./Chart.js";
export type { ChartProps } from "./lib/chart-spec.js";
export { default as Timeline } from "./Timeline.js";
export type { TimelineProps } from "./Timeline.js";
export { default as DataTable } from "./DataTable.js";
export type { DataTableProps } from "./DataTable.js";
export type { TimelineEvent } from "./lib/timeline-scale.js";
export type { Column, Row } from "./lib/table-sort.js";
export { default as Scrolly, ScrollyStep } from "./Scrolly.js";
export type { ScrollyProps, ScrollyStepProps } from "./Scrolly.js";
export { default as ScrollyTimeline } from "./ScrollyTimeline.js";
export type { ScrollyTimelineProps, ScrollyTimelineEvent } from "./ScrollyTimeline.js";
export { default as RunnableCode } from "./RunnableCode.js";
export type { RunnableCodeProps } from "./RunnableCode.js";
export { default as Map } from "./Map.js";
export type { MapProps } from "./Map.js";
export { default as ControlledChart } from "./ControlledChart.js";
export type { ControlledChartProps } from "./ControlledChart.js";
export { default as KellyChart } from "./KellyChart.js";
export type { KellyChartProps } from "./KellyChart.js";
export { default as Model3D } from "./Model3D.js";
export type { Model3DProps } from "./Model3D.js";
export { default as Sidenote } from "./Sidenote.js";
export type { SidenoteProps } from "./Sidenote.js";
export { default as DrawChart } from "./DrawChart.js";
export type { DrawChartProps } from "./DrawChart.js";
export { default as StatBand } from "./StatBand.js";
export type { StatBandProps, Stat } from "./StatBand.js";
export { default as Pullquote } from "./Pullquote.astro";
// ── P0 wave: image + math primitives + shared connective tissue ───────────────
export { default as Figure } from "./Figure.astro";
export type { FigureProps } from "./Figure.astro";
export { default as Math } from "./Math.js";
export type { MathProps, MathStep } from "./Math.js";
export { default as Callout } from "./Callout.astro";
export type { CalloutProps } from "./Callout.astro";
export { default as Detail } from "./Detail.astro";
export type { DetailProps } from "./Detail.astro";
export { default as Definition } from "./Definition.js";
export type { DefinitionProps } from "./Definition.js";
export { default as NarrativeScene } from "./NarrativeScene.js";
export type { NarrativeSceneProps } from "./NarrativeScene.js";
export type {
  PanelSpec,
  MapPanelSpec,
  ChartPanelSpec,
  ScenePanelSpec,
  NarrativeStep,
} from "./lib/narrative-scene.js";
// ── P1 wave: knowledge-carrier + teardown/build primitives ────────────────────
export { default as Diagram } from "./Diagram.js";
export type { DiagramProps } from "./Diagram.js";
export type { DiagramNode, DiagramEdge, EdgeKind, NodeKind } from "./lib/diagram-layout.js";
export { default as Simulation } from "./Simulation.js";
export type { SimulationProps, SimParamSpec } from "./Simulation.js";
export { default as Stepper } from "./Stepper.js";
export type { StepperProps, StepperStep } from "./Stepper.js";
export type { StepperMode } from "./lib/stepper-index.js";
export { default as Quiz } from "./Quiz.js";
export type { QuizProps } from "./Quiz.js";
export type { QuizQuestion, QuizKind } from "./lib/quiz-check.js";
export { default as CodeWalkthrough } from "./CodeWalkthrough.astro";
export type { CodeWalkthroughProps } from "./CodeWalkthrough.astro";
export type { WalkthroughStep } from "./lib/code-walkthrough.js";
export { default as AnnotatedFigure } from "./AnnotatedFigure.js";
export type { AnnotatedFigureProps } from "./AnnotatedFigure.js";
export type { Pin } from "./lib/annotated-figure.js";
