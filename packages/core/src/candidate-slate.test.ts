import { expect, test } from "vitest";
import {
  CandidateSlateSchema,
  ReadCandidateSchema,
  blendedScore,
  DEFAULT_SLATE_WEIGHTS,
  type ReadCandidate,
} from "./candidate-slate.js";

function candidate(overrides: Partial<ReadCandidate> = {}): ReadCandidate {
  return {
    id: "kelly-criterion-in-crypto",
    thesis: "The 1956 Kelly formula explains why leveraged crypto traders blow up.",
    angle: "Re-derive Kelly from information theory, then apply it to on-chain leverage data.",
    seedItemIds: ["abc123", "def456"],
    seedCluster: "cluster-kelly",
    channels: ["finance", "data-science"],
    suggestedFormat: "dispatch",
    scores: { groundability: 0.9, novelty: 0.7, tasteFit: 0.8, interestingness: 0.85, importance: 0.7 },
    origin: "feed-grounded",
    rationale: "Surging cluster, strong taste fit, deep primary literature exists.",
    groundabilityEvidence: "Kelly (1956) BSTJ, Thorp (2006), plus public on-chain datasets.",
    noveltyCheck: "Extends 'The Arithmetic of Ruin' into a new domain, not a repeat.",
    ...overrides,
  };
}

test("ReadCandidateSchema accepts a well-formed candidate", () => {
  const r = ReadCandidateSchema.safeParse(candidate());
  expect(r.success).toBe(true);
});

test("ReadCandidateSchema rejects an out-of-range score", () => {
  const r = ReadCandidateSchema.safeParse(candidate({
    scores: { groundability: 1.5, novelty: 0.5, tasteFit: 0.5, interestingness: 0.5, importance: 0.5 },
  }));
  expect(r.success).toBe(false);
});

test("ReadCandidateSchema rejects an out-of-range importance", () => {
  const r = ReadCandidateSchema.safeParse(candidate({
    scores: { groundability: 0.9, novelty: 0.7, tasteFit: 0.8, interestingness: 0.85, importance: 1.2 },
  }));
  expect(r.success).toBe(false);
});

test("ReadCandidateSchema requires importance in scores", () => {
  const { scores, ...rest } = candidate();
  void scores;
  const r = ReadCandidateSchema.safeParse({
    ...rest,
    scores: { groundability: 0.9, novelty: 0.7, tasteFit: 0.8, interestingness: 0.85 },
  });
  expect(r.success).toBe(false);
});

test("ReadCandidateSchema rejects an unknown channel", () => {
  const r = ReadCandidateSchema.safeParse({ ...candidate(), channels: ["not-a-channel"] });
  expect(r.success).toBe(false);
});

test("ReadCandidateSchema rejects an unknown format", () => {
  const r = ReadCandidateSchema.safeParse({ ...candidate(), suggestedFormat: "listicle" });
  expect(r.success).toBe(false);
});

test("ReadCandidateSchema requires at least one channel", () => {
  const r = ReadCandidateSchema.safeParse({ ...candidate(), channels: [] });
  expect(r.success).toBe(false);
});

test("seedItemIds defaults to an empty array", () => {
  const { seedItemIds, ...rest } = candidate();
  void seedItemIds;
  const r = ReadCandidateSchema.parse(rest);
  expect(r.seedItemIds).toEqual([]);
});

test("an interest-driven candidate with empty seedItemIds validates", () => {
  const r = ReadCandidateSchema.safeParse(candidate({
    origin: "interest-driven",
    seedItemIds: [],
    seedCluster: undefined,
  }));
  expect(r.success).toBe(true);
});

test("origin must be one of the two lanes", () => {
  const ok = ReadCandidateSchema.safeParse(candidate({ origin: "interest-driven" }));
  expect(ok.success).toBe(true);
  const bad = ReadCandidateSchema.safeParse({ ...candidate(), origin: "made-up-lane" });
  expect(bad.success).toBe(false);
});

test("CandidateSlateSchema validates a ranked slate and defaults notes", () => {
  const r = CandidateSlateSchema.parse({
    generatedAt: "2026-07-01T12:00:00.000Z",
    candidates: [candidate(), candidate({ id: "second" })],
  });
  expect(r.candidates).toHaveLength(2);
  expect(r.notes).toBe("");
});

test("CandidateSlateSchema rejects a non-datetime generatedAt", () => {
  const r = CandidateSlateSchema.safeParse({ generatedAt: "yesterday", candidates: [] });
  expect(r.success).toBe(false);
});

test("blendedScore is the weighted sum and stays in [0,1]", () => {
  const perfect = blendedScore({ groundability: 1, novelty: 1, tasteFit: 1, interestingness: 1, importance: 1 });
  expect(perfect).toBeCloseTo(1, 10);
  const zero = blendedScore({ groundability: 0, novelty: 0, tasteFit: 0, interestingness: 0, importance: 0 });
  expect(zero).toBe(0);
  // Groundability is weighted highest (the gate).
  const groundOnly = blendedScore({ groundability: 1, novelty: 0, tasteFit: 0, interestingness: 0, importance: 0 });
  expect(groundOnly).toBeCloseTo(DEFAULT_SLATE_WEIGHTS.groundability, 10);
});

test("importance contributes to the blend with its own weight", () => {
  const importanceOnly = blendedScore({
    groundability: 0, novelty: 0, tasteFit: 0, interestingness: 0, importance: 1,
  });
  expect(importanceOnly).toBeCloseTo(DEFAULT_SLATE_WEIGHTS.importance, 10);
  // Importance is a meaningful weight, comparable to interestingness and tasteFit.
  expect(DEFAULT_SLATE_WEIGHTS.importance).toBeGreaterThan(0);
  expect(DEFAULT_SLATE_WEIGHTS.groundability).toBeGreaterThan(DEFAULT_SLATE_WEIGHTS.importance);
});

test("default weights sum to 1", () => {
  const sum = Object.values(DEFAULT_SLATE_WEIGHTS).reduce((a, b) => a + b, 0);
  expect(sum).toBeCloseTo(1, 10);
});
