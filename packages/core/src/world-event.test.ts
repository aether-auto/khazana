import { expect, test } from "vitest";
import type { Reporting } from "./world-event.js";
import { ReportingSchema, StanceSchema, ToneSchema, WorldEventSchema } from "./world-event.js";
import { EVENT_SEVERITIES, WORLD_EVENT_CATEGORIES } from "./vocab.js";

const referencedProvenance = {
  sourceId: "gdelt-gkg",
  sourceUrl: "https://api.gdeltproject.org/api/v2/doc/doc?query=example",
  methodUrl: "https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/",
  licenseTier: "redistribute-raw-ok" as const,
  redistribution: true,
  origin: "referenced" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
};

const reporting = (overrides: Partial<Reporting> = {}) => ({
  outletId: "reuters",
  url: "https://reuters.com/example-article",
  headline: "Ceasefire talks resume",
  publishedAt: "2026-07-07T13:00:00.000Z",
  tone: "neutral" as const,
  stance: "neutral" as const,
  frame: "diplomatic breakthrough",
  provenance: referencedProvenance,
  ...overrides,
});

const fullEvent = {
  id: "evt-2026-07-07-001",
  headline: "Ceasefire talks resume in region",
  geo: { lat: 33.5, lng: 36.3, country: "SY" },
  time: "2026-07-07T12:00:00.000Z",
  category: "diplomacy" as const,
  sourceCategoryCode: "042",
  severity: "medium" as const,
  reportings: [
    reporting({ outletId: "reuters", tone: "neutral", stance: "neutral" }),
    reporting({ outletId: "the-hindu", tone: "positive", stance: "supportive", frame: "humanitarian relief" }),
  ],
  provenance: referencedProvenance,
};

test("round-trips a fully-populated WorldEvent fixture with multiple Reporting entries", () => {
  const parsed = WorldEventSchema.parse(fullEvent);
  expect(parsed).toEqual(fullEvent);
  expect(parsed.reportings).toHaveLength(2);
});

test("all seven WorldEventCategory values parse", () => {
  for (const category of WORLD_EVENT_CATEGORIES) {
    expect(WorldEventSchema.parse({ ...fullEvent, category }).category).toBe(category);
  }
});

test("all four EventSeverity values parse", () => {
  for (const severity of EVENT_SEVERITIES) {
    expect(WorldEventSchema.parse({ ...fullEvent, severity }).severity).toBe(severity);
  }
});

test("all four Tone values parse", () => {
  for (const tone of ["positive", "negative", "neutral", "mixed"] as const) {
    expect(ToneSchema.parse(tone)).toBe(tone);
  }
});

test("all four Stance values parse", () => {
  for (const stance of ["supportive", "critical", "neutral", "mixed"] as const) {
    expect(StanceSchema.parse(stance)).toBe(stance);
  }
});

test("rejects unknown category, severity, tone, and stance values", () => {
  expect(WorldEventSchema.safeParse({ ...fullEvent, category: "sports" }).success).toBe(false);
  expect(WorldEventSchema.safeParse({ ...fullEvent, severity: "catastrophic" }).success).toBe(false);
  expect(ToneSchema.safeParse("furious").success).toBe(false);
  expect(StanceSchema.safeParse("hostile").success).toBe(false);
});

test("each Reporting carries full Provenance", () => {
  const parsed = ReportingSchema.parse(reporting());
  expect(parsed.provenance).toEqual(referencedProvenance);
});
