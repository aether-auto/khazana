import { expect, test } from "vitest";
import {
  CorroborationEdgeSchema,
  CorroboratedCoreClaimSchema,
  DivergenceIndexSchema,
  DualAxisScoreSchema,
  NelaFeatureVectorSchema,
  OutletStateAffiliationSchema,
  WordfishPositionSchema,
} from "./world-bias-lab.js";

const provenance = {
  sourceId: "khazana-bias-lab",
  sourceUrl: "https://khazana.internal/bias-lab/reuters",
  methodUrl: "https://khazana.internal/bias-lab/methodology",
  licenseTier: "derived-only" as const,
  redistribution: false,
  origin: "computed" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "sampleSize" as const, n: 120 },
};

// ---- DualAxisScoreSchema ----

const fullDualAxisScore = {
  outletId: "reuters",
  towardLeft: { score: -0.4, uncertainty: { kind: "none" as const } },
  towardRight: { score: 0.1, uncertainty: { kind: "none" as const } },
  entitySeedListId: "baly-2018-seed-v1",
  provenance,
};

test("round-trips a fully-populated DualAxisScore fixture unchanged", () => {
  expect(DualAxisScoreSchema.parse(fullDualAxisScore)).toEqual(fullDualAxisScore);
});

test("DualAxisScore rejects towardLeft.score outside [-1,1]", () => {
  expect(
    DualAxisScoreSchema.safeParse({ ...fullDualAxisScore, towardLeft: { ...fullDualAxisScore.towardLeft, score: 1.1 } }).success,
  ).toBe(false);
  expect(
    DualAxisScoreSchema.safeParse({ ...fullDualAxisScore, towardLeft: { ...fullDualAxisScore.towardLeft, score: -1.1 } }).success,
  ).toBe(false);
});

test("DualAxisScore rejects towardRight.score outside [-1,1]", () => {
  expect(
    DualAxisScoreSchema.safeParse({ ...fullDualAxisScore, towardRight: { ...fullDualAxisScore.towardRight, score: 1.1 } }).success,
  ).toBe(false);
  expect(
    DualAxisScoreSchema.safeParse({ ...fullDualAxisScore, towardRight: { ...fullDualAxisScore.towardRight, score: -1.1 } }).success,
  ).toBe(false);
});

// ---- WordfishPositionSchema ----

const fullWordfishPosition = {
  outletId: "reuters",
  position: 0.32,
  se: 0.05,
  corpusN: 480,
  provenance,
};

test("round-trips a fully-populated WordfishPosition fixture unchanged", () => {
  expect(WordfishPositionSchema.parse(fullWordfishPosition)).toEqual(fullWordfishPosition);
});

test("WordfishPosition rejects negative se", () => {
  expect(WordfishPositionSchema.safeParse({ ...fullWordfishPosition, se: -0.01 }).success).toBe(false);
});

test("WordfishPosition rejects negative corpusN", () => {
  expect(WordfishPositionSchema.safeParse({ ...fullWordfishPosition, corpusN: -1 }).success).toBe(false);
});

// ---- NelaFeatureVectorSchema ----

const fullNelaFeatureVector = {
  outletId: "reuters",
  features: { "readability-grade": 12.4, "hedging-cue-density": 0.03, "clickbait-score": 0.1 },
  reliabilityContribution: 78,
  classifierCvError: 0.12,
  provenance,
};

test("round-trips a fully-populated NelaFeatureVector fixture unchanged", () => {
  expect(NelaFeatureVectorSchema.parse(fullNelaFeatureVector)).toEqual(fullNelaFeatureVector);
});

test("NelaFeatureVector rejects reliabilityContribution outside [0,100]", () => {
  expect(NelaFeatureVectorSchema.safeParse({ ...fullNelaFeatureVector, reliabilityContribution: 101 }).success).toBe(false);
  expect(NelaFeatureVectorSchema.safeParse({ ...fullNelaFeatureVector, reliabilityContribution: -1 }).success).toBe(false);
});

test("NelaFeatureVector rejects classifierCvError outside [0,1]", () => {
  expect(NelaFeatureVectorSchema.safeParse({ ...fullNelaFeatureVector, classifierCvError: 1.1 }).success).toBe(false);
  expect(NelaFeatureVectorSchema.safeParse({ ...fullNelaFeatureVector, classifierCvError: -0.1 }).success).toBe(false);
});

// ---- CorroborationEdgeSchema / CorroboratedCoreClaimSchema / DivergenceIndexSchema ----

const edge = (relation: "entails" | "contradicts" | "neutral") => ({
  outletA: "reuters",
  outletB: "ap",
  relation,
  confidence: 0.8,
});

test("CorroborationEdgeSchema accepts every relation literal", () => {
  for (const relation of ["entails", "contradicts", "neutral"] as const) {
    expect(CorroborationEdgeSchema.parse(edge(relation)).relation).toBe(relation);
  }
});

test("CorroborationEdgeSchema rejects an unknown relation value", () => {
  expect(CorroborationEdgeSchema.safeParse({ ...edge("entails"), relation: "implies" }).success).toBe(false);
});

const spanningClaim = {
  claim: "Officials confirmed the ceasefire took effect at midnight.",
  confirmingOutletIds: ["reuters", "ap", "state-outlet-a"],
  spectrumSpan: true,
};

const nonSpanningClaim = {
  claim: "The delegation left the venue shortly after talks concluded.",
  confirmingOutletIds: ["state-outlet-a", "state-outlet-b"],
  spectrumSpan: false,
};

test("CorroboratedCoreClaimSchema round-trips spanning and non-spanning claims independently", () => {
  expect(CorroboratedCoreClaimSchema.parse(spanningClaim)).toEqual(spanningClaim);
  expect(CorroboratedCoreClaimSchema.parse(nonSpanningClaim)).toEqual(nonSpanningClaim);
});

const fullDivergenceIndex = {
  eventId: "event-2026-07-14-ceasefire",
  divergence: { score: 42, uncertainty: { kind: "none" as const } },
  corroborationPct: 65,
  edges: [edge("entails"), edge("contradicts"), edge("neutral")],
  outletIds: ["reuters", "ap", "state-outlet-a", "state-outlet-b"],
  corroboratedCore: [spanningClaim, nonSpanningClaim],
  computedFrom: "headline+snippet" as const,
  provenance,
};

test("round-trips a fully-populated DivergenceIndex fixture with a mixed corroboratedCore array", () => {
  const parsed = DivergenceIndexSchema.parse(fullDivergenceIndex);
  expect(parsed).toEqual(fullDivergenceIndex);
  expect(parsed.corroboratedCore[0]?.spectrumSpan).toBe(true);
  expect(parsed.corroboratedCore[1]?.spectrumSpan).toBe(false);
});

test("DivergenceIndex accepts both computedFrom literals", () => {
  for (const computedFrom of ["headline-only", "headline+snippet"] as const) {
    expect(DivergenceIndexSchema.parse({ ...fullDivergenceIndex, computedFrom }).computedFrom).toBe(computedFrom);
  }
});

test("DivergenceIndex rejects an unknown computedFrom value", () => {
  expect(DivergenceIndexSchema.safeParse({ ...fullDivergenceIndex, computedFrom: "full-text" }).success).toBe(false);
});

test("DivergenceIndex rejects a fixture missing any required field", () => {
  for (const key of Object.keys(fullDivergenceIndex)) {
    const broken = { ...fullDivergenceIndex } as Record<string, unknown>;
    delete broken[key];
    expect(DivergenceIndexSchema.safeParse(broken).success, `missing "${key}" should fail`).toBe(false);
  }
});

// ---- OutletStateAffiliationSchema ----

const fullOutletStateAffiliation = {
  outletId: "state-outlet-a",
  affiliation: "state-controlled" as const,
  affiliatedCountry: "RU",
  sourceListId: "rsf-state-media-list-2026",
  provenance,
};

test("round-trips a fully-populated OutletStateAffiliation fixture", () => {
  expect(OutletStateAffiliationSchema.parse(fullOutletStateAffiliation)).toEqual(fullOutletStateAffiliation);
});

test("OutletStateAffiliation.affiliatedCountry is optional", () => {
  const { affiliatedCountry: _affiliatedCountry, ...withoutCountry } = fullOutletStateAffiliation;
  expect(OutletStateAffiliationSchema.parse(withoutCountry)).toEqual(withoutCountry);
});

test("OutletStateAffiliation accepts every affiliation literal", () => {
  for (const affiliation of ["state-controlled", "state-funded", "state-aligned", "none"] as const) {
    expect(OutletStateAffiliationSchema.parse({ ...fullOutletStateAffiliation, affiliation }).affiliation).toBe(affiliation);
  }
});

test("OutletStateAffiliation rejects an unknown affiliation value", () => {
  expect(OutletStateAffiliationSchema.safeParse({ ...fullOutletStateAffiliation, affiliation: "independent" }).success).toBe(false);
});

// ---- provenance-required, all seven schemas ----

test("every schema in this file rejects a fixture with provenance omitted entirely", () => {
  const cases: Array<{ name: string; schema: { safeParse: (v: unknown) => { success: boolean } }; fixture: Record<string, unknown> }> = [
    { name: "DualAxisScoreSchema", schema: DualAxisScoreSchema, fixture: fullDualAxisScore },
    { name: "WordfishPositionSchema", schema: WordfishPositionSchema, fixture: fullWordfishPosition },
    { name: "NelaFeatureVectorSchema", schema: NelaFeatureVectorSchema, fixture: fullNelaFeatureVector },
    { name: "DivergenceIndexSchema", schema: DivergenceIndexSchema, fixture: fullDivergenceIndex },
    { name: "OutletStateAffiliationSchema", schema: OutletStateAffiliationSchema, fixture: fullOutletStateAffiliation },
  ];
  for (const { name, schema, fixture } of cases) {
    const { provenance: _provenance, ...withoutProvenance } = fixture;
    expect(schema.safeParse(withoutProvenance).success, `${name} should require provenance`).toBe(false);
  }

  // CorroborationEdgeSchema and CorroboratedCoreClaimSchema don't embed provenance
  // individually (they're nested under DivergenceIndex's own provenance) — confirmed
  // above via DivergenceIndexSchema's own provenance-omitted rejection.
});
