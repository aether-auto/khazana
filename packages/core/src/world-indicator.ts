import { createHash } from "node:crypto";
import { z } from "zod";
import { IndicatorFieldSchema } from "./vocab.js";
import { ProvenanceSchema } from "./world-provenance.js";

/**
 * Indicator — one grounded, provenance-carrying datum in the World Data Spine.
 * See docs/cofounder/specs/2026-07-07-world-data-spine-design.md §3.
 */

// ISO 3166-1 alpha-3, uppercase only.
export const CountryCodeSchema = z.string().regex(/^[A-Z]{3}$/);
export type CountryCode = z.infer<typeof CountryCodeSchema>;

// Four documented grains: YYYY | YYYY-Qn (n=1-4) | YYYY-MM (01-12) | YYYY-MM-DD.
export const PeriodSchema = z
  .string()
  .regex(/^\d{4}(-(Q[1-4]|(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?))?$/);
export type Period = z.infer<typeof PeriodSchema>;

export const SubnationalRefSchema = z.object({
  level: z.enum(["state", "district"]),
  code: z.string(),
  name: z.string(),
});
export type SubnationalRef = z.infer<typeof SubnationalRefSchema>;

export const IndicatorSchema = z.object({
  id: z.string(),
  field: IndicatorFieldSchema,
  key: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  /**
   * Cross-country, cross-time comparable score, 0-100, required on every Indicator so
   * the Ledger's cross-field views (radar charts, heatmaps mixing 8 fields on one
   * country) have one common axis to plot. For sources already 0-100 (CPI, Freedom
   * House), normalizedScore === value. For raw macro/fiscal series, it's khazana's own
   * percentile rank against the cross-country distribution, computed at build time.
   */
  normalizedScore: z.number().min(0).max(100),
  country: CountryCodeSchema,
  subnational: SubnationalRefSchema.optional(),
  period: PeriodSchema,
  provenance: ProvenanceSchema,
});
export type Indicator = z.infer<typeof IndicatorSchema>;

/**
 * Deterministic id for an Indicator, mirroring feed-item.ts's makeFeedItemId sha1-hash
 * pattern. `subnationalCode` uses an explicit "-" placeholder when absent (not omission)
 * so the id changes both when subnationalCode toggles present-vs-absent and when its
 * value changes -- omission alone could collide with an indicator that has no subnational
 * scope at all.
 */
export function makeIndicatorId(
  sourceId: string,
  field: string,
  key: string,
  country: string,
  period: string,
  subnationalCode?: string,
): string {
  const parts = [sourceId, field, key, country, period, subnationalCode ?? "-"];
  return createHash("sha1").update(parts.join("::")).digest("hex").slice(0, 16);
}
