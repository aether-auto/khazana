import type { CandidateSource, FeedItem, Registry, SourceType } from "@khazana/core";
import { normalizeDomain } from "../gaps.js";
import { registryDomainSet } from "../candidate.js";
import { isIgnoredDomain } from "./ignore-domains.js";

/**
 * Source types that are *aggregators* — their items link OUT to first-party
 * publishers we may not yet track. First-party feeds (eng-blog, rss, arxiv,
 * podcast, news) are excluded: their `url` is the publisher itself, so tallying
 * them would just re-surface sources we already ingest.
 */
export const AGGREGATOR_TYPES: ReadonlySet<SourceType> = new Set<SourceType>(["hn", "reddit"]);

export interface DomainFrequencyOpts {
  /** Minimum recurrence for a domain to become a candidate. Default 3. */
  minCount?: number;
  /** Max candidates to emit (highest frequency first). Default 200. */
  limit?: number;
}

/**
 * Domain-frequency: a no-AI candidate generator. We already ingest HN/Reddit
 * aggregators; the external domains their items keep pointing at are first-party
 * publishers worth adding directly. Tally each external `item.url` domain across
 * aggregator items; domains recurring at/above `minCount` that aren't already
 * registered become candidates, ranked by frequency.
 *
 * Pure over already-fetched items — no network.
 */
export function domainFrequency(items: FeedItem[], registry: Registry, opts: DomainFrequencyOpts = {}): CandidateSource[] {
  const minCount = opts.minCount ?? 3;
  const limit = opts.limit ?? 200;
  const registered = registryDomainSet(registry);

  const counts = new Map<string, { url: string; count: number }>();
  for (const item of items) {
    if (!AGGREGATOR_TYPES.has(item.sourceType)) continue;
    const domain = normalizeDomain(item.url);
    if (!domain || registered.has(domain) || isIgnoredDomain(domain)) continue;
    const entry = counts.get(domain);
    if (entry) entry.count += 1;
    else counts.set(domain, { url: originOf(item.url), count: 1 });
  }

  return [...counts.entries()]
    .filter(([, v]) => v.count >= minCount)
    .sort(([da, a], [db, b]) => b.count - a.count || da.localeCompare(db))
    .slice(0, limit)
    .map(([domain, v]) => ({
      url: v.url,
      discoveredVia: "domain-frequency" as const,
      evidence: [`recurs across ${v.count} aggregator items (${domain})`],
      seenCount: v.count,
    }));
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
