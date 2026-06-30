import { expect, test } from "vitest";
import {
  RANK_WEIGHTS,
  GAUSSIAN_DEFAULTS,
  MIN_READ_MINUTES,
  FEATURED_SIZE,
  FEED_WPM,
  MIN_FULLTEXT_CHARS,
  readTimeMinutes,
  readTimeScore,
  hasFullText,
  isFullTextRead,
  isTranscriptlessMedia,
  scoreContributions,
  type RankProfile,
  type ScoringContext,
} from "./scoring.js";
import type { FeedItem } from "./feed-item.js";

function makeItem(over: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${over.id}`,
    title: over.id,
    publishedAt: "2026-06-22T00:00:00.000Z",
    fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: [],
    entities: [],
    summary: "",
    media: [],
    kind: "link",
    ...over,
  };
}

const NOW = "2026-06-23T00:00:00.000Z";
const FULL_BODY = `<p>${"Genuine full article text rendered in the body for the reader. ".repeat(40)}</p>`;

const notReady: RankProfile = { ready: false, topics: {}, entities: {} };

function ctx(over: Partial<ScoringContext> = {}): ScoringContext {
  return {
    weights: RANK_WEIGHTS,
    gaussian: GAUSSIAN_DEFAULTS,
    clusterSize: 1,
    now: NOW,
    profile: notReady,
    ...over,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

test("RANK_WEIGHTS has the 8 documented default weights and is frozen", () => {
  // readTime lowered 3→2 (founder directive); fullText lowered 1.5→1.25 for
  // consistency now that full text is a hard gate (content credit is inert).
  expect(RANK_WEIGHTS).toEqual({
    recency: 1,
    trust: 1,
    metrics: 1,
    cluster: 0.5,
    affinity: 6,
    fullText: 1.25,
    media: 0.9,
    readTime: 2,
  });
  expect(Object.isFrozen(RANK_WEIGHTS)).toBe(true);
});

test("readTime weight is 2 (founder directive: down from 3)", () => {
  expect(RANK_WEIGHTS.readTime).toBe(2);
});

test("GAUSSIAN_DEFAULTS reproduce the current curve (peak 15, sigma 10)", () => {
  expect(GAUSSIAN_DEFAULTS).toEqual({ peakMin: 15, sigmaMin: 10 });
});

test("scalar constants match the pre-refactor values", () => {
  expect(MIN_READ_MINUTES).toBe(5);
  expect(FEATURED_SIZE).toBe(10);
  expect(FEED_WPM).toBe(225);
  expect(MIN_FULLTEXT_CHARS).toBe(800);
});

// ── readTimeMinutes / hasFullText / isTranscriptlessMedia ─────────────────────

test("readTimeMinutes returns 0 for absent body and word-count/225 otherwise", () => {
  expect(readTimeMinutes(makeItem({ id: "none" }))).toBe(0);
  const body = `<p>${Array.from({ length: 2250 }, (_, i) => `w${i}`).join(" ")}</p>`;
  expect(readTimeMinutes(makeItem({ id: "ten", body }))).toBe(10);
});

test("hasFullText distinguishes real bodies from summaries / bare links", () => {
  expect(hasFullText(makeItem({ id: "full", body: FULL_BODY }))).toBe(true);
  expect(hasFullText(makeItem({ id: "summary", body: "short summary" }))).toBe(false);
  expect(hasFullText(makeItem({ id: "none" }))).toBe(false);
});

test("isFullTextRead is the full-text gate: real body kept, teaser/bare-link rejected", () => {
  // Genuine full-text article → kept.
  expect(isFullTextRead(makeItem({ id: "full", body: FULL_BODY }))).toBe(true);
  // Short summary / teaser → rejected.
  expect(isFullTextRead(makeItem({ id: "teaser", body: "A short teaser sentence." }))).toBe(false);
  // Bare link (no body) → rejected.
  expect(isFullTextRead(makeItem({ id: "bare" }))).toBe(false);
});

test("isFullTextRead keeps a full-content-RSS item (long body that equals its summary)", () => {
  // The key data finding: full-content RSS feeds emit body === summary. As long
  // as that body is genuinely long, it IS full text and must be kept.
  const longText = "Genuine full article text rendered in the body for the reader. ".repeat(40);
  const item = makeItem({ id: "rss-full", body: longText, summary: longText });
  expect(isFullTextRead(item)).toBe(true);
});

test("isTranscriptlessMedia is true only for text-less video/audio", () => {
  expect(isTranscriptlessMedia(makeItem({ id: "v", kind: "video" }))).toBe(true);
  expect(isTranscriptlessMedia(makeItem({ id: "a", kind: "audio" }))).toBe(true);
  expect(isTranscriptlessMedia(makeItem({ id: "vfull", kind: "video", body: FULL_BODY }))).toBe(false);
  expect(isTranscriptlessMedia(makeItem({ id: "link", kind: "link" }))).toBe(false);
});

// ── readTimeScore parameterization ────────────────────────────────────────────

test("readTimeScore with default peak=15/sigma=10 reproduces the historical curve", () => {
  // exp(-(m-15)^2 / (2*10^2)). These are the exact values the pre-refactor
  // rank.ts produced; the curve is symmetric about the 15-min peak.
  expect(readTimeScore(2)).toBeCloseTo(0.4296, 4);
  expect(readTimeScore(5)).toBeCloseTo(0.6065, 4);
  expect(readTimeScore(15)).toBeCloseTo(1.0, 5);
  expect(readTimeScore(25)).toBeCloseTo(0.6065, 4);
  // symmetry: equidistant points score equally.
  expect(readTimeScore(5)).toBeCloseTo(readTimeScore(25), 10);
});

test("readTimeScore is parameterized: a different peak shifts the maximum", () => {
  expect(readTimeScore(20, 20, 10)).toBeCloseTo(1.0, 5);
  // Symmetric around the supplied peak.
  expect(readTimeScore(10, 20, 10)).toBeCloseTo(readTimeScore(30, 20, 10), 10);
});

// ── scoreContributions ────────────────────────────────────────────────────────

test("recency contribution = W.recency * exp(-ln2*ageDays/halfLife)", () => {
  // 7 days old, default half-life 7 → recency subscore = 0.5.
  const item = makeItem({ id: "wk", publishedAt: "2026-06-16T00:00:00.000Z" });
  const { contributions } = scoreContributions(item, ctx());
  expect(contributions.recency).toBeCloseTo(RANK_WEIGHTS.recency * 0.5, 6);
});

test("trust contribution = W.trust * (trustScore ?? 0.5)", () => {
  const withTrust = scoreContributions(makeItem({ id: "t", trustScore: 0.9, publishedAt: NOW }), ctx());
  expect(withTrust.contributions.trust).toBeCloseTo(0.9, 6);
  const noTrust = scoreContributions(makeItem({ id: "d", publishedAt: NOW }), ctx());
  expect(noTrust.contributions.trust).toBeCloseTo(0.5, 6);
});

test("metrics contribution = W.metrics * log10(1+score+comments)/5", () => {
  const item = makeItem({ id: "m", metrics: { score: 500, comments: 200 }, publishedAt: NOW });
  const expected = Math.log10(1 + 700) / 5;
  expect(scoreContributions(item, ctx()).contributions.metrics).toBeCloseTo(expected, 9);
});

test("cluster contribution = W.cluster * log10(1+(clusterSize-1))", () => {
  const item = makeItem({ id: "c", clusterId: "k", publishedAt: NOW });
  const expected = RANK_WEIGHTS.cluster * Math.log10(1 + (4 - 1));
  expect(scoreContributions(item, ctx({ clusterSize: 4 })).contributions.cluster).toBeCloseTo(expected, 9);
});

test("content contribution: fullText > media > 0 and mutually exclusive", () => {
  const full = scoreContributions(makeItem({ id: "f", body: FULL_BODY, publishedAt: NOW }), ctx());
  const media = scoreContributions(makeItem({ id: "v", kind: "video", publishedAt: NOW }), ctx());
  const bare = scoreContributions(makeItem({ id: "l", publishedAt: NOW }), ctx());
  expect(full.contributions.content).toBe(RANK_WEIGHTS.fullText);
  expect(media.contributions.content).toBe(RANK_WEIGHTS.media);
  expect(bare.contributions.content).toBe(0);
});

test("readTime contribution = W.readTime * readTimeScore(minutes, peak, sigma)", () => {
  const body = `<p>${Array.from({ length: 15 * 225 }, (_, i) => `w${i}`).join(" ")}</p>`;
  const item = makeItem({ id: "rt", body, publishedAt: NOW });
  const { contributions } = scoreContributions(item, ctx());
  expect(contributions.readTime).toBeCloseTo(RANK_WEIGHTS.readTime * 1.0, 5); // 15-min peak
});

test("affinity is 0 when profile not ready, nonzero when ready and topics match", () => {
  const item = makeItem({ id: "ai", topics: ["ai"], entities: ["OpenAI"], publishedAt: NOW });
  expect(scoreContributions(item, ctx()).contributions.affinity).toBe(0);

  const ready: RankProfile = { ready: true, topics: { ai: 1 }, entities: { OpenAI: 1 } };
  const got = scoreContributions(item, ctx({ profile: ready }));
  // mean(topic)=1, mean(entity)=1 → W.affinity * (1 + 1) = 12.
  expect(got.contributions.affinity).toBeCloseTo(RANK_WEIGHTS.affinity * 2, 6);
});

test("total = exact sum of all contributions", () => {
  const item = makeItem({
    id: "all",
    body: FULL_BODY,
    trustScore: 0.7,
    metrics: { score: 30, comments: 5 },
    topics: ["ai"],
    entities: ["OpenAI"],
    clusterId: "k",
    publishedAt: "2026-06-20T00:00:00.000Z",
  });
  const ready: RankProfile = { ready: true, topics: { ai: 0.5 }, entities: { OpenAI: 0.5 } };
  const { total, contributions } = scoreContributions(item, ctx({ clusterSize: 3, profile: ready }));
  const sum =
    contributions.recency +
    contributions.trust +
    contributions.metrics +
    contributions.cluster +
    contributions.content +
    contributions.readTime +
    contributions.affinity;
  expect(total).toBeCloseTo(sum, 12);
});

test("is deterministic for the same inputs", () => {
  const item = makeItem({ id: "d", body: FULL_BODY, trustScore: 0.8 });
  const a = scoreContributions(item, ctx());
  const b = scoreContributions(item, ctx());
  expect(a).toEqual(b);
});
