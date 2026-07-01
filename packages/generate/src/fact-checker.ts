import { z } from "zod";
import { type CitationLedger, ledgerUrls } from "@khazana/core";

/**
 * Deterministic adversarial quality-gate over a draft's claims-map + its citation
 * ledger (spec §6.3 "second verification pass"). The LLM re-read that PRODUCES the
 * claims-map is a separate cloud step; this is the pure gate that CONSUMES it.
 *
 * A claim is "covered" when at least one of its cited urls is in the ledger.
 * A load-bearing claim is "corroborated" when it cites >=2 INDEPENDENT ledger
 * sources — independent = distinct registrable-ish domain AND distinct origin
 * (curated vs researched), so two arms of the same site/origin don't count twice.
 */

/** One load-bearing/aside claim the author extracted from the draft. */
export const ClaimEntrySchema = z.object({
  claim: z.string().min(1),
  /** A claim the argument leans on (vs. flavor/aside). */
  loadBearing: z.boolean().default(false),
  /** A consequential/contestable claim (big numbers, causal/safety/financial). */
  highStakes: z.boolean().default(false),
  /** Ledger urls the author says support this claim. */
  sourceUrls: z.array(z.string()).default([]),
});
export type ClaimEntry = z.infer<typeof ClaimEntrySchema>;

export const FactCheckVerdictSchema = z.object({
  pass: z.boolean(),
  /** Fraction of all claims that cite >=1 ledger source (0..1). */
  claimsCovered: z.number(),
  /** Fraction of load-bearing claims corroborated by >=2 independent sources (0..1). */
  corroborationRate: z.number(),
  violations: z.array(z.string()),
});
export type FactCheckVerdict = z.infer<typeof FactCheckVerdictSchema>;

/** Quality-gate thresholds (spec §6.3). */
export const COVERAGE_THRESHOLD = 0.9;
export const CORROBORATION_THRESHOLD = 0.6;
export const INDEPENDENT_SOURCES_REQUIRED = 2;

/** Coarse registrable domain, e.g. `https://sub.example.co.uk/x` -> `example.co.uk`. */
function domainOf(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const twoLevelTld = new Set(["co", "com", "org", "gov", "ac", "net", "edu"]);
  const last = parts[parts.length - 1]!;
  const penult = parts[parts.length - 2]!;
  if (last.length === 2 && twoLevelTld.has(penult)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

/**
 * Count INDEPENDENT ledger-backed sources for a claim: dedupe by (domain, origin)
 * so two urls from the same site/origin corroborate only once.
 */
function independentSourceCount(urls: string[], ledger: CitationLedger): number {
  const originByUrl = new Map(ledger.map((e) => [e.url, e.origin]));
  const seen = new Set<string>();
  for (const url of urls) {
    if (!originByUrl.has(url)) continue; // only ledger-backed urls corroborate
    seen.add(`${domainOf(url)}::${originByUrl.get(url)}`);
  }
  return seen.size;
}

export function checkClaims(claims: ClaimEntry[], ledger: CitationLedger): FactCheckVerdict {
  const inLedger = ledgerUrls(ledger);
  const violations: string[] = [];

  if (claims.length === 0) {
    return {
      pass: false,
      claimsCovered: 0,
      corroborationRate: 0,
      violations: ["claims: empty claims-map — nothing to ground the draft against"],
    };
  }

  let covered = 0;
  const loadBearing: ClaimEntry[] = [];
  let corroborated = 0;

  for (const c of claims) {
    const ledgerCited = c.sourceUrls.filter((u) => inLedger.has(u));
    // Flag any cited url that isn't in the ledger (fabricated / unappraised).
    for (const u of c.sourceUrls) {
      if (!inLedger.has(u)) violations.push(`claim "${c.claim}": cites a url not in ledger: ${u}`);
    }
    if (ledgerCited.length > 0) covered++;

    if (c.loadBearing) {
      loadBearing.push(c);
      const independents = independentSourceCount(c.sourceUrls, ledger);
      const isCorroborated = independents >= INDEPENDENT_SOURCES_REQUIRED;
      if (isCorroborated) corroborated++;
      // High-stakes claims must be corroborated; flag if not.
      if (c.highStakes && !isCorroborated) {
        violations.push(
          `claim "${c.claim}": HIGH-STAKES claim is not corroborated by >=${INDEPENDENT_SOURCES_REQUIRED} independent sources`,
        );
      }
    }
  }

  const claimsCovered = covered / claims.length;
  const corroborationRate = loadBearing.length === 0 ? 1 : corroborated / loadBearing.length;

  if (claimsCovered < COVERAGE_THRESHOLD) {
    violations.push(
      `coverage: ${(claimsCovered * 100).toFixed(0)}% of claims cite a ledger source (need >=${COVERAGE_THRESHOLD * 100}%)`,
    );
  }
  if (corroborationRate < CORROBORATION_THRESHOLD) {
    violations.push(
      `corroboration: ${(corroborationRate * 100).toFixed(0)}% of load-bearing claims are double-corroborated (need >=${CORROBORATION_THRESHOLD * 100}%)`,
    );
  }

  return {
    pass: violations.length === 0,
    claimsCovered,
    corroborationRate,
    violations,
  };
}
