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
