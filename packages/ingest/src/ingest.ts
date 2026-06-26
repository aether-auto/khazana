import type { FeedItem, Registry } from "@khazana/core";
import { buildSource, defaultFetch, type FetchFn } from "./fetchers/build-source.js";
import { enrichContent, type EnrichContentOptions } from "./enrich-content.js";
import { withRetry, INTER_SOURCE_DELAY_MS, MAX_ATTEMPTS, BACKOFF_BASE_MS, defaultSleep, type SleepFn } from "./retry.js";

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
  const results: SourceResult[] = [];
  const all: FeedItem[] = [];

  const enabled = registry.sources.filter((s) => s.enabled);
  for (let i = 0; i < enabled.length; i++) {
    const entry = enabled[i]!;
    // Small inter-source spacing: avoids self-throttling when hitting the
    // same platform (e.g. YouTube) with many sequential requests. First
    // source fires immediately; subsequent sources wait.
    if (i > 0) await sleep(INTER_SOURCE_DELAY_MS);

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
      all.push(...items.items);
      results.push({ id: entry.id, ok: true, count: items.items.length });
    } catch (err) {
      results.push({ id: entry.id, ok: false, count: 0, error: err instanceof Error ? err.message : String(err) });
    }
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
