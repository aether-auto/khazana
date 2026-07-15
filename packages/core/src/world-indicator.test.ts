import { expect, test } from "vitest";
import { CountryCodeSchema, IndicatorSchema, PeriodSchema, makeIndicatorId } from "./world-indicator.js";

const baseProvenance = {
  sourceId: "world-bank-wdi",
  sourceUrl: "https://api.worldbank.org/v2/country/IN/indicator/NY.GDP.MKTP.CD",
  methodUrl: "https://datahelpdesk.worldbank.org/knowledgebase/articles/906519",
  licenseTier: "redistribute-raw-ok" as const,
  redistribution: true,
  origin: "referenced" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
};

test("round-trips a fully-populated Indicator fixture including subnational", () => {
  const full = {
    id: "abc123",
    field: "macro" as const,
    key: "NY.GDP.MKTP.CD",
    label: "GDP (current US$)",
    value: 3730000000000,
    unit: "USD",
    normalizedScore: 0.82,
    country: "IND",
    subnational: { level: "state", code: "IN-MH", name: "Maharashtra" },
    period: "2024",
    provenance: baseProvenance,
  };
  const parsed = IndicatorSchema.parse(full);
  expect(parsed).toEqual(full);
});

test("round-trips a minimal Indicator fixture without subnational or normalizedScore", () => {
  const minimal = {
    id: "abc124",
    field: "fiscal" as const,
    key: "GC.DOD.TOTL.GD.ZS",
    label: "Central government debt, total (% of GDP)",
    value: 82.3,
    unit: "% of GDP",
    country: "USA",
    period: "2024-Q1",
    provenance: baseProvenance,
  };
  const parsed = IndicatorSchema.parse(minimal);
  expect(parsed).toEqual(minimal);
});

// --- CountryCodeSchema ---

test("CountryCodeSchema accepts valid alpha-3 codes", () => {
  for (const code of ["USA", "IND", "GBR", "ZZZ"]) {
    expect(CountryCodeSchema.parse(code)).toBe(code);
  }
});

test("CountryCodeSchema rejects malformed casing/length", () => {
  for (const bad of ["usa", "US", "USAA", "Ind", "12A", ""]) {
    expect(() => CountryCodeSchema.parse(bad)).toThrow();
  }
});

// --- PeriodSchema ---

test("PeriodSchema accepts all four documented grains", () => {
  for (const good of ["2024", "2024-Q1", "2024-Q4", "2024-06", "2024-12", "2024-06-15"]) {
    expect(PeriodSchema.parse(good)).toBe(good);
  }
});

test("PeriodSchema rejects malformed period strings", () => {
  for (const bad of ["2024-13", "2024-Q5", "2024-2-3", "24", "2024-00", "2024-Q0", "not-a-period", "2024-13-01"]) {
    expect(() => PeriodSchema.parse(bad)).toThrow();
  }
});

// --- makeIndicatorId ---

test("makeIndicatorId is deterministic for identical inputs", () => {
  const a = makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "IND", "2024");
  const b = makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "IND", "2024");
  expect(a).toBe(b);
});

test("makeIndicatorId changes when any single input changes", () => {
  const base = makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "IND", "2024");
  expect(makeIndicatorId("other-source", "macro", "NY.GDP.MKTP.CD", "IND", "2024")).not.toBe(base);
  expect(makeIndicatorId("world-bank-wdi", "fiscal", "NY.GDP.MKTP.CD", "IND", "2024")).not.toBe(base);
  expect(makeIndicatorId("world-bank-wdi", "macro", "OTHER.KEY", "IND", "2024")).not.toBe(base);
  expect(makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "USA", "2024")).not.toBe(base);
  expect(makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "IND", "2023")).not.toBe(base);
});

test("makeIndicatorId is sensitive to the optional subnationalCode, both present-vs-absent and value change", () => {
  const noSubnational = makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "IND", "2024");
  const withSubnational = makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "IND", "2024", "IN-MH");
  const withDifferentSubnational = makeIndicatorId("world-bank-wdi", "macro", "NY.GDP.MKTP.CD", "IND", "2024", "IN-DL");
  expect(withSubnational).not.toBe(noSubnational);
  expect(withDifferentSubnational).not.toBe(noSubnational);
  expect(withDifferentSubnational).not.toBe(withSubnational);
});
