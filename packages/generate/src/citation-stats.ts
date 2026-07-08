// packages/generate/src/citation-stats.ts
//
// Deterministic, per-draft grounding stats over the frontmatter `sources[]` and
// the citation ledger — NOT the claims-level factChecker gate.
//
// Why not just wire `checkClaims` (fact-checker.ts) into the CLI: `checkClaims`
// needs a `ClaimEntry[]` claims-map (per-claim load-bearing/high-stakes flags +
// which ledger urls support each claim). That map is produced by an LLM re-read
// during research/verify (see `writers/researcher/SKILL.md` — the "claims
// table" is a free-text artifact with no fixed persisted file path or schema,
// unlike the ledger which IS persisted deterministically at
// `data/generation/research/<slug>.ledger.json` in the exact `CitationLedger`
// shape). Parsing an LLM-authored markdown table well enough to feed a
// pass/fail gate would be guessing at structure that was never a contract —
// exactly the kind of "fake it" the harness must not do. So the ≥90%
// coverage / ≥60% corroboration CLAIM-level gate stays with the adversarial
// `reads-verify` LLM pass, which has the actual claims table in front of it.
//
// What IS fully deterministic and worth surfacing here: for the sources a
// draft actually cites in its frontmatter, how many resolve to a known ledger
// entry (tier + origin), and how many INDEPENDENT sources (distinct domain AND
// origin — the same test `checkClaims` uses) back the piece as a whole. This
// doesn't replace claim-level coverage, but it gives the deterministic report
// real, non-fabricated numbers instead of silence.
import type { CitationLedger, FeedItem } from "@khazana/core";
import { domainOf } from "./fact-checker.js";

export interface CitationTierBreakdown {
  high: number;
  med: number;
  low: number;
  /** Grounded via a curated FeedItem only — no ledger entry, so no tier is known. */
  unknown: number;
}

export interface CitationStats {
  /** Number of sources cited in the draft's frontmatter. */
  citedCount: number;
  /** How many of those resolve to a curated FeedItem or a ledger entry. */
  groundedCount: number;
  /** groundedCount / citedCount (1 when citedCount is 0 — nothing to fail). */
  ledgerCoverage: number;
  /** Distinct (domain, origin) pairs among the grounded, ledger-known sources. */
  independentSourceCount: number;
  tierBreakdown: CitationTierBreakdown;
}

export function computeCitationStats(
  sources: { url: string }[],
  ledger: CitationLedger,
  curated: FeedItem[],
): CitationStats {
  const ledgerByUrl = new Map(ledger.map((e) => [e.url, e]));
  const curatedUrls = new Set(curated.map((it) => it.url));

  const tierBreakdown: CitationTierBreakdown = { high: 0, med: 0, low: 0, unknown: 0 };
  let groundedCount = 0;
  const independentKeys = new Set<string>();

  for (const s of sources) {
    const ledgerEntry = ledgerByUrl.get(s.url);
    const isCurated = curatedUrls.has(s.url);
    if (!ledgerEntry && !isCurated) continue; // ungrounded — not counted, drops coverage
    groundedCount++;
    if (ledgerEntry) {
      tierBreakdown[ledgerEntry.tier]++;
      independentKeys.add(`${domainOf(s.url)}::${ledgerEntry.origin}`);
    } else {
      tierBreakdown.unknown++;
      // Grounded only via the curated set — origin is implicitly "curated".
      independentKeys.add(`${domainOf(s.url)}::curated`);
    }
  }

  return {
    citedCount: sources.length,
    groundedCount,
    ledgerCoverage: sources.length === 0 ? 1 : groundedCount / sources.length,
    independentSourceCount: independentKeys.size,
    tierBreakdown,
  };
}
