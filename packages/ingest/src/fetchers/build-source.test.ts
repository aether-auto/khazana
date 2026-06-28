import { expect, test, vi } from "vitest";
import {
  buildSource,
  BROWSER_USER_AGENT,
  FEED_ACCEPT,
  mergeHeaders,
  type FetchFn,
  type FetchResult,
} from "./build-source.js";
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

test("buildSource sends a browser User-Agent and feed-appropriate Accept on the generic fetch", async () => {
  let sentHeaders: Record<string, string> | undefined;
  const fetchFn: FetchFn = async (_url, init) => {
    sentHeaders = init?.headers;
    return ok({ text: RSS });
  };
  await buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentHeaders?.["User-Agent"]).toBe(BROWSER_USER_AGENT);
  expect(sentHeaders?.["User-Agent"]).toContain("Mozilla/5.0"); // browser-like, not a bot UA
  expect(sentHeaders?.["Accept"]).toBe(FEED_ACCEPT);
  expect(sentHeaders?.["Accept"]).toContain("application/rss+xml"); // fixes the 406 class
});

test("caller-provided headers override the generic defaults", async () => {
  let sentHeaders: Record<string, string> | undefined;
  const fetchFn: FetchFn = async (_url, init) => {
    sentHeaders = init?.headers;
    return ok({ text: RSS });
  };
  // A caller that passes explicit headers wins over the defaults.
  await buildSource(rssEntry, fetchFn, { headers: { "User-Agent": "custom-agent/9.9" } }).fetch({
    now: "2026-06-23T00:00:00.000Z",
  });
  expect(sentHeaders?.["User-Agent"]).toBe("custom-agent/9.9"); // override wins
  expect(sentHeaders?.["Accept"]).toBe(FEED_ACCEPT); // gap still filled by default
});

test("mergeHeaders lets overrides win and is case-insensitive on duplicate header names", () => {
  const merged = mergeHeaders(
    { "User-Agent": "default-ua", Accept: "default-accept" },
    { "user-agent": "override-ua" },
  );
  expect(merged["user-agent"] ?? merged["User-Agent"]).toBe("override-ua");
  expect(merged["Accept"]).toBe("default-accept");
});

test("the generic fetch routes through defaultFetch with redirect:follow set explicitly", async () => {
  // Spy the global fetch to assert defaultFetch opts in to redirect following.
  const globalFetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(RSS, { status: 200 }));
  // No injected FetchFn → buildSource uses the real defaultFetch.
  await buildSource(rssEntry).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(globalFetchSpy).toHaveBeenCalledWith(
    rssEntry.url,
    expect.objectContaining({ redirect: "follow" }),
  );
  globalFetchSpy.mockRestore();
});

test("reddit is untouched: still routes to the dedicated reddit flow, not the generic Accept path", async () => {
  delete process.env["REDDIT_CLIENT_ID"];
  delete process.env["REDDIT_CLIENT_SECRET"];
  let sentHeaders: Record<string, string> | undefined;
  const REDDIT_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Reddit thread</title><link href="https://www.reddit.com/r/x/comments/z/thread/"/></entry>
</feed>`;
  const fetchFn: FetchFn = async (_url, init) => {
    sentHeaders = init?.headers;
    return ok({ text: REDDIT_RSS });
  };
  const reddit: SourceEntry = { ...rssEntry, id: "r-x", type: "reddit", url: "https://www.reddit.com/r/x/.rss" };
  await buildSource(reddit, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  // The reddit flow sets its own browser UA and does NOT send the generic feed Accept.
  expect(sentHeaders?.["User-Agent"]).toContain("Mozilla/5.0");
  expect(sentHeaders?.["Accept"]).toBeUndefined();
});
