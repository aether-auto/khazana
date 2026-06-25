import { expect, test } from "vitest";
import { enrichContent } from "./enrich-content.js";
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
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("timedtext")) {
      return { ok: true, status: 200, text: async () => `<transcript><text start="0">spoken transcript words</text></transcript>`, json: async () => ({}) };
    }
    if (url.endsWith(".txt")) return { ok: true, status: 200, text: async () => "podcast transcript text", json: async () => ({}) };
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };
  await enrichContent([yt, pod], fetchFn);
  expect(yt.body).toBe("<p>spoken transcript words</p>");
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
