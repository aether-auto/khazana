import { z } from "zod";
import { ProvenanceSchema, UncertaintySchema } from "./world-provenance.js";

/**
 * The Bias Lab's own derived layer — cross-subsystem shapes (world-ingest writes
 * them, `apps/site` reads them) but methodologically owned by the Bias Lab, not the
 * Spine. See docs/cofounder/specs/2026-07-07-atlas-bias-lab-design.md §6.1.
 *
 * Every schema here embeds `ProvenanceSchema` unmodified from spec 1 — this layer
 * adds new *shapes*, not a new uncertainty or licensing model.
 */

// §4.1 — Baly et al. 2018 free-signal outlet predictor, dual-axis over single-axis
// per §5.4's rationale.
export const DualAxisScoreSchema = z.object({
  outletId: z.string(),
  towardLeft: z.object({ score: z.number().min(-1).max(1), uncertainty: UncertaintySchema }),
  towardRight: z.object({ score: z.number().min(-1).max(1), uncertainty: UncertaintySchema }),
  /** which left/right entity-coding seed list this was computed against — see §12. */
  entitySeedListId: z.string(),
  provenance: ProvenanceSchema,
});
export type DualAxisScore = z.infer<typeof DualAxisScoreSchema>;

// §4.4 — Wordfish unsupervised text-scaling, runs on khazana's own corpus.
export const WordfishPositionSchema = z.object({
  outletId: z.string(),
  position: z.number(),
  se: z.number().nonnegative(), // native Wordfish standard error
  corpusN: z.number().int().nonnegative(), // documents this position was fit from
  provenance: ProvenanceSchema,
});
export type WordfishPosition = z.infer<typeof WordfishPositionSchema>;

// §4.3 — NELA-GT content-feature reliability classifier, fitted once offline.
export const NelaFeatureVectorSchema = z.object({
  outletId: z.string(),
  features: z.record(z.string(), z.number()), // named NELA features -> averaged values
  reliabilityContribution: z.number().min(0).max(100),
  classifierCvError: z.number().min(0).max(1), // holdout error — the §4.3 caveat, once, not per-outlet
  provenance: ProvenanceSchema,
});
export type NelaFeatureVector = z.infer<typeof NelaFeatureVectorSchema>;

// §4.5 — same-story divergence + corroboration (FLAGSHIP), pairwise NLI edges.
export const CorroborationEdgeSchema = z.object({
  outletA: z.string(),
  outletB: z.string(),
  relation: z.enum(["entails", "contradicts", "neutral"]),
  confidence: z.number().min(0).max(1),
});
export type CorroborationEdge = z.infer<typeof CorroborationEdgeSchema>;

// §4.5 / D7 — a selected/quoted claim-sentence from the source reportings, never
// generated (D7 + D4's zero-AI-prose rule for the whole world-data path).
export const CorroboratedCoreClaimSchema = z.object({
  claim: z.string(),
  confirmingOutletIds: z.array(z.string()),
  /** do confirming outlets' BiasProfile.lean values span both sides where coverage allows? */
  spectrumSpan: z.boolean(),
});
export type CorroboratedCoreClaim = z.infer<typeof CorroboratedCoreClaimSchema>;

export const DivergenceIndexSchema = z.object({
  eventId: z.string(), // WorldEvent.id — the Globe handoff key, §0.1
  divergence: z.object({ score: z.number().min(0).max(100), uncertainty: UncertaintySchema }),
  corroborationPct: z.number().min(0).max(100),
  edges: z.array(CorroborationEdgeSchema),
  outletIds: z.array(z.string()),
  /** the flagship's D7 output — always measured agreement, never khazana-asserted truth. */
  corroboratedCore: z.array(CorroboratedCoreClaimSchema),
  /** honest about text depth used — never silently assume snippet depth, §6.2. */
  computedFrom: z.enum(["headline-only", "headline+snippet"]),
  provenance: ProvenanceSchema,
});
export type DivergenceIndex = z.infer<typeof DivergenceIndexSchema>;

// §4.7 / D6.4 — wartime editorial physics input: which outlets carry a state-affiliation
// label chip. Sourced from free authoritative lists, itself a source with provenance.
export const OutletStateAffiliationSchema = z.object({
  outletId: z.string(),
  affiliation: z.enum(["state-controlled", "state-funded", "state-aligned", "none"]),
  affiliatedCountry: z.string().optional(), // ISO country code, when known
  /** which free authoritative list this was sourced from — provenance discipline applies here too. */
  sourceListId: z.string(),
  provenance: ProvenanceSchema,
});
export type OutletStateAffiliation = z.infer<typeof OutletStateAffiliationSchema>;
