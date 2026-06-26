import { expect, test } from "vitest";
import {
  extractPlayerResponse,
  fetchYouTubeTranscript,
  fetchYouTubeTranscriptResult,
  parseTranscriptJson3,
  parseTranscriptXml,
  pickCaptionTrack,
  transcriptToHtml,
  youTubeVideoId,
} from "./youtube.js";
import type { FetchFn } from "./fetchers/build-source.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TIMEDTEXT_XML = `<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <text start="0" dur="2.5">Welcome to the channel</text>
  <text start="2.5" dur="3">today we explore caching &amp; sharding</text>
  <text start="5.5" dur="2">it&#39;s a deep dive</text>
  <text start="7.5" dur="2"></text>
</transcript>`;

const TIMEDTEXT_JSON3 = JSON.stringify({
  events: [
    { segs: [{ utf8: "Hello " }, { utf8: "world" }] },
    { segs: [{ utf8: "\n" }] }, // newline-only cue should be ignored
    { segs: [{ utf8: "this is a " }, { utf8: "real transcript" }] },
  ],
});

/**
 * Minimal valid watch-page HTML containing a ytInitialPlayerResponse with one
 * English caption track and one French track.
 */
function makeWatchPageHtml(baseUrl: string): string {
  const playerResponse = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl, languageCode: "fr", name: { simpleText: "French" } },
          { baseUrl: `${baseUrl}&en`, languageCode: "en", name: { simpleText: "English" } },
        ],
      },
    },
  };
  return `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></body></html>`;
}

// ---------------------------------------------------------------------------
// parseTranscriptXml
// ---------------------------------------------------------------------------

test("parses timedtext XML into clean joined plain text with entities decoded", () => {
  const text = parseTranscriptXml(TIMEDTEXT_XML);
  expect(text).toBe("Welcome to the channel today we explore caching & sharding it's a deep dive");
});

test("parseTranscriptXml handles empty input", () => {
  expect(parseTranscriptXml("")).toBe("");
  expect(parseTranscriptXml("<transcript></transcript>")).toBe("");
});

// ---------------------------------------------------------------------------
// parseTranscriptJson3
// ---------------------------------------------------------------------------

test("parseTranscriptJson3 concatenates non-empty segs, skips newline-only cues", () => {
  const text = parseTranscriptJson3(TIMEDTEXT_JSON3);
  expect(text).toBe("Hello world this is a real transcript");
});

test("parseTranscriptJson3 handles empty input gracefully", () => {
  expect(parseTranscriptJson3("")).toBe("");
  expect(parseTranscriptJson3("{}")).toBe("");
  expect(parseTranscriptJson3("not json")).toBe("");
});

// ---------------------------------------------------------------------------
// extractPlayerResponse
// ---------------------------------------------------------------------------

test("extractPlayerResponse extracts caption tracks from watch page HTML", () => {
  const html = makeWatchPageHtml("https://cdn.yt.com/timedtext?v=abc");
  const resp = extractPlayerResponse(html);
  expect(resp).not.toBeNull();
  const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  expect(tracks).toHaveLength(2);
  expect(tracks.map((t) => t.languageCode).sort()).toEqual(["en", "fr"]);
});

test("extractPlayerResponse returns null when marker is absent", () => {
  expect(extractPlayerResponse("<html><body>no player here</body></html>")).toBeNull();
  expect(extractPlayerResponse("")).toBeNull();
});

test("extractPlayerResponse returns null for malformed JSON after marker", () => {
  expect(extractPlayerResponse("var ytInitialPlayerResponse = {broken json")).toBeNull();
});

// ---------------------------------------------------------------------------
// pickCaptionTrack
// ---------------------------------------------------------------------------

test("pickCaptionTrack prefers English tracks over other languages", () => {
  const tracks = [
    { baseUrl: "https://cdn.yt.com/fr", languageCode: "fr" },
    { baseUrl: "https://cdn.yt.com/en", languageCode: "en" },
    { baseUrl: "https://cdn.yt.com/de", languageCode: "de" },
  ];
  const picked = pickCaptionTrack(tracks);
  expect(picked?.languageCode).toBe("en");
});

test("pickCaptionTrack falls back to first track when no English track exists", () => {
  const tracks = [
    { baseUrl: "https://cdn.yt.com/fr", languageCode: "fr" },
    { baseUrl: "https://cdn.yt.com/de", languageCode: "de" },
  ];
  const picked = pickCaptionTrack(tracks);
  expect(picked?.languageCode).toBe("fr");
});

test("pickCaptionTrack returns null for empty array", () => {
  expect(pickCaptionTrack([])).toBeNull();
});

// ---------------------------------------------------------------------------
// youTubeVideoId
// ---------------------------------------------------------------------------

test("youTubeVideoId extracts id from watch / youtu.be / embed / shorts URLs", () => {
  expect(youTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(youTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(youTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(youTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  expect(youTubeVideoId("https://example.com/no-id")).toBeNull();
});

// ---------------------------------------------------------------------------
// transcriptToHtml
// ---------------------------------------------------------------------------

test("transcriptToHtml wraps text in a paragraph and is empty for empty input", () => {
  expect(transcriptToHtml("hello world")).toBe("<p>hello world</p>");
  expect(transcriptToHtml("   ")).toBe("");
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — happy path (json3)
// ---------------------------------------------------------------------------

/**
 * Build a FetchFn mock that serves:
 *  - the watch page HTML for the watch URL
 *  - the json3 timedtext for the json3 track URL
 *  - 404 for everything else
 */
function makeMockFetch(baseUrl: string, json3Body: string): FetchFn {
  return async (url) => {
    if (url.includes("youtube.com/watch")) {
      return { ok: true, status: 200, text: async () => makeWatchPageHtml(baseUrl), json: async () => ({}) };
    }
    if (url.endsWith("&fmt=json3") || url.includes("&en&fmt=json3")) {
      return { ok: true, status: 200, text: async () => json3Body, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };
}

/**
 * Long enough json3 body so it clears MIN_TRANSCRIPT_CHARS.
 * Repeats "This is a real transcript sentence " until > 300 chars.
 */
const LONG_JSON3 = JSON.stringify({
  events: Array.from({ length: 20 }, (_, i) => ({
    segs: [{ utf8: `This is segment number ${i + 1} of the real transcript which is genuinely long.` }],
  })),
});

test("fetchYouTubeTranscriptResult returns transcript kind with text when json3 succeeds", async () => {
  const baseUrl = "https://cdn.youtube.com/timedtext?v=abc123";
  const fetchFn = makeMockFetch(baseUrl, LONG_JSON3);
  const result = await fetchYouTubeTranscriptResult("abc123", fetchFn);
  expect(result.kind).toBe("transcript");
  if (result.kind === "transcript") {
    expect(result.text.length).toBeGreaterThan(300);
    expect(result.text).toContain("real transcript");
  }
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — XML fallback when json3 returns garbage
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult falls back to XML timedtext when json3 returns short/invalid", async () => {
  // Serve the watch page with one English track, then:
  // - json3 URL returns empty
  // - baseUrl returns XML with long content
  const baseUrl = "https://cdn.youtube.com/timedtext?v=abc123";
  const longXml = `<transcript>${Array.from({ length: 30 }, (_, i) =>
    `<text start="${i}" dur="1">Word number ${i + 1} in the long English caption track content here.</text>`
  ).join("")}</transcript>`;

  const fetchFn: FetchFn = async (url) => {
    if (url.includes("youtube.com/watch")) {
      return { ok: true, status: 200, text: async () => makeWatchPageHtml(baseUrl), json: async () => ({}) };
    }
    if (url.includes("fmt=json3")) {
      // Return very short json3 — below MIN_TRANSCRIPT_CHARS
      return { ok: true, status: 200, text: async () => JSON.stringify({ events: [{ segs: [{ utf8: "short" }] }] }), json: async () => ({}) };
    }
    if (url.includes("en")) {
      // English track baseUrl (no fmt=json3 suffix)
      return { ok: true, status: 200, text: async () => longXml, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  const result = await fetchYouTubeTranscriptResult("abc123", fetchFn);
  expect(result.kind).toBe("transcript");
  if (result.kind === "transcript") {
    expect(result.text.length).toBeGreaterThan(100);
  }
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — no captions → none
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult returns none when page has no caption tracks", async () => {
  const pageHtml = `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify({
    captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
  })};</script></body></html>`;
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("youtube.com/watch")) {
      return { ok: true, status: 200, text: async () => pageHtml, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };
  const result = await fetchYouTubeTranscriptResult("nocaps", fetchFn);
  expect(result.kind).toBe("none");
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — consent / login wall → none
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult returns none on consent redirect", async () => {
  const fetchFn: FetchFn = async () => ({
    ok: true,
    status: 200,
    text: async () => `<html><body>Visit consent.youtube.com to continue</body></html>`,
    json: async () => ({}),
  });
  const result = await fetchYouTubeTranscriptResult("consent", fetchFn);
  expect(result.kind).toBe("none");
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — network error → none (resilient)
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult is resilient: returns none on network error, never throws", async () => {
  const fetchFn: FetchFn = async () => { throw new Error("network down"); };
  await expect(fetchYouTubeTranscriptResult("err", fetchFn)).resolves.toEqual({ kind: "none" });
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — non-ok page response → none
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult returns none when watch page returns non-ok", async () => {
  const fetchFn: FetchFn = async () => ({ ok: false, status: 403, text: async () => "", json: async () => ({}) });
  const result = await fetchYouTubeTranscriptResult("blocked", fetchFn);
  expect(result.kind).toBe("none");
});

// ---------------------------------------------------------------------------
// Legacy shim: fetchYouTubeTranscript
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscript (legacy shim) returns text when transcript found", async () => {
  const baseUrl = "https://cdn.youtube.com/timedtext?v=abc123";
  const fetchFn = makeMockFetch(baseUrl, LONG_JSON3);
  const text = await fetchYouTubeTranscript("abc123", fetchFn);
  expect(text.length).toBeGreaterThan(0);
  expect(text).toContain("real transcript");
});

test("fetchYouTubeTranscript (legacy shim) returns '' when no transcript and never throws", async () => {
  const fetchFn: FetchFn = async () => { throw new Error("network down"); };
  await expect(fetchYouTubeTranscript("err", fetchFn)).resolves.toBe("");
});
