// apps/site/src/lib/atlas/indicator-to-range.ts
/**
 * Adapts a World Data Spine `Indicator` into the `RangeDatum` shape the
 * <RangePlot> layout engine consumes. Pure function, no DOM/network/build
 * dependency — matches rangeplot-scale.ts's own pure-function house style.
 * Mapping per docs/cofounder/specs/2026-07-... government-ledger-design.md §4.2.
 */

import type { Indicator } from "@khazana/core";
import type { RangeDatum } from "../../components/mdx/lib/rangeplot-scale.js";

export function indicatorToRangeDatum(indicator: Indicator, label: string): RangeDatum {
  const { uncertainty } = indicator.provenance;
  const mid = indicator.normalizedScore;

  switch (uncertainty.kind) {
    case "confidenceInterval":
      return { label, low: uncertainty.low, mid, high: uncertainty.high };
    case "standardError":
      return { label, low: mid - uncertainty.se, mid, high: mid + uncertainty.se };
    case "raterSpread":
      return { label, low: uncertainty.min, mid, high: uncertainty.max, n: uncertainty.raterCount };
    case "sampleSize":
      return { label, low: mid, mid, high: mid, n: uncertainty.n };
    case "none":
      return { label, low: mid, mid, high: mid };
    default: {
      const _exhaustive: never = uncertainty;
      throw new Error(`indicatorToRangeDatum: unhandled Uncertainty kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
