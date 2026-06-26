/**
 * Retry / backoff utilities for resilient network calls.
 *
 * Extracted so ingest.ts and youtube.ts can share the same strategy without
 * coupling the source fetcher to the enrich-content layer.
 */

/** Milliseconds to wait between source fetches (anti-self-throttle). */
export const INTER_SOURCE_DELAY_MS = 120;

/** Maximum number of attempts per source (first attempt + N-1 retries). */
export const MAX_ATTEMPTS = 3;

/** Base backoff delay for the first retry, in milliseconds. */
export const BACKOFF_BASE_MS = 1000;

/** Backoff multiplier — each subsequent retry doubles the previous delay. */
const BACKOFF_MULTIPLIER = 2;

/**
 * Sleep for `ms` milliseconds. Extracted so tests can swap it for a no-op.
 * @internal
 */
export type SleepFn = (ms: number) => Promise<void>;
export const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Classify an error as retryable. We retry on:
 *  - Thrown exceptions (network errors, DNS failures, etc.)
 *  - HTTP 429 (rate-limited) and 5xx server errors
 *
 * 4xx client errors (except 429) are not retried — there is no point.
 */
function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * Run `fn` with exponential backoff, retrying up to `maxAttempts` times on
 * network failures and retryable HTTP status codes. The `fn` receives the
 * attempt number (1-based) in case it needs to vary behaviour.
 *
 * - Thrown exceptions always trigger a retry.
 * - HTTP responses with `ok === false` trigger a retry only for 429 / 5xx.
 * - Returns the last response / throws the last error after all attempts
 *   are exhausted (never suppresses the final result — callers decide).
 *
 * All timing constants are injected so unit tests run instantly.
 */
export async function withRetry<T extends { ok: boolean; status: number }>(
  fn: (attempt: number) => Promise<T>,
  opts?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    sleepFn?: SleepFn;
  },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? MAX_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? BACKOFF_BASE_MS;
  const sleep = opts?.sleepFn ?? defaultSleep;

  let lastError: unknown;
  let delay = baseDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn(attempt);
      // Non-retryable HTTP errors (4xx except 429) are returned immediately.
      if (!result.ok && !isRetryable(result.status)) return result;
      // Success or non-retryable error → return.
      if (result.ok || attempt === maxAttempts) return result;
      // Retryable HTTP status → back off and retry.
      await sleep(delay);
      delay *= BACKOFF_MULTIPLIER;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      await sleep(delay);
      delay *= BACKOFF_MULTIPLIER;
    }
  }

  // All attempts exhausted; re-throw the last network error.
  throw lastError;
}
