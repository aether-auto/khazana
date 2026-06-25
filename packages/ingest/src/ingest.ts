import type { FeedItem, Registry } from "@khazana/core";
import { buildSource, defaultFetch, type FetchFn } from "./fetchers/build-source.js";
import { enrichContent, type EnrichContentOptions } from "./enrich-content.js";

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
  },
): Promise<IngestResult> {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const results: SourceResult[] = [];
  const all: FeedItem[] = [];
  for (const entry of registry.sources) {
    if (!entry.enabled) continue;
    try {
      const items = await buildSource(entry, fetchFn).fetch({ now: opts.now, limit: opts.limitPerSource });
      all.push(...items);
      results.push({ id: entry.id, ok: true, count: items.length });
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
