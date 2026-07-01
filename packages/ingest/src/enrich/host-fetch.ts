/**
 * Rate-limit hardening for the enrich / full-text phase.
 *
 * The article-extraction phase used to fetch publisher pages up to `concurrency`
 * wide with no per-host gap and no 429 handling — so a publisher with many new
 * posts in one run could be hit in a burst. These helpers route those fetches
 * through the same `PerHostLimiter` used for the source-fetch phase (per-host
 * semaphore + min-gap) and add a light 429/503 backoff, mirroring how arXiv
 * mirrors are already limited.
 *
 * Both helpers are resilient: they resolve to null (never throw) so a single
 * bad page never affects the rest of the run.
 */

import type { FetchFn, FetchResult } from "../fetchers/build-source.js";
import type { PerHostLimiter } from "../concurrency.js";
import { defaultSleep, type SleepFn } from "../retry.js";

/** Max attempts for enrich-phase 429/503 backoff. Env: ENRICH_MAX_ATTEMPTS */
export const DEFAULT_ENRICH_MAX_ATTEMPTS =
  parseInt(process.env["ENRICH_MAX_ATTEMPTS"] ?? "", 10) || 2;

/** Base backoff delay (ms) for enrich-phase retries. Env: ENRICH_BACKOFF_BASE_MS */
export const DEFAULT_ENRICH_BACKOFF_BASE_MS =
  parseInt(process.env["ENRICH_BACKOFF_BASE_MS"] ?? "", 10) || 1500;

/**
 * Fetch `url` through `limiter`, keyed by its hostname, so many articles from
 * one publisher don't burst. Returns null when the URL can't be parsed (so the
 * caller cleanly falls through) — never throws.
 */
export async function hostLimitedFetch(
  fetchFn: FetchFn,
  url: string,
  limiter: PerHostLimiter,
  init?: { headers?: Record<string, string> },
): Promise<FetchResult | null> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  return limiter.run(hostname, async () => {
    try {
      return await fetchFn(url, init);
    } catch {
      return null;
    }
  });
}

/**
 * Fetch with a light backoff on transient rate-limit / server errors
 * (429, 503, and 5xx). Permanent statuses (2xx, 4xx≠429) return immediately.
 * Resolves to null on a thrown network error. Never throws.
 */
export async function backoffFetch(
  fetchFn: FetchFn,
  url: string,
  init: { headers?: Record<string, string> } | undefined,
  opts?: { maxAttempts?: number; baseDelayMs?: number; sleepFn?: SleepFn },
): Promise<FetchResult | null> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_ENRICH_MAX_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_ENRICH_BACKOFF_BASE_MS;
  const sleep = opts?.sleepFn ?? defaultSleep;

  let delay = baseDelayMs;
  let last: FetchResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchFn(url, init);
      last = res;
      // Retry only transient statuses.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxAttempts) return res;
        await sleep(delay);
        delay *= 2;
        continue;
      }
      return res;
    } catch {
      // Network error — retry until attempts exhausted, then give up as null.
      if (attempt === maxAttempts) return null;
      await sleep(delay);
      delay *= 2;
    }
  }
  return last;
}
