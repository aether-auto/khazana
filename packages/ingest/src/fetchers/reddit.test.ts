import { expect, test } from "vitest";
import {
  parseRedditListing,
  redditJsonUrl,
  fetchReddit,
  resolveRedditMinGapMs,
  REDDIT_BROWSER_UA,
  REDDIT_OAUTH_UA,
  DEFAULT_REDDIT_MIN_GAP_MS,
} from "./reddit.js";
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

// Keep tests deterministic and $0-default: ensure no OAuth creds leak in from the
// real environment. Each OAuth test sets them explicitly and clears after.
delete process.env["REDDIT_CLIENT_ID"];
delete process.env["REDDIT_CLIENT_SECRET"];

// ---------------------------------------------------------------------------
// fetchReddit — PRIMARY path: browser-UA .rss (no creds = $0 default)
// ---------------------------------------------------------------------------

test("fetchReddit: .rss primary success → discussion items, browser UA, hits registry .rss url", async () => {
  const calls: Array<{ url: string; ua?: string }> = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, ua: init?.headers?.["User-Agent"] });
    return rssOk;
  };
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe("discussion");
  expect(items[0]!.url).toBe("https://www.reddit.com/r/Physics/comments/xyz/atom_thread/");
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe("https://www.reddit.com/r/Physics/.rss"); // the registry url, unchanged
  expect(calls[0]!.ua).toBe(REDDIT_BROWSER_UA); // browser UA, NOT a bot UA
});

test("fetchReddit: .rss path respects ctx.limit (slices)", async () => {
  const TWO_RSS = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>a</title><link href="https://www.reddit.com/r/Physics/comments/1/a/"/></entry>
    <entry><title>b</title><link href="https://www.reddit.com/r/Physics/comments/2/b/"/></entry>
  </feed>`;
  const fetchFn: FetchFn = async () => ({ ok: true, status: 200, text: async () => TWO_RSS, json: async () => ({}) });
  const items = await fetchReddit(redditEntry, fetchFn, { now, limit: 1 }, noSleep);
  expect(items).toHaveLength(1);
});

test("fetchReddit: 429 on .rss → bounded backoff retry → success", async () => {
  let hits = 0;
  const fetchFn: FetchFn = async () => {
    hits++;
    return hits < 3 ? blocked(429) : rssOk; // two 429s, then a 200
  };
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  expect(hits).toBe(3); // retried through the 429s (RSS_MAX_ATTEMPTS = 3)
  expect(items).toHaveLength(1);
});

test("fetchReddit: persistent 429 on .rss → throws (one sub fails, run survives upstream)", async () => {
  const fetchFn: FetchFn = async () => blocked(429);
  await expect(fetchReddit(redditEntry, fetchFn, { now }, noSleep)).rejects.toThrow("429");
});

test("fetchReddit: 403 on .rss is not retried → throws", async () => {
  let hits = 0;
  const fetchFn: FetchFn = async () => { hits++; return blocked(403); };
  await expect(fetchReddit(redditEntry, fetchFn, { now }, noSleep)).rejects.toThrow("403");
  expect(hits).toBe(1); // 403 (UA block) is not a rate-limit; no retry
});

// ---------------------------------------------------------------------------
// fetchReddit — OAuth escalation when creds present
// ---------------------------------------------------------------------------

test("fetchReddit: with creds → OAuth token then oauth.reddit.com JSON (rich metrics)", async () => {
  process.env["REDDIT_CLIENT_ID"] = "id";
  process.env["REDDIT_CLIENT_SECRET"] = "secret";
  const calls: Array<{ url: string; ua?: string; auth?: string; method?: string }> = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, ua: init?.headers?.["User-Agent"], auth: init?.headers?.["Authorization"], method: init?.method });
    if (url.includes("access_token")) {
      return { ok: true, status: 200, text: async () => "", json: async () => ({ access_token: "tok123" }) };
    }
    return { ok: true, status: 200, text: async () => "", json: async () => ({
      data: { children: [{ data: { title: "OAuth thread", permalink: "/r/Physics/comments/o/oauth/", score: 7, num_comments: 3 } }] },
    }) };
  };
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  delete process.env["REDDIT_CLIENT_ID"];
  delete process.env["REDDIT_CLIENT_SECRET"];

  expect(items).toHaveLength(1);
  expect(items[0]!.metrics).toEqual({ score: 7, comments: 3 }); // rich JSON metrics
  // token call: POST to access_token with Basic auth + descriptive UA
  expect(calls[0]!.url).toBe("https://www.reddit.com/api/v1/access_token");
  expect(calls[0]!.method).toBe("POST");
  expect(calls[0]!.auth).toMatch(/^Basic /);
  // listing call: oauth.reddit.com with Bearer + descriptive UA
  expect(calls[1]!.url).toBe("https://oauth.reddit.com/r/Physics/hot.json?limit=50");
  expect(calls[1]!.auth).toBe("Bearer tok123");
  expect(calls[1]!.ua).toBe(REDDIT_OAUTH_UA);
});

test("fetchReddit: creds present but token fetch fails → degrades to .rss browser-UA", async () => {
  process.env["REDDIT_CLIENT_ID"] = "id";
  process.env["REDDIT_CLIENT_SECRET"] = "secret";
  const seen: string[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    seen.push(`${url}|${init?.headers?.["User-Agent"]}`);
    if (url.includes("access_token")) return blocked(401); // token denied
    return rssOk; // the .rss fallback
  };
  const items = await fetchReddit(redditEntry, fetchFn, { now }, noSleep);
  delete process.env["REDDIT_CLIENT_ID"];
  delete process.env["REDDIT_CLIENT_SECRET"];

  expect(items).toHaveLength(1);
  expect(seen.some((s) => s.includes(".rss") && s.includes(REDDIT_BROWSER_UA))).toBe(true);
});

test("resolveRedditMinGapMs: env override wins, else default", () => {
  delete process.env["REDDIT_MIN_GAP_MS"];
  expect(resolveRedditMinGapMs()).toBe(DEFAULT_REDDIT_MIN_GAP_MS);
  process.env["REDDIT_MIN_GAP_MS"] = "7000";
  expect(resolveRedditMinGapMs()).toBe(7000);
  delete process.env["REDDIT_MIN_GAP_MS"];
});
