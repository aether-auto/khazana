import { z } from "zod";
import { ReferenceRaterSchema } from "./vocab.js";
import { ProvenanceSchema, UncertaintySchema } from "./world-provenance.js";

/**
 * Outlet + BiasProfile — the Bias Lab's core shapes. See
 * docs/cofounder/specs/2026-07-07-world-data-spine-design.md §3.4.
 *
 * Load-bearing distinction: `lean`/`reliability` are khazana's OWN computed
 * numbers (each still carrying full Provenance, origin: "computed") — those
 * are what renders. `referenceRaters` is purely an attribution overlay:
 * "AllSides independently calls this outlet Lean Left" shown next to
 * khazana's number, never substituted for it — decision #4's derived-only
 * constraint applied to a whole class of sources at once.
 */

export const ReferenceRatingSchema = z.object({
  rater: ReferenceRaterSchema,
  leanLabel: z.string(), // the rater's OWN label, e.g. "Lean Left" — attribution only
  reliabilityLabel: z.string().optional(),
  url: z.string().url(),
  retrievedAt: z.string().datetime(),
});
export type ReferenceRating = z.infer<typeof ReferenceRatingSchema>;

export const BiasProfileSchema = z.object({
  /** khazana's OWN computed lean, -1 (far-left) .. +1 (far-right). This is what renders. */
  lean: z.object({ score: z.number().min(-1).max(1), uncertainty: UncertaintySchema, provenance: ProvenanceSchema }),
  /** khazana's OWN computed reliability, 0-100. */
  reliability: z.object({ score: z.number().min(0).max(100), uncertainty: UncertaintySchema, provenance: ProvenanceSchema }),
  /** Attribution-only overlay. Never redistributed as khazana's number — AllSides/Ad
   *  Fontes/MBFC are all derived-only tier (decision #4). */
  referenceRaters: z.array(ReferenceRatingSchema).default([]),
  /** Spread across referenceRaters' own lean labels, mapped to a common -1..1 scale
   *  purely for spread computation (not stored as anyone's official score). Informs
   *  how much to trust khazana's own lean estimate when raters strongly disagree. */
  crossRaterSpread: z.object({ min: z.number(), max: z.number(), raterCount: z.number().int().positive() }).optional(),
  /** Number of articles/reportings khazana's own lean+reliability were computed from. */
  sampleN: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});
export type BiasProfile = z.infer<typeof BiasProfileSchema>;

export const OutletSchema = z.object({
  id: z.string(), // slug, e.g. "reuters", "the-hindu"
  name: z.string(),
  domain: z.string(), // canonical domain for matching Reporting.url -> outlet
  country: z.string().optional(),
  bias: BiasProfileSchema,
});
export type Outlet = z.infer<typeof OutletSchema>;
