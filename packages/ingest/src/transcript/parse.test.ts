import { describe, it, expect } from "vitest";
import {
  vttToText,
  srtToText,
  jsonTranscriptToText,
  transcriptContentToText,
  parseTranscriptTags,
  selectTranscript,
  transcriptKindForType,
} from "./parse.js";

// ---------------------------------------------------------------------------
// VTT → text
// ---------------------------------------------------------------------------

const VTT_FIXTURE = `WEBVTT

NOTE This is a note block that should be ignored

1
00:00:01.000 --> 00:00:04.000
<v Alice>Hello and welcome to the show.

2
00:00:04.500 --> 00:00:08.000
<v Bob>Thanks for having me, <00:00:05.000>it's great to be here.

3
00:00:08.500 --> 00:00:11.000
Today we talk about caching.
`;

describe("vttToText", () => {
  it("extracts cue text, dropping headers, notes, timestamps and inline tags", () => {
    const text = vttToText(VTT_FIXTURE);
    expect(text).toContain("Hello and welcome to the show.");
    expect(text).toContain("Thanks for having me, it's great to be here.");
    expect(text).toContain("Today we talk about caching.");
    // structural noise must be gone
    expect(text).not.toContain("WEBVTT");
    expect(text).not.toContain("NOTE");
    expect(text).not.toContain("-->");
    expect(text).not.toMatch(/<v\s/);
    expect(text).not.toMatch(/<00:00/);
  });

  it("returns empty string for empty input", () => {
    expect(vttToText("")).toBe("");
    expect(vttToText("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// SRT → text
// ---------------------------------------------------------------------------

const SRT_FIXTURE = `1
00:00:01,000 --> 00:00:04,000
Hello and welcome to the show.

2
00:00:04,500 --> 00:00:08,000
Bob: Thanks for having me.
It's great to be here.
`;

describe("srtToText", () => {
  it("extracts cue text, dropping sequence numbers and timestamps", () => {
    const text = srtToText(SRT_FIXTURE);
    expect(text).toContain("Hello and welcome to the show.");
    expect(text).toContain("Thanks for having me.");
    expect(text).toContain("It's great to be here.");
    expect(text).not.toContain("-->");
    expect(text).not.toMatch(/^\d+$/m);
  });

  it("returns empty string for empty input", () => {
    expect(srtToText("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// JSON (podcast-namespace) → text
// ---------------------------------------------------------------------------

// The podcast-namespace JSON transcript schema: { version, segments: [{ speaker, startTime, endTime, body }] }
const JSON_FIXTURE = JSON.stringify({
  version: "1.0.0",
  segments: [
    { speaker: "Alice", startTime: 0, endTime: 4, body: "Hello and welcome to the show." },
    { speaker: "Bob", startTime: 4.5, endTime: 8, body: "Thanks for having me." },
    { speaker: "Bob", startTime: 8, endTime: 10, body: "It's great to be here." },
  ],
});

describe("jsonTranscriptToText", () => {
  it("extracts segment bodies from the podcast-namespace JSON schema", () => {
    const text = jsonTranscriptToText(JSON_FIXTURE);
    expect(text).toContain("Hello and welcome to the show.");
    expect(text).toContain("Thanks for having me.");
    expect(text).toContain("It's great to be here.");
  });

  it("handles a bare array of {text} objects", () => {
    const raw = JSON.stringify([{ text: "First line." }, { text: "Second line." }]);
    const text = jsonTranscriptToText(raw);
    expect(text).toContain("First line.");
    expect(text).toContain("Second line.");
  });

  it("returns empty string on invalid JSON", () => {
    expect(jsonTranscriptToText("{not json")).toBe("");
    expect(jsonTranscriptToText("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// transcriptContentToText — dispatch by MIME/type
// ---------------------------------------------------------------------------

describe("transcriptContentToText", () => {
  it("routes text/vtt to the VTT parser", () => {
    expect(transcriptContentToText(VTT_FIXTURE, "text/vtt")).toContain("caching");
  });
  it("routes application/x-subrip (SRT) to the SRT parser", () => {
    expect(transcriptContentToText(SRT_FIXTURE, "application/x-subrip")).toContain("welcome");
  });
  it("routes application/json to the JSON parser", () => {
    expect(transcriptContentToText(JSON_FIXTURE, "application/json")).toContain("welcome");
  });
  it("strips tags for text/html", () => {
    const html = "<html><body><p>Hello <b>world</b>.</p></body></html>";
    const text = transcriptContentToText(html, "text/html");
    expect(text).toContain("Hello world.");
    expect(text).not.toContain("<");
  });
  it("passes through text/plain", () => {
    expect(transcriptContentToText("Just plain words.", "text/plain")).toBe("Just plain words.");
  });
  it("sniffs WEBVTT even when type is generic", () => {
    expect(transcriptContentToText(VTT_FIXTURE, "application/octet-stream")).toContain("caching");
  });
});

// ---------------------------------------------------------------------------
// parseTranscriptTags + selectTranscript — <podcast:transcript> ordering
// ---------------------------------------------------------------------------

describe("parseTranscriptTags", () => {
  it("normalizes rss-parser custom-field refs to {url,type,language}", () => {
    const refs = [
      { $: { url: "https://x/a.vtt", type: "text/vtt", language: "en" } },
      { $: { url: "https://x/b.html", type: "text/html" } },
    ];
    expect(parseTranscriptTags(refs)).toEqual([
      { url: "https://x/a.vtt", type: "text/vtt", language: "en" },
      { url: "https://x/b.html", type: "text/html", language: undefined },
    ]);
  });

  it("drops refs without a url", () => {
    expect(parseTranscriptTags([{ $: { type: "text/vtt" } }])).toEqual([]);
    expect(parseTranscriptTags(undefined)).toEqual([]);
  });
});

describe("selectTranscript", () => {
  const tags = [
    { url: "https://x/a.html", type: "text/html", language: "en" },
    { url: "https://x/b.vtt", type: "text/vtt", language: "es" },
    { url: "https://x/c.srt", type: "application/x-subrip", language: "en" },
    { url: "https://x/d.json", type: "application/json", language: "de" },
  ];

  it("prefers VTT/SRT/JSON over HTML", () => {
    const chosen = selectTranscript(tags, undefined);
    expect(chosen?.type).not.toBe("text/html");
  });

  it("prefers a transcript whose language matches the feed", () => {
    // feed is English → among machine formats, the English SRT wins over es/de.
    const chosen = selectTranscript(tags, "en");
    expect(chosen?.url).toBe("https://x/c.srt");
  });

  it("falls back to the first machine format when no language matches", () => {
    const chosen = selectTranscript(tags, "fr");
    expect(chosen?.type).not.toBe("text/html");
    expect(chosen?.url).toBe("https://x/b.vtt");
  });

  it("returns HTML only when it is the only option", () => {
    const chosen = selectTranscript(
      [{ url: "https://x/only.html", type: "text/html", language: undefined }],
      "en",
    );
    expect(chosen?.url).toBe("https://x/only.html");
  });

  it("returns null when there are no tags", () => {
    expect(selectTranscript([], "en")).toBeNull();
  });
});

describe("transcriptKindForType", () => {
  it("labels each supported MIME with its parser kind", () => {
    expect(transcriptKindForType("text/vtt")).toBe("vtt");
    expect(transcriptKindForType("application/x-subrip")).toBe("srt");
    expect(transcriptKindForType("application/json")).toBe("json");
    expect(transcriptKindForType("text/html")).toBe("html");
    expect(transcriptKindForType("text/plain")).toBe("plain");
  });
});
