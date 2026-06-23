import { z } from "zod";
import { SourceTypeSchema } from "./vocab.js";

export const SourceEntrySchema = z.object({
  id: z.string(),
  type: SourceTypeSchema,
  url: z.string().url(),
  channels: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  trustScore: z.number().min(0).max(1).default(0.5),
  addedBy: z.enum(["seed", "scout", "manual"]).default("seed"),
  addedAt: z.string().datetime().optional(),
  lastFetchedAt: z.string().datetime().optional(),
  failureCount: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export const RegistrySchema = z.object({
  version: z.number().int().default(1),
  sources: z.array(SourceEntrySchema).default([]),
});
export type Registry = z.infer<typeof RegistrySchema>;

export function parseRegistry(json: unknown): Registry {
  return RegistrySchema.parse(json);
}
