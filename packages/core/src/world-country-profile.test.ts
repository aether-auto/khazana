import { expect, test } from "vitest";
import { CountryProfileSchema, IndicatorGroupSchema, SubnationalProfileSchema } from "./world-country-profile.js";

const provenance = {
  sourceId: "world-bank-wdi",
  sourceUrl: "https://api.worldbank.org/v2/country/IN/indicator/NY.GDP.MKTP.CD",
  methodUrl: "https://datahelpdesk.worldbank.org/knowledgebase/articles/906519",
  licenseTier: "redistribute-raw-ok" as const,
  redistribution: true,
  origin: "referenced" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
};

const indicator = {
  id: "abc123",
  field: "macro" as const,
  key: "NY.GDP.MKTP.CD",
  label: "GDP (current US$)",
  value: 3730000000000,
  unit: "USD",
  normalizedScore: 82,
  country: "IND",
  period: "2024",
  provenance,
};

const indicatorGroup = { field: "macro" as const, indicators: [indicator] };

test("IndicatorGroupSchema round-trips", () => {
  expect(IndicatorGroupSchema.parse(indicatorGroup)).toEqual(indicatorGroup);
});

test("SubnationalProfileSchema round-trips", () => {
  const sub = { level: "state", code: "IN-MH", name: "Maharashtra", fields: [indicatorGroup] };
  expect(SubnationalProfileSchema.parse(sub)).toEqual(sub);
});

test("round-trips a fully-populated CountryProfile fixture including nested SubnationalProfile", () => {
  const full = {
    country: "IND",
    name: "India",
    region: "South Asia",
    updatedAt: "2026-07-07T12:00:00.000Z",
    fields: [indicatorGroup],
    subnational: [{ level: "state", code: "IN-MH", name: "Maharashtra", fields: [indicatorGroup] }],
  };
  const parsed = CountryProfileSchema.parse(full);
  expect(parsed).toEqual(full);
});

test("SubnationalProfileSchema rejects an unsupported level grain", () => {
  const sub = { level: "province", code: "IN-MH", name: "Maharashtra", fields: [indicatorGroup] };
  expect(() => SubnationalProfileSchema.parse(sub)).toThrow();
});

test("subnational defaults to [] when the field is omitted entirely", () => {
  const withoutSubnational = {
    country: "IND",
    name: "India",
    updatedAt: "2026-07-07T12:00:00.000Z",
    fields: [indicatorGroup],
  };
  const parsed = CountryProfileSchema.parse(withoutSubnational);
  expect(parsed.subnational).toEqual([]);
});
