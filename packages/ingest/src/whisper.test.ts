/**
 * Tests for whisper.ts — Whisper-based podcast transcription.
 *
 * These tests are pure/offline: they mock the fetch and child-process calls
 * and never contact the network or invoke ffmpeg/onnxruntime.
 */
import { expect, test, vi, afterEach } from "vitest";
import {
  isFullTranscript,
  buildReadTime,
  pickAudioMime,
  isDegenerateChunk,
  MAX_AUDIO_BYTES,
  MIN_FULL_TRANSCRIPT_CHARS,
  GROQ_API_KEY,
  COMPRESSION_RATIO_THRESHOLD,
  MIN_UNIQUE_RATIO,
} from "./whisper.js";

// ---------------------------------------------------------------------------
// isFullTranscript — guards against short/stub transcripts
// ---------------------------------------------------------------------------

test("isFullTranscript returns true when HTML has enough text content", () => {
  // Build an HTML string whose stripped text is > MIN_FULL_TRANSCRIPT_CHARS
  const longParagraph = "This is a real word from a real transcript. ".repeat(100);
  const html = `<p>${longParagraph}</p>`;
  expect(isFullTranscript(html)).toBe(true);
});

test("isFullTranscript returns false for a short snippet / chapter list", () => {
  const snippet = "<p>This episode covers AI and society. Plus more.</p>";
  expect(isFullTranscript(snippet)).toBe(false);
});

test("isFullTranscript returns false for empty string", () => {
  expect(isFullTranscript("")).toBe(false);
});

test("isFullTranscript strips HTML tags before measuring length", () => {
  // Lots of HTML tags but very little actual text
  const html = "<p>" + "<span></span>".repeat(200) + "short</p>";
  expect(isFullTranscript(html)).toBe(false);
});

test("isFullTranscript threshold is MIN_FULL_TRANSCRIPT_CHARS", () => {
  // Exactly at threshold — just below → false, at or above → true
  const atThreshold = "a".repeat(MIN_FULL_TRANSCRIPT_CHARS);
  const belowThreshold = "a".repeat(MIN_FULL_TRANSCRIPT_CHARS - 1);
  expect(isFullTranscript(atThreshold)).toBe(true);
  expect(isFullTranscript(belowThreshold)).toBe(false);
});

// ---------------------------------------------------------------------------
// buildReadTime — estimates reading time from HTML body
// ---------------------------------------------------------------------------

test("buildReadTime returns positive minutes for non-empty HTML", () => {
  const words = "hello world ".repeat(300); // 600 words → 3 min at 200wpm
  const html = `<p>${words}</p>`;
  const minutes = buildReadTime(html);
  expect(minutes).toBeGreaterThan(0);
  expect(minutes).toBeCloseTo(3, 0);
});

test("buildReadTime returns 0 for empty string", () => {
  expect(buildReadTime("")).toBe(0);
});

test("buildReadTime strips HTML tags before counting words", () => {
  const html = "<p>" + "<strong>word </strong>".repeat(200) + "</p>";
  const minutes = buildReadTime(html);
  // 200 words → 1 min
  expect(minutes).toBeGreaterThan(0);
  expect(minutes).toBeLessThan(5);
});

// ---------------------------------------------------------------------------
// pickAudioMime — selects best audio track from enclosure-like objects
// ---------------------------------------------------------------------------

test("pickAudioMime returns url for audio/mpeg enclosure", () => {
  const url = pickAudioMime([
    { url: "https://cdn.example.com/ep.mp3", type: "audio/mpeg" },
  ]);
  expect(url).toBe("https://cdn.example.com/ep.mp3");
});

test("pickAudioMime prefers audio/mpeg over audio/ogg", () => {
  const url = pickAudioMime([
    { url: "https://cdn.example.com/ep.ogg", type: "audio/ogg" },
    { url: "https://cdn.example.com/ep.mp3", type: "audio/mpeg" },
  ]);
  expect(url).toBe("https://cdn.example.com/ep.mp3");
});

test("pickAudioMime returns first audio track when no mpeg available", () => {
  const url = pickAudioMime([
    { url: "https://cdn.example.com/ep.ogg", type: "audio/ogg" },
    { url: "https://cdn.example.com/ep.aac", type: "audio/aac" },
  ]);
  expect(url).toBe("https://cdn.example.com/ep.ogg");
});

test("pickAudioMime returns null for empty array", () => {
  expect(pickAudioMime([])).toBeNull();
});

test("pickAudioMime returns null when no audio tracks present", () => {
  const url = pickAudioMime([
    { url: "https://cdn.example.com/ep.jpg", type: "image/jpeg" },
  ]);
  expect(url).toBeNull();
});

// ---------------------------------------------------------------------------
// MAX_AUDIO_BYTES — sanity check the download cap constant
// ---------------------------------------------------------------------------

test("MAX_AUDIO_BYTES is a positive number capped at a reasonable size", () => {
  // Should be <= 50MB (don't want to pull a 300MB file for transcription)
  expect(MAX_AUDIO_BYTES).toBeGreaterThan(0);
  expect(MAX_AUDIO_BYTES).toBeLessThanOrEqual(50 * 1024 * 1024);
});

// ---------------------------------------------------------------------------
// MIN_FULL_TRANSCRIPT_CHARS — sanity check
// ---------------------------------------------------------------------------

test("MIN_FULL_TRANSCRIPT_CHARS is high enough to reject summaries", () => {
  // A chapter list or episode summary is typically < 500 chars
  // A real transcript for even a 10-min segment is thousands of chars
  expect(MIN_FULL_TRANSCRIPT_CHARS).toBeGreaterThanOrEqual(1000);
});

// ---------------------------------------------------------------------------
// isDegenerateChunk — Whisper hallucination / non-speech detection
// ---------------------------------------------------------------------------

test("isDegenerateChunk returns true for empty string", () => {
  expect(isDegenerateChunk("")).toBe(true);
});

test("isDegenerateChunk returns true for whitespace-only string", () => {
  expect(isDegenerateChunk("   \n  ")).toBe(true);
});

test("isDegenerateChunk returns true for a Whisper hallucination loop", () => {
  // Simulates "get the opportunity" repeated 108 times as whisper-tiny produces
  const loop = "get the opportunity to ".repeat(30).trim();
  expect(isDegenerateChunk(loop)).toBe(true);
});

test("isDegenerateChunk returns true for single-word repetition (non-speech)", () => {
  const nonSpeech = "the the the the the the the the the the the the the the";
  expect(isDegenerateChunk(nonSpeech)).toBe(true);
});

test("isDegenerateChunk returns false for real spoken dialogue", () => {
  const dialogue =
    "So one definition of intelligence is sample efficiency. " +
    "That is to say how much data do you need to operate fluently? " +
    "And it's not clear that we've made much progress on training efficiency.";
  expect(isDegenerateChunk(dialogue)).toBe(false);
});

test("isDegenerateChunk returns false for varied technical speech", () => {
  const tech =
    "The Schwab Intelligent Portfolios algorithm rebalances when asset classes " +
    "drift more than five percent from target allocations across equities bonds and alternatives.";
  expect(isDegenerateChunk(tech)).toBe(false);
});

test("isDegenerateChunk returns false for a normal sentence", () => {
  expect(isDegenerateChunk("Hello and welcome to the show today.")).toBe(false);
});

// ---------------------------------------------------------------------------
// New constants — sanity checks
// ---------------------------------------------------------------------------

test("GROQ_API_KEY is a string (empty when not set)", () => {
  // In test env, env var is not set — should be ""
  expect(typeof GROQ_API_KEY).toBe("string");
});

test("COMPRESSION_RATIO_THRESHOLD is a positive number", () => {
  expect(COMPRESSION_RATIO_THRESHOLD).toBeGreaterThan(0);
  expect(COMPRESSION_RATIO_THRESHOLD).toBeLessThan(10);
});

test("MIN_UNIQUE_RATIO is between 0 and 1", () => {
  expect(MIN_UNIQUE_RATIO).toBeGreaterThan(0);
  expect(MIN_UNIQUE_RATIO).toBeLessThan(1);
});

test("WHISPER_MODEL_ID defaults to whisper-base", async () => {
  // When no env override is set, should default to whisper-base (not tiny)
  const { WHISPER_MODEL_ID } = await import("./whisper.js");
  // Either the default or an env override — but default must not be whisper-tiny
  if (!process.env["WHISPER_MODEL_ID"]) {
    expect(WHISPER_MODEL_ID).toBe("Xenova/whisper-base");
  }
});
