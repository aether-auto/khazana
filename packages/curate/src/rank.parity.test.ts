import { expect, test } from "vitest";
import { rankItems } from "./rank.js";
import type { TasteProfile } from "./taste.js";
import type { FeedItem } from "@khazana/core";

/**
 * Parity guard for the scoring extraction. This recomputes the per-item
 * tasteScore using the ORIGINAL inline formula (copied verbatim from the
 * pre-refactor rank.ts) and asserts that delegating to @khazana/core's
 * `scoreContributions` produces byte-identical scores AND ordering for a mixed
 * fixture corpus with the default weights/gaussian. If the shared core math
 * ever drifts from the historical build math, this test fails.
 */

const NOW = "2026-06-23T00:00:00.000Z";
const MS_PER_DAY = 86_400_000;
const HALF_LIFE = 7;

// Reference constants — intentionally hard-coded here, not imported, so the
// independent reimplementation actually guards the shared core math. These must
// track RANK_WEIGHTS in @khazana/core (readTime 3→2, fullText 1.5→1.25 after the
// full-text-gate change).
const O_W_RECENCY = 1;
const O_W_TRUST = 1;
const O_W_METRICS = 1;
const O_W_CLUSTER = 0.5;
const O_W_AFFINITY = 6;
const O_W_FULLTEXT = 1.25;
const O_W_MEDIA = 0.9;
const O_W_READTIME = 2;
const O_PEAK = 15;
const O_SIGMA = 10;
const O_WPM = 225;
const O_FULLTEXT_CHARS = 800;

function bodyLen(body: string | undefined): number {
  if (!body) return 0;
  return body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;
}
function rtMinutes(item: FeedItem): number {
  if (!item.body) return 0;
  const text = item.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") return 0;
  return Math.round(text.split(/\s+/).length / O_WPM);
}
function rtScore(m: number): number {
  const d = m - O_PEAK;
  return Math.exp(-(d * d) / (2 * O_SIGMA * O_SIGMA));
}
function hasFull(item: FeedItem): boolean {
  return bodyLen(item.body) > O_FULLTEXT_CHARS;
}
function isMedia(item: FeedItem): boolean {
  if (hasFull(item)) return false;
  return item.kind === "video" || item.kind === "audio";
}
function mean(vs: number[]): number {
  if (vs.length === 0) return 0;
  return vs.reduce((a, b) => a + b, 0) / vs.length;
}

function originalScore(it: FeedItem, clusterSize: number, profile: TasteProfile): number {
  const nowMs = Date.parse(NOW);
  const ageDays = (nowMs - Date.parse(it.publishedAt)) / MS_PER_DAY;
  const recency = Math.exp((-Math.LN2 * Math.max(ageDays, 0)) / HALF_LIFE);
  const trust = it.trustScore ?? 0.5;
  const rawMetric = (it.metrics?.score ?? 0) + (it.metrics?.comments ?? 0);
  const metrics = Math.log10(1 + Math.max(rawMetric, 0)) / 5;
  const clusterBoost = Math.log10(1 + (clusterSize - 1));
  const contentCredit = hasFull(it) ? O_W_FULLTEXT : isMedia(it) ? O_W_MEDIA : 0;
  const rt = rtScore(rtMinutes(it));
  let score =
    O_W_RECENCY * recency +
    O_W_TRUST * trust +
    O_W_METRICS * metrics +
    O_W_CLUSTER * clusterBoost +
    contentCredit +
    O_W_READTIME * rt;
  if (profile.ready) {
    const t = mean(it.topics.map((x) => profile.topics[x] ?? 0));
    const e = mean(it.entities.map((x) => profile.entities[x] ?? 0));
    score += O_W_AFFINITY * (t + e);
  }
  return score;
}

const FULL_BODY = `<p>${"Genuine full article text rendered in the body for the reader. ".repeat(40)}</p>`;
function makeBody(minutes: number): string {
  const words = Math.round(minutes * 225);
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}
function makeItem(over: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${over.id}`,
    title: over.id,
    publishedAt: "2026-06-20T00:00:00.000Z",
    fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: [],
    entities: [],
    summary: "",
    media: [],
    kind: "link",
    ...over,
  };
}

const corpus: FeedItem[] = [
  makeItem({ id: "fresh-full", publishedAt: "2026-06-22T18:00:00.000Z", body: FULL_BODY, trustScore: 0.85 }),
  makeItem({ id: "stale-link", publishedAt: "2026-06-08T00:00:00.000Z" }),
  makeItem({ id: "video", kind: "video", sourceType: "youtube", publishedAt: "2026-06-22T00:00:00.000Z", trustScore: 0.9 }),
  makeItem({ id: "audio", kind: "audio", sourceType: "podcast", publishedAt: "2026-06-21T00:00:00.000Z" }),
  makeItem({ id: "15min-ai", body: makeBody(15), topics: ["ai"], entities: ["OpenAI"], trustScore: 0.7 }),
  makeItem({ id: "hot", metrics: { score: 900, comments: 300 }, publishedAt: "2026-06-22T00:00:00.000Z" }),
  makeItem({ id: "clustered-a", clusterId: "k1", publishedAt: "2026-06-22T00:00:00.000Z" }),
  makeItem({ id: "clustered-b", clusterId: "k1", publishedAt: "2026-06-22T00:00:00.000Z" }),
  makeItem({ id: "clustered-c", clusterId: "k1", publishedAt: "2026-06-22T00:00:00.000Z" }),
];

function clusterSizeOf(it: FeedItem): number {
  if (!it.clusterId) return 1;
  return corpus.filter((x) => x.clusterId === it.clusterId).length;
}

test("rankItems matches the original inline formula exactly (not-ready profile)", () => {
  const profile: TasteProfile = { ready: false, topics: {}, entities: {} };
  const ranked = rankItems(corpus, profile, { now: NOW });

  // Every tasteScore is byte-identical to the original formula.
  for (const it of ranked) {
    const expected = originalScore(it, clusterSizeOf(it), profile);
    expect(it.tasteScore).toBe(expected);
  }
  // Ordering matches a stable re-sort by the original score.
  const expectedOrder = [...corpus]
    .map((it) => ({ id: it.id, s: originalScore(it, clusterSizeOf(it), profile) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
  expect(ranked.map((it) => it.id)).toEqual(expectedOrder);
});

test("rankItems matches the original inline formula exactly (ready profile)", () => {
  const profile: TasteProfile = { ready: true, topics: { ai: 1 }, entities: { OpenAI: 1 } };
  const ranked = rankItems(corpus, profile, { now: NOW });
  for (const it of ranked) {
    const expected = originalScore(it, clusterSizeOf(it), profile);
    expect(it.tasteScore).toBe(expected);
  }
  // With affinity ready, the ai/OpenAI item must surface at the top.
  expect(ranked[0]!.id).toBe("15min-ai");
});
