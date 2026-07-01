/**
 * Conditional GET (HTTP caching) for feed fetches.
 *
 * We persist each feed's `ETag` / `Last-Modified` validators (keyed by URL hash)
 * and replay them as `If-None-Match` / `If-Modified-Since` on the next run. When
 * the origin answers `304 Not Modified` we skip re-parse + re-enrich entirely —
 * the biggest incremental-run win alongside the transcript cache.
 *
 * The header shaping (`conditionalHeaders`, `extractValidators`) is pure and
 * unit-tested; `conditionalFetch` is the thin IO wrapper around a `FetchFn`.
 */

import type { FetchFn } from "../fetchers/build-source.js";
import type { DiskCache } from "./disk.js";
import type { HttpMeta } from "./store.js";
import { urlKey } from "./keys.js";

/** Build conditional request headers from stored validators (pure). */
export function conditionalHeaders(meta: HttpMeta | undefined): Record<string, string> {
  const h: Record<string, string> = {};
  if (meta?.etag) h["If-None-Match"] = meta.etag;
  if (meta?.lastModified) h["If-Modified-Since"] = meta.lastModified;
  return h;
}

/** Read ETag / Last-Modified from response headers, case-insensitively (pure). */
export function extractValidators(
  headers: Record<string, string> | undefined,
): { etag?: string; lastModified?: string } {
  if (!headers) return {};
  const out: { etag?: string; lastModified?: string } = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (lk === "etag") out.etag = v;
    else if (lk === "last-modified") out.lastModified = v;
  }
  return out;
}

export interface ConditionalFetchResult {
  /** True when the origin returned 304 — the caller should reuse prior items. */
  notModified: boolean;
  /** The fresh response (200/other); undefined when notModified. */
  result?: Awaited<ReturnType<FetchFn>>;
}

/**
 * Fetch `url` with conditional-GET semantics against `httpCache`:
 *   - replay stored validators as If-None-Match / If-Modified-Since,
 *   - on 304 → `{ notModified: true }` (no body work for the caller),
 *   - on 2xx → store the new validators and return the response.
 *
 * `baseHeaders` are the caller's normal request headers (UA/Accept); the
 * conditional headers are merged in (they never collide).
 */
export async function conditionalFetch(
  fetchFn: FetchFn,
  url: string,
  baseHeaders: Record<string, string> | undefined,
  httpCache: DiskCache<HttpMeta>,
): Promise<ConditionalFetchResult> {
  const key = urlKey(url);
  const prior = httpCache.get(key);
  const headers = { ...(baseHeaders ?? {}), ...conditionalHeaders(prior) };

  const result = await fetchFn(url, { headers });

  if (result.status === 304) {
    return { notModified: true };
  }

  if (result.ok) {
    const { etag, lastModified } = extractValidators(result.headers);
    if (etag || lastModified) {
      httpCache.set(key, {
        url,
        etag,
        lastModified,
        fetchedAt: new Date().toISOString(),
      });
    }
  }
  return { notModified: false, result };
}
