// One-off real ingestion + curation over the full registry, with full-text
// extraction ON and a per-source cap so the run stays tractable. Writes real
// data/feed/raw.json + data/feed/curated.json (and taste.json best-effort).
import {
  loadRegistry,
  saveRegistry,
  saveSourceHealth,
  writeFeed,
  runIngest,
  rediscoverMovedFeeds,
  defaultFetch,
} from "../packages/ingest/src/index.ts";
import { readRawFeed, readEvents, runCurate, writeCuratedFeed, makeLlmClientFromEnv } from "../packages/curate/src/index.ts";
// Import from the package SOURCE by relative path (not the "@khazana/core"
// specifier) — root-level scripts run via `tsx` can't resolve the workspace
// package name (matches fetch-events.mts's convention).
import { reconcileRegistry, extractSourceHealth } from "../packages/core/src/index.ts";
import type { FeedItem } from "../packages/core/src/index.ts";
import { installCrashBackstop } from "./lib/crash-backstop.mts";

const dataDir = new URL("../data/", import.meta.url).pathname;
const now = new Date().toISOString();

// ── Crash backstop (defense-in-depth) ───────────────────────────────────────
// A live run once crashed the WHOLE ~720-source ingest with an uncaught
// Node/undici HTTP-parser AssertionError thrown asynchronously off a socket
// event — a class of failure no try/catch around a fetch() call can stop.
// Installed FIRST, before runIngest starts, so no async failure window during
// the run is left uncovered. `preEnrichItems` is filled by `onPreEnrich`
// below the instant source-fetch finishes (i.e. before the enrich phase,
// where that crash class lives) so a fatal error mid-enrichment can still
// salvage every source's already-collected raw items instead of losing the
// whole run. See scripts/lib/crash-backstop.mts for the full incident write-up.
let preEnrichItems: FeedItem[] | null = null;
installCrashBackstop({
  getSalvageItems: () => preEnrichItems,
  writeFeed: (items) => {
    writeFeed(dataDir, items);
  },
});
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

const { items, results, fetchResults } = await runIngest(registry, {
  now,
  limitPerSource: LIMIT,
  ...(EXTRACT ? {} : { extract: { enabled: false } }),
  // Salvage anchor for the crash backstop above: fires once source-fetch has
  // fully collected + deduped every source's items, right before the enrich
  // phase (YouTube transcript fetches et al.) — where the undici crash class
  // lives — starts.
  onPreEnrich: (pre) => {
    preEnrichItems = pre;
  },
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

// ── Self-healing: fold this run's classified fetch outcomes into persisted
// status + the real strike counter (mirrors packages/ingest/src/cli.ts's
// wiring — this used to only bump the legacy `failureCount`, leaving
// auto-disable/re-probe structurally inert on the production path). Success
// resets strikes; transient failures never strike/disable; permanent
// failures strike toward DISABLE_THRESHOLD (3 consecutive); a disabled source
// gets one bounded re-probe every REPROBE_AFTER_MS (7 days) — see
// packages/core/src/source-verify.ts.
const { registry: reconciled, actions, rediscover } = reconcileRegistry(registry, fetchResults, { now });

// Before finalizing an auto-disable, probe for a moved feed and repair it.
const healed = await rediscoverMovedFeeds(reconciled, rediscover, defaultFetch, { now });

// Keep the legacy `failureCount` last-run flag in sync for the site's
// existing read (superseded by `consecutiveFailures` as the real strike counter).
const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
const attempted = new Set(results.map((r) => r.id));
for (const s of healed.sources) {
  if (!attempted.has(s.id)) continue;
  if (okIds.has(s.id)) s.failureCount = 0;
  else s.failureCount += 1;
}
saveRegistry(dataDir, healed);

// Committed cross-clone persistence: data/sources.json (just written above) is
// gitignored and never survives a fresh CI checkout, so status/
// consecutiveFailures/disabledAt would otherwise reset to nothing every run —
// the auto-disable/re-probe machinery would run but never accumulate state.
// data/source-health.json is a small COMMITTED subset (status subset only,
// not url/type/channels/...) that pipeline.yml commits back once/day;
// loadRegistry layers it onto the seed on the next run that has no local
// sources.json. feed-refresh.yml writes this file too but has no commit step
// (contents:read) — that write is a harmless no-op in effect, consistent with
// its deploy-only role.
saveSourceHealth(dataDir, extractSourceHealth(healed));

const disabledCount = actions.filter((a) => a.action === "disable").length;
const repairedCount = rediscover.filter((r) => healed.sources.find((s) => s.id === r.id)?.status === "active").length;
console.log(
  `[real-ingest] source health: ${disabledCount} newly disabled, ${repairedCount} rediscovered, ` +
    `${fetchResults.filter((r) => !r.ok).length} sources with fetch errors this run`,
);
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
