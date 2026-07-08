import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
// Zero the arXiv mirror per-host min-gap so the suite is fast/deterministic.
process.env["ARXIV_HOST_MIN_GAP_MS"] = "0";
import { enrichContent, type ExtractMethod } from "./enrich-content.js";
import type { FetchFn } from "./fetchers/build-source.js";
import type { FeedItem } from "@khazana/core";
import { htmlToText } from "./extract.js";

const AR5IV_HTML = readFileSync(
  fileURLToPath(new URL("./__fixtures__/ar5iv-sample.html", import.meta.url)),
  "utf8",
);

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

test("hn items are treated as article type: linked article gets full-text extraction", async () => {
  // HN items carry only a tiny snippet (link + comment count); the linked
  // article must go through the same Readability/AMP/meta fallback chain as
  // rss/news/eng-blog/arxiv, or hn items can never clear the curate
  // full-text gate (MIN_FULLTEXT_CHARS) and are silently dropped from the feed.
  const item = makeItem({ sourceType: "hn", url: "https://blog.example.com/hn-linked-post" });
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
    transcriptTags?: Array<{ url: string; type: string; language: string | undefined }>;
    enclosureUrl?: string;
  };
  // New contract: the tiered resolver reads the normalized <podcast:transcript>
  // tag list (not a single pre-selected URL) and the enclosure (cache key).
  pod.transcriptTags = [{ url: "https://cdn.example.com/ep.txt", type: "text/plain", language: undefined }];
  pod.enclosureUrl = "https://cdn.example.com/ep.mp3";

  // The new YouTube path: proxy via Invidious (no direct youtube.com calls).
  const INV_TEST = "https://inv.enrich-test.example.com";
  const captionsListJson = JSON.stringify({
    captions: [
      { label: "English", languageCode: "en", url: "/api/v1/captions/dQw4w9WgXcQ?label=English" },
    ],
  });
  // Long enough VTT to clear MIN_PROXY_CHARS
  const spokenVtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
spoken transcript words spoken transcript words spoken.

00:00:04.500 --> 00:00:08.000
spoken transcript words spoken transcript words spoken.

00:00:08.500 --> 00:00:12.000
spoken transcript words spoken transcript words spoken.

00:00:12.500 --> 00:00:16.000
spoken transcript words spoken transcript words spoken.

00:00:16.500 --> 00:00:20.000
spoken transcript words spoken transcript words spoken.
`;

  const savedInv = process.env["INVIDIOUS_INSTANCES"];
  const savedPiped = process.env["PIPED_INSTANCES"];
  process.env["INVIDIOUS_INSTANCES"] = INV_TEST;
  process.env["PIPED_INSTANCES"] = "";

  const fetchFn: FetchFn = async (url) => {
    if (url.startsWith(INV_TEST) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => captionsListJson, json: async () => ({}) };
    }
    if (url.startsWith(INV_TEST) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => spokenVtt, json: async () => ({}) };
    }
    // Return a full transcript long enough to pass isFullTranscript (>= 1500
    // text chars). Vary each sentence so repetition-collapse doesn't fold it.
    const longTranscript = Array.from(
      { length: 40 },
      (_, i) => `This is a real word from a dialogue transcript, sentence ${i} about subject ${i}.`,
    ).join(" ");
    if (url.endsWith(".txt")) return { ok: true, status: 200, text: async () => longTranscript, json: async () => ({}) };
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  try {
    await enrichContent([yt, pod], fetchFn);
    expect(yt.body).toContain("spoken transcript words");
    // The podcast transcript body should contain the long transcript text
    expect(pod.body).toContain("real word from a dialogue transcript");
    expect(pod.body).not.toBe("show notes"); // must have been upgraded
    // transient fields scrubbed
    expect((pod as { transcriptTags?: unknown }).transcriptTags).toBeUndefined();
    expect((pod as { enclosureUrl?: string }).enclosureUrl).toBeUndefined();
  } finally {
    if (savedInv === undefined) delete process.env["INVIDIOUS_INSTANCES"]; else process.env["INVIDIOUS_INSTANCES"] = savedInv;
    if (savedPiped === undefined) delete process.env["PIPED_INSTANCES"]; else process.env["PIPED_INSTANCES"] = savedPiped;
  }
});

test("youtube with no transcript keeps the description", async () => {
  const yt = makeItem({
    id: "yt2", sourceType: "youtube", kind: "video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", body: "video description",
  });
  const fetchFn: FetchFn = async () => ({ ok: false, status: 404, text: async () => "", json: async () => ({}) });
  // Scope to a single non-existent instance so we don't iterate 18 real defaults with delays.
  const savedInv = process.env["INVIDIOUS_INSTANCES"];
  const savedPiped = process.env["PIPED_INSTANCES"];
  process.env["INVIDIOUS_INSTANCES"] = "https://inv.test.invalid";
  process.env["PIPED_INSTANCES"] = "https://piped.test.invalid";
  try {
    await enrichContent([yt], fetchFn);
    expect(yt.body).toBe("video description");
  } finally {
    if (savedInv === undefined) delete process.env["INVIDIOUS_INSTANCES"]; else process.env["INVIDIOUS_INSTANCES"] = savedInv;
    if (savedPiped === undefined) delete process.env["PIPED_INSTANCES"]; else process.env["PIPED_INSTANCES"] = savedPiped;
  }
});

// ---- arXiv full-text via mirrors -------------------------------------------

test("arxiv items get full paper text from a mirror, clearing the 5-min floor", async () => {
  const abstract =
    "We study how sparse mixture-of-experts routing interacts with long context windows. " +
    "We introduce a routing regularizer that stabilizes expert load.";
  const item = makeItem({
    id: "arx", sourceType: "arxiv", kind: "paper",
    url: "https://arxiv.org/abs/2501.01234v2",
    body: abstract, summary: abstract,
  });
  const seen: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    seen.push(url);
    if (url.includes("ar5iv")) {
      return { ok: true, status: 200, text: async () => AR5IV_HTML, json: async () => ({}) };
    }
    // Abstract page or any other url yields nothing useful here.
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };
  await enrichContent([item], fetchFn);

  // Mirror was consulted, body upgraded to full paper text.
  expect(seen.some((u) => u.includes("ar5iv"))).toBe(true);
  expect(item.body).not.toBe(abstract);
  expect(item.body).toContain("depth-decorrelated");
  // Clears a 5-minute read (~1100+ words).
  const words = htmlToText(item.body ?? "").split(/\s+/).filter(Boolean).length;
  expect(words).toBeGreaterThan(1100);
});

test("arxiv mirror failure falls back to the abstract page without throwing", async () => {
  const abstract = "Short abstract that is under five minutes to read on its own.";
  const item = makeItem({
    id: "arx2", sourceType: "arxiv", kind: "paper",
    url: "https://arxiv.org/abs/2501.09999",
    body: abstract, summary: abstract,
  });
  const fetchFn: FetchFn = async () => ({ ok: false, status: 503, text: async () => "", json: async () => ({}) });
  await enrichContent([item], fetchFn);
  // No upgrade available → original abstract is preserved, no crash.
  expect(item.body).toBe(abstract);
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
