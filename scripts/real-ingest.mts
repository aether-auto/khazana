// One-off real ingestion + curation over the full registry, with full-text
// extraction ON and a per-source cap so the run stays tractable. Writes real
// data/feed/raw.json + data/feed/curated.json (and taste.json best-effort).
import { loadRegistry, saveRegistry, writeFeed, runIngest } from "../packages/ingest/src/index.ts";
import { readRawFeed, readEvents, runCurate, writeCuratedFeed, makeLlmClientFromEnv } from "../packages/curate/src/index.ts";

const dataDir = new URL("../data/", import.meta.url).pathname;
const now = new Date().toISOString();
const LIMIT = Number(process.env.LIMIT ?? 4);
// Optional sourceType filter: SOURCE_TYPES=youtube,podcast
const SOURCE_TYPES = process.env.SOURCE_TYPES
  ? new Set(process.env.SOURCE_TYPES.split(",").map((s) => s.trim()))
  : null;
// EXTRACT toggle: the frequent cheap refresh (feed-refresh) sets EXTRACT=0 to
// skip full-text/transcript extraction — it only needs the fresh feed LIST;
// article bodies come from the deep daily pipeline + the reads researcher.
// Default ON (unset/anything else) preserves prior behavior.
const EXTRACT = !/^(0|false)$/i.test((process.env.EXTRACT ?? "").trim());

console.log(`[real-ingest] start ${now} — dataDir=${dataDir} limitPerSource=${LIMIT}`);
console.log(`[real-ingest] extraction: ${EXTRACT ? "on" : "off"}`);
if (SOURCE_TYPES) console.log(`[real-ingest] filtering to sourceTypes: ${[...SOURCE_TYPES].join(", ")}`);

const registry = loadRegistry(dataDir);
// Apply sourceType filter when requested (e.g. targeted YouTube+podcast re-ingest).
if (SOURCE_TYPES) {
  for (const s of registry.sources) {
    if (!SOURCE_TYPES.has(s.type)) s.enabled = false;
  }
}
console.log(`[real-ingest] ${registry.sources.filter((s) => s.enabled).length} enabled sources`);

// ── Throttled progress heartbeat ──────────────────────────────────────────
// A slow/stuck cloud run must show LIFE in the Actions log. We print a
// progress line at most once every ~10s OR every ~25 sources (whichever
// comes first) — never per-source (720 lines is spam). Wall-clock throttle.
const runStart = Date.now();
const HEARTBEAT_MS = 10_000;
const HEARTBEAT_EVERY = 25;
let lastBeatAt = runStart;
let lastBeatDone = 0;
const elapsedSec = () => Math.round((Date.now() - runStart) / 1000);

const { items, results } = await runIngest(registry, {
  now,
  limitPerSource: LIMIT,
  ...(EXTRACT ? {} : { extract: { enabled: false } }),
  onProgress: (p) => {
    const dueByTime = Date.now() - lastBeatAt >= HEARTBEAT_MS;
    const dueByCount = p.done - lastBeatDone >= HEARTBEAT_EVERY;
    // Always print the final source so the last line is exact.
    if (dueByTime || dueByCount || p.done === p.total) {
      lastBeatAt = Date.now();
      lastBeatDone = p.done;
      console.log(
        `[real-ingest] progress ${p.done}/${p.total} sources (ok=${p.okSoFar} fail=${p.failedSoFar}) · ${p.itemsSoFar} items · ${elapsedSec()}s elapsed`,
      );
    }
  },
  ...(EXTRACT
    ? {
        onExtractProgress: (p) => {
          // Extraction is the long tail; heartbeat it on the same wall-clock cadence.
          if (Date.now() - lastBeatAt >= HEARTBEAT_MS || p.done === p.total) {
            lastBeatAt = Date.now();
            console.log(
              `[real-ingest] extracting ${p.done}/${p.total} items · ${elapsedSec()}s elapsed`,
            );
          }
        },
      }
    : {}),
});
const ingestSec = elapsedSec();
const ok = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
const itemsPerSec = ingestSec > 0 ? (items.length / ingestSec).toFixed(1) : "∞";
console.log(`[real-ingest] ingested ${items.length} items from ${ok}/${results.length} sources in ${ingestSec}s (${itemsPerSec} items/s)`);
console.log(`[real-ingest] failed sources: ${failed.length}`);

// ── Failure summary: grouped, capped, actionable ──────────────────────────
// Group failures by error message so a systemic problem (e.g. every reddit
// source 429ing) shows as one line with a count, not 40 identical lines.
if (failed.length > 0) {
  const byError = new Map<string, string[]>();
  for (const r of failed) {
    const msg = (r.error ?? "unknown error").trim();
    const ids = byError.get(msg) ?? [];
    ids.push(r.id);
    byError.set(msg, ids);
  }
  // Most-common errors first.
  const groups = [...byError.entries()].sort((a, b) => b[1].length - a[1].length);
  const CAP = 15;
  console.log(`[real-ingest] failure summary (${failed.length} failed, ${groups.length} distinct errors):`);
  let shown = 0;
  for (const [msg, ids] of groups) {
    if (shown >= CAP) break;
    const head = ids[0];
    const extra = ids.length > 1 ? ` (+${ids.length - 1} more: ${ids.slice(1, 4).join(", ")}${ids.length > 4 ? ", …" : ""})` : "";
    console.log(`  ✗ ${head} — ${msg}${extra}`);
    shown += 1;
  }
  if (groups.length > CAP) {
    const remaining = groups.slice(CAP).reduce((n, [, ids]) => n + ids.length, 0);
    console.log(`  (+${remaining} more failures across ${groups.length - CAP} other error(s))`);
  }
}

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
console.log(`[real-ingest] DONE — total ${elapsedSec()}s elapsed (${items.length} items, ${failed.length} source failures)`);
