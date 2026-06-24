import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultFetch, type FetchFn } from "@khazana/ingest";
import { applyScout, type Evaluated } from "./apply.js";
import { evaluateCandidate } from "./evaluate.js";
import { fetchAndDiscoverFeed } from "./discover-feed.js";
import { computeGaps, renderBrief } from "./gaps.js";
import {
  loadCandidates,
  loadCurated,
  loadEvents,
  loadRegistry,
  saveRegistry,
  writeBrief,
  writePending,
  writeReport,
} from "./io.js";
import { pruneRegistry } from "./prune.js";

export function discoverMain(dataDir: string, now: string): void {
  const registry = loadRegistry(dataDir);
  const curated = loadCurated(dataDir);
  const events = loadEvents(dataDir);
  const gaps = computeGaps(registry, curated, events);
  const path = writeBrief(dataDir, renderBrief(gaps, now));
  console.log(`[scout] discovery brief → ${path}`);
}

export async function applyMain(dataDir: string, now: string, fetchFn: FetchFn = defaultFetch): Promise<void> {
  const loaded = loadRegistry(dataDir);
  const candidates = loadCandidates(dataDir);

  // 1. prune/repair existing sources (disable-not-delete) BEFORE evaluating new ones.
  const { registry: pruned, actions } = pruneRegistry(loaded, { now });

  // 2. autodiscover + evaluate each candidate against the pruned registry.
  const evaluated: Evaluated[] = [];
  for (const candidate of candidates) {
    const feedUrl = await fetchAndDiscoverFeed(candidate.url, fetchFn);
    evaluated.push({ candidate, verdict: evaluateCandidate(candidate, feedUrl, pruned) });
  }

  // 3. apply decisions.
  const { registry, pending, report } = applyScout(pruned, evaluated, now);
  report.pruned = actions;

  saveRegistry(dataDir, registry);
  const pendingPath = writePending(dataDir, pending);
  const reportPath = writeReport(dataDir, report);
  console.log(
    `[scout] +${report.added.length} added, ${report.queued.length} queued, ` +
      `${report.rejected.length} rejected, ${report.pruned.length} pruned → ${reportPath}, ${pendingPath}`,
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
