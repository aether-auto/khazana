import { expect, test } from "vitest";
import { ProvenanceSchema, UncertaintySchema } from "./world-provenance.js";

const baseProv = {
  sourceId: "world-bank-wdi",
  sourceUrl: "https://api.worldbank.org/v2/country/IN/indicator/NY.GDP.MKTP.CD",
  methodUrl: "https://datahelpdesk.worldbank.org/knowledgebase/articles/906519",
  redistribution: false,
  origin: "referenced" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" as const },
};

test("round-trips a fully-populated Provenance fixture", () => {
  const full = {
    ...baseProv,
    licenseTier: "redistribute-raw-ok" as const,
    redistribution: true,
    origin: "referenced" as const,
    uncertainty: { kind: "confidenceInterval" as const, low: 1.2, high: 3.4, level: 0.9 },
  };
  const parsed = ProvenanceSchema.parse(full);
  expect(parsed).toEqual(full);
});

test("confidenceInterval level defaults to 0.95 on parse", () => {
  const parsed = UncertaintySchema.parse({ kind: "confidenceInterval", low: 0, high: 1 });
  expect(parsed).toEqual({ kind: "confidenceInterval", low: 0, high: 1, level: 0.95 });
});

// --- license superRefine invariant, all four directions (deliverable 3) ---

test("derived-only + redistribution:true throws", () => {
  expect(() =>
    ProvenanceSchema.parse({ ...baseProv, licenseTier: "derived-only", redistribution: true, origin: "computed" }),
  ).toThrow();
});

test("derived-only + redistribution:false + origin:computed does not throw", () => {
  expect(() =>
    ProvenanceSchema.parse({ ...baseProv, licenseTier: "derived-only", redistribution: false, origin: "computed" }),
  ).not.toThrow();
});

test("derived-only + origin:referenced throws", () => {
  expect(() =>
    ProvenanceSchema.parse({ ...baseProv, licenseTier: "derived-only", redistribution: false, origin: "referenced" }),
  ).toThrow();
});

test("redistribute-raw-ok + redistribution:false does not throw", () => {
  expect(() =>
    ProvenanceSchema.parse({ ...baseProv, licenseTier: "redistribute-raw-ok", redistribution: false, origin: "referenced" }),
  ).not.toThrow();
});

// --- all five Uncertainty kinds parse, and each rejects a malformed shape ---

test("confidenceInterval parses and rejects malformed", () => {
  expect(UncertaintySchema.parse({ kind: "confidenceInterval", low: 0, high: 1, level: 0.99 }).kind).toBe("confidenceInterval");
  expect(UncertaintySchema.safeParse({ kind: "confidenceInterval", low: 0 }).success).toBe(false);
});

test("standardError parses and rejects malformed", () => {
  expect(UncertaintySchema.parse({ kind: "standardError", se: 0.5 }).kind).toBe("standardError");
  expect(UncertaintySchema.safeParse({ kind: "standardError", se: -1 }).success).toBe(false);
});

test("raterSpread parses and rejects malformed", () => {
  expect(UncertaintySchema.parse({ kind: "raterSpread", min: 1, max: 5, raterCount: 3 }).kind).toBe("raterSpread");
  expect(UncertaintySchema.safeParse({ kind: "raterSpread", min: 1, max: 5, raterCount: 0 }).success).toBe(false);
});

test("sampleSize parses and rejects malformed", () => {
  expect(UncertaintySchema.parse({ kind: "sampleSize", n: 400 }).kind).toBe("sampleSize");
  expect(UncertaintySchema.safeParse({ kind: "sampleSize", n: 1.5 }).success).toBe(false);
});

test("none parses and rejects malformed", () => {
  expect(UncertaintySchema.parse({ kind: "none" }).kind).toBe("none");
  expect(UncertaintySchema.safeParse({ kind: "unknown-kind" }).success).toBe(false);
});
