import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, saveRegistry, writeFeed } from "./registry-io.js";
import { runIngest } from "./ingest.js";
import type { FetchFn } from "./fetchers/build-source.js";

export async function main(dataDir: string, now: string, fetchFn?: FetchFn): Promise<void> {
  const registry = loadRegistry(dataDir);
  const { items, results } = await runIngest(registry, { now, fetchFn });
  const byId = new Map(results.map((r) => [r.id, r]));
  for (const s of registry.sources) {
    const r = byId.get(s.id);
    if (!r) continue;
    if (r.ok) {
      s.lastFetchedAt = now;
      s.failureCount = 0;
    } else {
      s.failureCount += 1;
    }
  }
  saveRegistry(dataDir, registry);
  const path = writeFeed(dataDir, items);
  const okCount = results.filter((r) => r.ok).length;
  console.log(`[ingest] ${items.length} items from ${okCount}/${results.length} sources → ${path}`);
  for (const r of results.filter((r) => !r.ok)) {
    console.warn(`[ingest] FAILED ${r.id}: ${r.error}`);
  }
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  const dataDir = join(dirname(here), "..", "..", "..", "data");
  main(dataDir, new Date().toISOString()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
