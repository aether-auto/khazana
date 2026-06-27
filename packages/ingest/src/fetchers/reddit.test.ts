import { expect, test } from "vitest";
import { parseRedditListing, redditJsonUrl, fetchReddit, REDDIT_USER_AGENT } from "./reddit.js";
import type { FetchFn, FetchResult } from "./build-source.js";
import type { SourceEntry } from "@khazana/core";

const entry: SourceEntry = {
  id: "r-dataisbeautiful", type: "reddit",
  url: "https://www.reddit.com/r/dataisbeautiful/top/.json?t=day", channels: ["data-science"],
  enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0,
};

const LISTING = {
  data: {
    children: [
      { data: {
          title: "[OC] World GDP over time", permalink: "/r/dataisbeautiful/comments/abc/oc/",
          url: "https://i.redd.it/x.png", author: "viz_guy", created_utc: 1750000000,
          num_comments: 42, score: 1200, selftext: "", thumbnail: "https://b.thumbs.redditmedia.com/t.jpg",
      } },
      { data: { title: "no permalink" } },
    ],
  },
};

test("parses reddit children into discussion FeedItems with canonical permalink url", () => {
  const items = parseRedditListing(LISTING, entry, "2026-06-23T00:00:00.000Z");
  expect(items).toHaveLength(1);
  const it = items[0]!;
  expect(it.kind).toBe("discussion");
  expect(it.url).toBe("https://www.reddit.com/r/dataisbeautiful/comments/abc/oc/");
  expect(it.author).toBe("viz_guy");
  expect(it.metrics).toEqual({ score: 1200, comments: 42 });
  expect(it.media[0]).toEqual({ type: "image", url: "https://b.thumbs.redditmedia.com/t.jpg" });
  expect(it.topics).toEqual(["data-science"]);
});

test("drops children without title or permalink", () => {
  expect(parseRedditListing({ data: { children: [{ data: {} }] } }, entry, "2026-06-23T00:00:00.000Z")).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// redditJsonUrl — pure URL derivation
// ---------------------------------------------------------------------------

test("redditJsonUrl: .rss base → hot.json with default limit", () => {
  expect(redditJsonUrl("https://www.reddit.com/r/Physics/.rss")).toBe(
    "https://www.reddit.com/r/Physics/hot.json?limit=50",
  );
});

test("redditJsonUrl: trailing slash (no .rss) → hot.json", () => {
  expect(redditJsonUrl("https://www.reddit.com/r/programming/")).toBe(
    "https://www.reddit.com/r/programming/hot.json?limit=50",
  );
});

test("redditJsonUrl: /top/.rss → top.json", () => {
  expect(redditJsonUrl("https://www.reddit.com/r/history/top/.rss")).toBe(
    "https://www.reddit.com/r/history/top.json?limit=50",
  );
});

test("redditJsonUrl: preserves time-window query param (?t=week)", () => {
  expect(redditJsonUrl("https://www.reddit.com/r/finance/top/.rss?t=week")).toBe(
    "https://www.reddit.com/r/finance/top.json?t=week&limit=50",
  );
});

test("redditJsonUrl: preserves mixed-case sub name", () => {
  expect(redditJsonUrl("https://www.reddit.com/r/MachineLearning/.rss")).toBe(
    "https://www.reddit.com/r/MachineLearning/hot.json?limit=50",
  );
});

test("redditJsonUrl: honours explicit limit option", () => {
  expect(redditJsonUrl("https://www.reddit.com/r/IOT/.rss", { limit: 5 })).toBe(
    "https://www.reddit.com/r/IOT/hot.json?limit=5",
  );
});

test("redditJsonUrl: derived URL keeps www.reddit.com host (shares rate limiter)", () => {
  expect(new URL(redditJsonUrl("https://www.reddit.com/r/gis/.rss")).hostname).toBe("www.reddit.com");
});

test("redditJsonUrl: unknown trailing segment is not treated as a sort", () => {
  // `comments` is not a sort; default to hot.
  expect(redditJsonUrl("https://www.reddit.com/r/gis/comments/.rss")).toBe(
    "https://www.reddit.com/r/gis/hot.json?limit=50",
  );
});

// ---------------------------------------------------------------------------
// fetchReddit — JSON → 429/403 backoff → .rss fallback flow (mocked fetch)
// ---------------------------------------------------------------------------

const redditEntry: SourceEntry = {
  id: "r-physics", type: "reddit",
  url: "https://www.reddit.com/r/Physics/.rss", channels: ["science"],
  enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0,
};

const jsonOk = (json: unknown): FetchResult => ({
  ok: true, status: 200, text: async () => "", json: async () => json,
});
const blocked = (status: number): FetchResult => ({
  ok: false, status, text: async () => "", json: async () => ({}),
});
const REDDIT_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Atom thread</title><link href="https://www.reddit.com/r/Physics/comments/xyz/atom_thread/"/></entry>
</feed>`;
const rssOk: FetchResult = { ok: true, status: 200, text: async () => REDDIT_RSS, json: async () => ({}) };

const noSleep = async () => {};
const now = "2026-06-23T00:00:00.000Z";

const LISTING_JSON = { data: { children: [{ data: { title: "JSON thread", permalink: "/r/Physics/comments/abc/json_thread/", score: 99, num_comments: 12 } }] } };

test("fetchReddit: JSON success → rich discussion items, hits JSON url with descriptive UA", async () => {
  const calls: Array<{ url: string; ua?: string }> = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, ua: init?.headers?.["User-Agent"] });
    return jsonOk(LISTING_JSON);
  };
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe("discussion");
  expect(items[0]!.metrics).toEqual({ score: 99, comments: 12 });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://www.reddit.com/r/Physics/hot.json?limit=50");
  expect(calls[0]!.ua).toBe(REDDIT_USER_AGENT);
});

test("fetchReddit: respects ctx.limit on JSON path (passed to url and slice)", async () => {
  const urls: string[] = [];
  const big = { data: { children: [
    { data: { title: "a", permalink: "/r/Physics/comments/1/a/" } },
    { data: { title: "b", permalink: "/r/Physics/comments/2/b/" } },
  ] } };
  const fetchFn: FetchFn = async (url) => { urls.push(url); return jsonOk(big); };
  const items = await fetchReddit(redditEntry, fetchFn, { now, limit: 1 }, noSleep);
  expect(items).toHaveLength(1);
  expect(urls[0]).toBe("https://www.reddit.com/r/Physics/hot.json?limit=1");
});

test("fetchReddit: 429 on JSON → backoff retry → .rss fallback (Atom) succeeds", async () => {
  const urls: string[] = [];
  let jsonHits = 0;
  const fetchFn: FetchFn = async (url) => {
    urls.push(url);
    if (url.endsWith(".json?limit=50")) { jsonHits++; return blocked(429); }
    return rssOk; // the original .rss url
  };
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  expect(jsonHits).toBe(2); // bounded retry: 2 JSON attempts
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe("discussion"); // reddit .rss maps to discussion
  expect(items[0]!.url).toBe("https://www.reddit.com/r/Physics/comments/xyz/atom_thread/");
  expect(urls[urls.length - 1]).toBe("https://www.reddit.com/r/Physics/.rss");
});

test("fetchReddit: 403 block → .rss fallback", async () => {
  const fetchFn: FetchFn = async (url) =>
    url.includes(".json") ? blocked(403) : rssOk;
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe("discussion");
});

test("fetchReddit: JSON network error → .rss fallback", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.includes(".json")) throw new Error("ECONNRESET");
    return rssOk;
  };
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  expect(items).toHaveLength(1);
});

test("fetchReddit: both JSON and .rss fail → throws", async () => {
  const fetchFn: FetchFn = async (url) =>
    url.includes(".json") ? blocked(429) : blocked(503);
  await expect(fetchReddit(redditEntry, fetchFn, { now }, noSleep)).rejects.toThrow("503");
});
