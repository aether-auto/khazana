import { expect, test } from "vitest";
import { BiasProfileSchema, OutletSchema, ReferenceRatingSchema } from "./world-outlet.js";
import { REFERENCE_RATERS } from "./vocab.js";

const computedProvenance = {
  sourceId: "khazana-bias-lab",
  sourceUrl: "https://khazana.internal/bias-lab/reuters",
  methodUrl: "https://khazana.internal/bias-lab/methodology",
  licenseTier: "derived-only" as const,
  redistribution: false,
  origin: "computed" as const,
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "sampleSize" as const, n: 120 },
};

const referenceRating = (rater: (typeof REFERENCE_RATERS)[number]) => ({
  rater,
  leanLabel: "Lean Left",
  reliabilityLabel: "High",
  url: `https://example.com/${rater}/reuters`,
  retrievedAt: "2026-07-07T12:00:00.000Z",
});

const fullBiasProfile = {
  lean: { score: -0.2, uncertainty: { kind: "none" as const }, provenance: computedProvenance },
  reliability: { score: 82, uncertainty: { kind: "none" as const }, provenance: computedProvenance },
  referenceRaters: [referenceRating("allsides"), referenceRating("adfontes"), referenceRating("mbfc")],
  crossRaterSpread: { min: -0.4, max: 0.1, raterCount: 3 },
  sampleN: 120,
  updatedAt: "2026-07-07T12:00:00.000Z",
};

const fullOutlet = {
  id: "reuters",
  name: "Reuters",
  domain: "reuters.com",
  country: "GB",
  bias: fullBiasProfile,
};

test("round-trips a fully-populated Outlet fixture with BiasProfile", () => {
  const parsed = OutletSchema.parse(fullOutlet);
  expect(parsed).toEqual(fullOutlet);
});

test("all three ReferenceRater enum values parse in a ReferenceRating", () => {
  for (const rater of REFERENCE_RATERS) {
    expect(ReferenceRatingSchema.parse(referenceRating(rater)).rater).toBe(rater);
  }
});

test("ReferenceRatingSchema rejects an unknown rater value", () => {
  expect(ReferenceRatingSchema.safeParse({ ...referenceRating("allsides"), rater: "gallup" }).success).toBe(false);
});

test("BiasProfile lean/reliability provenance enforces derived-only license invariant", () => {
  // derived-only + origin: computed is valid
  expect(BiasProfileSchema.safeParse(fullBiasProfile).success).toBe(true);

  // derived-only + origin: referenced must throw at the Provenance level
  const badProfile = {
    ...fullBiasProfile,
    lean: {
      ...fullBiasProfile.lean,
      provenance: { ...computedProvenance, origin: "referenced" as const },
    },
  };
  expect(BiasProfileSchema.safeParse(badProfile).success).toBe(false);
});
