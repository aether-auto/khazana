import { describe, expect, it, test } from "vitest";
import {
  CREDIBILITY_WEIGHTS,
  engagementScore,
  parseUploadDate,
  reachScore,
  recencyScore,
  subscriberScaleScore,
  youtubeCredibility,
  youtubeCredibilityBrief,
  youtubeTrustScore,
} from "./youtube-credibility.js";

// Reference clock: 2026-06-30, so recency is deterministic in tests.
const NOW = Date.UTC(2026, 5, 30);

// Real signals captured from `yt-dlp -J` on a 3Blue1Brown video (high-trust).
const HIGH = {
  subscriberCount: 8_450_000,
  viewCount: 23_563_119,
  likeCount: 550_687,
  durationSec: 1120,
  uploadDate: "20250105",
};

// A synthetic low-signal channel: small, low engagement, a Short, stale.
const LOW = {
  subscriberCount: 120,
  viewCount: 90,
  likeCount: 1,
  durationSec: 35,
  uploadDate: "20210101",
};

describe("sub-scores", () => {
  test("subscriberScaleScore is log-scaled and monotonic", () => {
    expect(subscriberScaleScore(undefined)).toBe(0);
    expect(subscriberScaleScore(0)).toBe(0);
    expect(subscriberScaleScore(1_000)).toBeCloseTo(0, 5); // log10(1k)=3 → floor
    expect(subscriberScaleScore(10_000_000)).toBeCloseTo(1, 5); // log10(10M)=7 → cap
    expect(subscriberScaleScore(100_000)).toBeGreaterThan(subscriberScaleScore(10_000));
    // 8.45M subs should be near the top of the curve.
    expect(subscriberScaleScore(8_450_000)).toBeGreaterThan(0.9);
  });

  test("engagementScore is like/view ratio normalized to ~8% ceiling", () => {
    expect(engagementScore(undefined, 100)).toBe(0);
    expect(engagementScore(10, 0)).toBe(0);
    expect(engagementScore(8, 100)).toBeCloseTo(1, 5); // 8% → full
    expect(engagementScore(2, 100)).toBeCloseTo(0.25, 5); // 2% → 0.25
    // 3B1B: 550687/23563119 ≈ 2.3% → mid.
    expect(engagementScore(550_687, 23_563_119)).toBeGreaterThan(0.2);
  });

  test("reachScore maps views/subs, neutral when scale unknown", () => {
    expect(reachScore(0, 100)).toBe(0);
    expect(reachScore(500, undefined)).toBe(0.5); // reach known, scale unknown
    expect(reachScore(50, 100)).toBeCloseTo(0.5, 5);
    expect(reachScore(200, 100)).toBe(1); // clamped
  });

  test("recencyScore decays over time and is neutral when unknown", () => {
    expect(recencyScore(undefined, NOW)).toBe(0.5);
    expect(recencyScore("20260630", NOW)).toBe(1); // today
    expect(recencyScore("20200101", NOW)).toBe(0); // >2y old → floor
    const mid = recencyScore("20250630", NOW); // ~1y old → ~0.5
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  test("parseUploadDate parses YYYYMMDD and rejects junk", () => {
    expect(parseUploadDate("20250105")).toBe(Date.UTC(2025, 0, 5));
    expect(parseUploadDate("2025-01-05")).toBeNull();
    expect(parseUploadDate(undefined)).toBeNull();
    expect(parseUploadDate("20259999")).toBeNull();
  });
});

describe("youtubeCredibility — worked high vs low", () => {
  it("scores a top channel high with positive named factors", () => {
    const r = youtubeCredibility(HIGH, { nowMs: NOW });
    expect(r.score).toBeGreaterThan(0.6);
    expect(r.factors.map((f) => f.key)).toEqual(
      expect.arrayContaining(["subscriber-scale", "engagement", "reach", "recency"]),
    );
    const subFactor = r.factors.find((f) => f.key === "subscriber-scale")!;
    expect(subFactor.polarity).toBe("positive");
    expect(subFactor.detail).toContain("8.4M");
    expect(r.rationale).toMatch(/high-trust|credible/);
  });

  it("scores a tiny stale Short low with cautions", () => {
    const r = youtubeCredibility(LOW, { nowMs: NOW });
    expect(r.score).toBeLessThan(0.3);
    // Short penalty factor present.
    expect(r.factors.some((f) => f.key === "short")).toBe(true);
    expect(r.rationale).toMatch(/provisional/);
  });

  it("high strictly outranks low", () => {
    const hi = youtubeCredibility(HIGH, { nowMs: NOW }).score;
    const lo = youtubeCredibility(LOW, { nowMs: NOW }).score;
    expect(hi).toBeGreaterThan(lo);
  });

  it("never throws on empty signals and stays in [0,1]", () => {
    const r = youtubeCredibility({}, { nowMs: NOW });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  test("weights are defined and positive", () => {
    for (const w of Object.values(CREDIBILITY_WEIGHTS)) expect(w).toBeGreaterThan(0);
  });
});

describe("youtubeTrustScore — registry wiring", () => {
  it("lifts trust for a strong channel, keeps seed as a floor", () => {
    const cred = youtubeCredibility(HIGH, { nowMs: NOW }).score;
    const t = youtubeTrustScore(cred, 0.9);
    expect(t).toBeGreaterThanOrEqual(0.9); // seed floor honored
    expect(t).toBeLessThanOrEqual(1);
  });

  it("uses the computed score when there is no seed", () => {
    const cred = youtubeCredibility(HIGH, { nowMs: NOW }).score;
    expect(youtubeTrustScore(cred, undefined)).toBeCloseTo(Math.round(cred * 100) / 100, 2);
  });
});

describe("youtubeCredibilityBrief — cloud seam (no LLM)", () => {
  it("packs raw signals + deterministic verdict for the appraiser", () => {
    const brief = youtubeCredibilityBrief({
      channel: "3Blue1Brown",
      channelId: "UCYO_jab_esuFRV4b17AJtAw",
      title: "But what is a neural network?",
      description: "An intro to deep learning.",
      signals: HIGH,
      nowMs: NOW,
    });
    expect(brief.channel).toBe("3Blue1Brown");
    expect(brief.title).toContain("neural network");
    expect(brief.deterministic.score).toBeGreaterThan(0.6);
    expect(brief.signals.subscriberCount).toBe(8_450_000);
  });
});
