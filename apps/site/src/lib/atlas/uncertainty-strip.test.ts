import { UncertaintySchema } from "@khazana/core";
import { expect, test } from "vitest";
import { uncertaintyStripReadout } from "./uncertainty-strip.js";

test("confidenceInterval uses direct bounds, the passed sample count, and a stable default label", () => {
  const uncertainty = UncertaintySchema.parse({
    kind: "confidenceInterval",
    low: 42.1,
    high: 57.9,
    level: 0.95,
  });

  const readout = uncertaintyStripReadout(50, uncertainty, 240);

  expect(readout).toEqual({
    kind: "confidenceInterval",
    sampleCount: 240,
    rangeDatum: { label: "Score", low: 42.1, mid: 50, high: 57.9 },
  });
});

test("standardError uses the unrounded 1.96 multiplier around the score", () => {
  const uncertainty = UncertaintySchema.parse({ kind: "standardError", se: 0.37 });

  const readout = uncertaintyStripReadout(33.333, uncertainty, 81, "Reliability");

  expect(readout.kind).toBe("standardError");
  if (!("rangeDatum" in readout)) throw new Error("standardError must yield a range");
  expect(readout.rangeDatum).toEqual({
    label: "Reliability",
    low: 33.333 - 1.96 * 0.37,
    mid: 33.333,
    high: 33.333 + 1.96 * 0.37,
  });
  expect(readout.rangeDatum.low).toBeLessThan(readout.rangeDatum.high);
});

test("raterSpread uses direct min and max with raterCount on the range datum", () => {
  const uncertainty = UncertaintySchema.parse({
    kind: "raterSpread",
    min: -0.6,
    max: 0.4,
    raterCount: 8,
  });

  const readout = uncertaintyStripReadout(-0.1, uncertainty, 120, "Lean");

  expect(readout).toEqual({
    kind: "raterSpread",
    sampleCount: 120,
    rangeDatum: { label: "Lean", low: -0.6, mid: -0.1, high: 0.4, n: 8 },
  });
});

test("sampleSize remains an n-only readout with no fabricated range datum", () => {
  const uncertainty = UncertaintySchema.parse({ kind: "sampleSize", n: 1_204 });

  const readout = uncertaintyStripReadout(72, uncertainty, 240, "Reliability");

  expect(readout).toEqual({
    kind: "sampleSize",
    sampleCount: 240,
    statedSampleSize: 1_204,
  });
  expect("rangeDatum" in readout).toBe(false);
});

test("none remains an explicit no-uncertainty readout with no fabricated range datum", () => {
  const uncertainty = UncertaintySchema.parse({ kind: "none" });

  const readout = uncertaintyStripReadout(72, uncertainty, 240, "Reliability");

  expect(readout).toEqual({ kind: "none", sampleCount: 240 });
  expect("rangeDatum" in readout).toBe(false);
});
