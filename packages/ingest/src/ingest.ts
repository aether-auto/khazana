import type { FeedItem, Registry } from "@khazana/core";
import { buildSource, defaultFetch, type FetchFn } from "./fetchers/build-source.js";
import { enrichContent, type EnrichContentOptions } from "./enrich-content.js";
import { withRetry, MAX_ATTEMPTS, BACKOFF_BASE_MS, defaultSleep, type SleepFn } from "./retry.js";
import { pooledMap, PerHostLimiter, DEFAULT_INGEST_CONCURRENCY } from "./concurrency.js";

export interface SourceResult {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
}
export interface IngestResult {
  items: FeedItem[];
  results: SourceResult[];
}

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
  },
): Promise<IngestResult> {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const sleep = opts.sleepFn ?? defaultSleep;

  const enabled = registry.sources.filter((s) => s.enabled);

  const concurrency =
    parseInt(process.env["INGEST_CONCURRENCY"] ?? "", 10) || DEFAULT_INGEST_CONCURRENCY;
  const hostLimiter = new PerHostLimiter();

  const sourceResults = await pooledMap(
    enabled,
    concurrency,
    async (entry) => {
      const hostname = new URL(entry.url).hostname;
      return hostLimiter.run(hostname, async () => {
        try {
          const items = await withRetry(
            async () => {
              const source = buildSource(entry, fetchFn);
              const fetched = await source.fetch({ now: opts.now, limit: opts.limitPerSource });
              // buildSource.fetch throws on non-ok HTTP, but we need an ok/status shape
              // for withRetry's classification. Wrap a successful result.
              return { ok: true, status: 200, items: fetched };
            },
            { maxAttempts: MAX_ATTEMPTS, baseDelayMs: BACKOFF_BASE_MS, sleepFn: sleep },
          );
          return {
            id: entry.id,
            ok: true,
            count: items.items.length,
            items: items.items,
          } as const;
        } catch (err) {
          return {
            id: entry.id,
            ok: false,
            count: 0,
            items: [] as FeedItem[],
            error: err instanceof Error ? err.message : String(err),
          } as const;
        }
      });
    },
  );

  const all: FeedItem[] = [];
  const results: SourceResult[] = [];
  for (const r of sourceResults) {
    all.push(...r.items);
    results.push({ id: r.id, ok: r.ok, count: r.count, error: "error" in r ? r.error : undefined });
  }

  const seen = new Set<string>();
  const items = all.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  // Best-effort full-text/transcript enrichment of body. Resilient: never throws.
  await enrichContent(items, fetchFn, opts.extract);
  return { items, results };
}
