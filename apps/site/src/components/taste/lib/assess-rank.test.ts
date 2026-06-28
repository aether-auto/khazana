import { describe, expect, test } from "vitest";
import { RANK_WEIGHTS, GAUSSIAN_DEFAULTS, type RankProfile } from "@khazana/core";
import { assessRank, type AssessRankOpts } from "./assess-rank.js";
import type { RerankItem } from "./rerank.js";

const NOW = "2026-06-28T00:00:00.000Z";
const PEAK_BODY = ("word ".repeat(4050)).trim(); // ~18 min @ 225wpm

function item(over: Partial<RerankItem> & { id: string }): RerankItem {
  return {
    id: over.id,
    title: over.title ?? `Item ${over.id}`,
    href: over.href ?? `/item/${over.id}`,
    topics: over.topics ?? ["ai"],
    entities: over.entities ?? [],
    publishedAt: over.publishedAt ?? "2026-06-26T00:00:00.000Z",
    trustScore: over.trustScore ?? 0.86,
    metrics: over.metrics,
    clusterId: over.clusterId,
    kind: over.kind ?? "link",
    channel: over.channel ?? "ai",
    group: over.group ?? "ai",
    body: over.body ?? PEAK_BODY,
    readMin: over.readMin ?? 18,
    hasFullText: over.hasFullText ?? true,
    isMedia: over.isMedia ?? false,
  };
}

const PROFILE_READY: RankProfile = { ready: true, topics: { ai: 0.71 }, entities: {} };
const PROFILE_COLD: RankProfile = { ready: false, topics: {}, entities: {} };

function opts(over: Partial<AssessRankOpts> = {}): AssessRankOpts {
  return {
    weights: over.weights ?? RANK_WEIGHTS,
    gaussian: over.gaussian ?? GAUSSIAN_DEFAULTS,
    profile: over.profile ?? PROFILE_READY,
    now: over.now ?? NOW,
    clusterSize: over.clusterSize ?? 1,
    halfLifeDays: over.halfLifeDays,
  };
}

describe("assessRank", () => {
  test("factors sum (≈) to score", () => {
    const basis = assessRank(item({ id: "a" }), opts());
    const sum = basis.factors.reduce((s, f) => s + f.contribution, 0);
    expect(sum).toBeCloseTo(basis.score, 6);
  });

  test("factors sorted by contribution desc", () => {
    const basis = assessRank(item({ id: "a" }), opts());
    for (let i = 1; i < basis.factors.length; i++) {
      expect(basis.factors[i - 1]!.contribution).toBeGreaterThanOrEqual(basis.factors[i]!.contribution);
    }
  });

  test("shares sum (≈) to 1 for positive scores", () => {
    const basis = assessRank(item({ id: "a" }), opts());
    const shareSum = basis.factors.reduce((s, f) => s + f.share, 0);
    expect(shareSum).toBeCloseTo(1, 6);
  });

  test("rationale is a non-empty sentence ending in '.'", () => {
    const basis = assessRank(item({ id: "a" }), opts());
    expect(basis.rationale.length).toBeGreaterThan(0);
    expect(basis.rationale.endsWith(".")).toBe(true);
  });

  test("affinity factor collapses when profile not ready", () => {
    const basis = assessRank(item({ id: "a" }), opts({ profile: PROFILE_COLD }));
    const affinity = basis.factors.find((f) => f.label === "affinity")!;
    expect(affinity.contribution).toBe(0);
    expect(affinity.strength).toBe("none");
  });

  test("affinity factor collapses when weight is 0", () => {
    const basis = assessRank(item({ id: "a" }), opts({ weights: { ...RANK_WEIGHTS, affinity: 0 } }));
    const affinity = basis.factors.find((f) => f.label === "affinity")!;
    expect(affinity.contribution).toBe(0);
  });

  test("is deterministic", () => {
    const a = assessRank(item({ id: "a" }), opts());
    const b = assessRank(item({ id: "a" }), opts());
    expect(a).toEqual(b);
  });

  test("tier reflects total — a strong item is high resonance, a weak one buried", () => {
    const strong = assessRank(
      item({ id: "s", trustScore: 0.95, topics: ["ai"], metrics: { score: 500, comments: 200 } }),
      opts(),
    );
    const weak = assessRank(
      item({ id: "w", trustScore: 0.05, topics: ["nothing"], body: "short", readMin: 6, hasFullText: false }),
      opts({ profile: PROFILE_COLD }),
    );
    expect(strong.score).toBeGreaterThan(weak.score);
    const tiers = ["buried", "mid", "solid", "high resonance"];
    expect(tiers.indexOf(strong.tier)).toBeGreaterThan(tiers.indexOf(weak.tier));
  });

  test("every factor has a non-empty detail and a valid strength", () => {
    const basis = assessRank(item({ id: "a" }), opts());
    const strengths = new Set(["strong", "solid", "minor", "none"]);
    for (const f of basis.factors) {
      expect(f.detail.length).toBeGreaterThan(0);
      expect(strengths.has(f.strength)).toBe(true);
    }
  });
});
