import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { main } from "./cli.js";
import type { FetchFn } from "./fetchers/build-source.js";

let dir: string;
const seed = {
  version: 1,
  sources: [
    { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"] },
    { id: "bad", type: "rss", url: "https://b.com/feed", channels: ["ai"] },
  ],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-cli-"));
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify(seed));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("main writes feed and updates source health", async () => {
  const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Hi</title><link>https://a.com/1</link></item></channel></rss>`;
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("b.com")) throw new Error("down");
    return { ok: true, status: 200, text: async () => RSS, json: async () => ({}) };
  };
  await main(dir, "2026-06-23T00:00:00.000Z", fetchFn);

  const feed = JSON.parse(readFileSync(join(dir, "feed", "raw.json"), "utf8"));
  expect(feed).toHaveLength(1);

  const reg = JSON.parse(readFileSync(join(dir, "sources.json"), "utf8"));
  const good = reg.sources.find((s: { id: string }) => s.id === "good");
  const bad = reg.sources.find((s: { id: string }) => s.id === "bad");
  expect(good.lastFetchedAt).toBe("2026-06-23T00:00:00.000Z");
  expect(good.failureCount).toBe(0);
  expect(bad.failureCount).toBe(1);
});
