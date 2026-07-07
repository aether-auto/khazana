import type { CitationLedger, SourceOrigin, SourceTier } from "@khazana/core";

/**
 * The ledger→frontmatter source enrichment merge.
 *
 * The citation ledger (`data/generation/research/<slug>.ledger.json`) is ephemeral —
 * gitignored and regenerated per run — while a Read's frontmatter `sources[]` is
 * committed and permanent. So any tier/origin grounding signal we want to SURVIVE
 * on the page must be baked into the frontmatter at the moment the ledger still
 * exists, not read back out of it later. This is that merge: PURE, url-keyed,
 * never fabricates a tier/origin for a source the ledger doesn't know about.
 */

/** The minimal shape of a frontmatter source entry — url is the merge key. */
export interface BareSource {
  title?: string;
  url: string;
}

/** A source, enriched with its ledger tier/origin when a matching url exists. */
export interface EnrichedSource {
  title?: string;
  url: string;
  tier?: SourceTier;
  origin?: SourceOrigin;
}

/**
 * Match each source's `url` against the citation ledger (exact string match, no
 * host/fuzzy matching) and attach that entry's `tier` + `origin`. A source whose
 * url has no ledger entry is returned unchanged (title/url only — no tier/origin
 * keys), so a partially-researched draft never fabricates grounding data. An
 * empty ledger is a no-op over every source (back-compat with pre-ledger drafts).
 */
export function enrichSourcesFromLedger(
  sources: readonly BareSource[],
  ledger: CitationLedger,
): EnrichedSource[] {
  const byUrl = new Map(ledger.map((entry) => [entry.url, entry]));
  return sources.map((source) => {
    const entry = byUrl.get(source.url);
    if (!entry) return { ...source };
    return { ...source, tier: entry.tier, origin: entry.origin };
  });
}
