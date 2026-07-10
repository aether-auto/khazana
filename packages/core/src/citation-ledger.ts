import { z } from "zod";

/**
 * Citation ledger — the grounding contract shared by the generation harness and
 * the writer-skills researcher. Every source a Read may cite must appear here.
 *
 * Ledger = (curated FeedItem URLs) ∪ (researched sources appraised during the
 * research phase). `validateDraft` accepts a `source.url` iff it is in the ledger.
 */

/** Source-credibility tier. */
export const SourceTierSchema = z.enum(["high", "med", "low"]);
export type SourceTier = z.infer<typeof SourceTierSchema>;

/** Where a ledger entry came from. */
export const SourceOriginSchema = z.enum(["curated", "researched"]);
export type SourceOrigin = z.infer<typeof SourceOriginSchema>;

/**
 * One appraised source in the ledger.
 * - `tier`: High = peer-reviewed/journal/arXiv/primary-document/official-standard;
 *   Med = reputable secondary (established press, official docs);
 *   Low = blog/forum (allowed only if corroborated).
 * - `origin`: `curated` (from the FeedItem set) or `researched` (discovered + appraised).
 */
/**
 * `firstSeen` accepts either a date-only string (`YYYY-MM-DD` — what the
 * `writers/researcher` skill and writer-emitted ledgers actually produce) or a
 * full ISO datetime. Date-only input is normalized to midnight-UTC ISO so every
 * parsed entry ends up in one consistently-comparable/sortable string form,
 * regardless of which shape it arrived in. Kept as a real date/datetime
 * validation (not "any string") — a malformed value is still rejected.
 */
const FirstSeenSchema = z
  .union([z.string().date(), z.string().datetime()])
  .transform((v) => (v.length === 10 ? `${v}T00:00:00.000Z` : v));

export const CitationLedgerEntrySchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  tier: SourceTierSchema,
  origin: SourceOriginSchema,
  firstSeen: FirstSeenSchema.optional(),
});
export type CitationLedgerEntry = z.infer<typeof CitationLedgerEntrySchema>;

/** The full ledger: an appraised, deduplicated-by-url list of sources. */
export const CitationLedgerSchema = z.array(CitationLedgerEntrySchema);
export type CitationLedger = z.infer<typeof CitationLedgerSchema>;

/** Set of every URL a draft is allowed to cite (the grounding gate). */
export function ledgerUrls(ledger: CitationLedger): Set<string> {
  return new Set(ledger.map((e) => e.url));
}
