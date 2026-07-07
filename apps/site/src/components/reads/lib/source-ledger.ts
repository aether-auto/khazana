// PURE logic behind the on-page "Sources & corroboration" rail (SourceLedger.astro).
// No DOM, no I/O — just the summary/grouping math over a Read's frontmatter
// `sources[]`, which is where a Read's citation-ledger tier/origin survives
// (the ledger itself, `data/generation/research/<slug>.ledger.json`, is ephemeral
// and gone by the time the site builds — see source-enrichment.ts on the
// @khazana/generate side for how tier/origin gets baked into frontmatter).
//
// DEGRADE GRACEFULLY: every Read published before this field existed has plain
// `{ title, url }` sources — `tier`/`origin` are optional everywhere here, and
// `hasTierData`/`hasOriginData` tell the component when to fall back to a plain
// list instead of rendering empty/broken tier badges.

export type SourceTier = "high" | "med" | "low";
export type SourceOrigin = "curated" | "researched";

/** A frontmatter source entry, exactly as parsed off the blog collection. */
export interface RailSource {
  title: string;
  url: string;
  tier?: SourceTier;
  origin?: SourceOrigin;
}

export interface SourceTierTally {
  high: number;
  med: number;
  low: number;
  /** No tier on this source — most commonly, a Read shipped before this field existed. */
  unknown: number;
}

export interface SourceOriginTally {
  curated: number;
  researched: number;
  unknown: number;
}

export interface SourceLedgerSummary {
  total: number;
  tiers: SourceTierTally;
  origins: SourceOriginTally;
  /** Distinct hostnames across all sources (www-insensitive) — a diversity signal. */
  independentDomains: number;
  /** True when at least one source carries a tier — gates tier-badge rendering. */
  hasTierData: boolean;
  /** True when at least one source carries an origin — gates the origin marker/split. */
  hasOriginData: boolean;
}

/**
 * Hostname of a url, www-stripped and lowercased — a lightweight "which site is
 * this" signal for domain-diversity counting. Deliberately simpler than
 * `packages/generate/src/fact-checker.ts`'s `domainOf` (which collapses to a
 * registrable domain for the claims-corroboration gate): this is a site-side,
 * display-only tally, not a grounding gate, so the full hostname is fine and
 * keeps the implementation dependency-free. Never throws — an unparseable url
 * falls back to its own lowercased text so a malformed source can't crash render.
 */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function summarizeSources(sources: readonly RailSource[]): SourceLedgerSummary {
  const tiers: SourceTierTally = { high: 0, med: 0, low: 0, unknown: 0 };
  const origins: SourceOriginTally = { curated: 0, researched: 0, unknown: 0 };
  const domains = new Set<string>();

  for (const s of sources) {
    if (s.tier) tiers[s.tier]++;
    else tiers.unknown++;
    if (s.origin) origins[s.origin]++;
    else origins.unknown++;
    domains.add(domainOf(s.url));
  }

  return {
    total: sources.length,
    tiers,
    origins,
    independentDomains: domains.size,
    hasTierData: tiers.high + tiers.med + tiers.low > 0,
    hasOriginData: origins.curated + origins.researched > 0,
  };
}

export type TierGroupKey = SourceTier | "unknown";

export interface TierGroup {
  tier: TierGroupKey;
  sources: RailSource[];
}

const TIER_ORDER: readonly TierGroupKey[] = ["high", "med", "low", "unknown"];

/**
 * Group sources by tier (high -> med -> low -> unknown), preserving each
 * group's original relative order. Empty groups are omitted. A back-compat
 * list (no source carries a tier) collapses to a single "unknown" group
 * containing every source, in original order.
 */
export function groupSourcesByTier(sources: readonly RailSource[]): TierGroup[] {
  const byTier = new Map<TierGroupKey, RailSource[]>();
  for (const s of sources) {
    const key: TierGroupKey = s.tier ?? "unknown";
    const list = byTier.get(key);
    if (list) list.push(s);
    else byTier.set(key, [s]);
  }
  return TIER_ORDER.filter((t) => byTier.has(t)).map((tier) => ({ tier, sources: byTier.get(tier)! }));
}
