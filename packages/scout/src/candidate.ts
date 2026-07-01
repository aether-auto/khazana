import { CandidateSourceSchema, type CandidateSource, type Registry } from "@khazana/core";
import { normalizeDomain } from "./gaps.js";
import type { Candidate } from "./io.js";

/** Normalized domain set of every URL currently in the registry (drops `www.`). */
export function registryDomainSet(registry: Registry): Set<string> {
  const set = new Set<string>();
  for (const s of registry.sources) {
    const d = normalizeDomain(s.url);
    if (d) set.add(d);
    const r = s.resolvedUrl ? normalizeDomain(s.resolvedUrl) : null;
    if (r) set.add(r);
  }
  return set;
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Dedupe a flat list of raw candidates:
 *   1. drop any whose normalized domain is already in the registry,
 *   2. merge remaining candidates that share a domain — summing `seenCount`,
 *      unioning `evidence`, and keeping the first non-empty `feedUrl`,
 *   3. rank by `seenCount` descending (ties broken by domain for determinism).
 *
 * Pure: no network, no clock. The merged `url` is the first-seen candidate's
 * URL for that domain (stable given input order).
 */
export function dedupeCandidates(candidates: CandidateSource[], registry: Registry): CandidateSource[] {
  const registered = registryDomainSet(registry);
  const byDomain = new Map<string, CandidateSource>();

  for (const raw of candidates) {
    const c = CandidateSourceSchema.parse(raw);
    const domain = normalizeDomain(c.url);
    if (!domain || registered.has(domain)) continue;

    const existing = byDomain.get(domain);
    if (!existing) {
      byDomain.set(domain, { ...c, evidence: uniq(c.evidence) });
      continue;
    }
    byDomain.set(domain, {
      ...existing,
      feedUrl: existing.feedUrl ?? c.feedUrl,
      evidence: uniq([...existing.evidence, ...c.evidence]),
      seenCount: existing.seenCount + c.seenCount,
    });
  }

  return [...byDomain.entries()]
    .sort(([da, a], [db, b]) => b.seenCount - a.seenCount || da.localeCompare(db))
    .map(([, c]) => c);
}

/**
 * Bridge a raw `CandidateSource` into the `Candidate` shape that `evaluate.ts` /
 * `apply.ts` consume. Deliberately leaves `channels` empty and sets no
 * `claimedTrust` — those are the cloud appraiser's job, not the generator's.
 * The provenance is folded into `rationale` so it survives into the pending queue.
 */
export function toCandidate(c: CandidateSource): Candidate {
  const domain = normalizeDomain(c.url) ?? c.url;
  const evidence = c.evidence.length ? ` — ${c.evidence.join("; ")}` : "";
  return {
    url: c.url,
    title: domain,
    channels: [],
    rationale: `discovered via ${c.discoveredVia} (seen ${c.seenCount}×)${evidence}`,
  };
}
