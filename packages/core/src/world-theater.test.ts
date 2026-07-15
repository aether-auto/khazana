import { expect, test } from "vitest";
import { ENGAGEMENT_KINDS, GEOMETRY_STATUSES, THEATER_METRIC_KINDS, THEATER_STATUSES } from "./vocab.js";
import {
  BelligerentSchema,
  ControlLayerSchema,
  EngagementSchema,
  SideSchema,
  TheaterMetricSchema,
  TheaterSchema,
} from "./world-theater.js";

const baseProvenance = (licenseTier: "redistribute-raw-ok" | "derived-only" = "redistribute-raw-ok") => ({
  sourceId: "khazana-atlas-curation",
  sourceUrl: "https://example.org/theater/registry",
  methodUrl: "https://example.org/theater/methodology",
  licenseTier,
  redistribution: licenseTier === "redistribute-raw-ok",
  origin: licenseTier === "derived-only" ? ("computed" as const) : ("referenced" as const),
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
});

const validSide = (id: string, label: string) => ({
  id,
  label,
  belligerents: [{ name: `${label} armed forces`, country: "UKR", role: "state" as const }],
});

const validTheater = {
  id: "theater-1",
  name: "Eastern Front",
  status: "active" as const,
  sides: [validSide("side-a", "Side A"), validSide("side-b", "Side B")],
  bounds: { north: 52, south: 45, east: 40, west: 22 },
  startedAt: "2022-02-24T00:00:00.000Z",
  endedAt: null,
  primaryCountries: ["UKR", "RUS"],
  provenance: baseProvenance(),
};

const validControlLayer = (overrides: Partial<Record<string, unknown>> = {}) => ({
  theaterId: "theater-1",
  snapshotAt: "2026-07-07T00:00:00.000Z",
  geometryStatus: "licensed" as const,
  geometryRef: "data/theaters/theater-1/control.geojson",
  sourceUrl: "https://example.org/control-map",
  reliabilityNote: "daily update, medium confidence",
  provenance: baseProvenance(),
  ...overrides,
});

const validMetric = {
  theaterId: "theater-1",
  kind: "casualties" as const,
  seriesId: "theater-1-casualties-est",
  label: "Estimated front-wide casualties",
  points: [{ period: "2026-07", value: 1200, uncertainty: { kind: "none" as const } }],
  unit: "count",
  provenance: baseProvenance("derived-only"),
};

const validEngagement = {
  id: "engagement-1",
  theaterId: "theater-1",
  kind: "battle" as const,
  geo: { lat: 48.5, lng: 37.0 },
  time: "2026-07-07T06:00:00.000Z",
  sideId: "side-a",
  fatalities: { value: 12, uncertainty: { kind: "sampleSize" as const, n: 12 } },
  summary: "Battle recorded near Bakhmut on 2026-07-07.",
  provenance: baseProvenance("derived-only"),
};

// --- round-trip every schema on a complete valid fixture ---

test("SideSchema round-trips and defaults role to state", () => {
  const parsed = SideSchema.parse(validSide("side-a", "Side A"));
  expect(parsed.belligerents[0]?.role).toBe("state");
});

test("BelligerentSchema defaults role to state when omitted", () => {
  const parsed = BelligerentSchema.parse({ name: "Freelance militia" });
  expect(parsed.role).toBe("state");
});

test("TheaterSchema round-trips a complete fixture and defaults primaryCountries", () => {
  const parsed = TheaterSchema.parse(validTheater);
  expect(parsed).toEqual(validTheater);
  const noPrimary = { ...validTheater, primaryCountries: undefined };
  delete (noPrimary as Record<string, unknown>).primaryCountries;
  expect(TheaterSchema.parse(noPrimary).primaryCountries).toEqual([]);
});

test("TheaterSchema rejects fewer than two sides", () => {
  const oneSide = { ...validTheater, sides: [validSide("side-a", "Side A")] };
  expect(TheaterSchema.safeParse(oneSide).success).toBe(false);
});

test("SideSchema rejects an empty belligerent list", () => {
  expect(SideSchema.safeParse({ id: "side-a", label: "Side A", belligerents: [] }).success).toBe(false);
});

test("TheaterSchema rejects an invalid country code in primaryCountries", () => {
  const bad = { ...validTheater, primaryCountries: ["ukr"] };
  expect(TheaterSchema.safeParse(bad).success).toBe(false);
});

test("ControlLayerSchema round-trips a valid licensed fixture", () => {
  const parsed = ControlLayerSchema.parse(validControlLayer());
  expect(parsed.geometryStatus).toBe("licensed");
});

test("ControlLayerSchema rejects an invalid geometryStatus", () => {
  expect(ControlLayerSchema.safeParse(validControlLayer({ geometryStatus: "embedded" })).success).toBe(false);
});

test("TheaterMetricSchema round-trips a complete fixture", () => {
  const parsed = TheaterMetricSchema.parse(validMetric);
  expect(parsed).toEqual(validMetric);
});

test("EngagementSchema round-trips a complete fixture", () => {
  const parsed = EngagementSchema.parse(validEngagement);
  expect(parsed).toEqual(validEngagement);
});

// --- exercise every literal in all four theater vocabularies ---

test("every TheaterStatus literal parses on TheaterSchema", () => {
  for (const status of THEATER_STATUSES) {
    expect(TheaterSchema.parse({ ...validTheater, status }).status).toBe(status);
  }
});

test("every GeometryStatus literal parses on a legal ControlLayer fixture", () => {
  for (const status of GEOMETRY_STATUSES) {
    const layer =
      status === "link-out-only"
        ? validControlLayer({ geometryStatus: status, geometryRef: null })
        : validControlLayer({ geometryStatus: status, provenance: baseProvenance("redistribute-raw-ok") });
    expect(ControlLayerSchema.parse(layer).geometryStatus).toBe(status);
  }
});

test("every TheaterMetricKind literal parses on TheaterMetricSchema", () => {
  for (const kind of THEATER_METRIC_KINDS) {
    expect(TheaterMetricSchema.parse({ ...validMetric, kind }).kind).toBe(kind);
  }
});

test("every EngagementKind literal parses on EngagementSchema", () => {
  for (const kind of ENGAGEMENT_KINDS) {
    expect(EngagementSchema.parse({ ...validEngagement, kind }).kind).toBe(kind);
  }
});

// --- control-layer licensing contract: reject every illegal direction ---

test("fallback + derived-only provenance throws", () => {
  const layer = validControlLayer({ geometryStatus: "fallback", provenance: baseProvenance("derived-only") });
  expect(() => ControlLayerSchema.parse(layer)).toThrow();
});

test("link-out-only + non-null geometryRef throws", () => {
  const layer = validControlLayer({ geometryStatus: "link-out-only", geometryRef: "data/theaters/theater-1/control.geojson" });
  expect(() => ControlLayerSchema.parse(layer)).toThrow();
});

test("licensed + null geometryRef throws", () => {
  const layer = validControlLayer({ geometryStatus: "licensed", geometryRef: null });
  expect(() => ControlLayerSchema.parse(layer)).toThrow();
});

test("fallback + null geometryRef throws", () => {
  const layer = validControlLayer({ geometryStatus: "fallback", geometryRef: null, provenance: baseProvenance("redistribute-raw-ok") });
  expect(() => ControlLayerSchema.parse(layer)).toThrow();
});

// --- control-layer licensing contract: accept every intended legal posture ---

test("licensed + non-null geometryRef parses", () => {
  expect(() => ControlLayerSchema.parse(validControlLayer({ geometryStatus: "licensed" }))).not.toThrow();
});

test("fallback + redistribute-raw-ok provenance + non-null geometryRef parses", () => {
  const layer = validControlLayer({ geometryStatus: "fallback", provenance: baseProvenance("redistribute-raw-ok") });
  expect(() => ControlLayerSchema.parse(layer)).not.toThrow();
});

test("link-out-only + null geometryRef parses", () => {
  const layer = validControlLayer({ geometryStatus: "link-out-only", geometryRef: null });
  expect(() => ControlLayerSchema.parse(layer)).not.toThrow();
});

// --- inherited Spine provenance invariant still enforced through ControlLayerSchema ---

test("inherited ProvenanceSchema still rejects derived-only claiming raw redistribution", () => {
  const badProvenance = { ...baseProvenance("derived-only"), redistribution: true };
  const layer = validControlLayer({ geometryStatus: "fallback", provenance: badProvenance });
  expect(() => ControlLayerSchema.parse(layer)).toThrow();
});
