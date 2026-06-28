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

test("buildSource fetches reddit via the .rss feed with a browser User-Agent", async () => {
  // No OAuth creds in env → the $0 default path: registry .rss + browser UA.
  delete process.env["REDDIT_CLIENT_ID"];
  delete process.env["REDDIT_CLIENT_SECRET"];
  let sentUA: string | undefined;
  let sentUrl: string | undefined;
  const REDDIT_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Reddit thread</title><link href="https://www.reddit.com/r/x/comments/z/thread/"/></entry>
</feed>`;
  const fetchFn: FetchFn = async (url, init) => {
    sentUA = init?.headers?.["User-Agent"];
    sentUrl = url;
    return ok({ text: REDDIT_RSS });
  };
  const reddit: SourceEntry = { ...rssEntry, id: "r-x", type: "reddit", url: "https://www.reddit.com/r/x/.rss" };
  const items = await buildSource(reddit, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentUrl).toBe("https://www.reddit.com/r/x/.rss"); // the registry .rss url, unchanged
  expect(sentUA).toContain("Mozilla/5.0"); // browser-like UA, not a bot UA
  expect(items).toHaveLength(1);
  expect(items[0]!.title).toBe("Reddit thread");
  expect(items[0]!.kind).toBe("discussion");
});

test("buildSource throws on non-OK HTTP", async () => {
  const fetchFn: FetchFn = async () => ({ ok: false, status: 503, text: async () => "", json: async () => ({}) });
  await expect(buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" })).rejects.toThrow("503");
});
