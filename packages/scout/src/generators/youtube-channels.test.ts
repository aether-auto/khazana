import { describe, expect, it, test } from "vitest";
import type { FeedItem, Registry } from "@khazana/core";
import {
  applyYouTubeTrust,
  buildYtSearchArgs,
  buildYtSearchQueries,
  channelFeedUrl,
  discoverYouTubeChannels,
  mineCuratedChannels,
  parseYtSearchResults,
  rankChannels,
  registryChannelIds,
  videoIdOf,
  youTubeChannelId,
  type ChannelSignalMap,
  type DiscoveredChannel,
  type YouTubeChannelMeta,
} from "./youtube-channels.js";

const NOW = Date.UTC(2026, 5, 30);

const registry: Registry = {
  version: 1,
  sources: [
    {
      id: "youtube-3blue1brown",
      type: "youtube",
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw",
      channels: ["science"],
      enabled: true,
      trustScore: 0.9,
      addedBy: "seed",
      failureCount: 0,
    },
    {
      id: "some-blog",
      type: "rss",
      url: "https://example.com/feed.xml",
      channels: ["tech"],
      enabled: true,
      trustScore: 0.6,
      addedBy: "seed",
      failureCount: 0,
    },
  ],
};

function videoItem(id: string, url: string, title: string, taste = 0.8): FeedItem {
  return {
    id,
    source: "youtube-x",
    sourceType: "youtube",
    url,
    title,
    publishedAt: "2026-01-01T00:00:00.000Z",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    topics: [],
    entities: [],
    summary: "",
    media: [],
    kind: "video",
    tasteScore: taste,
  };
}

describe("channel identity + registry dedup", () => {
  test("youTubeChannelId extracts UC id from feed + channel URLs", () => {
    expect(youTubeChannelId("https://www.youtube.com/feeds/videos.xml?channel_id=UCYO_jab_esuFRV4b17AJtAw")).toBe(
      "UCYO_jab_esuFRV4b17AJtAw",
    );
    expect(youTubeChannelId("https://www.youtube.com/channel/UCYO_jab_esuFRV4b17AJtAw")).toBe(
      "UCYO_jab_esuFRV4b17AJtAw",
    );
    expect(youTubeChannelId("https://www.youtube.com/watch?v=abc")).toBeNull();
  });

  test("registryChannelIds collects only youtube sources' channel ids", () => {
    const ids = registryChannelIds(registry);
    expect(ids.has("UCYO_jab_esuFRV4b17AJtAw")).toBe(true);
    expect(ids.size).toBe(1);
  });

  test("videoIdOf handles watch/youtu.be/shorts", () => {
    expect(videoIdOf("https://www.youtube.com/watch?v=aircAruvnKk")).toBe("aircAruvnKk");
    expect(videoIdOf("https://youtu.be/aircAruvnKk")).toBe("aircAruvnKk");
    expect(videoIdOf("https://example.com")).toBeNull();
  });

  test("channelFeedUrl builds the videos.xml feed", () => {
    expect(channelFeedUrl("UC123")).toContain("channel_id=UC123");
  });
});

describe("mineCuratedChannels — channels behind curated videos", () => {
  const meta: Record<string, YouTubeChannelMeta> = {
    // A NEW channel (not in registry) — should surface.
    v_new: { channelId: "UCnewChannelIddddddddddd", channel: "New Creator", subscriberCount: 500_000, viewCount: 300_000, likeCount: 15_000, durationSec: 800, uploadDate: "20260401" },
    // 3B1B — already registered, must be dropped.
    v_known: { channelId: "UCYO_jab_esuFRV4b17AJtAw", channel: "3Blue1Brown", subscriberCount: 8_450_000, viewCount: 1_000_000, likeCount: 50_000, uploadDate: "20260101" },
  };
  const lookup = (vid: string) => meta[vid];

  it("surfaces new channels and drops registered ones", () => {
    const curated = [
      videoItem("1", "https://www.youtube.com/watch?v=v_new00000_", "Cool explainer"),
      videoItem("2", "https://www.youtube.com/watch?v=v_known0000_", "3B1B video"),
    ];
    // videoIdOf needs an 11-char id; map lookups by the extracted id.
    const byId: Record<string, YouTubeChannelMeta> = {
      v_new00000_: meta["v_new"]!,
      v_known0000_: meta["v_known"]!,
    };
    const got = mineCuratedChannels(curated, registry, (id) => byId[id]);
    expect(got.map((c) => c.channelId)).toEqual(["UCnewChannelIddddddddddd"]);
    expect(got[0]!.evidence[0]).toContain("Cool explainer");
  });

  it("respects minTasteScore", () => {
    const curated = [videoItem("1", "https://www.youtube.com/watch?v=v_new00000_", "low", 0.1)];
    const byId: Record<string, YouTubeChannelMeta> = { v_new00000_: meta["v_new"]! };
    expect(mineCuratedChannels(curated, registry, (id) => byId[id], { minTasteScore: 0.5 })).toHaveLength(0);
  });
});

describe("parseYtSearchResults — ndjson + playlist forms", () => {
  const ndjson = [
    JSON.stringify({ channel_id: "UCaaaaaaaaaaaaaaaaaaaaaa", channel: "Alpha", title: "A vid", channel_follower_count: 900_000, view_count: 400_000, like_count: 20_000, upload_date: "20260501" }),
    JSON.stringify({ channel_id: "UCYO_jab_esuFRV4b17AJtAw", channel: "3Blue1Brown", title: "known" }), // registry → drop
    "not json",
  ].join("\n");

  it("parses ndjson, drops registry channels + junk lines", () => {
    const got = parseYtSearchResults(ndjson, registry);
    expect(got.map((c) => c.channelId)).toEqual(["UCaaaaaaaaaaaaaaaaaaaaaa"]);
    expect(got[0]!.signals.subscriberCount).toBe(900_000);
  });

  it("parses a single playlist object with entries[]", () => {
    const playlist = JSON.stringify({
      entries: [
        { channel_id: "UCbbbbbbbbbbbbbbbbbbbbbb", channel: "Beta", title: "B", view_count: 100 },
      ],
    });
    const got = parseYtSearchResults(playlist, registry);
    expect(got.map((c) => c.channelId)).toEqual(["UCbbbbbbbbbbbbbbbbbbbbbb"]);
  });
});

describe("rankChannels — credibility ordering + threshold", () => {
  const high: DiscoveredChannel = {
    channelId: "UChigh0000000000000000_",
    channel: "High",
    signals: { subscriberCount: 5_000_000, viewCount: 2_000_000, likeCount: 120_000, durationSec: 900, uploadDate: "20260601" },
    evidence: ["e"],
    seenCount: 3,
  };
  const low: DiscoveredChannel = {
    channelId: "UClow00000000000000000_",
    channel: "Low",
    signals: { subscriberCount: 80, viewCount: 40, likeCount: 0, durationSec: 30, uploadDate: "20200101" },
    evidence: ["e"],
    seenCount: 1,
  };

  it("ranks high credibility first and filters sub-threshold", () => {
    const got = rankChannels([low, high], { nowMs: NOW, minScore: 0.35 });
    expect(got).toHaveLength(1);
    expect(got[0]!.feedUrl).toContain("UChigh0000000000000000_");
    expect(got[0]!.discoveredVia).toBe("youtube-channel");
    expect(got[0]!.evidence[0]).toMatch(/credibility 0\.\d\d/);
  });

  it("emits CandidateSource with a channel feed URL + evidence", () => {
    const got = rankChannels([high], { nowMs: NOW });
    expect(got[0]!.url).toContain("/channel/UChigh");
    expect(got[0]!.feedUrl).toContain("videos.xml?channel_id=UChigh");
    expect(got[0]!.seenCount).toBe(3);
  });
});

describe("buildYtSearchArgs / queries", () => {
  test("buildYtSearchArgs makes one ytsearchN term per topic", () => {
    const args = buildYtSearchArgs(["quantum computing", "geopolitics"], { perQuery: 5 });
    expect(args).toContain("ytsearch5:quantum computing");
    expect(args).toContain("ytsearch5:geopolitics");
    expect(args[0]).toBe("-J");
  });

  test("buildYtSearchQueries turns channel slugs into search phrases", () => {
    expect(buildYtSearchQueries(["data-science"])).toEqual(["data science explained"]);
  });
});

describe("applyYouTubeTrust — registry trust wiring", () => {
  it("recomputes trustScore for matched youtube sources, honoring seed floor", () => {
    const signals: ChannelSignalMap = new Map([
      // 3B1B's channel id (in registry, seed trust 0.9) with strong signals.
      [
        "UCYO_jab_esuFRV4b17AJtAw",
        { subscriberCount: 8_450_000, viewCount: 23_563_119, likeCount: 550_687, durationSec: 1120, uploadDate: "20260601" },
      ],
    ]);
    const { registry: out } = applyYouTubeTrust(registry, signals, { nowMs: NOW });
    const yt = out.sources.find((s) => s.id === "youtube-3blue1brown")!;
    expect(yt.trustScore).toBeGreaterThanOrEqual(0.9); // seed floor honored
    expect(yt.trustScore).toBeLessThanOrEqual(1);
    // Non-youtube source untouched.
    expect(out.sources.find((s) => s.id === "some-blog")!.trustScore).toBe(0.6);
  });

  it("leaves entries without fresh signals untouched", () => {
    const { registry: out, changed } = applyYouTubeTrust(registry, new Map(), { nowMs: NOW });
    expect(changed).toHaveLength(0);
    expect(out.sources).toEqual(registry.sources);
  });
});

describe("discoverYouTubeChannels — merge both lanes", () => {
  it("merges curated + search by channel id and ranks", () => {
    const searchStdout = JSON.stringify({
      channel_id: "UCsearch00000000000000_",
      channel: "Searchy",
      title: "hit",
      channel_follower_count: 1_200_000,
      view_count: 600_000,
      like_count: 30_000,
      upload_date: "20260601",
    });
    const curated = [videoItem("1", "https://www.youtube.com/watch?v=vvvvvvvvvvv", "curated hit")];
    const metaLookup = (_id: string): YouTubeChannelMeta => ({
      channelId: "UCcurated0000000000000_",
      channel: "Curated",
      subscriberCount: 2_000_000,
      viewCount: 800_000,
      likeCount: 40_000,
      durationSec: 900,
      uploadDate: "20260601",
    });
    const got = discoverYouTubeChannels(
      { registry, curated, metaLookup, searchStdout },
      { nowMs: NOW },
    );
    const ids = got.map((c) => c.feedUrl);
    expect(ids.some((u) => u?.includes("UCsearch"))).toBe(true);
    expect(ids.some((u) => u?.includes("UCcurated"))).toBe(true);
  });
});
