import { z } from "zod";
import { EngagementKindSchema, GeometryStatusSchema, TheaterMetricKindSchema, TheaterStatusSchema } from "./vocab.js";
import { CountryCodeSchema, PeriodSchema } from "./world-indicator.js";
import { ProvenanceSchema, UncertaintySchema } from "./world-provenance.js";

/**
 * Conflict Theaters — belligerent sides, theater lifecycle, control-map references,
 * theater-scoped metrics, and discrete engagements. See
 * docs/superpowers/specs/2026-07-07-atlas-conflict-theaters-design.md §2-§4 and §12.
 *
 * This module owns its own downstream contract; it consumes CountryCodeSchema,
 * PeriodSchema, ProvenanceSchema, and UncertaintySchema from the Spine unchanged and
 * never modifies them.
 */

// §2 — the role a belligerent plays within a Side; defaults to "state" per Decision D6.
export const BelligerentRoleSchema = z.enum(["state", "non-state", "coalition-member", "proxy"]);
export type BelligerentRole = z.infer<typeof BelligerentRoleSchema>;

export const BelligerentSchema = z.object({
  name: z.string(),
  country: CountryCodeSchema.optional(),
  role: BelligerentRoleSchema.default("state"),
});
export type Belligerent = z.infer<typeof BelligerentSchema>;

// §2 — a grouped side in a theater; at least one belligerent per side.
export const SideSchema = z.object({
  id: z.string(),
  label: z.string(),
  belligerents: z.array(BelligerentSchema).min(1),
});
export type Side = z.infer<typeof SideSchema>;

// §2 — lat/lng membership/rendering bounds, NOT a territorial control claim.
export const TheaterBoundsSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180),
});
export type TheaterBounds = z.infer<typeof TheaterBoundsSchema>;

// §2 — the persistent, hand-curated theater record.
export const TheaterSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: TheaterStatusSchema,
  sides: z.array(SideSchema).min(2),
  bounds: TheaterBoundsSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().default(null),
  primaryCountries: z.array(CountryCodeSchema).default([]),
  provenance: ProvenanceSchema, // provenance of the registry entry itself
});
export type Theater = z.infer<typeof TheaterSchema>;

/**
 * §3 — the control-map licensing contract, enforced at parse time so the intended three
 * postures cannot be violated by component discipline alone:
 *   - "licensed":     committed geometry, licensed to render directly.
 *   - "fallback":     committed geometry from a redistribute-raw-ok source only (e.g. the
 *                     permitted Wikipedia CC BY-SA fallback) — never derived-only.
 *   - "link-out-only": deliberate no-embedded-geometry rendering; geometryRef must be null.
 */
export const ControlLayerSchema = z
  .object({
    theaterId: z.string(),
    snapshotAt: z.string().datetime(),
    geometryStatus: GeometryStatusSchema,
    geometryRef: z.string().min(1).nullable(), // committed GeoJSON path/ref, or null for link-out-only
    sourceUrl: z.string().url(), // authoritative source link
    reliabilityNote: z.string(),
    provenance: ProvenanceSchema,
  })
  .superRefine((c, ctx) => {
    if (c.geometryStatus === "link-out-only" && c.geometryRef !== null) {
      ctx.addIssue({ code: "custom", path: ["geometryRef"], message: "link-out-only layers must never carry a committed geometry reference" });
    }
    if ((c.geometryStatus === "licensed" || c.geometryStatus === "fallback") && c.geometryRef === null) {
      ctx.addIssue({ code: "custom", path: ["geometryRef"], message: "licensed and fallback layers must reference committed geometry" });
    }
    if (c.geometryStatus === "fallback" && c.provenance.licenseTier === "derived-only") {
      ctx.addIssue({ code: "custom", path: ["provenance", "licenseTier"], message: "fallback geometry must come from a redistribute-raw-ok source" });
    }
  });
export type ControlLayer = z.infer<typeof ControlLayerSchema>;

// §4 — one point in a theater-scoped metric series. Country-grain series remain
// Indicator records; this is only for theater-grain data such as front-wide
// casualties or corridor shipping impact.
export const TheaterMetricPointSchema = z.object({
  period: PeriodSchema,
  value: z.number(),
  uncertainty: UncertaintySchema,
});
export type TheaterMetricPoint = z.infer<typeof TheaterMetricPointSchema>;

export const TheaterMetricSchema = z.object({
  theaterId: z.string(),
  kind: TheaterMetricKindSchema,
  seriesId: z.string(), // source series identity
  label: z.string(),
  points: z.array(TheaterMetricPointSchema).min(1),
  unit: z.string(),
  provenance: ProvenanceSchema,
});
export type TheaterMetric = z.infer<typeof TheaterMetricSchema>;

// §4 — a discrete engagement. Deliberately does not enable raw ACLED-style engagement
// dumps; source-policy enforcement belongs to later fetcher tests, not this schema.
export const EngagementSchema = z.object({
  id: z.string(),
  theaterId: z.string(),
  kind: EngagementKindSchema,
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  time: z.string().datetime(),
  sideId: z.string().optional(), // Side.id, when attributable
  fatalities: z.object({ value: z.number().nonnegative(), uncertainty: UncertaintySchema }).optional(),
  summary: z.string(), // deterministic, templated — never freeform LLM prose
  provenance: ProvenanceSchema,
});
export type Engagement = z.infer<typeof EngagementSchema>;
