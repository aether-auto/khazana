import { expect, test, vi } from "vitest";
import { withRetry } from "./retry.js";

// ---- helpers ----------------------------------------------------------------

/** Instant sleep mock — records call count without blocking. */
function makeSleepSpy() {
  const delays: number[] = [];
  const fn = async (ms: number) => { delays.push(ms); };
  return { fn, delays };
}

// ---- withRetry: success on first attempt ------------------------------------

test("returns immediately when fn succeeds on first attempt", async () => {
  const sleep = makeSleepSpy();
  let calls = 0;
  const result = await withRetry(
    async () => { calls++; return { ok: true, status: 200 }; },
    { maxAttempts: 3, baseDelayMs: 50, sleepFn: sleep.fn },
  );
  expect(result.ok).toBe(true);
  expect(calls).toBe(1);
  expect(sleep.delays).toHaveLength(0); // no backoff on immediate success
});

// ---- withRetry: retries on thrown error -------------------------------------

test("retries on thrown error and succeeds on second attempt", async () => {
  const sleep = makeSleepSpy();
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls === 1) throw new Error("network error");
      return { ok: true, status: 200 };
    },
    { maxAttempts: 3, baseDelayMs: 100, sleepFn: sleep.fn },
  );
  expect(result.ok).toBe(true);
  expect(calls).toBe(2);
  expect(sleep.delays).toEqual([100]); // backed off once
});

// ---- withRetry: exponential backoff -----------------------------------------

test("applies exponential backoff across all retries before giving up", async () => {
  const sleep = makeSleepSpy();
  let calls = 0;
  await expect(
    withRetry(
      async () => { calls++; throw new Error("always fails"); },
      { maxAttempts: 3, baseDelayMs: 50, sleepFn: sleep.fn },
    ),
  ).rejects.toThrow("always fails");
  expect(calls).toBe(3); // three total attempts
  expect(sleep.delays).toEqual([50, 100]); // 50 → 100 (doubles each time)
});

// ---- withRetry: retries on HTTP 429 (rate-limited) --------------------------

test("retries on HTTP 429 rate-limit and succeeds on third attempt", async () => {
  const sleep = makeSleepSpy();
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) return { ok: false, status: 429 };
      return { ok: true, status: 200 };
    },
    { maxAttempts: 3, baseDelayMs: 40, sleepFn: sleep.fn },
  );
  expect(result.ok).toBe(true);
  expect(calls).toBe(3);
  expect(sleep.delays).toEqual([40, 80]);
});

// ---- withRetry: retries on HTTP 5xx -----------------------------------------

test("retries on HTTP 503 and gives up after maxAttempts, returning last response", async () => {
  const sleep = makeSleepSpy();
  let calls = 0;
  const result = await withRetry(
    async () => { calls++; return { ok: false, status: 503 }; },
    { maxAttempts: 3, baseDelayMs: 30, sleepFn: sleep.fn },
  );
  expect(result.ok).toBe(false);
  expect(result.status).toBe(503);
  expect(calls).toBe(3);
  expect(sleep.delays).toHaveLength(2);
});

// ---- withRetry: does NOT retry on 404 (non-retryable 4xx) -------------------

test("returns immediately on HTTP 404 without retrying", async () => {
  const sleep = makeSleepSpy();
  let calls = 0;
  const result = await withRetry(
    async () => { calls++; return { ok: false, status: 404 }; },
    { maxAttempts: 3, baseDelayMs: 50, sleepFn: sleep.fn },
  );
  expect(result.ok).toBe(false);
  expect(result.status).toBe(404);
  expect(calls).toBe(1); // no retry on 4xx (except 429)
  expect(sleep.delays).toHaveLength(0);
});

// ---- withRetry: succeeds on retry after 5xx ---------------------------------

test("retries on 500 and succeeds on next attempt", async () => {
  const sleep = makeSleepSpy();
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 500 };
      return { ok: true, status: 200 };
    },
    { maxAttempts: 3, baseDelayMs: 20, sleepFn: sleep.fn },
  );
  expect(result.ok).toBe(true);
  expect(calls).toBe(2);
  expect(sleep.delays).toEqual([20]);
});

// ---- ingest: parallel processing with pooledMap ----------------------------

test("runIngest processes multiple sources and collects all results", async () => {
  const { runIngest } = await import("./ingest.js");
  const delays: number[] = [];
  const sleepFn = async (ms: number) => { delays.push(ms); };

  const registry = {
    version: 1 as const,
    sources: [
      { id: "s1", type: "rss" as const, url: "https://a.com/feed", channels: ["tech" as const], enabled: true, trustScore: 0.6, addedBy: "seed" as const, failureCount: 0 },
      { id: "s2", type: "rss" as const, url: "https://b.com/feed", channels: ["ai" as const], enabled: true, trustScore: 0.6, addedBy: "seed" as const, failureCount: 0 },
      { id: "s3", type: "rss" as const, url: "https://c.com/feed", channels: ["tech" as const], enabled: true, trustScore: 0.6, addedBy: "seed" as const, failureCount: 0 },
    ],
  };
  const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>X</title><link>https://x.com/1</link></item></channel></rss>`;
  const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => RSS, json: async () => ({}) });

  const result = await runIngest(registry, { now: "2026-06-25T00:00:00.000Z", fetchFn, extract: { enabled: false }, sleepFn });

  // All three sources processed successfully (parallel pooledMap + PerHostLimiter)
  expect(result.results).toHaveLength(3);
  expect(result.results.every((r) => r.ok)).toBe(true);
  // sleepFn is only used for retry backoff — no inter-source sleep in the parallel path
  const retrySleeps = delays.filter((d) => d >= 1000); // backoff starts at BACKOFF_BASE_MS=1000
  expect(retrySleeps).toHaveLength(0); // no retries needed on first-try success
});
