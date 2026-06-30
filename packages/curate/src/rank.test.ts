import { expect, test } from "vitest";
import { hasFullText, rankItems, applyDiversityFloor, readTimeMinutes, readTimeScore, W_FULLTEXT, W_MEDIA, W_READTIME, READ_TIME_PEAK_MIN, FEATURED_SIZE, DIVERSITY_WINDOW, DIVERSITY_MIN_VIDEO, DIVERSITY_MIN_AUDIO } from "./rank.js";
import type { TasteProfile } from "./taste.js";
import type { FeedItem } from "@khazana/core";

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
const notReady: TasteProfile = { ready: false, topics: {}, entities: {} };

test("sets tasteScore on every item and returns a new sorted array", () => {
  const items = [
    makeItem({ id: "old", publishedAt: "2026-05-01T00:00:00.000Z" }),
    makeItem({ id: "fresh", publishedAt: "2026-06-22T18:00:00.000Z" }),
  ];
  const ranked = rankItems(items, notReady, { now: NOW });
  expect(ranked).not.toBe(items);
  expect(ranked.every((it) => typeof it.tasteScore === "number")).toBe(true);
  expect(ranked[0]!.id).toBe("fresh"); // recency wins with no profile
});

test("higher trust and engagement metrics raise the base score", () => {
  const items = [
    makeItem({ id: "low", trustScore: 0.2 }),
    makeItem({ id: "high", trustScore: 0.9, metrics: { score: 500, comments: 200 } }),
  ];
  const ranked = rankItems(items, notReady, { now: NOW });
  expect(ranked[0]!.id).toBe("high");
});

test("when profile is ready, affinity dominates ranking (aggressive)", () => {
  const items = [
    makeItem({ id: "fresh-offtopic", publishedAt: "2026-06-22T23:00:00.000Z", topics: ["finance"] }),
    makeItem({ id: "older-ontopic", publishedAt: "2026-06-18T00:00:00.000Z", topics: ["ai"], entities: ["OpenAI"] }),
  ];
  const ready: TasteProfile = { ready: true, topics: { ai: 1, finance: 0 }, entities: { OpenAI: 1 } };
  const ranked = rankItems(items, ready, { now: NOW });
  expect(ranked[0]!.id).toBe("older-ontopic"); // affinity beats recency
});

const FULL_BODY = `<p>${"Genuine full article text rendered in the body for the reader. ".repeat(40)}</p>`;

test("hasFullText distinguishes full-text bodies from summaries / bare links", () => {
  expect(hasFullText(makeItem({ id: "full", body: FULL_BODY }))).toBe(true);
  expect(hasFullText(makeItem({ id: "summary", body: "just a short summary" }))).toBe(false);
  expect(hasFullText(makeItem({ id: "none" }))).toBe(false);
});

test("a full-text item outranks an otherwise-equal summary-only item", () => {
  const items = [
    makeItem({ id: "summary-only", body: "short rss summary" }),
    makeItem({ id: "full-text", body: FULL_BODY }),
  ];
  const ranked = rankItems(items, notReady, { now: NOW });
  expect(ranked[0]!.id).toBe("full-text");
  const full = ranked.find((it) => it.id === "full-text")!;
  const summary = ranked.find((it) => it.id === "summary-only")!;
  expect(full.tasteScore!).toBeGreaterThan(summary.tasteScore!);
});

test("is deterministic for the same now", () => {
  const items = [makeItem({ id: "a" }), makeItem({ id: "b", trustScore: 0.9 })];
  const a = rankItems(items, notReady, { now: NOW });
  const b = rankItems(items, notReady, { now: NOW });
  expect(a.map((it) => [it.id, it.tasteScore])).toEqual(b.map((it) => [it.id, it.tasteScore]));
});

// ── MEDIA_CREDIT tests ────────────────────────────────────────────────────────

test("W_MEDIA is exported and in a reasonable range (0 < W_MEDIA < W_FULLTEXT)", () => {
  // Sanity: partial credit is strictly between 0 and the full-text bonus.
  expect(W_MEDIA).toBeGreaterThan(0);
  expect(W_MEDIA).toBeLessThan(W_FULLTEXT);
});

test("a transcript-less video item scores higher than an equivalent link-only item", () => {
  const linkItem = makeItem({ id: "link-only", kind: "link", body: undefined });
  const videoItem = makeItem({ id: "video-no-transcript", kind: "video", body: undefined, sourceType: "youtube" });
  const ranked = rankItems([linkItem, videoItem], notReady, { now: NOW });
  const linkScore = ranked.find((it) => it.id === "link-only")!.tasteScore!;
  const videoScore = ranked.find((it) => it.id === "video-no-transcript")!.tasteScore!;
  expect(videoScore).toBeGreaterThan(linkScore);
});

test("a transcript-less audio item scores higher than an equivalent link-only item", () => {
  const linkItem = makeItem({ id: "link-only", kind: "link", body: undefined });
  const audioItem = makeItem({ id: "audio-no-transcript", kind: "audio", body: undefined, sourceType: "podcast" });
  const ranked = rankItems([linkItem, audioItem], notReady, { now: NOW });
  const linkScore = ranked.find((it) => it.id === "link-only")!.tasteScore!;
  const audioScore = ranked.find((it) => it.id === "audio-no-transcript")!.tasteScore!;
  expect(audioScore).toBeGreaterThan(linkScore);
});

test("a video item WITH a transcript receives full-text credit, not media credit", () => {
  const videoWithTranscript = makeItem({ id: "video-full-text", kind: "video", body: FULL_BODY, sourceType: "youtube" });
  const videoNoTranscript = makeItem({ id: "video-no-text", kind: "video", body: undefined, sourceType: "youtube" });
  const ranked = rankItems([videoWithTranscript, videoNoTranscript], notReady, { now: NOW });
  // The transcribed video should beat the untranscribed one.
  expect(ranked[0]!.id).toBe("video-full-text");
  // The score delta must be strictly positive (full-text credit > media credit).
  // The exact delta includes both the W_FULLTEXT/W_MEDIA difference and the
  // W_READTIME contribution (transcribed body has read-time; absent body scores 0),
  // so we assert direction rather than the exact W_FULLTEXT - W_MEDIA value.
  const withScore = ranked[0]!.tasteScore!;
  const withoutScore = ranked[1]!.tasteScore!;
  expect(withScore).toBeGreaterThan(withoutScore);
  // No double-counting: the delta exceeds W_FULLTEXT - W_MEDIA (not less than it).
  expect(withScore - withoutScore).toBeGreaterThan(W_FULLTEXT - W_MEDIA);
});

test("a fresh trusted video item without a transcript ranks well above stale full-text articles", () => {
  const freshPublished = "2026-06-22T18:00:00.000Z"; // 6 h old — very fresh
  const stalePublished = "2026-06-08T00:00:00.000Z"; // 15 days old — well past half-life

  // 100 stale full-text articles (past half-life, default trust 0.5).
  const staleLinks: FeedItem[] = Array.from({ length: 100 }, (_, i) =>
    makeItem({ id: `stale-${i}`, kind: "link", publishedAt: stalePublished, body: FULL_BODY }),
  );
  // 10 fresh full-text articles with above-average trust — should beat the video.
  const freshHighTrust: FeedItem[] = Array.from({ length: 10 }, (_, i) =>
    makeItem({ id: `fresh-high-${i}`, kind: "link", publishedAt: freshPublished, body: FULL_BODY, trustScore: 0.85 }),
  );

  const freshTrustedVideo = makeItem({
    id: "youtube-fresh",
    kind: "video",
    sourceType: "youtube",
    body: undefined,
    publishedAt: freshPublished,
    trustScore: 0.9,
  });

  const all = [...staleLinks, ...freshHighTrust, freshTrustedVideo];
  const ranked = rankItems(all, notReady, { now: NOW });
  const position = ranked.findIndex((it) => it.id === "youtube-fresh");
  // The fresh video should beat all 100 stale links despite lacking a transcript.
  expect(position).toBeLessThan(15); // ahead of the stale tail
});

// ── Diversity floor tests ──────────────────────────────────────────────────────

test("FEATURED_SIZE, DIVERSITY_WINDOW, DIVERSITY_MIN_VIDEO, DIVERSITY_MIN_AUDIO are exported positive integers", () => {
  expect(FEATURED_SIZE).toBeGreaterThan(0);
  expect(DIVERSITY_WINDOW).toBeGreaterThan(0);
  expect(DIVERSITY_MIN_VIDEO).toBeGreaterThan(0);
  expect(DIVERSITY_MIN_AUDIO).toBeGreaterThan(0);
});

test("applyDiversityFloor returns the same array when diversity is already satisfied", () => {
  // 10 featured items at head, then 2 video + 2 audio in the list region — floor met.
  const items: FeedItem[] = [
    ...Array.from({ length: FEATURED_SIZE }, (_, i) => makeItem({ id: `feat-${i}`, kind: "link" })),
    makeItem({ id: "v1", kind: "video" }),
    makeItem({ id: "v2", kind: "video" }),
    makeItem({ id: "a1", kind: "audio" }),
    makeItem({ id: "a2", kind: "audio" }),
    ...Array.from({ length: 10 }, (_, i) => makeItem({ id: `link-${i}`, kind: "link" })),
  ];
  const result = applyDiversityFloor(items);
  // All original IDs present, order matches input.
  expect(result.map((it) => it.id)).toEqual(items.map((it) => it.id));
});

test("applyDiversityFloor promotes video items when none are in the list window", () => {
  // Build a feed where all videos are buried past FEATURED_SIZE + DIVERSITY_WINDOW.
  const listEnd = FEATURED_SIZE + DIVERSITY_WINDOW;
  const links: FeedItem[] = Array.from({ length: listEnd + 5 }, (_, i) =>
    makeItem({ id: `link-${i}`, kind: "link" }),
  );
  const videos: FeedItem[] = [
    makeItem({ id: "vid-hi", kind: "video", tasteScore: 5 }),
    makeItem({ id: "vid-lo", kind: "video", tasteScore: 3 }),
  ];
  const all = [...links, ...videos];
  const result = applyDiversityFloor(all);
  // Check the list region only (after featured head).
  const listIds = result.slice(FEATURED_SIZE, listEnd).map((it) => it.id);
  const videoCount = listIds.filter((id) => id.startsWith("vid-")).length;
  expect(videoCount).toBeGreaterThanOrEqual(DIVERSITY_MIN_VIDEO);
});

test("applyDiversityFloor promotes audio items when none are in the list window", () => {
  const listEnd = FEATURED_SIZE + DIVERSITY_WINDOW;
  const links: FeedItem[] = Array.from({ length: listEnd + 5 }, (_, i) =>
    makeItem({ id: `link-${i}`, kind: "link" }),
  );
  const audios: FeedItem[] = [
    makeItem({ id: "aud-hi", kind: "audio", tasteScore: 5 }),
    makeItem({ id: "aud-lo", kind: "audio", tasteScore: 3 }),
  ];
  const all = [...links, ...audios];
  const result = applyDiversityFloor(all);
  const listIds = result.slice(FEATURED_SIZE, listEnd).map((it) => it.id);
  const audioCount = listIds.filter((id) => id.startsWith("aud-")).length;
  expect(audioCount).toBeGreaterThanOrEqual(DIVERSITY_MIN_AUDIO);
});

test("applyDiversityFloor preserves all items (no items lost or duplicated)", () => {
  const links: FeedItem[] = Array.from({ length: 60 }, (_, i) => makeItem({ id: `link-${i}`, kind: "link" }));
  const videos: FeedItem[] = [makeItem({ id: "vid", kind: "video" })];
  const audios: FeedItem[] = [makeItem({ id: "aud", kind: "audio" })];
  const all = [...links, ...videos, ...audios];
  const result = applyDiversityFloor(all);
  expect(result).toHaveLength(all.length);
  const ids = result.map((it) => it.id);
  for (const item of all) {
    expect(ids.filter((id) => id === item.id)).toHaveLength(1);
  }
});

test("applyDiversityFloor never injects items into the featured (bento) region", () => {
  // All videos are buried well past the list window. Even when the list is short,
  // no promoted item should land in positions [0, FEATURED_SIZE).
  const listEnd = FEATURED_SIZE + DIVERSITY_WINDOW;
  const featuredLinks: FeedItem[] = Array.from({ length: FEATURED_SIZE }, (_, i) =>
    makeItem({ id: `feat-${i}`, kind: "link" }),
  );
  const listLinks: FeedItem[] = Array.from({ length: DIVERSITY_WINDOW }, (_, i) =>
    makeItem({ id: `list-${i}`, kind: "link" }),
  );
  const buriedVideo = makeItem({ id: "vid-buried", kind: "video", tasteScore: 999 });
  const all = [...featuredLinks, ...listLinks, buriedVideo];
  const result = applyDiversityFloor(all);

  // Featured region must remain untouched — only link items there.
  const featuredIds = result.slice(0, FEATURED_SIZE).map((it) => it.id);
  expect(featuredIds.every((id) => id.startsWith("feat-"))).toBe(true);

  // The video must now appear in the list region (it was promoted from beyond listEnd).
  const listIds = result.slice(FEATURED_SIZE, listEnd).map((it) => it.id);
  expect(listIds).toContain("vid-buried");
});

test("applyDiversityFloor promotes the highest-scoring video/audio items first", () => {
  const listEnd = FEATURED_SIZE + DIVERSITY_WINDOW;
  const links: FeedItem[] = Array.from({ length: listEnd + 5 }, (_, i) =>
    makeItem({ id: `link-${i}`, kind: "link" }),
  );
  // Two videos buried — the one with higher tasteScore should be promoted.
  const videos: FeedItem[] = [
    makeItem({ id: "vid-better", kind: "video", tasteScore: 8 }),
    makeItem({ id: "vid-worse", kind: "video", tasteScore: 2 }),
  ];
  const all = [...links, ...videos];
  const result = applyDiversityFloor(all);
  const listIds = result.slice(FEATURED_SIZE, listEnd).map((it) => it.id);
  // The higher-scoring video must appear in the list window.
  expect(listIds).toContain("vid-better");
});

// ── Read-time scoring curve tests (Task A) ────────────────────────────────────

/** Build a body string that produces ~N minutes of read time at 225 wpm. */
function makeBody(minutes: number): string {
  const words = Math.round(minutes * 225);
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

test("READ_TIME_PEAK_MIN is exported and equals 15", () => {
  expect(READ_TIME_PEAK_MIN).toBe(15);
});

test("W_READTIME is exported and is a meaningful weight (≥2)", () => {
  // Read time is a strong length signal (founder lowered it 3→2; affinity now
  // dominates, and full text is enforced as a hard gate rather than a weight).
  expect(W_READTIME).toBeGreaterThanOrEqual(2);
});

test("readTimeMinutes returns 0 for absent/falsy body", () => {
  const item = makeItem({ id: "no-body" });
  expect(readTimeMinutes(item)).toBe(0);
});

test("readTimeMinutes strips HTML and computes word-count / 225 wpm", () => {
  // 2250 words at 225 wpm = 10 minutes (rounded)
  const body = `<p>${Array.from({ length: 2250 }, (_, i) => `w${i}`).join(" ")}</p>`;
  const item = makeItem({ id: "ten-min", body });
  expect(readTimeMinutes(item)).toBeCloseTo(10, 0);
});

test("readTimeScore peaks at READ_TIME_PEAK_MIN (15) and equals 1.0 there", () => {
  expect(readTimeScore(READ_TIME_PEAK_MIN)).toBeCloseTo(1.0, 5);
});

test("readTimeScore is symmetric: same score for equidistant points below and above 15", () => {
  // 5 min is 10 below peak; 25 min is 10 above peak.
  expect(readTimeScore(5)).toBeCloseTo(readTimeScore(25), 5);
  // 10 min is 5 below; 20 min is 5 above.
  expect(readTimeScore(10)).toBeCloseTo(readTimeScore(20), 5);
});

test("readTimeScore falls off on both sides: 15-min scores higher than 6-min and 40-min", () => {
  const score15 = readTimeScore(15);
  const score6 = readTimeScore(6);
  const score40 = readTimeScore(40);
  expect(score15).toBeGreaterThan(score6);
  expect(score15).toBeGreaterThan(score40);
});

test("readTimeScore is in [0, 1] for any input", () => {
  for (const m of [0, 2, 5, 8, 15, 25, 45, 120]) {
    const s = readTimeScore(m);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  }
});

test("a 15-min full-text item outranks an equally-fresh 3-min and 45-min item", () => {
  const base = {
    publishedAt: "2026-06-22T18:00:00.000Z",
    trustScore: 0.8 as number,
    kind: "link" as const,
  };
  const items = [
    makeItem({ id: "three-min", body: makeBody(3), ...base }),
    makeItem({ id: "fifteen-min", body: makeBody(15), ...base }),
    makeItem({ id: "fortyfive-min", body: makeBody(45), ...base }),
  ];
  const ranked = rankItems(items, notReady, { now: NOW });
  expect(ranked[0]!.id).toBe("fifteen-min");
});

test("read-time score contribution is heavy: a 15-min item beats a fresh 3-min item even when the 3-min has higher trust", () => {
  // Give the 3-min item max trust (1.0) vs 0.5 baseline for 15-min.
  // The read-time weight must dominate.
  const items = [
    makeItem({ id: "short-max-trust", body: makeBody(3), trustScore: 1.0, publishedAt: "2026-06-22T18:00:00.000Z" }),
    makeItem({ id: "long-mid-trust", body: makeBody(15), trustScore: 0.5, publishedAt: "2026-06-22T18:00:00.000Z" }),
  ];
  const ranked = rankItems(items, notReady, { now: NOW });
  expect(ranked[0]!.id).toBe("long-mid-trust");
});

// ── MIN_READ_MINUTES reject filter tests (Task B) — tested via curate.ts ─────
// (See curate.test.ts for pipeline-level reject tests — these unit-test rank.ts
// exports used by the filter.)
