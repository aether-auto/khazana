import { describe, expect, test } from "vitest";
import type { EngagementEvent, FeedItem, RankProfile } from "@khazana/core";
import {
  decaySeries,
  channelBars,
  eventWeightLadder,
  liveProfileFromEvents,
  mergeLiveSnapshot,
  dailySparkline,
  gaugeLabel,
  gateState,
} from "./taste-derive.js";

const NOW = "2026-06-28T00:00:00.000Z";

describe("decaySeries", () => {
  test("starts at weight 1 on day 0 and halves at the half-life", () => {
    const s = decaySeries(7, 21);
    expect(s[0]).toEqual({ day: 0, weight: 1 });
    const atHalf = s.find((p) => p.day === 7)!;
    expect(atHalf.weight).toBeCloseTo(0.5, 6);
  });
  test("is monotonically decreasing and spans 0..maxDays", () => {
    const s = decaySeries(7, 14);
    expect(s[0]!.day).toBe(0);
    expect(s[s.length - 1]!.day).toBe(14);
    for (let i = 1; i < s.length; i++) expect(s[i]!.weight).toBeLessThanOrEqual(s[i - 1]!.weight);
  });
});

describe("channelBars", () => {
  test("sorts topics desc, attaches group + value", () => {
    const profile: RankProfile = { ready: true, topics: { ai: 1, finance: 0.4, tech: 0.7 }, entities: {} };
    const bars = channelBars(profile);
    expect(bars.map((b) => b.channel)).toEqual(["ai", "tech", "finance"]);
    expect(bars[0]!.group).toBe("ai");
    expect(bars.find((b) => b.channel === "finance")!.group).toBe("data");
  });
  test("empty profile → empty bars", () => {
    expect(channelBars({ ready: false, topics: {}, entities: {} })).toEqual([]);
  });
});

describe("eventWeightLadder", () => {
  test("returns open/read/dwell rungs from EVENT_WEIGHTS", () => {
    const ladder = eventWeightLadder();
    const labels = ladder.map((r) => r.label);
    expect(labels).toContain("open");
    expect(labels).toContain("read");
    const open = ladder.find((r) => r.label === "open")!;
    const read = ladder.find((r) => r.label === "read")!;
    expect(open.weight).toBe(1);
    expect(read.weight).toBe(3);
  });
});

describe("liveProfileFromEvents", () => {
  test("aggregates events into a profile + format affinity with core math", () => {
    const items = new Map<string, FeedItem>();
    const base: Omit<FeedItem, "id"> = {
      source: "s",
      sourceType: "rss",
      url: "https://example.com/x",
      title: "t",
      publishedAt: NOW,
      fetchedAt: NOW,
      topics: ["ai"],
      entities: [],
      summary: "",
      media: [],
      kind: "link",
    };
    items.set("i1", { ...base, id: "i1" });
    const events: EngagementEvent[] = [];
    // 25 events across 6 days so the gate opens (minEvents 20, minDays 5).
    for (let d = 0; d < 25; d++) {
      const day = String(16 + (d % 12)).padStart(2, "0");
      events.push({ itemId: "i1", type: "read", at: `2026-06-${day}T00:00:00.000Z` });
    }
    const { profile, formatAffinity } = liveProfileFromEvents(events, items, NOW);
    expect(profile.ready).toBe(true);
    expect(profile.topics.ai).toBeCloseTo(1, 6);
    expect(typeof formatAffinity).toBe("object");
  });
  test("too few events → not ready, empty affinity", () => {
    const items = new Map<string, FeedItem>();
    const { profile, formatAffinity } = liveProfileFromEvents([], items, NOW);
    expect(profile.ready).toBe(false);
    expect(formatAffinity).toEqual({});
  });
});

describe("mergeLiveSnapshot", () => {
  test("unions keys, fills missing with 0", () => {
    const merged = mergeLiveSnapshot({ ai: 0.74, tech: 0.3 }, { ai: 1.0, data: 0.4 });
    const byKey = new Map(merged.map((m) => [m.key, m]));
    expect(byKey.get("ai")).toEqual({ key: "ai", snapshot: 0.74, live: 1.0 });
    expect(byKey.get("tech")).toEqual({ key: "tech", snapshot: 0.3, live: 0 });
    expect(byKey.get("data")).toEqual({ key: "data", snapshot: 0, live: 0.4 });
  });
  test("sorted by max(live,snapshot) desc", () => {
    const merged = mergeLiveSnapshot({ a: 0.1 }, { b: 0.9 });
    expect(merged[0]!.key).toBe("b");
  });
});

describe("dailySparkline", () => {
  test("normalizes weights to [0,1] preserving order", () => {
    const s = dailySparkline([
      { date: "2026-06-16", weight: 1 },
      { date: "2026-06-17", weight: 4 },
      { date: "2026-06-18", weight: 2 },
    ]);
    expect(s).toEqual([0.25, 1, 0.5]);
  });
  test("empty input → empty array; all-zero → zeros", () => {
    expect(dailySparkline([])).toEqual([]);
    expect(dailySparkline([{ date: "x", weight: 0 }])).toEqual([0]);
  });
});

describe("gateState re-export + gaugeLabel", () => {
  test("gateState re-exported from core", () => {
    const g = gateState(16, 4);
    expect(g.ready).toBe(false);
    expect(g.eventsNeeded).toBe(4);
    expect(g.daysNeeded).toBe(1);
  });
  test("gaugeLabel produces the 'N more events, M more day(s)' sentence", () => {
    const label = gaugeLabel(gateState(16, 4));
    expect(label).toContain("4 more events");
    expect(label).toContain("1 more day");
  });
  test("gaugeLabel reads ready when both thresholds met", () => {
    const label = gaugeLabel(gateState(25, 6));
    expect(label.toLowerCase()).toContain("ready");
  });
});
