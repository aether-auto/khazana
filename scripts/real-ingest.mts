// One-off real ingestion + curation over the full registry, with full-text
// extraction ON and a per-source cap so the run stays tractable. Writes real
// data/feed/raw.json + data/feed/curated.json (and taste.json best-effort).
import { loadRegistry, saveRegistry, writeFeed, runIngest } from "../packages/ingest/src/index.ts";
import { readRawFeed, readEvents, runCurate, writeCuratedFeed, makeLlmClientFromEnv } from "../packages/curate/src/index.ts";

const dataDir = new URL("../data/", import.meta.url).pathname;
const now = new Date().toISOString();
const LIMIT = Number(process.env.LIMIT ?? 4);

console.log(`[real-ingest] start ${now} — dataDir=${dataDir} limitPerSource=${LIMIT}`);

const registry = loadRegistry(dataDir);
console.log(`[real-ingest] ${registry.sources.filter((s) => s.enabled).length} enabled sources`);

const { items, results } = await runIngest(registry, { now, limitPerSource: LIMIT });
const ok = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`[real-ingest] ingested ${items.length} items from ${ok}/${results.length} sources`);
console.log(`[real-ingest] failed sources: ${failed.length}`);

// update registry health
const byId = new Map(results.map((r) => [r.id, r]));
for (const s of registry.sources) {
  const r = byId.get(s.id);
  if (!r) continue;
  if (r.ok) { s.lastFetchedAt = now; s.failureCount = 0; }
  else { s.failureCount += 1; }
}
saveRegistry(dataDir, registry);
const rawPath = writeFeed(dataDir, items);
console.log(`[real-ingest] wrote ${rawPath}`);

// curate (enrich is no-op without an LLM key — graceful; clustering + ranking still run)
const raw = readRawFeed(dataDir);
const events = readEvents(dataDir);
const client = makeLlmClientFromEnv();
console.log(`[real-ingest] curating ${raw.length} items (llm=${client ? "on" : "off"})…`);
const { items: curated, clusterCount, profileReady } = await runCurate(raw, events, client, { now });
const curatedPath = writeCuratedFeed(dataDir, curated);
console.log(`[real-ingest] wrote ${curatedPath} — ${curated.length} curated, ${clusterCount} clusters, profileReady=${profileReady}`);
const withBody = curated.filter((i) => i.body && i.body.length > 400).length;
console.log(`[real-ingest] items with full body text: ${withBody}/${curated.length}`);
console.log(`[real-ingest] DONE`);
