import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  fetchYouTubeVideoMeta,
  makeVideoMetaCache,
  parseYtDlpJson,
  YouTubeVideoMetaSchema,
  type VideoMetaCache,
} from "./youtube-meta.js";
import { YtDlpGate, type GateClock } from "./youtube.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(HERE, "__fixtures__", "yt-dlp-3b1b.json"), "utf8"),
) as unknown;

// A deterministic gate: no real timers.
function fakeGate(): YtDlpGate {
  let t = 0;
  const clock: GateClock = { now: () => t, sleep: async (ms) => void (t += ms) };
  return new YtDlpGate(() => 0, clock);
}

describe("parseYtDlpJson — real 3Blue1Brown -J fixture", () => {
  test("extracts every founder-required signal", () => {
    const meta = parseYtDlpJson(FIXTURE)!;
    expect(meta).not.toBeNull();
    expect(meta.videoId).toBe("aircAruvnKk");
    expect(meta.channel).toBe("3Blue1Brown");
    expect(meta.channelId).toBe("UCYO_jab_esuFRV4b17AJtAw");
    // Subscribers — the signal podcasts entirely lack.
    expect(meta.subscriberCount).toBe(8_450_000);
    expect(meta.viewCount).toBeGreaterThan(20_000_000);
    expect(meta.likeCount).toBeGreaterThan(500_000);
    expect(meta.durationSec).toBe(1120);
    expect(meta.uploadDate).toMatch(/^\d{8}$/);
    expect(meta.hasCaptions).toBe(true);
    expect(meta.hasManualCaptions).toBe(true);
  });

  test("the parsed shape is schema-valid", () => {
    const meta = parseYtDlpJson(FIXTURE)!;
    expect(YouTubeVideoMetaSchema.safeParse(meta).success).toBe(true);
  });

  test("falls back from channel → uploader when channel is absent", () => {
    const meta = parseYtDlpJson({
      id: "x",
      title: "t",
      uploader: "Some Creator",
      channel_id: "UC123",
    })!;
    expect(meta.channel).toBe("Some Creator");
  });

  test("returns null on missing identity fields", () => {
    expect(parseYtDlpJson({ id: "x" })).toBeNull();
    expect(parseYtDlpJson(null)).toBeNull();
    expect(parseYtDlpJson("nope")).toBeNull();
  });

  test("hasCaptions false when no english tracks", () => {
    const meta = parseYtDlpJson({
      id: "x",
      title: "t",
      channel: "c",
      channel_id: "UC1",
      subtitles: { fr: [] },
      automatic_captions: { de: [] },
    })!;
    expect(meta.hasCaptions).toBe(false);
    expect(meta.hasManualCaptions).toBe(false);
  });
});

describe("fetchYouTubeVideoMeta — paced + cached wrapper", () => {
  it("runs yt-dlp -J through the gate and parses the result", async () => {
    let calls = 0;
    const meta = await fetchYouTubeVideoMeta("aircAruvnKk", {
      gate: fakeGate(),
      run: async () => {
        calls += 1;
        return JSON.stringify(FIXTURE);
      },
    });
    expect(calls).toBe(1);
    expect(meta?.subscriberCount).toBe(8_450_000);
  });

  it("serves a cache hit without spawning yt-dlp", async () => {
    const parsed = parseYtDlpJson(FIXTURE)!;
    const store = new Map<string, { meta: unknown }>();
    store.set("aircAruvnKk", { meta: parsed });
    const cache: VideoMetaCache = {
      get: (k) => store.get(k),
      set: (k, v) => void store.set(k, v),
    };
    let calls = 0;
    const meta = await fetchYouTubeVideoMeta("aircAruvnKk", {
      cache,
      run: async () => {
        calls += 1;
        return "";
      },
    });
    expect(calls).toBe(0); // never spawned
    expect(meta?.channel).toBe("3Blue1Brown");
  });

  it("writes the fetched meta into the cache", async () => {
    const store = new Map<string, { meta: unknown }>();
    const cache: VideoMetaCache = {
      get: (k) => store.get(k),
      set: (k, v) => void store.set(k, v),
    };
    await fetchYouTubeVideoMeta("aircAruvnKk", {
      cache,
      gate: fakeGate(),
      run: async () => JSON.stringify(FIXTURE),
    });
    expect(store.has("aircAruvnKk")).toBe(true);
  });

  it("returns null (never throws) when yt-dlp fails", async () => {
    const meta = await fetchYouTubeVideoMeta("bad", {
      gate: fakeGate(),
      run: async () => "",
    });
    expect(meta).toBeNull();
  });

  it("returns null on unparseable stdout", async () => {
    const meta = await fetchYouTubeVideoMeta("bad", {
      gate: fakeGate(),
      run: async () => "not json{",
    });
    expect(meta).toBeNull();
  });
});

describe("makeVideoMetaCache — persistent round-trip", () => {
  it("persists a fetched meta and serves it on the next call without spawning", async () => {
    const dir = mkdtempSync(join(tmpdir(), "khzytmeta-"));
    const cache = makeVideoMetaCache(dir);
    let calls = 0;
    const run = async () => {
      calls += 1;
      return JSON.stringify(FIXTURE);
    };
    const first = await fetchYouTubeVideoMeta("aircAruvnKk", { cache, gate: fakeGate(), run });
    expect(first?.subscriberCount).toBe(8_450_000);
    expect(calls).toBe(1);

    // A fresh cache over the same dir reads the persisted entry.
    const cache2 = makeVideoMetaCache(dir);
    const second = await fetchYouTubeVideoMeta("aircAruvnKk", { cache: cache2, gate: fakeGate(), run });
    expect(second?.channel).toBe("3Blue1Brown");
    expect(calls).toBe(1); // no second spawn
  });
});
