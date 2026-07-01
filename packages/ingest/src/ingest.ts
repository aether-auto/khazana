import type { FeedItem, Registry } from "@khazana/core";
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
  },
): Promise<IngestResult> {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const sleep = opts.sleepFn ?? defaultSleep;
  const caches = opts.caches ?? ephemeralCaches();

  const enabled = registry.sources.filter((s) => s.enabled);

  const concurrency =
    parseInt(process.env["INGEST_CONCURRENCY"] ?? "", 10) || DEFAULT_INGEST_CONCURRENCY;
  // Reddit's unauth `.rss` budget is tight — give www.reddit.com a generous gap
  // (REDDIT_MIN_GAP_MS, default 4s) without slowing every other host.
  const hostLimiter = new PerHostLimiter({
    hostGapMs: { "www.reddit.com": resolveRedditMinGapMs() },
  });

  const sourceResults = await pooledMap(
    enabled,
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

      return hostLimiter.run(hostname, async () => {
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

  // Best-effort full-text/transcript enrichment of body. Resilient: never throws.
  // Share the same caches + a per-host limiter across the enrich phase.
  await enrichContent(items, fetchFn, {
    ...opts.extract,
    caches,
    hostLimiter: new PerHostLimiter(),
  });
  return { items, results, fetchResults, cacheStats: caches.stats.snapshot() };
}
