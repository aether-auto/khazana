import { expect, test } from "vitest";
import { rankItems } from "./rank.js";
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

test("is deterministic for the same now", () => {
  const items = [makeItem({ id: "a" }), makeItem({ id: "b", trustScore: 0.9 })];
  const a = rankItems(items, notReady, { now: NOW });
  const b = rankItems(items, notReady, { now: NOW });
  expect(a.map((it) => [it.id, it.tasteScore])).toEqual(b.map((it) => [it.id, it.tasteScore]));
});
