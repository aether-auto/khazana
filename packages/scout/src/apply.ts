import { SourceEntrySchema, type Registry, type SourceEntry, type SourceType } from "@khazana/core";
import type { CandidateVerdict } from "./evaluate.js";
import { normalizeDomain } from "./gaps.js";
import type { Candidate, PendingEntry } from "./io.js";
import type { PruneAction } from "./prune.js";

export interface ScoutReport {
  now: string;
  added: string[];
  queued: string[];
  rejected: { url: string; reason: string }[];
  pruned: PruneAction[];
}

export interface Evaluated {
  candidate: Candidate;
  verdict: CandidateVerdict;
}

export function inferType(feedUrl: string): SourceType {
  let host = "";
  let path = "";
  try {
    const u = new URL(feedUrl);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return "rss";
  }
  if (host.includes("arxiv.org")) return "arxiv";
  if (host.includes("reddit.com")) return "reddit";
  if (/(^|\.)blog\./.test(host) || /\/blog(\/|$)/.test(path) || host.includes("eng")) return "eng-blog";
  return "rss";
}

export function makeSourceId(feedUrl: string, registry: Registry): string {
  const domain = normalizeDomain(feedUrl) ?? "source";
  const base = domain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const taken = new Set(registry.sources.map((s) => s.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function applyScout(
  registry: Registry,
  evaluated: Evaluated[],
  now: string,
): { registry: Registry; pending: PendingEntry[]; report: ScoutReport } {
  const sources: SourceEntry[] = [...registry.sources];
  const pending: PendingEntry[] = [];
  const report: ScoutReport = { now, added: [], queued: [], rejected: [], pruned: [] };

  for (const { candidate, verdict } of evaluated) {
    if (verdict.decision === "add" && verdict.feedUrl) {
      const id = makeSourceId(verdict.feedUrl, { ...registry, sources });
      const entry = SourceEntrySchema.parse({
        id,
        type: inferType(verdict.feedUrl),
        url: verdict.feedUrl,
        channels: verdict.channels,
        enabled: true,
        trustScore: verdict.trust,
        addedBy: "scout",
        addedAt: now,
      });
      sources.push(entry);
      report.added.push(id);
    } else if (verdict.decision === "queue") {
      pending.push({ candidate, feedUrl: verdict.feedUrl, trust: verdict.trust, reason: verdict.reason });
      report.queued.push(candidate.url);
    } else {
      report.rejected.push({ url: candidate.url, reason: verdict.reason });
    }
  }

  return { registry: { ...registry, sources }, pending, report };
}
