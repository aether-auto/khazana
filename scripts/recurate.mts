// Re-curate ONLY over the existing data/feed/raw.json — no network, no LLM key.
// raw.json already carries enrichment topics, so this regenerates curated.json
// with the new two-tier maker read-time floor applied. Use after a curate-logic
// change to avoid a full (slow, key-needing) re-ingest.
import { readRawFeed, readEvents, runCurate, writeCuratedFeed, makeLlmClientFromEnv } from "../packages/curate/src/index.ts";

const dataDir = new URL("../data/", import.meta.url).pathname;
const now = new Date().toISOString();
const raw = readRawFeed(dataDir);
const events = readEvents(dataDir);
const client = makeLlmClientFromEnv();
console.log(`[recurate] curating ${raw.length} raw items (llm=${client ? "on" : "off"})…`);
const { items, clusterCount, profileReady } = await runCurate(raw, events, client, { now });
const path = writeCuratedFeed(dataDir, items);
console.log(`[recurate] wrote ${path} — ${items.length} curated, ${clusterCount} clusters, profileReady=${profileReady}`);
const u5 = items.filter((i) => {
  const t = (i.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t ? Math.round(t.split(/\s+/).length / 225) < 5 : false;
}).length;
console.log(`[recurate] items under 5-min (the new short-maker tier): ${u5}`);
console.log(`[recurate] DONE`);
