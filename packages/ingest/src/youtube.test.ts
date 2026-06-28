import { expect, test, describe, it, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildYtDlpArgs,
  extractInnertubeApiKey,
  extractPlayerResponse,
  fetchYouTubeTranscript,
  fetchYouTubeTranscriptResult,
  fetchYtDlpTranscript,
  isDirectYouTubeEnabled,
  fetchDirectYouTubeTranscript,
  parseTranscriptJson3,
  parseTranscriptXml,
  pickCaptionTrack,
  transcriptToHtml,
  YtDlpGate,
  youTubeVideoId,
} from "./youtube.js";
import type { ExecRunner } from "./youtube.js";
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
// Proxy mock helpers (Invidious)
// ---------------------------------------------------------------------------

/** Sample VTT long enough to clear MIN_PROXY_CHARS (200). */
const LONG_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
This is segment one of the real transcript which is genuinely long.

00:00:04.500 --> 00:00:08.000
This is segment two of the real transcript which is genuinely long.

00:00:08.500 --> 00:00:12.000
This is segment three of the real transcript which is genuinely long.

00:00:12.500 --> 00:00:16.000
This is segment four of the real transcript which is genuinely long.

00:00:16.500 --> 00:00:20.000
This is segment five of the real transcript which is genuinely long.
`;

const INVIDIOUS_CAPTIONS_JSON = JSON.stringify({
  captions: [
    { label: "English", languageCode: "en", url: "/api/v1/captions/VIDEO?label=English" },
  ],
});

const TEST_INV_INSTANCE = "https://inv.test.example.com";
const TEST_PIPED_INSTANCE = "https://pipedapi.test.example.com";

/** Build a FetchFn mock that serves Invidious captions + VTT. */
function makeMockFetch(_baseUrl: string, _json3Body: string): FetchFn {
  return async (url) => {
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => INVIDIOUS_CAPTIONS_JSON, json: async () => ({}) };
    }
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };
}

// We still need LONG_JSON3 for some tests below; redefine for compatibility.
const LONG_JSON3 = JSON.stringify({
  events: Array.from({ length: 20 }, (_, i) => ({
    segs: [{ utf8: `This is segment number ${i + 1} of the real transcript which is genuinely long.` }],
  })),
});

test("fetchYouTubeTranscriptResult returns transcript kind with text when Invidious VTT succeeds", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => INVIDIOUS_CAPTIONS_JSON, json: async () => ({}) };
    }
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  // Override env so only our test instance is tried
  const savedInv = process.env["INVIDIOUS_INSTANCES"];
  const savedPiped = process.env["PIPED_INSTANCES"];
  process.env["INVIDIOUS_INSTANCES"] = TEST_INV_INSTANCE;
  process.env["PIPED_INSTANCES"] = "";

  try {
    const result = await fetchYouTubeTranscriptResult("abc123", fetchFn);
    expect(result.kind).toBe("transcript");
    if (result.kind === "transcript") {
      expect(result.text.length).toBeGreaterThan(100);
      expect(result.text).toContain("real transcript");
    }
  } finally {
    if (savedInv === undefined) delete process.env["INVIDIOUS_INSTANCES"]; else process.env["INVIDIOUS_INSTANCES"] = savedInv;
    if (savedPiped === undefined) delete process.env["PIPED_INSTANCES"]; else process.env["PIPED_INSTANCES"] = savedPiped;
  }
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — Piped fallback when Invidious fails
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult falls through to Piped when Invidious fails", async () => {
  const PROXIED_VTT_URL = `${TEST_PIPED_INSTANCE}/vtt/abc123`;
  const pipedStreamsJson = JSON.stringify({
    subtitles: [
      { code: "en", autoGenerated: false, url: PROXIED_VTT_URL },
    ],
  });

  const fetchFn: FetchFn = async (url) => {
    // Invidious fails
    if (url.startsWith(TEST_INV_INSTANCE)) {
      return { ok: false, status: 500, text: async () => "", json: async () => ({}) };
    }
    // Piped streams endpoint
    if (url.includes("/streams/")) {
      return { ok: true, status: 200, text: async () => pipedStreamsJson, json: async () => ({}) };
    }
    // The proxied VTT URL
    if (url === PROXIED_VTT_URL) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  const savedInv = process.env["INVIDIOUS_INSTANCES"];
  const savedPiped = process.env["PIPED_INSTANCES"];
  process.env["INVIDIOUS_INSTANCES"] = TEST_INV_INSTANCE;
  process.env["PIPED_INSTANCES"] = TEST_PIPED_INSTANCE;

  try {
    const result = await fetchYouTubeTranscriptResult("abc123", fetchFn);
    expect(result.kind).toBe("transcript");
    if (result.kind === "transcript") {
      expect(result.text.length).toBeGreaterThan(100);
    }
  } finally {
    if (savedInv === undefined) delete process.env["INVIDIOUS_INSTANCES"]; else process.env["INVIDIOUS_INSTANCES"] = savedInv;
    if (savedPiped === undefined) delete process.env["PIPED_INSTANCES"]; else process.env["PIPED_INSTANCES"] = savedPiped;
  }
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — no captions → none
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult returns none when page has no caption tracks", async () => {
  const fetchFn: FetchFn = async () => ({
    ok: false,
    status: 404,
    text: async () => "",
    json: async () => ({}),
  });
  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    const result = await fetchYouTubeTranscriptResult("nocaps", fetchFn);
    expect(result.kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — consent / login wall → none
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult returns none on consent redirect", async () => {
  const fetchFn: FetchFn = async () => ({
    ok: false,
    status: 403,
    text: async () => "",
    json: async () => ({}),
  });
  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    const result = await fetchYouTubeTranscriptResult("consent", fetchFn);
    expect(result.kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — network error → none (resilient)
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult is resilient: returns none on network error, never throws", async () => {
  const fetchFn: FetchFn = async () => { throw new Error("network down"); };
  await expect(fetchYouTubeTranscriptResult("err", fetchFn)).resolves.toEqual({ kind: "none" });
  // Note: with multiple Innertube fallback methods each doing retry backoffs,
  // this may take several seconds — timeout is set high enough.
}, 30_000);

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — non-ok page response → none
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult returns none when watch page returns non-ok", async () => {
  const fetchFn: FetchFn = async () => ({ ok: false, status: 403, text: async () => "", json: async () => ({}) });
  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    const result = await fetchYouTubeTranscriptResult("blocked", fetchFn);
    expect(result.kind).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Legacy shim: fetchYouTubeTranscript
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscript (legacy shim) returns text when transcript found", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => INVIDIOUS_CAPTIONS_JSON, json: async () => ({}) };
    }
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  const savedInv = process.env["INVIDIOUS_INSTANCES"];
  const savedPiped = process.env["PIPED_INSTANCES"];
  process.env["INVIDIOUS_INSTANCES"] = TEST_INV_INSTANCE;
  process.env["PIPED_INSTANCES"] = "";

  try {
    const text = await fetchYouTubeTranscript("abc123", fetchFn);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("real transcript");
  } finally {
    if (savedInv === undefined) delete process.env["INVIDIOUS_INSTANCES"]; else process.env["INVIDIOUS_INSTANCES"] = savedInv;
    if (savedPiped === undefined) delete process.env["PIPED_INSTANCES"]; else process.env["PIPED_INSTANCES"] = savedPiped;
  }
});

test("fetchYouTubeTranscript (legacy shim) returns '' when no transcript and never throws", async () => {
  const fetchFn: FetchFn = async () => { throw new Error("network down"); };
  await expect(fetchYouTubeTranscript("err", fetchFn)).resolves.toBe("");
}, 30_000);

// ---------------------------------------------------------------------------
// extractInnertubeApiKey
// ---------------------------------------------------------------------------

test("extractInnertubeApiKey extracts key from watch page HTML", () => {
  const html = `<html><head><script>ytcfg.set({"INNERTUBE_API_KEY":"AIzaSyTestKey123","INNERTUBE_CONTEXT_CLIENT_NAME":1});</script></head></html>`;
  expect(extractInnertubeApiKey(html)).toBe("AIzaSyTestKey123");
});

test("extractInnertubeApiKey returns null when absent", () => {
  expect(extractInnertubeApiKey("<html><body>no key here</body></html>")).toBeNull();
  expect(extractInnertubeApiKey("")).toBeNull();
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult — proxy fallback order
// ---------------------------------------------------------------------------

/** Helper to set env vars and restore them after. */
async function withProxyEnv(
  inv: string,
  piped: string,
  fn: () => Promise<void>,
): Promise<void> {
  const savedInv = process.env["INVIDIOUS_INSTANCES"];
  const savedPiped = process.env["PIPED_INSTANCES"];
  process.env["INVIDIOUS_INSTANCES"] = inv;
  process.env["PIPED_INSTANCES"] = piped;
  try {
    await fn();
  } finally {
    if (savedInv === undefined) delete process.env["INVIDIOUS_INSTANCES"]; else process.env["INVIDIOUS_INSTANCES"] = savedInv;
    if (savedPiped === undefined) delete process.env["PIPED_INSTANCES"]; else process.env["PIPED_INSTANCES"] = savedPiped;
  }
}

test("fetchYouTubeTranscriptResult uses Invidious proxy (non-youtube.com endpoint)", async () => {
  // Verifies the new proxy path is used — no youtubei/v1/player or youtube.com/watch calls.
  const fetchedUrls: string[] = [];

  const fetchFn: FetchFn = async (url) => {
    fetchedUrls.push(url);
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => INVIDIOUS_CAPTIONS_JSON, json: async () => ({}) };
    }
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  await withProxyEnv(TEST_INV_INSTANCE, "", async () => {
    const result = await fetchYouTubeTranscriptResult("nocaps123", fetchFn);
    expect(result.kind).toBe("transcript");
    // Must NOT have hit youtube.com directly
    expect(fetchedUrls.some((u) => u.includes("youtube.com"))).toBe(false);
  });
});

test("fetchYouTubeTranscriptResult tries second Invidious instance when first fails", async () => {
  const INV2 = "https://inv2.test.example.com";
  let secondInstanceCalled = false;

  const fetchFn: FetchFn = async (url) => {
    if (url.startsWith(TEST_INV_INSTANCE)) {
      return { ok: false, status: 500, text: async () => "", json: async () => ({}) };
    }
    if (url.startsWith(INV2) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      secondInstanceCalled = true;
      return { ok: true, status: 200, text: async () => INVIDIOUS_CAPTIONS_JSON, json: async () => ({}) };
    }
    if (url.startsWith(INV2) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  await withProxyEnv(`${TEST_INV_INSTANCE},${INV2}`, "", async () => {
    const result = await fetchYouTubeTranscriptResult("androidtest", fetchFn);
    expect(secondInstanceCalled).toBe(true);
    expect(result.kind).toBe("transcript");
  });
});

test("fetchYouTubeTranscriptResult tries Piped when Invidious fails, does not hit youtube.com", async () => {
  const PROXIED_VTT = `${TEST_PIPED_INSTANCE}/vtt/srv3test`;
  const pipedStreams = JSON.stringify({
    subtitles: [{ code: "en", autoGenerated: false, url: PROXIED_VTT }],
  });
  const fetchedUrls: string[] = [];

  const fetchFn: FetchFn = async (url) => {
    fetchedUrls.push(url);
    if (url.startsWith(TEST_INV_INSTANCE)) {
      return { ok: false, status: 500, text: async () => "", json: async () => ({}) };
    }
    if (url.includes("/streams/")) {
      return { ok: true, status: 200, text: async () => pipedStreams, json: async () => ({}) };
    }
    if (url === PROXIED_VTT) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    const result = await fetchYouTubeTranscriptResult("srv3test", fetchFn);
    expect(result.kind).toBe("transcript");
    expect(fetchedUrls.some((u) => u.includes("youtube.com"))).toBe(false);
  });
});

test("fetchYouTubeTranscriptResult picks English track over non-English in Invidious captions", async () => {
  const captionsWithFrench = JSON.stringify({
    captions: [
      { label: "French", languageCode: "fr", url: "/api/v1/captions/VIDEO?label=French" },
      { label: "English", languageCode: "en", url: "/api/v1/captions/VIDEO?label=English" },
    ],
  });
  const fetchedTrackUrls: string[] = [];

  const fetchFn: FetchFn = async (url) => {
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => captionsWithFrench, json: async () => ({}) };
    }
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("label=")) {
      fetchedTrackUrls.push(url);
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  await withProxyEnv(TEST_INV_INSTANCE, "", async () => {
    await fetchYouTubeTranscriptResult("frtest", fetchFn);
    expect(fetchedTrackUrls.some((u) => u.includes("label=English"))).toBe(true);
    expect(fetchedTrackUrls.some((u) => u.includes("label=French"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// description-fallback removed — none returned when all methods fail
// ---------------------------------------------------------------------------

test("fetchYouTubeTranscriptResult returns none (not description-fallback) when all methods fail", async () => {
  const fetchFn: FetchFn = async () => ({
    ok: false,
    status: 500,
    text: async () => "",
    json: async () => ({}),
  });

  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    const result = await fetchYouTubeTranscriptResult("allfail", fetchFn);
    expect(result.kind).toBe("none");
    // TypeScript-level: ensure 'description-fallback' is not a valid kind
    const kinds: Array<"transcript" | "none"> = [result.kind];
    expect(kinds).toContain("none");
  });
});

test("fetchYouTubeTranscriptResult never contacts youtube.com directly", async () => {
  const fetchedUrls: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    fetchedUrls.push(url);
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => INVIDIOUS_CAPTIONS_JSON, json: async () => ({}) };
    }
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    await fetchYouTubeTranscriptResult("direct123", fetchFn);
    // No URL should be youtube.com, googlevideo.com, or youtubei
    const directHits = fetchedUrls.filter(
      (u) => u.includes("youtube.com") || u.includes("googlevideo.com") || u.includes("youtubei"),
    );
    expect(directHits).toHaveLength(0);
  });
});

test("fetchYouTubeTranscriptResult is resilient: proxy returns none on all failures", async () => {
  const fetchFn: FetchFn = async () => { throw new Error("network down"); };
  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    const result = await fetchYouTubeTranscriptResult("blocked456", fetchFn);
    expect(result.kind).toBe("none");
  });
});

test("fetchYouTubeTranscriptResult skips Piped subtitle pointing to youtube.com", async () => {
  const fetchedUrls: string[] = [];
  const pipedStreams = JSON.stringify({
    subtitles: [{ code: "en", autoGenerated: false, url: "https://www.youtube.com/api/timedtext?v=webonly789" }],
  });

  const fetchFn: FetchFn = async (url) => {
    fetchedUrls.push(url);
    if (url.startsWith(TEST_INV_INSTANCE)) {
      return { ok: false, status: 500, text: async () => "", json: async () => ({}) };
    }
    if (url.includes("/streams/")) {
      return { ok: true, status: 200, text: async () => pipedStreams, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
    const result = await fetchYouTubeTranscriptResult("webonly789", fetchFn);
    expect(result.kind).toBe("none");
    // The youtube.com URL inside subtitles must never be fetched
    expect(fetchedUrls.some((u) => u.includes("youtube.com/api/timedtext"))).toBe(false);
  });
});

test("fetchYouTubeTranscriptResult sends Accept-Language header on Invidious requests (not a consent cookie)", async () => {
  const seenHeaders: Record<string, string>[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    seenHeaders.push(init?.headers ?? {});
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("/api/v1/captions/") && !url.includes("label=")) {
      return { ok: true, status: 200, text: async () => INVIDIOUS_CAPTIONS_JSON, json: async () => ({}) };
    }
    if (url.startsWith(TEST_INV_INSTANCE) && url.includes("label=")) {
      return { ok: true, status: 200, text: async () => LONG_VTT, json: async () => ({}) };
    }
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  };

  await withProxyEnv(TEST_INV_INSTANCE, "", async () => {
    await fetchYouTubeTranscriptResult("cookietest", fetchFn);
    // Proxy does not need to send CONSENT cookie — it never hits youtube.com
    const sentCookies = seenHeaders.flatMap((h) => h["Cookie"] ? [h["Cookie"]] : []);
    expect(sentCookies.some((c) => c?.includes("CONSENT=YES"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// transcriptToHtml multi-paragraph behavior
// ---------------------------------------------------------------------------

test("transcriptToHtml splits long transcript into multiple paragraphs", () => {
  // Build a 1500-char transcript that should split into 3+ paragraphs
  const sentence = "This is a sentence that adds content to the transcript body.";
  const longText = Array.from({ length: 30 }, () => sentence).join(" ");
  const html = transcriptToHtml(longText);
  const paragraphCount = (html.match(/<p>/g) ?? []).length;
  expect(paragraphCount).toBeGreaterThan(1);
  // Each paragraph wrapped in <p>...</p>
  expect(html).toMatch(/^<p>/);
  expect(html).toMatch(/<\/p>$/);
});

test("transcriptToHtml keeps short transcripts as a single paragraph", () => {
  const shortText = "Short transcript text.";
  const html = transcriptToHtml(shortText);
  expect(html).toBe("<p>Short transcript text.</p>");
});

// ---------------------------------------------------------------------------
// isDirectYouTubeEnabled
// ---------------------------------------------------------------------------

describe("isDirectYouTubeEnabled", () => {
  afterEach(() => { delete process.env["ALLOW_DIRECT_YOUTUBE"]; });

  it("returns false by default", () => {
    delete process.env["ALLOW_DIRECT_YOUTUBE"];
    expect(isDirectYouTubeEnabled()).toBe(false);
  });

  it("returns true when ALLOW_DIRECT_YOUTUBE=1", () => {
    process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
    expect(isDirectYouTubeEnabled()).toBe(true);
  });

  it("returns false when ALLOW_DIRECT_YOUTUBE=0", () => {
    process.env["ALLOW_DIRECT_YOUTUBE"] = "0";
    expect(isDirectYouTubeEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscriptResult - direct fallback
// ---------------------------------------------------------------------------

describe("fetchYouTubeTranscriptResult - direct fallback", () => {
  afterEach(() => { delete process.env["ALLOW_DIRECT_YOUTUBE"]; });

  it("only tries proxy when ALLOW_DIRECT_YOUTUBE not set", async () => {
    delete process.env["ALLOW_DIRECT_YOUTUBE"];
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      return new Response("", { status: 404 }) as unknown as Awaited<ReturnType<FetchFn>>;
    };
    await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
      await fetchYouTubeTranscriptResult("test123", fetchFn as FetchFn);
    });
    const watchUrls = urls.filter(u => u.includes("youtube.com/watch"));
    expect(watchUrls).toHaveLength(0);
  });

  it("tries direct watch-page when proxy fails and ALLOW_DIRECT_YOUTUBE=1", async () => {
    process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
    // Mock watch page HTML with captionTracks
    const mockWatchHtml = `
      var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=test123&lang=en","name":{"simpleText":"English"},"languageCode":"en","kind":"","isTranslatable":true}]}}};
    `;
    const mockJson3 = JSON.stringify({
      events: [
        { segs: [{ utf8: "Hello " }], tStartMs: 0, dDurationMs: 1000 },
        { segs: [{ utf8: "world" }], tStartMs: 1000, dDurationMs: 1000 }
      ]
    });
    const fetchFn: FetchFn = async (url: string, _opts?: RequestInit) => {
      if (url.includes("youtube.com/watch")) {
        return { ok: true, status: 200, text: async () => mockWatchHtml, json: async () => ({}) };
      }
      if (url.includes("timedtext") && url.includes("fmt=json3")) {
        return { ok: true, status: 200, text: async () => mockJson3, json: async () => ({}) };
      }
      // proxy returns 404
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    };
    await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
      // Force yt-dlp "unavailable" so no real subprocess spawns and the
      // watch-page tier is exercised.
      const result = await fetchYouTubeTranscriptResult("test123", fetchFn, {
        ytDlpAvailable: () => false,
      });
      expect(result.kind).toBe("transcript");
    });
  });

  it("does not try yt-dlp when ALLOW_DIRECT_YOUTUBE not set", async () => {
    delete process.env["ALLOW_DIRECT_YOUTUBE"];
    let ytDlpCalled = false;
    const fetchFn: FetchFn = async () => ({ ok: false, status: 404, text: async () => "", json: async () => ({}) });
    await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
      const result = await fetchYouTubeTranscriptResult("test456", fetchFn, {
        ytDlpAvailable: () => true,
        ytDlp: async () => { ytDlpCalled = true; return ""; },
      });
      expect(result.kind).toBe("none");
    });
    expect(ytDlpCalled).toBe(false);
  });

  it("tries yt-dlp FIRST (before watch-page) when enabled and available", async () => {
    process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
    const order: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      if (url.includes("youtube.com/watch")) order.push("watch");
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    };
    await withProxyEnv(TEST_INV_INSTANCE, TEST_PIPED_INSTANCE, async () => {
      const result = await fetchYouTubeTranscriptResult("orderXYZ", fetchFn, {
        ytDlpAvailable: () => true,
        ytDlp: async () => { order.push("ytdlp"); return "a real yt-dlp transcript body"; },
      });
      expect(result.kind).toBe("transcript");
      if (result.kind === "transcript") expect(result.text).toContain("yt-dlp transcript");
    });
    // yt-dlp ran first; because it succeeded the watch-page was never hit.
    expect(order[0]).toBe("ytdlp");
    expect(order).not.toContain("watch");
  });

  it("falls through yt-dlp → watch-page → proxy when each prior tier fails", async () => {
    process.env["ALLOW_DIRECT_YOUTUBE"] = "1";
    const order: string[] = [];
    const mockWatchHtml = `var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[]}}};`;
    const fetchFn: FetchFn = async (url) => {
      if (url.includes("youtube.com/watch")) {
        order.push("watch");
        return { ok: true, status: 200, text: async () => mockWatchHtml, json: async () => ({}) };
      }
      if (url.startsWith(TEST_INV_INSTANCE)) order.push("proxy");
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    };
    await withProxyEnv(TEST_INV_INSTANCE, "", async () => {
      const result = await fetchYouTubeTranscriptResult("fallXYZ", fetchFn, {
        ytDlpAvailable: () => true,
        ytDlp: async () => { order.push("ytdlp"); return ""; },
      });
      expect(result.kind).toBe("none");
    });
    expect(order[0]).toBe("ytdlp");
    expect(order).toContain("watch");
    expect(order.indexOf("ytdlp")).toBeLessThan(order.indexOf("watch"));
    expect(order.indexOf("watch")).toBeLessThan(order.indexOf("proxy"));
  });
});

// ---------------------------------------------------------------------------
// buildYtDlpArgs — lean, English-only, paced flags
// ---------------------------------------------------------------------------

describe("buildYtDlpArgs", () => {
  const savedEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ["YT_DLP_SLEEP_REQUESTS", "YT_DLP_SLEEP_SUBTITLES", "YT_DLP_IMPERSONATE"]) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("restricts to an explicit English list, never a broad glob", () => {
    const args = buildYtDlpArgs("vid123", "/tmp/base");
    const i = args.indexOf("--sub-langs");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe("en,en-orig");
    // No translated-variant glob that triggered the 429.
    expect(args.join(" ")).not.toContain("en.*");
    expect(args.join(" ")).not.toContain("all");
  });

  it("requests both manual and auto English subs as vtt, skipping the download", () => {
    const args = buildYtDlpArgs("vid123", "/tmp/base");
    expect(args).toContain("--write-subs");
    expect(args).toContain("--write-auto-subs");
    expect(args).toContain("--skip-download");
    const fi = args.indexOf("--sub-format");
    expect(args[fi + 1]).toBe("vtt");
  });

  it("includes yt-dlp's own pacing + retry flags (defaults)", () => {
    const args = buildYtDlpArgs("vid123", "/tmp/base");
    expect(args[args.indexOf("--sleep-requests") + 1]).toBe("1");
    expect(args[args.indexOf("--sleep-subtitles") + 1]).toBe("1");
    expect(args).toContain("--retries");
    expect(args).toContain("--extractor-retries");
  });

  it("honors env-configured sleep values", () => {
    process.env["YT_DLP_SLEEP_REQUESTS"] = "3";
    process.env["YT_DLP_SLEEP_SUBTITLES"] = "2";
    const args = buildYtDlpArgs("vid123", "/tmp/base");
    expect(args[args.indexOf("--sleep-requests") + 1]).toBe("3");
    expect(args[args.indexOf("--sleep-subtitles") + 1]).toBe("2");
  });

  it("omits --impersonate unless YT_DLP_IMPERSONATE is set", () => {
    expect(buildYtDlpArgs("vid123", "/tmp/base")).not.toContain("--impersonate");
    process.env["YT_DLP_IMPERSONATE"] = "1";
    const args = buildYtDlpArgs("vid123", "/tmp/base");
    expect(args).toContain("--impersonate");
    expect(args[args.indexOf("--impersonate") + 1]).toBe("chrome");
  });

  it("passes the video id and output base after the -- separator", () => {
    const args = buildYtDlpArgs("vid123", "/tmp/base");
    expect(args[args.indexOf("-o") + 1]).toBe("/tmp/base");
    expect(args[args.length - 1]).toBe("vid123");
    expect(args[args.length - 2]).toBe("--");
  });
});

// ---------------------------------------------------------------------------
// YtDlpGate — serialize (concurrency 1) + min-gap, deterministic clock
// ---------------------------------------------------------------------------

describe("YtDlpGate", () => {
  /** A fake clock: `now` is advanced explicitly; `sleep` jumps it forward. */
  function fakeClock() {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number) => { t += ms; },
      advance: (ms: number) => { t += ms; },
      get t() { return t; },
    };
  }

  it("serializes calls (concurrency 1) — never overlaps", async () => {
    const clock = fakeClock();
    const gate = new YtDlpGate(() => 0, clock);
    let active = 0;
    let maxActive = 0;
    const make = (id: number) =>
      gate.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        // Yield a couple of microtasks to expose any overlap.
        await Promise.resolve();
        await Promise.resolve();
        active--;
        return id;
      });
    const results = await Promise.all([make(1), make(2), make(3)]);
    expect(results).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
  });

  it("enforces the min-gap between invocations via the injected sleep", async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const gate = new YtDlpGate(() => 5000, clock);
    const run = () => gate.run(async () => { starts.push(clock.now()); });
    await run();
    await run();
    await run();
    // Each invocation starts >= 5000ms after the previous one's start.
    expect(starts).toEqual([0, 5000, 10000]);
  });

  it("does not sleep when enough time already elapsed", async () => {
    const clock = fakeClock();
    const starts: number[] = [];
    const gate = new YtDlpGate(() => 1000, clock);
    await gate.run(async () => { starts.push(clock.now()); });
    clock.advance(5000); // more than the gap passes on its own
    await gate.run(async () => { starts.push(clock.now()); });
    expect(starts).toEqual([0, 5000]); // no extra sleep added
  });

  it("a rejecting run does not wedge the gate for later callers", async () => {
    const clock = fakeClock();
    const gate = new YtDlpGate(() => 0, clock);
    await expect(gate.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// fetchYtDlpTranscript — injected async exec + gate, no real subprocess
// ---------------------------------------------------------------------------

describe("fetchYtDlpTranscript (injected exec)", () => {
  it("passes the lean arg list to the exec runner", async () => {
    let seenArgs: readonly string[] = [];
    const exec: ExecRunner = async (_file, args) => { seenArgs = args; };
    // No transcript file written → returns "".
    const out = await fetchYtDlpTranscript("argcheck", {
      exec,
      gate: new YtDlpGate(() => 0),
    });
    expect(out).toBe("");
    expect(seenArgs).toContain("--sub-langs");
    expect(seenArgs[seenArgs.indexOf("--sub-langs") + 1]).toBe("en,en-orig");
    expect(seenArgs).toContain("--sleep-requests");
    expect(seenArgs).toContain("--skip-download");
    expect(seenArgs.join(" ")).not.toContain("en.*");
  });

  it("returns '' and never throws when exec rejects", async () => {
    const exec: ExecRunner = async () => { throw new Error("spawn failed"); };
    await expect(
      fetchYtDlpTranscript("boom", { exec, gate: new YtDlpGate(() => 0) }),
    ).resolves.toBe("");
  });

  it("reads the written .en.vtt, sanitizes it, and cleans up temp files", async () => {
    const vid = `vtttest-${Date.now()}`;
    const tmpBase = path.join(os.tmpdir(), `khzytdlp-${vid}`);
    const vttPath = `${tmpBase}.en.vtt`;
    const exec: ExecRunner = async () => {
      fs.writeFileSync(
        vttPath,
        `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nThis is a real spoken transcript line.\n\n` +
          `00:00:04.500 --> 00:00:08.000\nAnother spoken line of the transcript here.\n`,
      );
    };
    const out = await fetchYtDlpTranscript(vid, { exec, gate: new YtDlpGate(() => 0) });
    expect(out).toContain("real spoken transcript");
    // Temp file cleaned up afterwards.
    expect(fs.existsSync(vttPath)).toBe(false);
  });

  it("serializes + paces real fetch calls through the gate (deterministic clock)", async () => {
    let t = 0;
    const clock = { now: () => t, sleep: async (ms: number) => { t += ms; } };
    const gate = new YtDlpGate(() => 3000, clock);
    const starts: number[] = [];
    const exec: ExecRunner = async () => { starts.push(t); };
    await Promise.all([
      fetchYtDlpTranscript("a", { exec, gate }),
      fetchYtDlpTranscript("b", { exec, gate }),
      fetchYtDlpTranscript("c", { exec, gate }),
    ]);
    expect(starts).toEqual([0, 3000, 6000]);
  });
});

// ---------------------------------------------------------------------------
// fetchDirectYouTubeTranscript
// ---------------------------------------------------------------------------

describe("fetchDirectYouTubeTranscript", () => {
  it("sends consent cookie headers", async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetchFn: FetchFn = async (url: string, opts?: RequestInit) => {
      if (url.includes("youtube.com/watch")) {
        capturedHeaders = (opts?.headers as Record<string, string>) ?? {};
        return { ok: true, status: 200, text: async () => "var ytInitialPlayerResponse = {}", json: async () => ({}) };
      }
      return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
    };
    await fetchDirectYouTubeTranscript("test789", fetchFn);
    expect(capturedHeaders["Cookie"] ?? capturedHeaders["cookie"] ?? "").toContain("CONSENT=YES");
  });

  it("falls back from json3 to xml when json3 returns empty", async () => {
    const TIMEDTEXT_XML_FALLBACK = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="0" dur="1">Hello world</text>
</transcript>`;

    const mockWatchHtml = `
      var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=fallback&lang=en","name":{"simpleText":"English"},"languageCode":"en","kind":"","isTranslatable":true}]}}};
    `;
    const fetchFn: FetchFn = async (url: string) => {
      if (url.includes("youtube.com/watch")) {
        return { ok: true, status: 200, text: async () => mockWatchHtml, json: async () => ({}) };
      }
      if (url.includes("fmt=json3")) {
        // Return empty JSON3 (no events)
        return { ok: true, status: 200, text: async () => JSON.stringify({}), json: async () => ({}) };
      }
      if (url.includes("fmt=srv3")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({}), json: async () => ({}) };
      }
      // raw XML fallback
      return { ok: true, status: 200, text: async () => TIMEDTEXT_XML_FALLBACK, json: async () => ({}) };
    };
    const result = await fetchDirectYouTubeTranscript("fallback", fetchFn);
    expect(result).toContain("Hello world");
  });
});
