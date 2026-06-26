import { expect, test } from "vitest";
import { fetchPodcastTranscript, findTranscriptUrl, sanitizePodcastTranscript, transcriptContentToHtml } from "./podcast.js";
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

// ---------------------------------------------------------------------------
// sanitizePodcastTranscript — VTT parsing
// ---------------------------------------------------------------------------

const VTT_FIXTURE = `WEBVTT

00:00:01.000 --> 00:00:03.500
<v Alice>Hello and welcome to the show.

00:00:04.000 --> 00:00:07.000
<v Bob>Thanks for having me.

00:00:07.500 --> 00:00:10.000
<v Alice>Today we're talking about distributed systems.`;

test("sanitizePodcastTranscript strips WEBVTT header, timestamps, cue IDs from VTT", () => {
  const out = sanitizePodcastTranscript(VTT_FIXTURE, "text/vtt");
  expect(out).not.toContain("WEBVTT");
  expect(out).not.toContain("-->");
  expect(out).not.toContain("00:00:01");
  expect(out).toContain("Hello and welcome to the show");
  expect(out).toContain("Thanks for having me");
  expect(out).toContain("Today we");
});

test("sanitizePodcastTranscript extracts speaker labels from VTT <v> tags", () => {
  const out = sanitizePodcastTranscript(VTT_FIXTURE, "text/vtt");
  expect(out).toContain("Alice");
  expect(out).toContain("Bob");
  // Speaker names should be bolded
  expect(out).toMatch(/<strong>Alice<\/strong>|<b>Alice<\/b>/);
  expect(out).toMatch(/<strong>Bob<\/strong>|<b>Bob<\/b>/);
});

test("sanitizePodcastTranscript strips inline VTT timing tags like <00:00:01.234>", () => {
  const vttWithTimingTags = `WEBVTT

00:00:01.000 --> 00:00:05.000
<00:00:01.234><c>Hello</c> <00:00:02.000><c>world</c>`;
  const out = sanitizePodcastTranscript(vttWithTimingTags, "text/vtt");
  expect(out).not.toMatch(/<\d{2}:\d{2}/);
  expect(out).not.toContain("<c>");
  expect(out).toContain("Hello");
  expect(out).toContain("world");
});

// ---------------------------------------------------------------------------
// sanitizePodcastTranscript — SRT parsing
// ---------------------------------------------------------------------------

const SRT_FIXTURE = `1
00:00:01,000 --> 00:00:04,000
First line of speech here.

2
00:00:04,500 --> 00:00:08,000
Second line continues the thought.`;

test("sanitizePodcastTranscript parses SRT: drops sequence numbers, timestamps, keeps prose", () => {
  const out = sanitizePodcastTranscript(SRT_FIXTURE, "application/srt");
  expect(out).not.toMatch(/^\d+$/m);
  expect(out).not.toContain("-->");
  expect(out).not.toContain("00:00:01");
  expect(out).toContain("First line of speech here");
  expect(out).toContain("Second line continues the thought");
});

// ---------------------------------------------------------------------------
// sanitizePodcastTranscript — paragraph merging
// ---------------------------------------------------------------------------

test("sanitizePodcastTranscript merges short cues into flowing sentences", () => {
  const srt = `1
00:00:01,000 --> 00:00:02,000
Hello there.

2
00:00:02,500 --> 00:00:04,000
This is a continuation.`;
  const out = sanitizePodcastTranscript(srt, "application/srt");
  // Both should be in the same paragraph since they're short
  const paragraphs = out.match(/<p[^>]*>[\s\S]*?<\/p>/g) ?? [];
  const allText = paragraphs.join(" ");
  expect(allText).toContain("Hello there");
  expect(allText).toContain("This is a continuation");
});

test("sanitizePodcastTranscript breaks into paragraphs every ~500 chars", () => {
  // Build a long SRT with many cues
  const cues = Array.from({ length: 50 }, (_, i) => {
    const start = `00:00:${String(i).padStart(2, "0")},000`;
    const end = `00:00:${String(i + 1).padStart(2, "0")},000`;
    return `${i + 1}\n${start} --> ${end}\nThis is cue number ${i + 1} with some substantial text content here for testing paragraph breaks.`;
  }).join("\n\n");

  const out = sanitizePodcastTranscript(cues, "application/srt");
  const paragraphCount = (out.match(/<p/g) ?? []).length;
  // Should have multiple paragraphs for ~50 cues of decent-length text
  expect(paragraphCount).toBeGreaterThan(1);
});

// ---------------------------------------------------------------------------
// sanitizePodcastTranscript — speaker formatting
// ---------------------------------------------------------------------------

test("sanitizePodcastTranscript renders detected speakers as bold prefixes", () => {
  const out = sanitizePodcastTranscript(VTT_FIXTURE, "text/vtt");
  // Should have <strong>Name</strong>: text pattern
  expect(out).toMatch(/<strong>[^<]+<\/strong>/);
  expect(out).toContain("Hello and welcome");
});
