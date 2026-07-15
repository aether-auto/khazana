import { z } from "zod";
import { IndicatorFieldSchema } from "./vocab.js";
import { CountryCodeSchema, IndicatorSchema } from "./world-indicator.js";

/**
 * CountryProfile — the per-country aggregate view over the World Data Spine's
 * Indicators, grouped by IndicatorField and optionally broken out subnationally.
 * See docs/cofounder/specs/2026-07-07-world-data-spine-design.md §3.
 */

export const IndicatorGroupSchema = z.object({
  field: IndicatorFieldSchema,
  indicators: z.array(IndicatorSchema),
});
export type IndicatorGroup = z.infer<typeof IndicatorGroupSchema>;

export const SubnationalProfileSchema = z.object({
  level: z.string(),
  code: z.string(),
  name: z.string(),
  fields: z.array(IndicatorGroupSchema),
});
export type SubnationalProfile = z.infer<typeof SubnationalProfileSchema>;

export const CountryProfileSchema = z.object({
  country: CountryCodeSchema,
  name: z.string(),
  region: z.string().optional(),
  updatedAt: z.string().datetime(),
  fields: z.array(IndicatorGroupSchema),
  subnational: z.array(SubnationalProfileSchema).default([]),
});
export type CountryProfile = z.infer<typeof CountryProfileSchema>;
