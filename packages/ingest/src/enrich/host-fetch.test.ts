import { describe, it, expect } from "vitest";
import { hostLimitedFetch, backoffFetch } from "./host-fetch.js";
import { PerHostLimiter } from "../concurrency.js";
import type { FetchFn, FetchResult } from "../fetchers/build-source.js";

function res(status: number, body = ""): FetchResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {},
    text: async () => body,
    json: async () => ({}),
  };
}

describe("hostLimitedFetch", () => {
  it("caps concurrent fetches to the same host via the PerHostLimiter", async () => {
    const limiter = new PerHostLimiter({ maxConcurrent: 2, minGapMs: 0 });
    let current = 0;
    let peak = 0;
    const fetchFn: FetchFn = async () => {
      current++;
      peak = Math.max(peak, current);
      await new Promise((r) => setTimeout(r, 20));
      current--;
      return res(200);
    };
    await Promise.all(
      Array.from({ length: 6 }, () =>
        hostLimitedFetch(fetchFn, "https://pub.example.com/a", limiter),
      ),
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("keys the limiter by hostname so different hosts run in parallel", async () => {
    const limiter = new PerHostLimiter({ maxConcurrent: 1, minGapMs: 0 });
    const started: string[] = [];
    const mk = (host: string): FetchFn => async () => {
      started.push(host);
      await new Promise((r) => setTimeout(r, 40));
      return res(200);
    };
    const p1 = hostLimitedFetch(mk("h1"), "https://h1.com/x", limiter);
    const p2 = hostLimitedFetch(mk("h2"), "https://h2.com/x", limiter);
    await new Promise((r) => setTimeout(r, 15));
    expect(started.length).toBe(2);
    await Promise.all([p1, p2]);
  });

  it("returns null (never throws) when the url is unparseable", async () => {
    const limiter = new PerHostLimiter({ maxConcurrent: 1, minGapMs: 0 });
    const out = await hostLimitedFetch(async () => res(200), "not a url", limiter);
    expect(out).toBeNull();
  });
});

describe("backoffFetch (429/503 awareness)", () => {
  it("retries once on 429 then returns the success", async () => {
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return calls === 1 ? res(429) : res(200, "ok");
    };
    const out = await backoffFetch(fetchFn, "https://x.com/a", undefined, {
      maxAttempts: 3,
      sleepFn: async () => {},
    });
    expect(calls).toBe(2);
    expect(out?.status).toBe(200);
  });

  it("retries on 503 and gives up after maxAttempts, returning the last response", async () => {
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return res(503);
    };
    const out = await backoffFetch(fetchFn, "https://x.com/a", undefined, {
      maxAttempts: 2,
      sleepFn: async () => {},
    });
    expect(calls).toBe(2);
    expect(out?.status).toBe(503);
  });

  it("does not retry a normal 200", async () => {
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return res(200);
    };
    await backoffFetch(fetchFn, "https://x.com/a", undefined, { maxAttempts: 3, sleepFn: async () => {} });
    expect(calls).toBe(1);
  });

  it("does not retry a 404 (permanent)", async () => {
    let calls = 0;
    const fetchFn: FetchFn = async () => {
      calls++;
      return res(404);
    };
    const out = await backoffFetch(fetchFn, "https://x.com/a", undefined, { maxAttempts: 3, sleepFn: async () => {} });
    expect(calls).toBe(1);
    expect(out?.status).toBe(404);
  });

  it("returns null on a thrown network error (never throws)", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("boom");
    };
    const out = await backoffFetch(fetchFn, "https://x.com/a", undefined, { maxAttempts: 2, sleepFn: async () => {} });
    expect(out).toBeNull();
  });
});
