import { expect, test } from "vitest";
import {
  CHANNELS, ChannelSchema, SourceTypeSchema, FormatNameSchema,
  LICENSE_TIERS, LicenseTierSchema,
  INDICATOR_FIELDS, IndicatorFieldSchema,
  WORLD_EVENT_CATEGORIES, WorldEventCategorySchema,
  EVENT_SEVERITIES, EventSeveritySchema,
  REFERENCE_RATERS, ReferenceRaterSchema,
  CADENCE_LANES, CadenceLaneSchema,
} from "./vocab.js";

test("channels include the founder's core topics", () => {
  for (const c of ["history", "geopolitics", "ai", "quantum", "ds-sports", "finance"]) {
    expect(CHANNELS).toContain(c);
  }
});

test("ChannelSchema accepts known and rejects unknown", () => {
  expect(ChannelSchema.parse("finance")).toBe("finance");
  expect(ChannelSchema.safeParse("astrology").success).toBe(false);
});

test("source types and format names validate", () => {
  expect(SourceTypeSchema.parse("eng-blog")).toBe("eng-blog");
  expect(FormatNameSchema.parse("chronicle")).toBe("chronicle");
  expect(FormatNameSchema.safeParse("haiku").success).toBe(false);
});

test("LicenseTierSchema accepts known and rejects unknown", () => {
  expect(LICENSE_TIERS).toContain("derived-only");
  expect(LicenseTierSchema.parse("redistribute-raw-ok")).toBe("redistribute-raw-ok");
  expect(LicenseTierSchema.safeParse("public-domain").success).toBe(false);
});

test("IndicatorFieldSchema accepts known and rejects unknown", () => {
  expect(INDICATOR_FIELDS).toContain("procurement");
  expect(IndicatorFieldSchema.parse("governance")).toBe("governance");
  expect(IndicatorFieldSchema.safeParse("weather").success).toBe(false);
});

test("WorldEventCategorySchema accepts known and rejects unknown", () => {
  expect(WORLD_EVENT_CATEGORIES).toContain("science-tech");
  expect(WorldEventCategorySchema.parse("diplomacy")).toBe("diplomacy");
  expect(WorldEventCategorySchema.safeParse("sports").success).toBe(false);
});

test("EventSeveritySchema accepts known and rejects unknown", () => {
  expect(EVENT_SEVERITIES).toContain("critical");
  expect(EventSeveritySchema.parse("high")).toBe("high");
  expect(EventSeveritySchema.safeParse("catastrophic").success).toBe(false);
});

test("ReferenceRaterSchema accepts known and rejects unknown", () => {
  expect(REFERENCE_RATERS).toContain("allsides");
  expect(ReferenceRaterSchema.parse("mbfc")).toBe("mbfc");
  expect(ReferenceRaterSchema.safeParse("gallup").success).toBe(false);
});

test("CadenceLaneSchema accepts known and rejects unknown", () => {
  expect(CADENCE_LANES).toContain("fast");
  expect(CadenceLaneSchema.parse("slow")).toBe("slow");
  expect(CadenceLaneSchema.safeParse("realtime").success).toBe(false);
});
