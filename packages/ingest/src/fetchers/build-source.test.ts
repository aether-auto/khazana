import { expect, test } from "vitest";
import { buildSource, type FetchFn, type FetchResult } from "./build-source.js";
import type { SourceEntry } from "@khazana/core";

const ok = (body: { text?: string; json?: unknown }): FetchResult => ({
  ok: true, status: 200,
  text: async () => body.text ?? "",
  json: async () => body.json ?? {},
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>One</title><link>https://e.com/1</link></item>
  <item><title>Two</title><link>https://e.com/2</link></item>
</channel></rss>`;

const rssEntry: SourceEntry = {
  id: "blog", type: "rss", url: "https://e.com/feed", channels: ["tech"],
  enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0,
};

test("buildSource fetches, parses RSS, and respects ctx.limit", async () => {
  const fetchFn: FetchFn = async () => ok({ text: RSS });
  const items = await buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z", limit: 1 });
  expect(items).toHaveLength(1);
  expect(items[0]!.title).toBe("One");
});

test("buildSource routes reddit through the JSON listing API with a descriptive UA", async () => {
  let sentUA: string | undefined;
  let sentUrl: string | undefined;
  const fetchFn: FetchFn = async (url, init) => {
    sentUA = init?.headers?.["User-Agent"];
    sentUrl = url;
    return ok({ json: { data: { children: [{ data: { title: "T", permalink: "/r/x/c/" } }] } } });
  };
  const reddit: SourceEntry = { ...rssEntry, id: "r-x", type: "reddit", url: "https://www.reddit.com/r/x/.rss" };
  const items = await buildSource(reddit, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentUA).toContain("khazana");
  expect(sentUrl).toBe("https://www.reddit.com/r/x/hot.json?limit=50"); // derived JSON endpoint
  expect(items[0]!.kind).toBe("discussion");
});

test("buildSource reddit falls back to .rss when JSON is blocked", async () => {
  // status 500 falls back immediately (no backoff sleep) — keeps the suite fast;
  // the 429-backoff path is covered in reddit.test.ts with an injected sleepFn.
  const REDDIT_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Fallback thread</title><link href="https://www.reddit.com/r/x/comments/z/fallback/"/></entry>
</feed>`;
  const fetchFn: FetchFn = async (url) =>
    url.includes(".json")
      ? { ok: false, status: 500, text: async () => "", json: async () => ({}) }
      : ok({ text: REDDIT_RSS });
  const reddit: SourceEntry = { ...rssEntry, id: "r-x", type: "reddit", url: "https://www.reddit.com/r/x/.rss" };
  const items = await buildSource(reddit, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(items).toHaveLength(1);
  expect(items[0]!.title).toBe("Fallback thread");
  expect(items[0]!.kind).toBe("discussion");
});

test("buildSource throws on non-OK HTTP", async () => {
  const fetchFn: FetchFn = async () => ({ ok: false, status: 503, text: async () => "", json: async () => ({}) });
  await expect(buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" })).rejects.toThrow("503");
});
