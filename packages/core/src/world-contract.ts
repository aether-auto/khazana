import { z } from "zod";
import { CountryCodeSchema } from "./world-indicator.js";
import { ProvenanceSchema } from "./world-provenance.js";

/**
 * Contract — a procurement/spend record grounded in the World Data Spine.
 * See docs/cofounder/specs/2026-07-07-world-data-spine-design.md §3.
 */

export const ContractSchema = z.object({
  id: z.string(),
  buyer: z.object({
    name: z.string(),
    id: z.string().optional(),
  }),
  supplier: z.object({
    name: z.string(),
    id: z.string().optional(),
  }),
  value: z.object({
    amount: z.number().nonnegative(),
    currency: z.string().length(3), // ISO-4217, e.g. "USD"
  }),
  country: CountryCodeSchema,
  sector: z.string().optional(),
  date: z.string().datetime(),
  method: z.string().optional(),
  status: z.enum(["planned", "active", "complete", "cancelled"]).optional(),
  provenance: ProvenanceSchema,
});
export type Contract = z.infer<typeof ContractSchema>;
