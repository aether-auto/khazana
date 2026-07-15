import { expect, test } from "vitest";
import { IndicatorSchema } from "@khazana/core";
import { indicatorToRangeDatum } from "./indicator-to-range.js";

const baseProvenance = {
  sourceId: "world-bank-wdi",
  sourceUrl: "https://api.worldbank.org/v2/country/IN/indicator/NY.GDP.MKTP.CD",
  methodUrl: "https://datahelpdesk.worldbank.org/knowledgebase/articles/906519",
  licenseTier: "redistribute-raw-ok" as const,
  redistribution: true,
  origin: "referenced" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
};

const baseIndicator = {
  id: "abc123",
  field: "macro" as const,
  key: "NY.GDP.MKTP.CD",
  label: "GDP (current US$)",
  value: 3730000000000,
  unit: "USD",
  normalizedScore: 62,
  country: "IND",
  period: "2024",
};

test("confidenceInterval kind maps low/high from the variant, mid from normalizedScore, no n", () => {
  const indicator = IndicatorSchema.parse({
    ...baseIndicator,
    provenance: {
      ...baseProvenance,
      uncertainty: { kind: "confidenceInterval", low: 55, high: 70, level: 0.95 },
    },
  });
  const datum = indicatorToRangeDatum(indicator, "India GDP");
  expect(datum).toEqual({ label: "India GDP", low: 55, mid: 62, high: 70 });
  expect(datum.low).toBeLessThan(datum.high);
  expect("n" in datum).toBe(false);
});

test("standardError kind produces a symmetric mid +/- se band, no n", () => {
  const indicator = IndicatorSchema.parse({
    ...baseIndicator,
    provenance: {
      ...baseProvenance,
      uncertainty: { kind: "standardError", se: 4 },
    },
  });
  const datum = indicatorToRangeDatum(indicator, "India GDP");
  expect(datum).toEqual({ label: "India GDP", low: 58, mid: 62, high: 66 });
  expect(datum.low).toBeLessThan(datum.high);
  expect("n" in datum).toBe(false);
});

test("raterSpread kind maps low/high from min/max, mid from normalizedScore, n from raterCount", () => {
  const indicator = IndicatorSchema.parse({
    ...baseIndicator,
    provenance: {
      ...baseProvenance,
      uncertainty: { kind: "raterSpread", min: 48, max: 80, raterCount: 6 },
    },
  });
  const datum = indicatorToRangeDatum(indicator, "India GDP");
  expect(datum).toEqual({ label: "India GDP", low: 48, mid: 62, high: 80, n: 6 });
  expect(datum.low).toBeLessThan(datum.high);
});

test("sampleSize kind collapses to a true point at normalizedScore, n echoes the sample size", () => {
  const indicator = IndicatorSchema.parse({
    ...baseIndicator,
    provenance: {
      ...baseProvenance,
      uncertainty: { kind: "sampleSize", n: 1200 },
    },
  });
  const datum = indicatorToRangeDatum(indicator, "India GDP");
  expect(datum).toEqual({ label: "India GDP", low: 62, mid: 62, high: 62, n: 1200 });
  expect(datum.low).toBe(datum.mid);
  expect(datum.mid).toBe(datum.high);
});

test("none kind collapses to a true point at normalizedScore, no n", () => {
  const indicator = IndicatorSchema.parse({
    ...baseIndicator,
    provenance: {
      ...baseProvenance,
      uncertainty: { kind: "none" },
    },
  });
  const datum = indicatorToRangeDatum(indicator, "India GDP");
  expect(datum).toEqual({ label: "India GDP", low: 62, mid: 62, high: 62 });
  expect(datum.low).toBe(datum.mid);
  expect(datum.mid).toBe(datum.high);
  expect("n" in datum).toBe(false);
});
