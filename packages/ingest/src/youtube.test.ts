import { expect, test } from "vitest";
import {
  fetchYouTubeTranscript,
  parseTranscriptXml,
  transcriptToHtml,
  youTubeVideoId,
} from "./youtube.js";
import type { FetchFn } from "./fetchers/build-source.js";

const TIMEDTEXT = `<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <text start="0" dur="2.5">Welcome to the channel</text>
  <text start="2.5" dur="3">today we explore caching &amp; sharding</text>
  <text start="5.5" dur="2">it&#39;s a deep dive</text>
  <text start="7.5" dur="2"></text>
</transcript>`;

test("parses timedtext XML into clean joined plain text with entities decoded", () => {
  const text = parseTranscriptXml(TIMEDTEXT);
  expect(text).toBe("Welcome to the channel today we explore caching & sharding it's a deep dive");
});

test("parseTranscriptXml handles empty input", () => {
  expect(parseTranscriptXml("")).toBe("");
  expect(parseTranscriptXml("<transcript></transcript>")).toBe("");
});

test("youTubeVideoId extracts id from watch / youtu.be / embed / shorts URLs", () => {
  expect(youTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(youTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(youTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(youTubeVideoId("https://example.com/no-id")).toBeNull();
});

test("transcriptToHtml wraps text in a paragraph and is empty for empty input", () => {
  expect(transcriptToHtml("hello world")).toBe("<p>hello world</p>");
  expect(transcriptToHtml("   ")).toBe("");
});

test("fetchYouTubeTranscript returns transcript text via injected fetchFn", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("lang=en&")) return { ok: true, status: 200, text: async () => TIMEDTEXT, json: async () => ({}) };
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };
  const text = await fetchYouTubeTranscript("dQw4w9WgXcQ", fetchFn);
  expect(text).toContain("Welcome to the channel");
});

test("fetchYouTubeTranscript is resilient: returns '' when no transcript and never throws", async () => {
  const fetchFn: FetchFn = async () => {
    throw new Error("network down");
  };
  await expect(fetchYouTubeTranscript("dQw4w9WgXcQ", fetchFn)).resolves.toBe("");
});
