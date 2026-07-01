import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileRegistry } from "@khazana/core";
import { loadRegistry, saveRegistry, writeFeed } from "./registry-io.js";
import { runIngest } from "./ingest.js";
import { rediscoverMovedFeeds } from "./rediscover.js";
import { defaultFetch } from "./fetchers/build-source.js";
import { makeCaches } from "./cache/store.js";
import type { FetchFn } from "./fetchers/build-source.js";

export async function main(dataDir: string, now: string, fetchFn?: FetchFn): Promise<void> {
  const registry = loadRegistry(dataDir);
  // `runIngest` only fetches `enabled` sources, so anything auto-disabled by a
  // prior run's reconcile is skipped here automatically.
  const { items, results, fetchResults, cacheStats } = await runIngest(registry, {
    now,
    fetchFn,
    // Persist across runs (respects INGEST_CACHE_DIR) so conditional GET +
    // transcript + full-text caches survive between ingests.
    caches: makeCaches(),
  });

  // Self-healing: fold this run's classified fetch outcomes into persisted
  // status + the real strike counter (`consecutiveFailures`). Success resets,
  // transient never strikes/disables, permanent strikes toward auto-disable.
  const { registry: reconciled, actions, rediscover } = reconcileRegistry(registry, fetchResults, { now });

  // Before finalizing an auto-disable, probe for a moved feed and repair it.
  const healed = await rediscoverMovedFeeds(reconciled, rediscover, fetchFn ?? defaultFetch, { now });

  // Keep the legacy `failureCount` last-run flag in sync for the site's
  // existing read (superseded by `consecutiveFailures` as the strike counter).
  const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
  const attempted = new Set(results.map((r) => r.id));
  for (const s of healed.sources) {
    if (!attempted.has(s.id)) continue;
    if (okIds.has(s.id)) s.failureCount = 0;
    else s.failureCount += 1;
  }

  saveRegistry(dataDir, healed);
  const path = writeFeed(dataDir, items);
  const okCount = results.filter((r) => r.ok).length;
  const disabled = actions.filter((a) => a.action === "disable").length;
  const repaired = rediscover.filter((r) => healed.sources.find((s) => s.id === r.id)?.status === "active").length;
  console.log(`[ingest] ${items.length} items from ${okCount}/${results.length} sources → ${path}`);
  console.log(
    `[ingest] cache: ${cacheStats.hits} hits / ${cacheStats.misses} misses; ` +
      `${fetchResults.filter((r) => !r.ok).length} sources with fetch errors; ` +
      `${disabled} disabled, ${repaired} rediscovered`,
  );
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
