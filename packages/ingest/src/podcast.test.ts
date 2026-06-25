import { expect, test } from "vitest";
import { fetchPodcastTranscript, findTranscriptUrl, transcriptContentToHtml } from "./podcast.js";
import type { FetchFn } from "./fetchers/build-source.js";

const ITEM_XML = `<item>
  <title>Episode 12</title>
  <podcast:transcript url="https://cdn.example.com/ep12.html" type="text/html" />
  <podcast:transcript url="https://cdn.example.com/ep12.txt" type="text/plain" />
  <podcast:transcript url="https://cdn.example.com/ep12.srt" type="application/srt" />
</item>`;

test("findTranscriptUrl prefers text/plain transcript", () => {
  expect(findTranscriptUrl(ITEM_XML)).toBe("https://cdn.example.com/ep12.txt");
});

test("findTranscriptUrl falls back to html then first when no plain", () => {
  const xml = `<item><podcast:transcript url="https://x/a.html" type="text/html"/><podcast:transcript url="https://x/b.srt" type="application/srt"/></item>`;
  expect(findTranscriptUrl(xml)).toBe("https://x/a.html");
  const noTyped = `<item><podcast:transcript url="https://x/only.srt"/></item>`;
  expect(findTranscriptUrl(noTyped)).toBe("https://x/only.srt");
});

test("findTranscriptUrl returns null when absent", () => {
  expect(findTranscriptUrl("<item><title>no transcript</title></item>")).toBeNull();
  expect(findTranscriptUrl("")).toBeNull();
});

test("transcriptContentToHtml builds paragraphs from plain text and escapes", () => {
  const out = transcriptContentToHtml("Intro line about A & B\n\nSecond paragraph here", "text/plain");
  expect(out).toBe("<p>Intro line about A &amp; B</p><p>Second paragraph here</p>");
});

test("transcriptContentToHtml drops SRT cue numbers and timing lines", () => {
  const srt = "1\n\n00:00:01 --> 00:00:04\n\nActual spoken words here";
  const out = transcriptContentToHtml(srt, "text/plain");
  expect(out).toBe("<p>Actual spoken words here</p>");
});

test("transcriptContentToHtml sanitizes html transcripts", () => {
  const out = transcriptContentToHtml(`<p>safe</p><script>bad()</script>`, "text/html");
  expect(out).toContain("<p>safe</p>");
  expect(out).not.toContain("<script");
});

test("fetchPodcastTranscript fetches and converts; resilient on failure", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("ep12.txt")) return { ok: true, status: 200, text: async () => "Hello listeners", json: async () => ({}) };
    throw new Error("boom");
  };
  await expect(fetchPodcastTranscript("https://cdn.example.com/ep12.txt", fetchFn)).resolves.toBe(
    "<p>Hello listeners</p>",
  );
  await expect(fetchPodcastTranscript("https://cdn.example.com/missing.txt", fetchFn)).resolves.toBe("");
});
