import { z } from "zod";
import { SourceTypeSchema } from "./vocab.js";

/**
 * Persisted, classified record of the most recent failed fetch. `kind`
 * distinguishes a dead feed (`permanent`: 404/410/DNS/not-a-feed) from a
 * recoverable hiccup (`transient`: 429/5xx/timeout/network) so the strike
 * reducer never marches a rate-limited source toward death.
 */
export const SourceLastErrorSchema = z.object({
  kind: z.string(),
  code: z.number().int().optional(),
  at: z.string().datetime(),
});
export type SourceLastError = z.infer<typeof SourceLastErrorSchema>;

/** Persisted lifecycle status (source of truth; the site may still derive for legacy entries). */
export const SourceStatusSchema = z.enum(["active", "dormant", "failing", "disabled"]);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

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

  // ── Health / lifecycle (all optional → backward-compatible with live entries) ──
  /** Persisted lifecycle status. Absent ⇒ treated as `active`. */
  status: SourceStatusSchema.optional(),
  /** The REAL strike counter (permanent failures). Absent ⇒ treated as 0. */
  consecutiveFailures: z.number().int().nonnegative().optional(),
  /** ISO timestamp of the last *successful* fetch (distinct from lastFetchedAt = last attempt). */
  lastOkAt: z.string().datetime().optional(),
  /** Last failure, classified transient vs permanent. */
  lastError: SourceLastErrorSchema.optional(),
  /** Set when rediscovery repairs a moved feed to a new live URL. */
  resolvedUrl: z.string().url().optional(),
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
