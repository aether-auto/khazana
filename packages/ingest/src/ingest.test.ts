import { expect, test } from "vitest";
import { runIngest } from "./ingest.js";
import type { FetchFn } from "./fetchers/build-source.js";
import type { Registry } from "@khazana/core";

const RSS = (n: string, link: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><item><title>${n}</title><link>${link}</link></item></channel></rss>`;

const registry: Registry = {
  version: 1,
  sources: [
    { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    { id: "flaky", type: "rss", url: "https://b.com/feed", channels: ["ai"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    { id: "off", type: "rss", url: "https://c.com/feed", channels: ["finance"], enabled: false, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
  ],
};

test("one source failing does not break the run; results are recorded", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("b.com")) throw new Error("network down");
    return { ok: true, status: 200, text: async () => RSS("Hello", "https://a.com/1"), json: async () => ({}) };
  };
  const { items, results } = await runIngest(registry, { now: "2026-06-23T00:00:00.000Z", fetchFn, extract: { enabled: false } });
  expect(items).toHaveLength(1);
  expect(results.find((r) => r.id === "good")!.ok).toBe(true);
  expect(results.find((r) => r.id === "flaky")!.ok).toBe(false);
  expect(results.find((r) => r.id === "off")).toBeUndefined(); // disabled is skipped
});

test("items duplicated across sources are deduped by id", async () => {
  const dup: Registry = {
    version: 1,
    sources: [
      { id: "s1", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
      { id: "s2", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    ],
  };
  const fetchFn: FetchFn = async () => ({ ok: true, status: 200, text: async () => RSS("Same", "https://same.com/1"), json: async () => ({}) });
  const { items } = await runIngest(dup, { now: "2026-06-23T00:00:00.000Z", fetchFn, extract: { enabled: false } });
  expect(items).toHaveLength(1); // same sourceType+url → same id → deduped
});

test("onProgress fires once per source with accurate running tallies", async () => {
  const many: Registry = {
    version: 1,
    sources: [
      { id: "a", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
      { id: "b", type: "rss", url: "https://b.com/feed", channels: ["ai"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
      { id: "c", type: "rss", url: "https://c.com/feed", channels: ["finance"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
      { id: "d", type: "rss", url: "https://d.com/feed", channels: ["science"], enabled: false, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    ],
  };
  // b fails; a and c each yield one item.
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("b.com")) throw new Error("network down");
    return { ok: true, status: 200, text: async () => RSS("Hi", `${url}#1`), json: async () => ({}) };
  };
  const events: Array<Parameters<NonNullable<Parameters<typeof runIngest>[1]["onProgress"]>>[0]> = [];
  const { results } = await runIngest(many, {
    now: "2026-06-23T00:00:00.000Z",
    fetchFn,
    extract: { enabled: false },
    onProgress: (p) => events.push({ ...p }),
  });

  // 3 enabled sources → exactly 3 progress calls (disabled "d" is excluded).
  expect(events).toHaveLength(3);
  // total is constant and equals the enabled count.
  expect(events.every((e) => e.total === 3)).toBe(true);
  // done increases monotonically 1,2,3.
  expect(events.map((e) => e.done)).toEqual([1, 2, 3]);
  // final tallies: 2 ok, 1 failed, 2 items across the run.
  const last = events[2]!;
  expect(last.okSoFar).toBe(2);
  expect(last.failedSoFar).toBe(1);
  expect(last.itemsSoFar).toBe(2);
  // ok + failed always equals done at every step.
  expect(events.every((e) => e.okSoFar + e.failedSoFar === e.done)).toBe(true);
  // lastId/lastOk reflect a real source result each time.
  for (const e of events) {
    const r = results.find((x) => x.id === e.lastId)!;
    expect(r.ok).toBe(e.lastOk);
  }
});

test("runIngest works with onProgress omitted (no throw)", async () => {
  const fetchFn: FetchFn = async (url) => ({
    ok: true, status: 200, text: async () => RSS("Hi", `${url}#1`), json: async () => ({}),
  });
  await expect(
    runIngest(registry, { now: "2026-06-23T00:00:00.000Z", fetchFn, extract: { enabled: false } }),
  ).resolves.toBeDefined();
});

// ── Bounded self-healing re-probe: the fetch set includes reprobe-eligible
// disabled sources alongside enabled ones. ──────────────────────────────────

const NOW = "2026-07-07T00:00:00.000Z";
const EARLIER = "2026-06-01T00:00:00.000Z"; // > REPROBE_AFTER_MS (7d) before NOW
const RECENT = "2026-07-06T12:00:00.000Z"; // < REPROBE_AFTER_MS before NOW

test("a disabled source past its re-probe window is fetched again (self-heals a systemic outage)", async () => {
  const reg: Registry = {
    version: 1,
    sources: [
      { id: "live", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
      {
        id: "youtube-back",
        type: "youtube",
        url: "https://b.com/feed",
        channels: ["tech"],
        enabled: false,
        status: "disabled",
        consecutiveFailures: 3,
        disabledAt: EARLIER,
        trustScore: 0.6,
        addedBy: "seed",
        failureCount: 3,
      },
    ],
  };
  const fetchFn: FetchFn = async (url) => ({ ok: true, status: 200, text: async () => RSS("Hi", `${url}#1`), json: async () => ({}) });
  const { results, fetchResults } = await runIngest(reg, { now: NOW, fetchFn, extract: { enabled: false } });
  expect(results.find((r) => r.id === "live")).toBeDefined();
  expect(results.find((r) => r.id === "youtube-back")).toBeDefined();
  expect(fetchResults.find((r) => r.sourceId === "youtube-back")?.ok).toBe(true);
});

test("a disabled source still inside its re-probe window is skipped (no every-run hammering)", async () => {
  const reg: Registry = {
    version: 1,
    sources: [
      {
        id: "still-dead",
        type: "youtube",
        url: "https://c.com/feed",
        channels: ["tech"],
        enabled: false,
        status: "disabled",
        consecutiveFailures: 3,
        disabledAt: RECENT,
        trustScore: 0.6,
        addedBy: "seed",
        failureCount: 3,
      },
    ],
  };
  let calls = 0;
  const fetchFn: FetchFn = async (url) => {
    calls++;
    return { ok: true, status: 200, text: async () => RSS("Hi", `${url}#1`), json: async () => ({}) };
  };
  const { results } = await runIngest(reg, { now: NOW, fetchFn, extract: { enabled: false } });
  expect(results.find((r) => r.id === "still-dead")).toBeUndefined();
  expect(calls).toBe(0);
});

test("a manually disabled source (no status:'disabled') is never swept into a re-probe", async () => {
  const reg: Registry = {
    version: 1,
    sources: [
      { id: "manual-off", type: "rss", url: "https://d.com/feed", channels: ["tech"], enabled: false, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    ],
  };
  let calls = 0;
  const fetchFn: FetchFn = async (url) => {
    calls++;
    return { ok: true, status: 200, text: async () => RSS("Hi", `${url}#1`), json: async () => ({}) };
  };
  const { results } = await runIngest(reg, { now: NOW, fetchFn, extract: { enabled: false } });
  expect(results.find((r) => r.id === "manual-off")).toBeUndefined();
  expect(calls).toBe(0);
});
