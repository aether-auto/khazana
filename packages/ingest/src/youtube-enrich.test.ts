import { describe, expect, it } from "vitest";
import { enrichYouTubeItem, type YouTubeEnrichable } from "./youtube-enrich.js";
import type { YouTubeVideoMeta } from "./youtube-meta.js";

const NOW = Date.UTC(2026, 5, 30);

const HIGH_META: YouTubeVideoMeta = {
  videoId: "aircAruvnKk",
  title: "But what is a neural network?",
  description: "",
  channel: "3Blue1Brown",
  channelId: "UCYO_jab_esuFRV4b17AJtAw",
  subscriberCount: 8_450_000,
  viewCount: 23_563_119,
  likeCount: 550_687,
  durationSec: 1120,
  uploadDate: "20250105",
  hasCaptions: true,
  hasManualCaptions: true,
};

describe("enrichYouTubeItem", () => {
  it("stamps view_count into metrics.score and a credibility trustScore", () => {
    const item: YouTubeEnrichable = {};
    enrichYouTubeItem(item, HIGH_META, { nowMs: NOW });
    expect(item.metrics?.score).toBe(23_563_119);
    expect(item.trustScore).toBeGreaterThan(0.6);
    expect(item.trustScore).toBeLessThanOrEqual(1);
  });

  it("fills author from the channel when missing, leaves an existing author", () => {
    const a: YouTubeEnrichable = {};
    enrichYouTubeItem(a, HIGH_META, { nowMs: NOW });
    expect(a.author).toBe("3Blue1Brown");

    const b: YouTubeEnrichable = { author: "Custom" };
    enrichYouTubeItem(b, HIGH_META, { nowMs: NOW });
    expect(b.author).toBe("Custom");
  });

  it("honors seedTrust as a floor for the item trustScore", () => {
    const low: YouTubeVideoMeta = { ...HIGH_META, subscriberCount: 100, viewCount: 50, likeCount: 0 };
    const item: YouTubeEnrichable = {};
    enrichYouTubeItem(item, low, { nowMs: NOW, seedTrust: 0.9 });
    expect(item.trustScore).toBeGreaterThanOrEqual(0.9);
  });

  it("never throws on sparse metadata", () => {
    const sparse: YouTubeVideoMeta = {
      videoId: "x",
      title: "t",
      description: "",
      channel: "c",
      channelId: "UC1",
      hasCaptions: false,
      hasManualCaptions: false,
    };
    const item: YouTubeEnrichable = {};
    expect(() => enrichYouTubeItem(item, sparse, { nowMs: NOW })).not.toThrow();
    expect(item.trustScore).toBeGreaterThanOrEqual(0);
  });
});
