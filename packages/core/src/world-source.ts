import { z } from "zod";
import { CadenceLaneSchema, IndicatorFieldSchema, LicenseTierSchema } from "./vocab.js";
import { CountryCodeSchema } from "./world-indicator.js";

/**
 * WorldSourceEntry + WorldRegistry — the world-data source registry. Mirrors
 * SourceEntrySchema/RegistrySchema (registry.ts) one-for-one, in a new file because the
 * shape a world source produces (Indicator | WorldEvent | Contract, not FeedItem) is
 * disjoint from the ingest registry's Source contract.
 * See docs/superpowers/specs/2026-07-07-world-data-spine-design.md §3.7.
 */

export const WorldSourceEntrySchema = z.object({
  id: z.string(), // e.g. "world-bank-wdi", "gdelt-gkg", "usaspending", "allsides"
  name: z.string(),
  homepage: z.string().url(),
  licenseTier: LicenseTierSchema, // the CEILING this source permits — see §3.1 rationale
  cadenceLane: CadenceLaneSchema,
  fields: z.array(IndicatorFieldSchema).default([]), // which Indicator fields this source feeds (empty for event/outlet/contract sources)
  countries: z.array(CountryCodeSchema).optional(), // omitted = global coverage
  enabled: z.boolean().default(true),
  trustScore: z.number().min(0).max(1).default(0.5), // same semantics as SourceEntry.trustScore
  addedAt: z.string().datetime().optional(),
  lastFetchedAt: z.string().datetime().optional(),
  failureCount: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});
export type WorldSourceEntry = z.infer<typeof WorldSourceEntrySchema>;

export const WorldRegistrySchema = z.object({
  version: z.number().int().default(1),
  sources: z.array(WorldSourceEntrySchema).default([]),
});
export type WorldRegistry = z.infer<typeof WorldRegistrySchema>;

export function parseWorldRegistry(json: unknown): WorldRegistry {
  return WorldRegistrySchema.parse(json);
}
