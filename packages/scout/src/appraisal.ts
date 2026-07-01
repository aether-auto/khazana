import type { Appraisal, CandidateSource } from "@khazana/core";
import { normalizeDomain } from "./gaps.js";
import type { Candidate } from "./io.js";

export type { Appraisal } from "@khazana/core";
export { AppraisalSchema, parseAppraisals } from "@khazana/core";

/**
 * Join the appraiser's verdicts onto the generated candidates (by normalized
 * domain) and produce evaluate-ready `Candidate`s. An appraiser-supplied
 * `trust` becomes `claimedTrust` (which `computeTrust` consumes); a `reject`
 * decision drops the candidate; candidates with no matching appraisal are
 * skipped (the appraiser hasn't judged them yet). The generator's `feedUrl` is
 * carried through as an autodiscovery hint.
 *
 * Pure — no network, no LLM. This is the seam the cloud Sonnet appraisal flows
 * through into evaluate → apply.
 */
export function mergeAppraisal(candidates: CandidateSource[], appraisals: Appraisal[]): Candidate[] {
  const byDomain = new Map<string, Appraisal>();
  for (const a of appraisals) {
    const d = normalizeDomain(a.url);
    if (d) byDomain.set(d, a);
  }

  const out: Candidate[] = [];
  for (const c of candidates) {
    const domain = normalizeDomain(c.url);
    if (!domain) continue;
    const verdict = byDomain.get(domain);
    if (!verdict || verdict.decision === "reject") continue;

    out.push({
      url: c.url,
      title: domain,
      channels: verdict.channels,
      claimedTrust: verdict.trust,
      rationale: verdict.rationale ?? `appraised (${c.discoveredVia}, seen ${c.seenCount}×)`,
      ...(c.feedUrl ? { feedUrl: c.feedUrl } : {}),
    });
  }
  return out;
}
