import { expect, test } from "vitest";
import {
  CHANNELS, ChannelSchema, SourceTypeSchema, FormatNameSchema,
  LICENSE_TIERS, LicenseTierSchema,
  INDICATOR_FIELDS, IndicatorFieldSchema,
  WORLD_EVENT_CATEGORIES, WorldEventCategorySchema,
  EVENT_SEVERITIES, EventSeveritySchema,
  REFERENCE_RATERS, ReferenceRaterSchema,
  CADENCE_LANES, CadenceLaneSchema,
  SYSTEM_TYPES, SystemTypeSchema,
  GOV_BRANCHES, GovBranchSchema,
  GOV_TIERS, GovTierSchema,
  INSTITUTION_KINDS, InstitutionKindSchema,
  POWER_RELATIONS, PowerRelationSchema,
  SELECTION_METHODS, SelectionMethodSchema,
  THEATER_STATUSES, TheaterStatusSchema,
  GEOMETRY_STATUSES, GeometryStatusSchema,
  THEATER_METRIC_KINDS, TheaterMetricKindSchema,
  ENGAGEMENT_KINDS, EngagementKindSchema,
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

test("SystemTypeSchema accepts known and rejects unknown", () => {
  expect(SYSTEM_TYPES).toContain("semi-presidential");
  expect(SystemTypeSchema.parse("parliamentary")).toBe("parliamentary");
  expect(SystemTypeSchema.safeParse("anarcho-syndicalist").success).toBe(false);
});

test("GovBranchSchema accepts known and rejects unknown", () => {
  expect(GOV_BRANCHES).toContain("electoral");
  expect(GovBranchSchema.parse("judicial")).toBe("judicial");
  expect(GovBranchSchema.safeParse("religious").success).toBe(false);
});

test("GovTierSchema accepts known and rejects unknown", () => {
  expect(GOV_TIERS).toContain("national");
  expect(GovTierSchema.parse("state")).toBe("state");
  expect(GovTierSchema.safeParse("regional").success).toBe(false);
});

test("InstitutionKindSchema accepts known and rejects unknown", () => {
  expect(INSTITUTION_KINDS).toContain("apex-court");
  expect(InstitutionKindSchema.parse("chamber")).toBe("chamber");
  expect(InstitutionKindSchema.safeParse("ministry").success).toBe(false);
});

test("PowerRelationSchema accepts known and rejects unknown", () => {
  expect(POWER_RELATIONS).toContain("confidence");
  expect(PowerRelationSchema.parse("appoints")).toBe("appoints");
  expect(PowerRelationSchema.safeParse("influences").success).toBe(false);
});

test("SelectionMethodSchema accepts known and rejects unknown", () => {
  expect(SELECTION_METHODS).toContain("legislature-elected");
  expect(SelectionMethodSchema.parse("hereditary")).toBe("hereditary");
  expect(SelectionMethodSchema.safeParse("lottery").success).toBe(false);
});

test("TheaterStatusSchema accepts known and rejects unknown", () => {
  expect(THEATER_STATUSES).toContain("dormant");
  expect(TheaterStatusSchema.parse("active")).toBe("active");
  expect(TheaterStatusSchema.safeParse("resolved").success).toBe(false);
});

test("GeometryStatusSchema accepts known and rejects unknown", () => {
  expect(GEOMETRY_STATUSES).toContain("link-out-only");
  expect(GeometryStatusSchema.parse("fallback")).toBe("fallback");
  expect(GeometryStatusSchema.safeParse("embedded").success).toBe(false);
});

test("TheaterMetricKindSchema accepts known and rejects unknown", () => {
  expect(THEATER_METRIC_KINDS).toContain("commodity-impact");
  expect(TheaterMetricKindSchema.parse("displacement")).toBe("displacement");
  expect(TheaterMetricKindSchema.safeParse("gdp-drop").success).toBe(false);
});

test("EngagementKindSchema accepts known and rejects unknown", () => {
  expect(ENGAGEMENT_KINDS).toContain("siege");
  expect(EngagementKindSchema.parse("strike")).toBe("strike");
  expect(EngagementKindSchema.safeParse("ceasefire").success).toBe(false);
});
