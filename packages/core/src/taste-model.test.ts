import { expect, test } from "vitest";
import {
  EVENT_WEIGHTS,
  DWELL_MS_PER_POINT,
  DWELL_CAP,
  DEFAULT_TASTE_OPTS,
  eventWeight,
  aggregateProfile,
  aggregateFormatAffinity,
  gateState,
} from "./taste-model.js";
import type { FeedItem } from "./feed-item.js";
import type { EngagementEvent } from "./events.js";

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

// ── Constants ────────────────────────────────────────────────────────────────

test("constants match the pre-refactor values", () => {
  expect(EVENT_WEIGHTS).toEqual({ open: 1, read: 3 });
  expect(DWELL_MS_PER_POINT).toBe(30000);
  expect(DWELL_CAP).toBe(5);
  expect(DEFAULT_TASTE_OPTS).toEqual({ minEvents: 20, minDays: 5, halfLifeDays: 7 });
});

test("eventWeight: open=1, read=3, dwell scaled by ms and capped", () => {
  expect(eventWeight({ itemId: "a", type: "open", at: NOW })).toBe(1);
  expect(eventWeight({ itemId: "a", type: "read", at: NOW })).toBe(3);
  expect(eventWeight({ itemId: "a", type: "dwell", at: NOW, dwellMs: 60000 })).toBe(2);
  expect(eventWeight({ itemId: "a", type: "dwell", at: NOW, dwellMs: 10_000_000 })).toBe(DWELL_CAP);
  expect(eventWeight({ itemId: "a", type: "dwell", at: NOW })).toBe(0);
});

// ── aggregateProfile (mirrors computeTasteProfile) ────────────────────────────

test("aggregateProfile returns not-ready with too few events", () => {
  const itemsById = new Map([["a", makeItem("a", ["ai"])]]);
  const events: EngagementEvent[] = [{ itemId: "a", type: "read", at: "2026-06-22T00:00:00.000Z" }];
  const profile = aggregateProfile(events, itemsById, { now: NOW });
  expect(profile.ready).toBe(false);
  expect(profile.topics).toEqual({});
  expect(profile.entities).toEqual({});
});

test("aggregateProfile returns not-ready when span is too short", () => {
  const itemsById = new Map([["a", makeItem("a", ["ai"])]]);
  const events: EngagementEvent[] = Array.from({ length: 25 }, () => ({
    itemId: "a" as const,
    type: "read" as const,
    at: "2026-06-22T12:00:00.000Z",
  }));
  expect(aggregateProfile(events, itemsById, { now: NOW }).ready).toBe(false);
});

test("aggregateProfile builds normalized [0,1] affinities, recency-decayed", () => {
  const itemsById = new Map([
    ["ai", makeItem("ai", ["ai"], ["OpenAI"])],
    ["fin", makeItem("fin", ["finance"], ["Fed"])],
  ]);
  const events: EngagementEvent[] = [];
  for (let d = 0; d < 6; d += 1) {
    const at = `2026-06-${String(10 + d).padStart(2, "0")}T00:00:00.000Z`;
    events.push({ itemId: "ai", type: "read", at });
    events.push({ itemId: "ai", type: "open", at });
    events.push({ itemId: "ai", type: "read", at });
    events.push({ itemId: "fin", type: "open", at });
  }
  const profile = aggregateProfile(events, itemsById, { now: NOW });
  expect(profile.ready).toBe(true);
  expect(profile.topics.ai).toBe(1);
  expect(profile.topics.finance).toBeGreaterThan(0);
  expect(profile.topics.finance).toBeLessThan(1);
  expect(profile.topics.ai).toBeGreaterThan(profile.topics.finance!);
  expect(profile.entities.OpenAI).toBe(1);
});

// ── aggregateFormatAffinity (mirrors computeFormatAffinity) ───────────────────

test("aggregateFormatAffinity returns {} when not ready", () => {
  const itemsById = new Map([["a", makeItem("a", ["history"])]]);
  const events: EngagementEvent[] = [{ itemId: "a", type: "read", at: NOW }];
  expect(aggregateFormatAffinity(events, itemsById, { now: NOW, ready: false })).toEqual({});
});

test("aggregateFormatAffinity biases toward matching formats (dwell flat weight 2)", () => {
  const itemsById = new Map<string, FeedItem>([
    ["h", makeItem("h", ["history"])],
    ["d", makeItem("d", ["3d-printing"])],
  ]);
  const events: EngagementEvent[] = [
    { itemId: "h", type: "read", at: NOW },
    { itemId: "h", type: "read", at: NOW },
    { itemId: "d", type: "open", at: NOW },
  ];
  const aff = aggregateFormatAffinity(events, itemsById, { now: NOW, ready: true });
  expect(aff.chronicle).toBeGreaterThan(aff["build-log"]!);
  expect(Math.max(...Object.values(aff))).toBeCloseTo(1, 5);
});

// ── gateState (new helper) ────────────────────────────────────────────────────

test("gateState reports distance to ready", () => {
  const g = gateState(5, 2);
  expect(g.ready).toBe(false);
  expect(g.minEvents).toBe(20);
  expect(g.minDays).toBe(5);
  expect(g.eventsNeeded).toBe(15);
  expect(g.daysNeeded).toBe(3);
});

test("gateState is ready when both thresholds met and clamps needs at 0", () => {
  const g = gateState(40, 10);
  expect(g.ready).toBe(true);
  expect(g.eventsNeeded).toBe(0);
  expect(g.daysNeeded).toBe(0);
});

test("gateState honors custom thresholds", () => {
  const g = gateState(3, 1, { minEvents: 10, minDays: 3 });
  expect(g.ready).toBe(false);
  expect(g.minEvents).toBe(10);
  expect(g.minDays).toBe(3);
  expect(g.eventsNeeded).toBe(7);
  expect(g.daysNeeded).toBe(2);
});
