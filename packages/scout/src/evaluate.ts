import { CHANNELS, type Registry } from "@khazana/core";
import { normalizeDomain } from "./gaps.js";
import type { Candidate } from "./io.js";

export const AUTO_ADD_TRUST = 0.7;
export const QUEUE_TRUST = 0.4;

export interface CandidateVerdict {
  decision: "add" | "queue" | "reject";
  trust: number;
  feedUrl: string | null;
  channels: string[];
  duplicate: boolean;
  hasFeed: boolean;
  reason: string;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const VALID = new Set<string>(CHANNELS);

export function computeTrust(candidate: Candidate): number {
  const base = clamp01(candidate.claimedTrust ?? 0.5);
  const https = candidate.url.startsWith("https:") ? 0.05 : 0;
  return clamp01(base + https);
}

export function evaluateCandidate(
  candidate: Candidate,
  feedUrl: string | null,
  registry: Registry,
): CandidateVerdict {
  const channels = candidate.channels.filter((c) => VALID.has(c));
  const hasFeed = feedUrl !== null;
  const trust = computeTrust(candidate);

  const existing = new Set<string>();
  for (const s of registry.sources) {
    const d = normalizeDomain(s.url);
    if (d) existing.add(d);
  }
  const candDomain = normalizeDomain(candidate.url);
  const feedDomain = feedUrl ? normalizeDomain(feedUrl) : null;
  const duplicate =
    (candDomain !== null && existing.has(candDomain)) || (feedDomain !== null && existing.has(feedDomain));

  let decision: CandidateVerdict["decision"];
  let reason: string;
  if (!hasFeed) {
    decision = "reject";
    reason = "no-feed";
  } else if (duplicate) {
    decision = "reject";
    reason = "duplicate";
  } else if (channels.length === 0) {
    decision = "reject";
    reason = "no-valid-channels";
  } else if (trust >= AUTO_ADD_TRUST) {
    decision = "add";
    reason = "auto-add";
  } else if (trust >= QUEUE_TRUST) {
    decision = "queue";
    reason = "queue-review";
  } else {
    decision = "reject";
    reason = "low-trust";
  }

  return { decision, trust, feedUrl, channels, duplicate, hasFeed, reason };
}
