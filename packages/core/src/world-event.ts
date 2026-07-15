import { z } from "zod";
import { EventSeveritySchema, WorldEventCategorySchema } from "./vocab.js";
import { ProvenanceSchema } from "./world-provenance.js";

/**
 * WorldEvent + Reporting — the Globe's core shapes. See
 * docs/cofounder/specs/2026-07-07-world-data-spine-design.md §3.5.
 *
 * `reportings[]` is deliberately raw material, not a pre-digested verdict:
 * each Reporting carries its own tone/stance/frame and full Provenance, so
 * the Globe can render the spread of coverage rather than a single verdict.
 */

export const ToneSchema = z.enum(["positive", "negative", "neutral", "mixed"]);
export type Tone = z.infer<typeof ToneSchema>;

export const StanceSchema = z.enum(["supportive", "critical", "neutral", "mixed"]);
export type Stance = z.infer<typeof StanceSchema>;

export const ReportingSchema = z.object({
  outletId: z.string(), // Outlet.id
  url: z.string().url(),
  headline: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  tone: ToneSchema, // sentiment of the piece
  stance: StanceSchema, // the outlet's stance toward the event's subject
  frame: z.string(), // short phrase, e.g. "economic fallout" vs "humanitarian crisis"
  provenance: ProvenanceSchema,
});
export type Reporting = z.infer<typeof ReportingSchema>;

export const WorldEventSchema = z.object({
  id: z.string(),
  headline: z.string(),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    country: z.string().optional(),
  }),
  time: z.string().datetime(),
  category: WorldEventCategorySchema,
  /** The provider's own native taxonomy code (e.g. GDELT CAMEO root code), kept
   *  alongside our coarse `category` bucket for anyone who wants the granular code. */
  sourceCategoryCode: z.string().optional(),
  severity: EventSeveritySchema,
  reportings: z.array(ReportingSchema).default([]),
  provenance: ProvenanceSchema, // provenance of the EVENT record itself (e.g. a GDELT GKG row)
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;
