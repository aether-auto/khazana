import { describe, expect, test } from "vitest";
import {
  scoreContributions,
  RANK_WEIGHTS,
  GAUSSIAN_DEFAULTS,
  DEFAULT_HALF_LIFE_DAYS,
  type FeedItem,
  type RankProfile,
} from "@khazana/core";
import { affinityDelta, forYouScore, forYouOrder, type ForYouItem } from "./for-you.js";

const NOW = "2026-06-30T00:00:00.000Z";

// A ready profile that favours `ai`/`quantum` topics and one entity.
const READY: RankProfile = {
  ready: true,
  topics: { ai: 0.9, quantum: 0.5, history: 0.1 },
  entities: { openai: 0.8, cern: 0.3 },
};
const NOT_READY: RankProfile = { ready: false, topics: {}, entities: {} };

// A body long enough to clear the full-text credit (> 800 plain-text chars) so
// baseScore reflects a realistic full-text read.
const LONG_BODY = "word ".repeat(400);

function makeItem(over: Partial<FeedItem>): FeedItem {
  return {
    id: "x",
    title: "t",
    url: "https://example.com/x",
    source: "src",
    sourceType: "rss",
    kind: "link",
    publishedAt: "2026-06-28T00:00:00.000Z",
    topics: [],
    entities: [],
    trustScore: 0.6,
    metrics: { score: 10, comments: 4 },
    body: LONG_BODY,
    ...over,
  } as FeedItem;
}

/** baseScore = core total with a NOT-ready profile (affinity term = 0). */
function baseScore(item: FeedItem, clusterSize: number): number {
  return scoreContributions(item, {
    weights: RANK_WEIGHTS,
    gaussian: GAUSSIAN_DEFAULTS,
    clusterSize,
    now: NOW,
    profile: { ready: false, topics: {}, entities: {} },
    halfLifeDays: DEFAULT_HALF_LIFE_DAYS,
  }).total;
}

/** coreTotal = core total with the given (ready) profile. */
function coreTotal(item: FeedItem, clusterSize: number, profile: RankProfile): number {
  return scoreContributions(item, {
    weights: RANK_WEIGHTS,
    gaussian: GAUSSIAN_DEFAULTS,
    clusterSize,
    now: NOW,
    profile,
    halfLifeDays: DEFAULT_HALF_LIFE_DAYS,
  }).total;
}

function toForYou(item: FeedItem, clusterSize: number): ForYouItem {
  return { id: item.id, base: baseScore(item, clusterSize), topics: item.topics, entities: item.entities };
}

describe("affinityDelta", () => {
  test("returns 0 for a not-ready profile", () => {
    const it: ForYouItem = { id: "a", base: 3, topics: ["ai"], entities: ["openai"] };
    expect(affinityDelta(it, NOT_READY)).toBe(0);
  });

  test("mean of empty topics AND entities is 0 (no affinity)", () => {
    const it: ForYouItem = { id: "a", base: 3, topics: [], entities: [] };
    expect(affinityDelta(it, READY)).toBe(0);
  });

  test("uses RANK_WEIGHTS.affinity with the exact mean formula", () => {
    const it: ForYouItem = { id: "a", base: 0, topics: ["ai", "history"], entities: ["openai"] };
    // topicMean = (0.9 + 0.1)/2 = 0.5 ; entityMean = 0.8/1 = 0.8
    const expected = RANK_WEIGHTS.affinity * (0.5 + 0.8);
    expect(affinityDelta(it, READY)).toBeCloseTo(expected, 12);
  });

  test("unknown topics/entities contribute 0 to their mean", () => {
    const it: ForYouItem = { id: "a", base: 0, topics: ["ai", "unknown"], entities: [] };
    // topicMean = (0.9 + 0)/2 = 0.45 ; entityMean (empty) = 0
    expect(affinityDelta(it, READY)).toBeCloseTo(RANK_WEIGHTS.affinity * 0.45, 12);
  });
});

describe("parity with @khazana/core (base + affinityDelta === coreTotal)", () => {
  const EPS = 1e-9;
  const cases: Array<{ name: string; item: FeedItem; clusterSize: number }> = [
    { name: "ai+entity match", item: makeItem({ id: "p1", topics: ["ai", "quantum"], entities: ["openai"] }), clusterSize: 1 },
    { name: "partial topic match", item: makeItem({ id: "p2", topics: ["ai", "history"], entities: [] }), clusterSize: 3 },
    { name: "no matches at all", item: makeItem({ id: "p3", topics: ["diy"], entities: ["nobody"] }), clusterSize: 1 },
    { name: "empty topics/entities", item: makeItem({ id: "p4", topics: [], entities: [] }), clusterSize: 5 },
    { name: "link-only (no body)", item: makeItem({ id: "p5", topics: ["ai"], entities: ["cern"], body: undefined }), clusterSize: 2 },
  ];

  for (const { name, item, clusterSize } of cases) {
    test(`${name}`, () => {
      const fy = toForYou(item, clusterSize);
      const lhs = fy.base + affinityDelta(fy, READY);
      const rhs = coreTotal(item, clusterSize, READY);
      expect(Math.abs(lhs - rhs)).toBeLessThan(EPS);
      // forYouScore is exactly base + affinityDelta.
      expect(forYouScore(fy, READY)).toBeCloseTo(lhs, 12);
    });
  }

  test("not-ready parity: forYouScore === base === coreTotal(not-ready)", () => {
    const item = makeItem({ id: "n1", topics: ["ai"], entities: ["openai"] });
    const fy = toForYou(item, 1);
    expect(forYouScore(fy, NOT_READY)).toBeCloseTo(fy.base, 12);
    expect(fy.base).toBeCloseTo(coreTotal(item, 1, NOT_READY), 12);
  });
});

describe("forYouOrder", () => {
  test("orders by forYouScore desc when ready (affinity reorders vs base)", () => {
    // Two items with the SAME base; A matches the profile strongly, B not at all.
    // Ready ordering must put A first even though base is tied.
    const a: ForYouItem = { id: "a", base: 5, topics: ["ai"], entities: ["openai"] };
    const b: ForYouItem = { id: "b", base: 5, topics: ["diy"], entities: [] };
    expect(forYouOrder([b, a], READY)).toEqual(["a", "b"]);
  });

  test("differs from base order: a lower-base item can climb on affinity", () => {
    const strong: ForYouItem = { id: "strong", base: 1, topics: ["ai"], entities: ["openai"] };
    const weak: ForYouItem = { id: "weak", base: 4, topics: ["diy"], entities: [] };
    // base order = [weak, strong]; ready order should flip because affinity
    // (6 * (0.9 + 0.8) ≈ 10.2) dominates the base gap of 3.
    expect(forYouOrder([weak, strong], READY)).toEqual(["strong", "weak"]);
  });

  test("id.localeCompare tiebreak is deterministic", () => {
    const x: ForYouItem = { id: "zed", base: 2, topics: [], entities: [] };
    const y: ForYouItem = { id: "abe", base: 2, topics: [], entities: [] };
    // equal scores → id asc
    expect(forYouOrder([x, y], READY)).toEqual(["abe", "zed"]);
    expect(forYouOrder([y, x], READY)).toEqual(["abe", "zed"]);
  });

  test("not-ready order is a stable base-desc order (affinity is inert)", () => {
    const items: ForYouItem[] = [
      { id: "a", base: 1, topics: ["ai"], entities: ["openai"] },
      { id: "b", base: 3, topics: [], entities: [] },
      { id: "c", base: 2, topics: ["ai"], entities: [] },
    ];
    // With affinity=0 for all, order is pure base desc: b(3), c(2), a(1).
    expect(forYouOrder(items, NOT_READY)).toEqual(["b", "c", "a"]);
  });

  test("empty input → empty output", () => {
    expect(forYouOrder([], READY)).toEqual([]);
  });
});
