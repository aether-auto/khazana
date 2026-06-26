import { describe, it, expect } from "vitest";
import { pooledMap, PerHostLimiter, Semaphore } from "./concurrency.js";

describe("pooledMap", () => {
  it("respects concurrency limit — never exceeds max concurrent", async () => {
    let current = 0;
    let peak = 0;
    const limit = 3;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await pooledMap(items, limit, async (item) => {
      current++;
      peak = Math.max(peak, current);
      await new Promise<void>(r => setTimeout(r, 10));
      current--;
      return item;
    });

    expect(peak).toBeLessThanOrEqual(limit);
  });

  it("returns results in input order", async () => {
    const items = [30, 10, 20, 5, 15];
    const results = await pooledMap(items, 3, async (delay) => {
      await new Promise<void>(r => setTimeout(r, delay));
      return delay;
    });
    expect(results).toEqual([30, 10, 20, 5, 15]);
  });

  it("handles errors from fn() — propagates, doesn't swallow", async () => {
    const items = [1, 2, 3];
    await expect(
      pooledMap(items, 2, async (item) => {
        if (item === 2) throw new Error("item 2 failed");
        return item;
      })
    ).rejects.toThrow("item 2 failed");
  });

  it("handles empty array", async () => {
    const results = await pooledMap([], 3, async (item: number) => item);
    expect(results).toEqual([]);
  });
});

describe("PerHostLimiter", () => {
  it("caps same-host concurrency", async () => {
    const limiter = new PerHostLimiter({ maxConcurrent: 2, minGapMs: 0 });
    let current = 0;
    let peak = 0;

    const tasks = Array.from({ length: 5 }, () =>
      limiter.run("example.com", async () => {
        current++;
        peak = Math.max(peak, current);
        await new Promise<void>(r => setTimeout(r, 20));
        current--;
      })
    );

    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("enforces minGapMs between same-host calls", async () => {
    const minGapMs = 50;
    const limiter = new PerHostLimiter({ maxConcurrent: 1, minGapMs });
    const timestamps: number[] = [];

    for (let i = 0; i < 3; i++) {
      await limiter.run("example.com", async () => {
        timestamps.push(Date.now());
      });
    }

    for (let i = 1; i < timestamps.length; i++) {
      const gap = (timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(minGapMs - 10); // 10ms tolerance
    }
  });

  it("allows concurrent requests to DIFFERENT hosts", async () => {
    const limiter = new PerHostLimiter({ maxConcurrent: 1, minGapMs: 0 });
    const started: string[] = [];
    let bothStarted = false;

    const [p1, p2] = [
      limiter.run("host1.com", async () => {
        started.push("host1");
        await new Promise<void>(r => setTimeout(r, 50));
      }),
      limiter.run("host2.com", async () => {
        started.push("host2");
        await new Promise<void>(r => setTimeout(r, 50));
      }),
    ];

    // Give both time to start
    await new Promise<void>(r => setTimeout(r, 20));
    bothStarted = started.length === 2;

    await Promise.all([p1, p2]);
    expect(bothStarted).toBe(true);
  });
});

describe("Semaphore", () => {
  it("caps concurrency to its limit", async () => {
    const sem = new Semaphore(2);
    let current = 0;
    let peak = 0;

    const tasks = Array.from({ length: 5 }, async () => {
      const release = await sem.acquire();
      current++;
      peak = Math.max(peak, current);
      await new Promise<void>(r => setTimeout(r, 20));
      current--;
      release();
    });

    await Promise.all(tasks);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("releases slot correctly after fn", async () => {
    const sem = new Semaphore(1);

    const release1 = await sem.acquire();
    let acquired = false;
    const p = sem.acquire().then((rel) => {
      acquired = true;
      rel();
    });

    expect(acquired).toBe(false);
    release1();

    await p;
    expect(acquired).toBe(true);
  });
});
