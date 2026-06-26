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
  MAX_AUDIO_BYTES,
  MIN_FULL_TRANSCRIPT_CHARS,
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
