// apps/site/src/components/mdx/lib/narrative-scene.ts
/**
 * Pure types + helpers for <NarrativeScene>. A NarrativeScene is true
 * scrollytelling for NARRATIVE (not just charts): a sticky visual pane that
 * cross-fades between panels as stepped prose scrolls past. Steps are passed
 * as a SERIALIZABLE `steps` prop (same architecture as <Scrolly>) so the island
 * can render the panels in its OWN React tree — Astro hands MDX children to an
 * island as opaque virtual nodes it cannot introspect.
 *
 * No DOM here — only the serializable contracts + step bookkeeping, so it's
 * testable offline. Active-step resolution reuses scrolly-state.
 */
import type { ChartProps } from "./chart-spec.js";

/** A geographic panel: the world map with `regions` (iso3) highlighted. */
export interface MapPanelSpec {
  kind: "map";
  /** iso3 codes to highlight this step; different regions per step = motion. */
  regions: string[];
  /** optional weight per region (iso3 -> 0..1) for a graded highlight. */
  weights?: Record<string, number>;
  caption?: string;
}

/** A data panel: an existing <Chart> rendered inside the scene. */
export interface ChartPanelSpec extends ChartProps {
  kind: "chart";
}

/** A typographic / SVG "scene" panel for moments with no data viz. */
export interface ScenePanelSpec {
  kind: "scene";
  /** big Fraunces headline. */
  headline: string;
  /** optional supporting line under the headline. */
  sub?: string;
  /** optional mono kicker above the headline (e.g. a date or place). */
  kicker?: string;
}

/** The serializable union of panels a NarrativeScene step can pin. */
export type PanelSpec = MapPanelSpec | ChartPanelSpec | ScenePanelSpec;

export interface NarrativeStep {
  /** the visual pinned while this step is active. */
  panel: PanelSpec;
  /** the step's prose, as an HTML string (rendered into the steps column). */
  prose: string;
}

/**
 * Default highlight weight applied to a region named with no explicit weight.
 * The map's choropleth scale spans [min,max]; a flat 1 makes every named
 * region read at full signal while unnamed regions stay at NO_DATA_FILL.
 */
export const DEFAULT_REGION_WEIGHT = 1;

/**
 * Build the `values` map (iso3 -> weight) that <Map> consumes from a map
 * panel's `regions` + optional `weights`. Pure: a region with no explicit
 * weight gets DEFAULT_REGION_WEIGHT; explicit weights win. Duplicate regions
 * collapse (last weight wins via the regions pass, explicit weights override).
 */
export function regionValues(panel: MapPanelSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const iso3 of panel.regions) {
    if (!iso3) continue;
    out[iso3] = DEFAULT_REGION_WEIGHT;
  }
  if (panel.weights) {
    for (const [iso3, w] of Object.entries(panel.weights)) {
      if (!iso3) continue;
      out[iso3] = w;
    }
  }
  return out;
}

/** Narrow a PanelSpec to its kind without `any`; handy for exhaustive renders. */
export function panelKind(panel: PanelSpec): PanelSpec["kind"] {
  return panel.kind;
}
