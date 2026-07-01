import { z } from "zod";

/**
 * A raw, un-appraised source *candidate* produced by a no-AI discovery
 * generator (link-mining, domain-frequency, OPML import, …). It records WHERE
 * the candidate came from and the evidence for it — never a credibility
 * verdict. The credibility/fit call is a cloud step (the Claude Code Action,
 * Sonnet), which reads these and their evidence and decides add/queue/reject.
 *
 * A `CandidateSource` is deliberately lighter than a `Candidate` (io.ts): it
 * has no channels or `claimedTrust`, because those are the appraiser's job.
 */
export const DISCOVERED_VIA = [
  "link-mine",
  "domain-frequency",
  "opml",
  "engaged-domain",
  "outbound-domain",
  "manual",
  // YouTube channel discovery: channels behind curated videos, and ytsearch hits.
  "youtube-channel",
  "youtube-search",
] as const;
export const DiscoveredViaSchema = z.enum(DISCOVERED_VIA);
export type DiscoveredVia = z.infer<typeof DiscoveredViaSchema>;

export const CandidateSourceSchema = z.object({
  /** The publisher site or feed URL the generator surfaced. */
  url: z.string().url(),
  /** An autodiscovered/known feed URL, if the generator already has one. */
  feedUrl: z.string().url().optional(),
  /** Which generator produced this candidate. */
  discoveredVia: DiscoveredViaSchema,
  /**
   * Human-readable provenance the cloud appraiser reads: what cites this, how
   * often, from which OPML file, etc. Aggregated when candidates are merged.
   */
  evidence: z.array(z.string()).default([]),
  /** How many distinct signals pointed at this candidate (citation/recurrence count). */
  seenCount: z.number().int().positive().default(1),
});
export type CandidateSource = z.infer<typeof CandidateSourceSchema>;

export function parseCandidateSources(json: unknown): CandidateSource[] {
  return z.array(CandidateSourceSchema).parse(json);
}

/**
 * The cloud appraiser's verdict on one candidate — the SEAM between the
 * deterministic generator machinery (no AI) and the credibility call (the Claude
 * Code Action, Sonnet, in CI). Scout never fills this in; it reads it back and
 * threads it through evaluate → apply.
 */
export const AppraisalSchema = z.object({
  url: z.string().url(),
  channels: z.array(z.string()).default([]),
  trust: z.number().min(0).max(1),
  /** Optional explicit override; when absent the trust thresholds decide add/queue/reject. */
  decision: z.enum(["approve", "queue", "reject"]).optional(),
  rationale: z.string().optional(),
});
export type Appraisal = z.infer<typeof AppraisalSchema>;

export function parseAppraisals(json: unknown): Appraisal[] {
  return z.array(AppraisalSchema).parse(json);
}
