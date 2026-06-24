import { expect, test } from "vitest";
import { computeTasteProfile } from "./taste.js";
import type { EngagementEvent } from "./io.js";
import type { FeedItem } from "@khazana/core";

function makeItem(id: string, topics: string[], entities: string[] = []): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${id}`,
    title: id,
    publishedAt: "2026-06-01T00:00:00.000Z",
    fetchedAt: "2026-06-01T00:00:00.000Z",
    topics,
    entities,
    summary: "",
    media: [],
    kind: "link",
  };
}

const NOW = "2026-06-23T00:00:00.000Z";

test("returns not-ready when there are too few events", () => {
  const itemsById = new Map([["a", makeItem("a", ["ai"])]]);
  const events: EngagementEvent[] = [
    { itemId: "a", type: "read", at: "2026-06-22T00:00:00.000Z" },
  ];
  const profile = computeTasteProfile(events, itemsById, { now: NOW });
  expect(profile.ready).toBe(false);
  expect(profile.topics).toEqual({});
  expect(profile.entities).toEqual({});
});

test("returns not-ready when history span is too short even with enough events", () => {
  const itemsById = new Map([["a", makeItem("a", ["ai"])]]);
  const events: EngagementEvent[] = Array.from({ length: 25 }, () => ({
    itemId: "a" as const,
    type: "read" as const,
    at: "2026-06-22T12:00:00.000Z",
  }));
  const profile = computeTasteProfile(events, itemsById, { now: NOW });
  expect(profile.ready).toBe(false);
});

test("when ready, builds normalized topic/entity affinities in [0,1]", () => {
  const itemsById = new Map([
    ["ai", makeItem("ai", ["ai"], ["OpenAI"])],
    ["fin", makeItem("fin", ["finance"], ["Fed"])],
  ]);
  // 24 events spanning > 5 days; ai engaged far more heavily than finance.
  const events: EngagementEvent[] = [];
  for (let d = 0; d < 6; d += 1) {
    const at = `2026-06-${String(10 + d).padStart(2, "0")}T00:00:00.000Z`;
    events.push({ itemId: "ai", type: "read", at });
    events.push({ itemId: "ai", type: "open", at });
    events.push({ itemId: "ai", type: "read", at });
    events.push({ itemId: "fin", type: "open", at });
  }
  const profile = computeTasteProfile(events, itemsById, { now: NOW });
  expect(profile.ready).toBe(true);
  expect(profile.topics.ai).toBe(1); // max-normalized
  expect(profile.topics.finance).toBeGreaterThan(0);
  expect(profile.topics.finance).toBeLessThan(1);
  expect(profile.topics.ai).toBeGreaterThan(profile.topics.finance!);
  expect(profile.entities.OpenAI).toBe(1);
});

test("more recent engagement outweighs older engagement (recency decay)", () => {
  const itemsById = new Map([
    ["recent", makeItem("recent", ["ai"])],
    ["old", makeItem("old", ["finance"])],
  ]);
  const events: EngagementEvent[] = [];
  // 'finance' engaged early in window, 'ai' engaged near `now`.
  for (let d = 0; d < 6; d += 1) {
    events.push({ itemId: "old", type: "read", at: `2026-06-${String(10 + d).padStart(2, "0")}T00:00:00.000Z` });
  }
  for (let i = 0; i < 18; i += 1) {
    events.push({ itemId: "recent", type: "read", at: "2026-06-22T00:00:00.000Z" });
  }
  const profile = computeTasteProfile(events, itemsById, { now: NOW });
  expect(profile.ready).toBe(true);
  expect(profile.topics.ai).toBeGreaterThan(profile.topics.finance!);
});

test("is deterministic for the same now and events", () => {
  const itemsById = new Map([["a", makeItem("a", ["ai"])]]);
  const events: EngagementEvent[] = Array.from({ length: 24 }, (_, i) => ({
    itemId: "a" as const,
    type: "read" as const,
    at: `2026-06-${String(10 + (i % 8)).padStart(2, "0")}T00:00:00.000Z`,
  }));
  const a = computeTasteProfile(events, itemsById, { now: NOW });
  const b = computeTasteProfile(events, itemsById, { now: NOW });
  expect(a).toEqual(b);
});
