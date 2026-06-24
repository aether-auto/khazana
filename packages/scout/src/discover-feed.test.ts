import { expect, test } from "vitest";
import { discoverFeed, fetchAndDiscoverFeed, looksLikeFeedUrl } from "./discover-feed.js";
import type { FetchFn, FetchResult } from "@khazana/ingest";

const ok = (text: string): FetchResult => ({ ok: true, status: 200, text: async () => text, json: async () => ({}) });

const HTML_RELATIVE = `<!doctype html><html><head>
  <title>Example Blog</title>
  <link rel="stylesheet" href="/style.css">
  <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
</head><body>hi</body></html>`;

const HTML_ABSOLUTE_ATOM = `<html><head>
  <link rel="alternate" type="application/atom+xml" href="https://cdn.example.com/atom.xml" />
</head></html>`;

const HTML_NONE = `<html><head><link rel="icon" href="/favicon.ico"></head></html>`;

test("looksLikeFeedUrl recognises common feed URL shapes", () => {
  expect(looksLikeFeedUrl("https://e.com/feed.xml")).toBe(true);
  expect(looksLikeFeedUrl("https://e.com/blog/rss/")).toBe(true);
  expect(looksLikeFeedUrl("https://e.com/atom")).toBe(true);
  expect(looksLikeFeedUrl("https://e.com/blog")).toBe(false);
});

test("discoverFeed resolves a relative href against baseUrl", () => {
  expect(discoverFeed(HTML_RELATIVE, "https://example.com/blog")).toBe("https://example.com/feed.xml");
});

test("discoverFeed returns absolute atom href as-is", () => {
  expect(discoverFeed(HTML_ABSOLUTE_ATOM, "https://example.com/")).toBe("https://cdn.example.com/atom.xml");
});

test("discoverFeed returns the candidate url itself when it already looks like a feed", () => {
  expect(discoverFeed("<html></html>", "https://example.com/feed.rss")).toBe("https://example.com/feed.rss");
});

test("discoverFeed returns null when no alternate feed link is present", () => {
  expect(discoverFeed(HTML_NONE, "https://example.com/")).toBeNull();
});

test("fetchAndDiscoverFeed short-circuits a feed-looking url without fetching", async () => {
  let called = false;
  const fetchFn: FetchFn = async () => {
    called = true;
    return ok("");
  };
  expect(await fetchAndDiscoverFeed("https://e.com/feed.xml", fetchFn)).toBe("https://e.com/feed.xml");
  expect(called).toBe(false);
});

test("fetchAndDiscoverFeed fetches HTML and discovers the feed", async () => {
  const fetchFn: FetchFn = async () => ok(HTML_RELATIVE);
  expect(await fetchAndDiscoverFeed("https://example.com/blog", fetchFn)).toBe("https://example.com/feed.xml");
});

test("fetchAndDiscoverFeed returns null on fetch failure (never throws)", async () => {
  const fail: FetchFn = async () => {
    throw new Error("network down");
  };
  expect(await fetchAndDiscoverFeed("https://example.com/blog", fail)).toBeNull();

  const non200: FetchFn = async () => ({ ok: false, status: 404, text: async () => "", json: async () => ({}) });
  expect(await fetchAndDiscoverFeed("https://example.com/blog", non200)).toBeNull();
});
