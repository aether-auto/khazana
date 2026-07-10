import type { FeedItem, Registry } from "@khazana/core";
import { isReprobeEligible } from "@khazana/core";
import { buildSource, defaultFetch, type FetchFn } from "./fetchers/build-source.js";
import { enrichContent, type EnrichContentOptions } from "./enrich-content.js";
import { withRetry, MAX_ATTEMPTS, BACKOFF_BASE_MS, defaultSleep, type SleepFn } from "./retry.js";
import { pooledMap, PerHostLimiter, DEFAULT_INGEST_CONCURRENCY } from "./concurrency.js";
import { resolveRedditMinGapMs } from "./fetchers/reddit.js";
import { ephemeralCaches, type IngestCaches } from "./cache/store.js";
import { conditionalHeaders, extractValidators } from "./cache/conditional.js";
import { urlKey } from "./cache/keys.js";
import { classifyError, classifyOk, type SourceFetchResult } from "./fetch-result.js";

export interface SourceResult {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
}

/** Snapshot passed to `onProgress` as each source finishes. */
export interface IngestProgress {
  /** Sources finished so far (1..total). */
  done: number;
  /** Total sources fetched this run (enabled, plus any reprobe-eligible disabled sources). */
  total: number;
  /** Sources that succeeded so far. */
  okSoFar: number;
  /** Sources that failed so far. */
  failedSoFar: number;
  /** Total items collected so far (pre-dedup). */
  itemsSoFar: number;
  /** Id of the source that just finished. */
  lastId: string;
  /** Whether the source that just finished succeeded. */
  lastOk: boolean;
}

/** Snapshot passed to `onExtractProgress` as each item finishes enrichment. */
export interface ExtractProgress {
  /** Items enriched so far (1..total). */
  done: number;
  /** Total items targeted for enrichment. */
  total: number;
}
export interface IngestResult {
  items: FeedItem[];
  results: SourceResult[];
  /**
   * Structured per-source fetch results for the downstream verifier (Wave 2).
   * Classification only — no strike/prune logic here.
   */
  fetchResults: SourceFetchResult[];
  /** Cache hit/miss totals across all namespaces this run. */
  cacheStats: { hits: number; misses: number };
}

/** Sentinel thrown when a conditional GET returns 304 (reuse cached items). */
const NOT_MODIFIED = "__NOT_MODIFIED__";

export async function runIngest(
  registry: Registry,
  opts: {
    now: string;
    fetchFn?: FetchFn;
    limitPerSource?: number;
    /** Full-text / transcript extraction. Default ON; pass `{ enabled: false }` to skip (e.g. offline tests). */
    extract?: EnrichContentOptions;
    /** Override sleep function (injected in tests so the suite doesn't block). */
    sleepFn?: SleepFn;
    /**
     * Persistent caches for the real run (the CLI injects `makeCaches()` →
     * `.cache/ingest/`). Defaults to an ephemeral temp cache so tests and
     * ad-hoc calls never touch the shared on-disk cache.
     */
    caches?: IngestCaches;
    /**
     * Optional, side-effect-free progress hook fired once as each source
     * finishes (in completion order, so it can drive a live heartbeat in the
     * cloud log). Observability only — never affects ingest output. Kept
     * defensive: a throwing callback is swallowed so it can't break the run.
     */
    onProgress?: (p: IngestProgress) => void;
    /**
     * Optional progress hook for the extract/enrich phase, fired once per item
     * enriched. Same guarantees as `onProgress`.
     */
    onExtractProgress?: (p: ExtractProgress) => void;
    /**
     * Optional hook fired ONCE, synchronously, with the deduped items array
     * right before the enrich/extract phase starts — i.e. every source has
     * already been fetched successfully. `enrichContent` mutates this exact
     * array in place (it never reassigns), so a caller that stashes this
     * reference can still see (and persist) the fully-collected, pre-
     * enrichment items even if the process is later killed by an uncaught
     * exception thrown asynchronously from *inside* the enrich phase (e.g. a
     * Node/undici parser assert off a socket event — unreachable by any
     * try/catch here). This is what makes the `real-ingest.mts`
     * uncaughtException/unhandledRejection backstop able to salvage a
     * partial-but-fresh feed instead of losing the whole run. Never affects
     * ingest output; a throwing callback is swallowed.
     */
    onPreEnrich?: (items: FeedItem[]) => void;
  },
): Promise<IngestResult> {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const sleep = opts.sleepFn ?? defaultSleep;
  const caches = opts.caches ?? ephemeralCaches();

  // Fetch set = enabled sources ∪ disabled sources whose bounded re-probe
  // window has elapsed (`isReprobeEligible`, `@khazana/core`). This is how a
  // SYSTEMIC outage (e.g. a whole source type's discovery endpoint 404ing for
  // every entry at once, which permanently auto-disables all of them via
  // `source-verify`'s strike counter) self-heals once the upstream endpoint
  // recovers, instead of staying dead forever. `opts.now` is the sole clock
  // input, so this stays deterministic for tests — never `Date.now()` here.
  const fetchSet = registry.sources.filter((s) => s.enabled || isReprobeEligible(s, opts.now));

  const concurrency =
    parseInt(process.env["INGEST_CONCURRENCY"] ?? "", 10) || DEFAULT_INGEST_CONCURRENCY;
  // Reddit's unauth `.rss` budget is tight — give www.reddit.com a generous gap
  // (REDDIT_MIN_GAP_MS, default 4s) without slowing every other host.
  const hostLimiter = new PerHostLimiter({
    hostGapMs: { "www.reddit.com": resolveRedditMinGapMs() },
  });

  // Completion-ordered running tallies for the optional progress heartbeat.
  // Mutated only from inside the (serialized-by-await) mapper below.
  const total = fetchSet.length;
  let done = 0;
  let okSoFar = 0;
  let failedSoFar = 0;
  let itemsSoFar = 0;
  const report = (r: { id: string; ok: boolean; count: number }): void => {
    if (!opts.onProgress) return;
    done += 1;
    if (r.ok) okSoFar += 1;
    else failedSoFar += 1;
    itemsSoFar += r.count;
    try {
      opts.onProgress({
        done,
        total,
        okSoFar,
        failedSoFar,
        itemsSoFar,
        lastId: r.id,
        lastOk: r.ok,
      });
    } catch {
      // A misbehaving progress callback must never break the pipeline.
    }
  };

  const sourceResults = await pooledMap(
    fetchSet,
    concurrency,
    async (entry) => {
      const hostname = new URL(entry.url).hostname;
      const feedKey = urlKey(entry.url);
      // Reddit owns its own fetch (JSON API / .rss) and doesn't benefit from
      // conditional GET; only wrap generic feed fetches with validators.
      const conditional = entry.type !== "reddit";

      // Wrap fetchFn to replay stored validators and short-circuit on 304.
      const wrappedFetch: FetchFn = conditional
        ? async (url, init) => {
            const applyCond = url === entry.url;
            const headers = applyCond
              ? { ...(init?.headers ?? {}), ...conditionalHeaders(caches.http.get(feedKey)) }
              : init?.headers;
            const res = await fetchFn(url, { ...init, headers });
            if (applyCond && res.status === 304) throw new Error(NOT_MODIFIED);
            if (applyCond && res.ok) {
              const { etag, lastModified } = extractValidators(res.headers);
              if (etag || lastModified) {
                caches.http.set(feedKey, { url: entry.url, etag, lastModified, fetchedAt: opts.now });
              }
            }
            return res;
          }
        : fetchFn;

      const result = await hostLimiter.run(hostname, async () => {
        try {
          const items = await withRetry(
            async () => {
              const source = buildSource(entry, wrappedFetch);
              const fetched = await source.fetch({ now: opts.now, limit: opts.limitPerSource });
              // buildSource.fetch throws on non-ok HTTP, but we need an ok/status shape
              // for withRetry's classification. Wrap a successful result.
              return { ok: true, status: 200, items: fetched };
            },
            { maxAttempts: MAX_ATTEMPTS, baseDelayMs: BACKOFF_BASE_MS, sleepFn: sleep },
          );
          // Persist parsed items so a future 304 can reuse them.
          if (conditional) caches.feedItems.set(feedKey, { url: entry.url, items: items.items, fetchedAt: opts.now });
          return {
            id: entry.id,
            ok: true,
            count: items.items.length,
            items: items.items,
            fetch: classifyOk(entry.id, items.items.length, entry.url),
          } as const;
        } catch (err) {
          // 304 Not Modified → reuse the last run's parsed items (a cache hit).
          if (err instanceof Error && err.message === NOT_MODIFIED) {
            const cached = caches.feedItems.get(feedKey);
            const items = (cached?.items ?? []) as FeedItem[];
            return {
              id: entry.id,
              ok: true,
              count: items.length,
              items,
              fetch: classifyOk(entry.id, items.length, entry.url),
            } as const;
          }
          return {
            id: entry.id,
            ok: false,
            count: 0,
            items: [] as FeedItem[],
            error: err instanceof Error ? err.message : String(err),
            fetch: classifyError(entry.id, err),
          } as const;
        }
      });
      report(result);
      return result;
    },
  );

  const all: FeedItem[] = [];
  const results: SourceResult[] = [];
  const fetchResults: SourceFetchResult[] = [];
  for (const r of sourceResults) {
    all.push(...r.items);
    results.push({ id: r.id, ok: r.ok, count: r.count, error: "error" in r ? r.error : undefined });
    fetchResults.push(r.fetch);
  }

  const seen = new Set<string>();
  const items = all.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  // Fire the pre-enrich salvage hook now — items are fully collected/deduped
  // and about to be handed to the enrich phase, which is where the async
  // uncaught-from-a-socket-event failure class lives (see the option doc).
  if (opts.onPreEnrich) {
    try {
      opts.onPreEnrich(items);
    } catch {
      // A misbehaving hook must never break the pipeline.
    }
  }

  // Best-effort full-text/transcript enrichment of body. Resilient: never throws.
  // Share the same caches + a per-host limiter across the enrich phase.
  await enrichContent(items, fetchFn, {
    ...opts.extract,
    caches,
    hostLimiter: new PerHostLimiter(),
    ...(opts.onExtractProgress ? { onProgress: opts.onExtractProgress } : {}),
  });
  return { items, results, fetchResults, cacheStats: caches.stats.snapshot() };
}
