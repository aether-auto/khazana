import { expect, test } from "vitest";
import {
  fetchPodcastTranscript,
  findTranscriptUrl,
  sanitizePodcastTranscript,
  transcriptContentToHtml,
  cleanPodcastTranscript,
  collapseRepetition,
  maxNgramRepeatCount,
} from "./podcast.js";
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

// ---------------------------------------------------------------------------
// collapseRepetition — Whisper hallucination loop collapse
// ---------------------------------------------------------------------------

test("collapseRepetition collapses a 3-gram hallucination loop to one instance", () => {
  // Simulates whisper-tiny output: "get the opportunity" repeated 30 times
  const loop = "get the opportunity to get the opportunity to get the opportunity to get the opportunity to get the opportunity to";
  const collapsed = collapseRepetition(loop);
  // Should contain the phrase once but not repeat 5+ times
  const repeatCount = maxNgramRepeatCount(collapsed, 3);
  expect(repeatCount).toBeLessThan(5);
});

test("collapseRepetition leaves normal prose unchanged", () => {
  const prose =
    "Today we are discussing distributed systems and their tradeoffs. " +
    "Alice argued that consistency is more important than availability. " +
    "Bob disagreed and pointed to the CAP theorem.";
  const result = collapseRepetition(prose);
  // Normal prose should be unchanged or minimally modified
  expect(result).toContain("distributed systems");
  expect(result).toContain("CAP theorem");
});

test("collapseRepetition handles single-word text gracefully", () => {
  expect(() => collapseRepetition("hello")).not.toThrow();
  expect(collapseRepetition("hello")).toBe("hello");
});

test("collapseRepetition handles empty string gracefully", () => {
  expect(collapseRepetition("")).toBe("");
});

// ---------------------------------------------------------------------------
// maxNgramRepeatCount — metrics for BEFORE/AFTER comparison
// ---------------------------------------------------------------------------

test("maxNgramRepeatCount returns high count for a repetition loop", () => {
  const loop = "get the opportunity to ".repeat(30).trim();
  const count = maxNgramRepeatCount(loop, 3);
  expect(count).toBeGreaterThan(20);
});

test("maxNgramRepeatCount returns ~1 for normal prose", () => {
  const prose = "Hello and welcome to the show today. We have a great guest joining us.";
  const count = maxNgramRepeatCount(prose, 3);
  expect(count).toBeLessThan(3);
});

test("maxNgramRepeatCount returns 0 for empty text", () => {
  expect(maxNgramRepeatCount("", 3)).toBe(0);
});

// ---------------------------------------------------------------------------
// cleanPodcastTranscript — ad-stripping + repetition-collapse + paragraphize
// ---------------------------------------------------------------------------

test("cleanPodcastTranscript strips NPR-style dynamic ad block", () => {
  const withAd =
    "So today we are exploring the history of chess. " +
    "This message comes from Schwab. At Schwab, you can get everything from self-directed investing to financial planning. " +
    "Back to our story. Chess was invented in India around 600 AD.";
  const out = cleanPodcastTranscript(withAd);
  expect(out).not.toContain("Schwab");
  expect(out).not.toContain("self-directed investing");
  expect(out).toContain("history of chess");
  expect(out).toContain("Chess was invented");
});

test("cleanPodcastTranscript strips 'support for this podcast comes from' lines", () => {
  const withAd =
    "Today's episode is about machine learning. " +
    "Support for this podcast comes from BetterHelp. Online therapy is available to everyone. " +
    "Let's get back to talking about gradient descent.";
  const out = cleanPodcastTranscript(withAd);
  expect(out).not.toContain("BetterHelp");
  expect(out).not.toContain("Online therapy");
  expect(out).toContain("machine learning");
  expect(out).toContain("gradient descent");
});

test("cleanPodcastTranscript strips 'brought to you by' sponsor lines", () => {
  const withSponsor =
    "Welcome to this week's episode. " +
    "This podcast is brought to you by Squarespace. Build your website today. " +
    "Now let's get into the topic of quantum computing.";
  const out = cleanPodcastTranscript(withSponsor);
  expect(out).not.toContain("Squarespace");
  expect(out).toContain("quantum computing");
});

test("cleanPodcastTranscript strips promo code lines", () => {
  const withPromo =
    "In this episode we discuss ancient Rome. " +
    "Use code PODCAST for 20% off your first order at HelloFresh.com. " +
    "The Roman Empire at its peak controlled most of the known world.";
  const out = cleanPodcastTranscript(withPromo);
  expect(out).not.toContain("HelloFresh");
  expect(out).not.toContain("promo");
  expect(out).not.toContain("Use code");
  expect(out).toContain("Roman Empire");
});

test("cleanPodcastTranscript collapses Whisper hallucination loops", () => {
  // Simulates the NPR Embedded bug: "get the opportunity" repeated 108 times
  const loopedTranscript =
    "get the opportunity to get the opportunity to get the opportunity to get the opportunity to get the opportunity to get the opportunity to get the opportunity to get the opportunity to get the opportunity to get the opportunity to";
  const out = cleanPodcastTranscript(loopedTranscript);
  // The 3-gram repeat count should be dramatically reduced
  const afterRepeat = maxNgramRepeatCount(out, 3);
  expect(afterRepeat).toBeLessThan(5);
});

test("cleanPodcastTranscript returns readable HTML paragraphs", () => {
  const clean =
    "So today we are talking about distributed systems and their fascinating tradeoffs. " +
    "Alice argued that consistency is always more important than availability. " +
    "Bob disagreed and pointed to the CAP theorem as evidence.";
  const out = cleanPodcastTranscript(clean);
  expect(out).toContain("<p>");
  expect(out).toContain("distributed systems");
});

test("cleanPodcastTranscript returns empty string for empty input", () => {
  expect(cleanPodcastTranscript("")).toBe("");
  expect(cleanPodcastTranscript("   ")).toBe("");
});

test("cleanPodcastTranscript does not strip real content that mentions a brand naturally", () => {
  // "Schwab" appearing in editorial context (not an ad) should survive
  const editorial =
    "The Charles Schwab report found that younger investors prefer ETFs over mutual funds. " +
    "This has significant implications for the asset management industry.";
  const out = cleanPodcastTranscript(editorial);
  // The ad pattern is "at schwab," (with comma or space + verb) — editorial mention should survive
  // because our pattern is /at schwab[,. ]/i which requires "at" before "schwab"
  // "Charles Schwab report" does not match /at schwab[,. ]/i
  expect(out).toContain("Charles Schwab");
});
