import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePodcastTranscript } from "./resolve.js";
import { makeCaches } from "../cache/store.js";
import type { FetchFn, FetchResult } from "../fetchers/build-source.js";

// A long, varied transcript body across many real VTT cues (repetition-collapse
// would fold identical sentences, so each cue is distinct to survive as "full").
const VTT = `WEBVTT

${Array.from({ length: 60 }, (_, i) => {
  const t = String(i).padStart(2, "0");
  return `${i + 1}\n00:${t}:01.000 --> 00:${t}:05.000\nThis is a real transcript, cue ${i}, with plenty of varied dialogue about topic ${i}.`;
}).join("\n\n")}
`;

function okRes(body: string, headers: Record<string, string> = {}): FetchResult {
  return { ok: true, status: 200, headers, text: async () => body, json: async () => JSON.parse(body || "{}") };
}
function notFound(): FetchResult {
  return { ok: false, status: 404, headers: {}, text: async () => "", json: async () => ({}) };
}

describe("resolvePodcastTranscript — tier chain", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "khazana-resolve-"));
    delete process.env["PODCASTINDEX_API_KEY"];
    delete process.env["PODCASTINDEX_API_SECRET"];
    delete process.env["ALLOW_WHISPER"];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("Tier 1: resolves a <podcast:transcript> VTT tag to prose HTML", async () => {
    const caches = makeCaches(dir);
    const fetchFn: FetchFn = async (url) => (url.endsWith(".vtt") ? okRes(VTT) : notFound());
    const out = await resolvePodcastTranscript(
      {
        url: "https://show/ep1",
        enclosureUrl: "https://cdn/ep1.mp3",
        transcriptTags: [{ url: "https://show/ep1.vtt", type: "text/vtt", language: "en" }],
        feedLanguage: "en",
      },
      fetchFn,
      caches,
      {},
    );
    expect(out.tier).toBe("rss-tag");
    expect(out.body).toContain("real transcript");
    expect(out.body).toMatch(/<p>/);
  });

  it("Tier 1 miss (stub too short) → falls through to no-transcript when nothing else set", async () => {
    const caches = makeCaches(dir);
    const fetchFn: FetchFn = async () => okRes("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHi.\n");
    const out = await resolvePodcastTranscript(
      {
        url: "https://show/ep",
        enclosureUrl: "https://cdn/ep.mp3",
        transcriptTags: [{ url: "https://show/ep.vtt", type: "text/vtt", language: undefined }],
        feedLanguage: undefined,
      },
      fetchFn,
      caches,
      {},
    );
    expect(out.tier).toBe("none");
    expect(out.body).toBe("");
  });

  it("Tier 2: PodcastIndex used when keys set and tier 1 absent", async () => {
    process.env["PODCASTINDEX_API_KEY"] = "key";
    process.env["PODCASTINDEX_API_SECRET"] = "secret";
    const caches = makeCaches(dir);
    const fetchFn: FetchFn = async (url) => {
      if (url.includes("episodes/byurl")) return okRes(JSON.stringify({ episode: { id: 42 } }));
      if (url.includes("transcripts/byepisodeid"))
        return okRes(JSON.stringify({ items: [{ url: "https://pi/t.vtt", type: "text/vtt" }] }));
      if (url.endsWith(".vtt")) return okRes(VTT);
      return notFound();
    };
    const out = await resolvePodcastTranscript(
      { url: "https://show/ep", enclosureUrl: "https://cdn/ep.mp3", transcriptTags: [], feedLanguage: undefined },
      fetchFn,
      caches,
      {},
    );
    expect(out.tier).toBe("podcastindex");
    expect(out.body).toContain("real transcript");
  });

  it("Tier 2 skipped silently with NO PodcastIndex key", async () => {
    const caches = makeCaches(dir);
    let piCalled = false;
    const fetchFn: FetchFn = async (url) => {
      if (url.includes("podcastindex")) piCalled = true;
      return notFound();
    };
    const out = await resolvePodcastTranscript(
      { url: "https://show/ep", enclosureUrl: "https://cdn/ep.mp3", transcriptTags: [], feedLanguage: undefined },
      fetchFn,
      caches,
      {},
    );
    expect(piCalled).toBe(false);
    expect(out.tier).toBe("none");
  });

  it("Tier 3: YouTube captions when episode maps to a YouTube video", async () => {
    const caches = makeCaches(dir);
    const fetchFn: FetchFn = async () => notFound();
    const longText = "Spoken words in the video transcript. ".repeat(60);
    const out = await resolvePodcastTranscript(
      {
        url: "https://youtube.com/watch?v=abc123DEFGH",
        enclosureUrl: undefined,
        transcriptTags: [],
        feedLanguage: undefined,
      },
      fetchFn,
      caches,
      {
        youtube: async () => ({ kind: "transcript", text: longText }),
      },
    );
    expect(out.tier).toBe("youtube");
    expect(out.body).toContain("Spoken words");
  });

  it("Tier 4: Whisper OFF by default → no-transcript even with an enclosure", async () => {
    const caches = makeCaches(dir);
    let whisperCalled = false;
    const out = await resolvePodcastTranscript(
      { url: "https://show/ep", enclosureUrl: "https://cdn/ep.mp3", transcriptTags: [], feedLanguage: undefined },
      async () => notFound(),
      caches,
      {
        whisper: async () => {
          whisperCalled = true;
          return "<p>whispered</p>";
        },
      },
    );
    expect(whisperCalled).toBe(false);
    expect(out.tier).toBe("none");
    expect(out.body).toBe("");
  });

  it("Tier 4: Whisper runs only when ALLOW_WHISPER=1", async () => {
    process.env["ALLOW_WHISPER"] = "1";
    const caches = makeCaches(dir);
    const longBody = `<p>${"whispered dialogue ".repeat(100)}</p>`;
    const out = await resolvePodcastTranscript(
      { url: "https://show/ep", enclosureUrl: "https://cdn/ep.mp3", transcriptTags: [], feedLanguage: undefined },
      async () => notFound(),
      caches,
      { whisper: async () => longBody },
    );
    expect(out.tier).toBe("whisper");
    expect(out.body).toContain("whispered dialogue");
  });

  it("caches a resolved transcript: second call is a cache hit, no re-resolve", async () => {
    const caches = makeCaches(dir);
    let tagFetches = 0;
    const fetchFn: FetchFn = async (url) => {
      if (url.endsWith(".vtt")) {
        tagFetches++;
        return okRes(VTT);
      }
      return notFound();
    };
    const item = {
      url: "https://show/ep1",
      enclosureUrl: "https://cdn/ep1.mp3",
      transcriptTags: [{ url: "https://show/ep1.vtt", type: "text/vtt", language: undefined }],
      feedLanguage: undefined,
    };
    const first = await resolvePodcastTranscript(item, fetchFn, caches, {});
    const second = await resolvePodcastTranscript(item, fetchFn, caches, {});
    expect(first.body).toBe(second.body);
    expect(tagFetches).toBe(1); // second resolve did not re-fetch
    expect(second.cached).toBe(true);
  });

  it("caches a no-transcript result so a dead episode is never re-resolved", async () => {
    const caches = makeCaches(dir);
    let attempts = 0;
    const fetchFn: FetchFn = async () => {
      attempts++;
      return notFound();
    };
    const item = { url: "https://show/ep", enclosureUrl: "https://cdn/ep.mp3", transcriptTags: [{ url: "https://x.vtt", type: "text/vtt", language: undefined }], feedLanguage: undefined };
    await resolvePodcastTranscript(item, fetchFn, caches, {});
    const before = attempts;
    const second = await resolvePodcastTranscript(item, fetchFn, caches, {});
    expect(attempts).toBe(before); // no new fetches
    expect(second.tier).toBe("none");
    expect(second.cached).toBe(true);
  });
});
