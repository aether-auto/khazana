import { expect, test } from "vitest";
import { enrichContent, type ExtractMethod } from "./enrich-content.js";
import type { FetchFn } from "./fetchers/build-source.js";
import type { FeedItem } from "@khazana/core";

function makeItem(over: Partial<FeedItem>): FeedItem {
  return {
    id: "x", source: "s", sourceType: "rss", url: "https://blog.example.com/a",
    title: "T", publishedAt: "2026-06-23T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: [], entities: [], summary: "rss summary", body: "rss summary", media: [], kind: "link",
    ...over,
  };
}

const FULL_ARTICLE = `<html><body><article><h1>Title</h1><p>${"Real article body content goes here. ".repeat(40)}</p></article></body></html>`;

test("upgrades article body to sanitized full-text when extraction yields enough text", async () => {
  const item = makeItem({ sourceType: "rss", url: "https://blog.example.com/post" });
  const fetchFn: FetchFn = async () => ({ ok: true, status: 200, text: async () => FULL_ARTICLE, json: async () => ({}) });
  await enrichContent([item], fetchFn);
  expect(item.body).toContain("<p>");
  expect(item.body).toContain("Real article body content");
  expect(item.body).not.toBe("rss summary");
});

test("keeps RSS summary when extracted text is too short", async () => {
  const item = makeItem({ sourceType: "news", url: "https://news.example.com/x" });
  const short = `<html><body><article><p>too short</p></article></body></html>`;
  const fetchFn: FetchFn = async () => ({ ok: true, status: 200, text: async () => short, json: async () => ({}) });
  await enrichContent([item], fetchFn);
  expect(item.body).toBe("rss summary");
});

test("disabled toggle leaves items untouched and does not fetch", async () => {
  const item = makeItem({ sourceType: "rss" });
  let calls = 0;
  const fetchFn: FetchFn = async () => {
    calls++;
    return { ok: true, status: 200, text: async () => FULL_ARTICLE, json: async () => ({}) };
  };
  await enrichContent([item], fetchFn, { enabled: false });
  expect(calls).toBe(0);
  expect(item.body).toBe("rss summary");
});

test("a failing fetch never breaks the run; other items still enrich", async () => {
  const bad = makeItem({ id: "bad", sourceType: "rss", url: "https://bad.example.com/x" });
  const good = makeItem({ id: "good", sourceType: "rss", url: "https://good.example.com/x" });
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("bad")) throw new Error("network down");
    return { ok: true, status: 200, text: async () => FULL_ARTICLE, json: async () => ({}) };
  };
  await enrichContent([bad, good], fetchFn);
  expect(bad.body).toBe("rss summary"); // unchanged, no throw
  expect(good.body).toContain("Real article body content");
});

test("youtube items get transcript body; podcast items use transcriptUrl", async () => {
  const yt = makeItem({
    id: "yt", sourceType: "youtube", kind: "video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", body: "video description",
  });
  const pod = makeItem({ id: "pod", sourceType: "podcast", kind: "audio", body: "show notes" }) as FeedItem & {
    transcriptUrl?: string;
  };
  pod.transcriptUrl = "https://cdn.example.com/ep.txt";

  // The new YouTube path: fetch watch page → parse ytInitialPlayerResponse →
  // fetch json3 transcript from the captionTrack baseUrl.
  const captionBaseUrl = "https://cdn.youtube.com/timedtext?v=dQw4w9WgXcQ&lang=en";
  const spokenJson3 = JSON.stringify({
    events: Array.from({ length: 15 }, () => ({
      segs: [{ utf8: "spoken transcript words " }],
    })),
  });
  const watchPageHtml = `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify({
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [{ baseUrl: captionBaseUrl, languageCode: "en" }],
      },
    },
  })};</script></body></html>`;

  const fetchFn: FetchFn = async (url) => {
    if (url.includes("youtube.com/watch")) {
      return { ok: true, status: 200, text: async () => watchPageHtml, json: async () => ({}) };
    }
    if (url.includes("cdn.youtube.com") && url.includes("fmt=json3")) {
      return { ok: true, status: 200, text: async () => spokenJson3, json: async () => ({}) };
    }
    if (url.endsWith(".txt")) return { ok: true, status: 200, text: async () => "podcast transcript text", json: async () => ({}) };
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };
  await enrichContent([yt, pod], fetchFn);
  expect(yt.body).toContain("spoken transcript words");
  expect(pod.body).toBe("<p>podcast transcript text</p>");
  // transient field scrubbed
  expect((pod as { transcriptUrl?: string }).transcriptUrl).toBeUndefined();
});

test("youtube with no transcript keeps the description", async () => {
  const yt = makeItem({
    id: "yt2", sourceType: "youtube", kind: "video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", body: "video description",
  });
  const fetchFn: FetchFn = async () => ({ ok: false, status: 404, text: async () => "", json: async () => ({}) });
  await enrichContent([yt], fetchFn);
  expect(yt.body).toBe("video description");
});

// ---- Multi-method fallback chain -------------------------------------------

const okHtml = (html: string): ReturnType<FetchFn> =>
  Promise.resolve({ ok: true, status: 200, text: async () => html, json: async () => ({}) });

test("method 1 wins: inline RSS full content is used without any fetch", async () => {
  const longRss = `<p>${"Full article carried inline by the feed via content:encoded. ".repeat(40)}</p>`;
  const item = makeItem({ sourceType: "rss", url: "https://blog.example.com/p" }) as FeedItem & { rssContent?: string };
  item.rssContent = longRss;
  let calls = 0;
  const fetchFn: FetchFn = async () => {
    calls++;
    return { ok: true, status: 200, text: async () => "<html></html>", json: async () => ({}) };
  };
  const methodSink = new Map<string, ExtractMethod>();
  await enrichContent([item], fetchFn, { methodSink });
  expect(calls).toBe(0); // RSS content satisfied MIN_GOOD_TEXT → no network
  expect(item.body).toContain("carried inline by the feed");
  expect(methodSink.get("x")).toBe("rss-content");
  expect((item as { rssContent?: string }).rssContent).toBeUndefined(); // transient scrubbed
});

test("method 2 wins: browser-UA fetch + Readability recovers full text", async () => {
  const full = `<html><body><article><h1>H</h1><p>${"Full readable article body content goes here with words. ".repeat(40)}</p></article></body></html>`;
  const item = makeItem({ sourceType: "news", url: "https://news.example.com/post" });
  let sentUA: string | undefined;
  const fetchFn: FetchFn = async (_url, init) => {
    sentUA = init?.headers?.["User-Agent"];
    return okHtml(full);
  };
  const methodSink = new Map<string, ExtractMethod>();
  await enrichContent([item], fetchFn, { methodSink });
  expect(item.body).toContain("Full readable article body content");
  expect(methodSink.get("x")).toBe("readability");
  // A realistic desktop browser UA was sent (not the default fetch UA).
  expect(sentUA).toMatch(/Mozilla\/5\.0.*Chrome/);
});

test("method 4a wins: AMP variant is fetched when the canonical page is thin", async () => {
  const canonical = `<html><head><link rel="amphtml" href="/amp/post"></head><body><article><p>tiny stub.</p></article></body></html>`;
  const amp = `<html><body><article><h1>H</h1><p>${"The AMP page carries the complete article text in full. ".repeat(40)}</p></article></body></html>`;
  const item = makeItem({ sourceType: "news", url: "https://news.example.com/post" });
  const seen: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    seen.push(url);
    return okHtml(url.includes("/amp/") ? amp : canonical);
  };
  const methodSink = new Map<string, ExtractMethod>();
  await enrichContent([item], fetchFn, { methodSink });
  expect(item.body).toContain("AMP page carries the complete article");
  expect(methodSink.get("x")).toBe("amp");
  expect(seen).toContain("https://news.example.com/amp/post");
});

test("method 4b wins: og:description used as last text source when nothing richer exists", async () => {
  const desc = "A reasonably long social description summarizing the piece. ".repeat(6);
  const thin = `<html><head><meta property="og:description" content="${desc}"></head><body><article><p>x</p></article></body></html>`;
  const item = makeItem({ sourceType: "news", url: "https://news.example.com/post", body: "short rss", summary: "short rss" });
  const methodSink = new Map<string, ExtractMethod>();
  await enrichContent([item], async () => okHtml(thin), { methodSink });
  expect(item.body).toContain("social description summarizing");
  expect(methodSink.get("x")).toBe("meta");
});

test("all methods fail: the RSS summary is kept untouched", async () => {
  const thin = `<html><head></head><body><article><p>too short</p></article></body></html>`;
  const item = makeItem({ sourceType: "news", url: "https://news.example.com/post" });
  const methodSink = new Map<string, ExtractMethod>();
  await enrichContent([item], async () => okHtml(thin), { methodSink });
  expect(item.body).toBe("rss summary"); // no upgrade shorter than the summary
  expect(methodSink.has("x")).toBe(false);
});

test("extraction never replaces a summary with something shorter", async () => {
  // Canonical yields only a short meta description, but the RSS summary is longer.
  const longSummary = "This RSS summary is already fairly long and informative for the reader. ".repeat(4);
  const thin = `<html><head><meta name="description" content="brief blurb"></head><body><article><p>x</p></article></body></html>`;
  const item = makeItem({ sourceType: "news", url: "https://news.example.com/post", body: longSummary, summary: longSummary });
  await enrichContent([item], async () => okHtml(thin));
  expect(item.body).toBe(longSummary);
});
