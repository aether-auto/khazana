import type { Uncertainty } from "@khazana/core";
import type { RangeDatum } from "../../components/mdx/lib/rangeplot-scale.js";

type RangeReadout = {
  kind: "confidenceInterval" | "standardError" | "raterSpread";
  sampleCount: number;
  rangeDatum: RangeDatum;
};

type SampleSizeReadout = {
  kind: "sampleSize";
  sampleCount: number;
  statedSampleSize: number;
};

type NoUncertaintyReadout = {
  kind: "none";
  sampleCount: number;
};

export type UncertaintyStripReadout = RangeReadout | SampleSizeReadout | NoUncertaintyReadout;

export function uncertaintyStripReadout(
  score: number,
  uncertainty: Uncertainty,
  n: number,
  label: string = "Score",
): UncertaintyStripReadout {
  switch (uncertainty.kind) {
    case "confidenceInterval":
      return {
        kind: uncertainty.kind,
        sampleCount: n,
        rangeDatum: { label, low: uncertainty.low, mid: score, high: uncertainty.high },
      };
    case "standardError":
      return {
        kind: uncertainty.kind,
        sampleCount: n,
        rangeDatum: {
          label,
          low: score - 1.96 * uncertainty.se,
          mid: score,
          high: score + 1.96 * uncertainty.se,
        },
      };
    case "raterSpread":
      return {
        kind: uncertainty.kind,
        sampleCount: n,
        rangeDatum: {
          label,
          low: uncertainty.min,
          mid: score,
          high: uncertainty.max,
          n: uncertainty.raterCount,
        },
      };
    case "sampleSize":
      return { kind: uncertainty.kind, sampleCount: n, statedSampleSize: uncertainty.n };
    case "none":
      return { kind: uncertainty.kind, sampleCount: n };
    default: {
      const exhaustive: never = uncertainty;
      throw new Error(`uncertaintyStripReadout: unhandled uncertainty ${JSON.stringify(exhaustive)}`);
    }
  }
}
