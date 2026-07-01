import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { defaultFetch, type FetchFn } from "@khazana/ingest";
import { applyScout, type Evaluated } from "./apply.js";
import { mergeAppraisal } from "./appraisal.js";
import { evaluateCandidate } from "./evaluate.js";
import { fetchAndDiscoverFeed } from "./discover-feed.js";
import { generateCandidates, renderCandidateBrief } from "./generate.js";
import { computeGaps, renderBrief } from "./gaps.js";
import {
  loadAppraisals,
  loadCandidates,
  loadCurated,
  loadCuratedRaw,
  loadEvents,
  loadPendingCandidates,
  loadRegistry,
  saveRegistry,
  writeBrief,
  writeCandidateBrief,
  writePending,
  writePendingCandidates,
  writeReport,
} from "./io.js";
import type { Candidate } from "./io.js";
import { pruneRegistry } from "./prune.js";

/**
 * `scout discover`: the deterministic (no-AI, no bulk-network) candidate
 * GENERATION step. Emits two things:
 *   1. the legacy gaps brief (`scout/brief.md`),
 *   2. NEW: generated candidates written to the pending queue
 *      (`sources.pending.json`) plus a candidate-appraisal brief
 *      (`scout/candidate-brief.md`) for the cloud Sonnet appraiser.
 */
export function discoverMain(dataDir: string, now: string): void {
  const registry = loadRegistry(dataDir);
  const curated = loadCurated(dataDir);
  const events = loadEvents(dataDir);
  const raw = loadCuratedRaw(dataDir);

  // Legacy gaps brief (under-served channels / engaged / outbound domains).
  const gaps = computeGaps(registry, curated, events);
  const briefPath = writeBrief(dataDir, renderBrief(gaps, now));

  // No-AI candidate generation over already-available feed data.
  const opmlPath = join(dataDir, "scout", "feeds.opml");
  const opml = existsSync(opmlPath) ? readFileSync(opmlPath, "utf8") : undefined;
  const candidates = generateCandidates({ registry, curated, raw, opml });
  const pendingPath = writePendingCandidates(dataDir, candidates);
  const candBriefPath = writeCandidateBrief(dataDir, renderCandidateBrief(candidates, now));

  console.log(
    `[scout] discovery: ${candidates.length} candidate(s) → ${pendingPath}, ${candBriefPath} (gaps → ${briefPath})`,
  );
}

/**
 * `scout apply`: consume the cloud appraiser's verdicts (or, legacy, a
 * hand-written `candidates.json`), prune/repair the registry, then evaluate and
 * apply — auto-adding high-confidence sources and queuing borderline ones for
 * one-tap review. Deterministic; the only network is per-candidate feed
 * autodiscovery (skipped when the candidate already carries a `feedUrl`).
 */
export async function applyMain(dataDir: string, now: string, fetchFn: FetchFn = defaultFetch): Promise<void> {
  const loaded = loadRegistry(dataDir);

  // Prefer the appraisal-driven queue; fall back to the legacy candidates file.
  const appraisals = loadAppraisals(dataDir);
  const candidates: Candidate[] = appraisals.length
    ? mergeAppraisal(loadPendingCandidates(dataDir), appraisals)
    : loadCandidates(dataDir);

  // 1. prune/repair existing sources (disable-not-delete) BEFORE evaluating new ones.
  const { registry: pruned, actions } = pruneRegistry(loaded, { now });

  // 2. autodiscover (unless a feedUrl is supplied) + evaluate each candidate.
  const evaluated: Evaluated[] = [];
  for (const candidate of candidates) {
    const feedUrl = candidate.feedUrl ?? (await fetchAndDiscoverFeed(candidate.url, fetchFn));
    evaluated.push({ candidate, verdict: evaluateCandidate(candidate, feedUrl, pruned) });
  }

  // 3. apply decisions.
  const { registry, pending, report } = applyScout(pruned, evaluated, now);
  report.pruned = actions;

  saveRegistry(dataDir, registry);
  const reviewPath = writePending(dataDir, pending);
  const reportPath = writeReport(dataDir, report);
  console.log(
    `[scout] +${report.added.length} added, ${report.queued.length} queued, ` +
      `${report.rejected.length} rejected, ${report.pruned.length} pruned → ${reportPath}, ${reviewPath}`,
  );
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  const dataDir = join(dirname(here), "..", "..", "..", "data");
  const now = new Date().toISOString();
  const cmd = process.argv[2];
  const run = cmd === "apply" ? applyMain(dataDir, now) : Promise.resolve(discoverMain(dataDir, now));
  run.catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
