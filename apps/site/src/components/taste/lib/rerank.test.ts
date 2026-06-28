import { describe, expect, test } from "vitest";
import {
  RANK_WEIGHTS,
  GAUSSIAN_DEFAULTS,
  scoreContributions,
  type RankProfile,
  type FeedItem,
} from "@khazana/core";
import {
  rerank,
  rankDeltas,
  defaultRerank,
  applyDiversityFloor,
  type RerankItem,
  type RerankOpts,
  type RankedItem,
} from "./rerank.js";

const NOW = "2026-06-28T00:00:00.000Z";

// A medium body (~18 min @ 225wpm ≈ 4050 words) near the 15-min peak.
const PEAK_BODY = ("word ".repeat(4050)).trim();
// A tiny body so the item reads ~0-1 min (under the 5-min floor) and is NOT full text.
const SHORT_BODY = "tiny";

function item(over: Partial<RerankItem> & { id: string }): RerankItem {
  const body = over.body ?? PEAK_BODY;
  return {
    id: over.id,
    title: over.title ?? `Item ${over.id}`,
    href: over.href ?? `/item/${over.id}`,
    topics: over.topics ?? ["ai"],
    entities: over.entities ?? [],
    publishedAt: over.publishedAt ?? NOW,
    trustScore: over.trustScore,
    metrics: over.metrics,
    clusterId: over.clusterId,
    kind: over.kind ?? "link",
    channel: over.channel ?? "ai",
    group: over.group ?? "ai",
    body,
    readMin: over.readMin ?? 18,
    hasFullText: over.hasFullText ?? true,
    isMedia: over.isMedia ?? false,
  };
}

const PROFILE_READY: RankProfile = { ready: true, topics: { ai: 1, data: 0.5 }, entities: {} };
const PROFILE_COLD: RankProfile = { ready: false, topics: {}, entities: {} };

function opts(over: Partial<RerankOpts> = {}): RerankOpts {
  return {
    weights: over.weights ?? RANK_WEIGHTS,
    gaussian: over.gaussian ?? GAUSSIAN_DEFAULTS,
    gates: over.gates ?? { minReadMinutes: 5, featuredOn: false, diversityOn: false },
    filters: over.filters ?? { channels: [], format: "all" },
    profile: over.profile ?? PROFILE_READY,
    now: over.now ?? NOW,
    halfLifeDays: over.halfLifeDays,
  };
}

describe("rerank — scoring goes through core", () => {
  test("tasteScore equals core scoreContributions().total for a known item", () => {
    const it = item({ id: "a", topics: ["ai"], trustScore: 0.86 });
    const ranked = rerank([it], opts());
    expect(ranked).toHaveLength(1);
    const expected = scoreContributions(it as unknown as FeedItem, {
      weights: RANK_WEIGHTS,
      gaussian: GAUSSIAN_DEFAULTS,
      clusterSize: 1,
      now: NOW,
      profile: PROFILE_READY,
    });
    expect(ranked[0]!.tasteScore).toBeCloseTo(expected.total, 10);
    expect(ranked[0]!.contributions.affinity).toBeCloseTo(expected.contributions.affinity, 10);
  });
});

describe("rerank — filtering", () => {
  test("drops items under the read-time floor", () => {
    const keep = item({ id: "keep", readMin: 18 });
    const drop = item({ id: "drop", body: SHORT_BODY, readMin: 0, hasFullText: false });
    const ranked = rerank([keep, drop], opts({ gates: { minReadMinutes: 5, featuredOn: false, diversityOn: false } }));
    expect(ranked.map((r) => r.id)).toEqual(["keep"]);
  });

  test("filters by channel when channels are selected", () => {
    const ai = item({ id: "ai", channel: "ai" });
    const data = item({ id: "data", channel: "finance", topics: ["finance"] });
    const ranked = rerank([ai, data], opts({ filters: { channels: ["ai"], format: "all" } }));
    expect(ranked.map((r) => r.id)).toEqual(["ai"]);
  });

  test("empty channel filter keeps all channels", () => {
    const ai = item({ id: "ai", channel: "ai" });
    const data = item({ id: "data", channel: "finance", topics: ["finance"] });
    const ranked = rerank([ai, data], opts({ filters: { channels: [], format: "all" } }));
    expect(ranked.map((r) => r.id).sort()).toEqual(["ai", "data"]);
  });
});

describe("rerank — scoring behaviour", () => {
  test("clusterSize is computed over the FILTERED set and affects score", () => {
    const a = item({ id: "a", clusterId: "c1" });
    const b = item({ id: "b", clusterId: "c1" });
    const solo = item({ id: "solo", clusterId: "c2" });
    const ranked = rerank([a, b, solo], opts());
    const clustered = ranked.find((r) => r.id === "a")!;
    const lonely = ranked.find((r) => r.id === "solo")!;
    // cluster of 2 gives a positive cluster contribution; cluster of 1 gives 0.
    expect(clustered.contributions.cluster).toBeGreaterThan(0);
    expect(lonely.contributions.cluster).toBe(0);
  });

  test("setting affinity weight to 0 collapses the affinity contribution", () => {
    const it = item({ id: "a", topics: ["ai"] });
    const zeroAffinity = { ...RANK_WEIGHTS, affinity: 0 };
    const ranked = rerank([it], opts({ weights: zeroAffinity }));
    expect(ranked[0]!.contributions.affinity).toBe(0);
  });

  test("cold profile yields zero affinity", () => {
    const it = item({ id: "a", topics: ["ai"] });
    const ranked = rerank([it], opts({ profile: PROFILE_COLD }));
    expect(ranked[0]!.contributions.affinity).toBe(0);
  });

  test("sorts descending by total score and assigns rankIndex", () => {
    const high = item({ id: "high", trustScore: 0.95, topics: ["ai"] });
    const low = item({ id: "low", trustScore: 0.1, topics: ["data"] });
    const ranked = rerank([low, high], opts());
    expect(ranked[0]!.id).toBe("high");
    expect(ranked[1]!.id).toBe("low");
    expect(ranked[0]!.rankIndex).toBe(0);
    expect(ranked[1]!.rankIndex).toBe(1);
  });

  test("is deterministic", () => {
    const items = [item({ id: "a" }), item({ id: "b", trustScore: 0.7 }), item({ id: "c", trustScore: 0.3 })];
    const a = rerank(items, opts()).map((r) => `${r.id}:${r.tasteScore}`);
    const b = rerank(items, opts()).map((r) => `${r.id}:${r.tasteScore}`);
    expect(a).toEqual(b);
  });
});

describe("rankDeltas", () => {
  test("computes id → (baselineIndex - currentIndex) movement", () => {
    const a = item({ id: "a" });
    const b = item({ id: "b", trustScore: 0.9 });
    const baseline = [
      { ...a, tasteScore: 1, contributions: {} as never, rankIndex: 0 },
      { ...b, tasteScore: 0.5, contributions: {} as never, rankIndex: 1 },
    ];
    const current = [
      { ...b, tasteScore: 2, contributions: {} as never, rankIndex: 0 },
      { ...a, tasteScore: 1, contributions: {} as never, rankIndex: 1 },
    ];
    const deltas = rankDeltas(current, baseline);
    // b moved from baseline index 1 to current 0 → +1 (up)
    expect(deltas.get("b")).toBe(1);
    // a moved from 0 to 1 → -1 (down)
    expect(deltas.get("a")).toBe(-1);
  });
});

describe("defaultRerank baseline", () => {
  test("uses RANK_WEIGHTS / GAUSSIAN_DEFAULTS and default gates", () => {
    const it = item({ id: "a", topics: ["ai"] });
    const base = defaultRerank([it], PROFILE_READY, NOW);
    const expected = scoreContributions(it as unknown as FeedItem, {
      weights: RANK_WEIGHTS,
      gaussian: GAUSSIAN_DEFAULTS,
      clusterSize: 1,
      now: NOW,
      profile: PROFILE_READY,
    });
    expect(base[0]!.tasteScore).toBeCloseTo(expected.total, 10);
  });
});

describe("applyDiversityFloor (ported from curate)", () => {
  test("promotes a buried video into the list window", () => {
    // 10 featured + 50 window + buried video at the very end.
    const ranked: RankedItem[] = [];
    for (let i = 0; i < 62; i++) {
      ranked.push({
        ...item({ id: `t${i}`, kind: "link" }),
        tasteScore: 100 - i,
        contributions: {} as never,
        rankIndex: i,
      });
    }
    // Make the very last item a video so it is buried beyond the window (index 61).
    ranked[61] = { ...ranked[61]!, kind: "video", id: "buried-video" };
    const floored = applyDiversityFloor(ranked);
    const listWindow = floored.slice(10, 60);
    expect(listWindow.some((r) => r.kind === "video")).toBe(true);
  });

  test("diversityOn in rerank promotes buried media", () => {
    const items: RerankItem[] = [];
    for (let i = 0; i < 62; i++) {
      items.push(item({ id: `t${i}`, trustScore: (100 - i) / 100, kind: "link" }));
    }
    // a video that scores low so it lands buried
    items.push(item({ id: "vid", trustScore: 0.001, kind: "video" }));
    const withFloor = rerank(items, opts({ gates: { minReadMinutes: 5, featuredOn: false, diversityOn: true } }));
    const window = withFloor.slice(10, 60);
    expect(window.some((r) => r.id === "vid")).toBe(true);
  });
});
