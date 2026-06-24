import { expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import type { EngagementEvent } from "./io.js";
import type { TasteProfile } from "./taste.js";
import { buildTastePayload, computeFormatAffinity } from "./format-affinity.js";

const NOW = "2026-06-23T00:00:00.000Z";

function item(id: string, topics: string[]): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${id}`,
    title: id,
    publishedAt: "2026-06-22T00:00:00.000Z",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    topics,
    entities: [],
    summary: "",
    media: [],
    kind: "link",
  };
}

test("computeFormatAffinity returns {} when not ready", () => {
  const itemsById = new Map([["a", item("a", ["history"])]]);
  const events: EngagementEvent[] = [{ itemId: "a", type: "read", at: NOW }];
  const aff = computeFormatAffinity(events, itemsById, { now: NOW, ready: false });
  expect(aff).toEqual({});
});

test("computeFormatAffinity biases toward formats whose topics match engaged items", () => {
  // history → chronicle only (per FORMATS topic affinity). 3d-printing → build-log only.
  const itemsById = new Map<string, FeedItem>([
    ["h", item("h", ["history"])],
    ["d", item("d", ["3d-printing"])],
  ]);
  const events: EngagementEvent[] = [
    { itemId: "h", type: "read", at: NOW },
    { itemId: "h", type: "read", at: NOW },
    { itemId: "d", type: "open", at: NOW },
  ];
  const aff = computeFormatAffinity(events, itemsById, { now: NOW, ready: true });
  // chronicle saw two "read" events (weight 3 each); build-log one "open" (weight 1)
  expect(aff.chronicle).toBeGreaterThan(aff["build-log"]!);
  expect(Math.max(...Object.values(aff))).toBeCloseTo(1, 5); // normalized
});

test("buildTastePayload merges the profile with formatAffinity", () => {
  const profile: TasteProfile = { ready: true, topics: { history: 1 }, entities: {} };
  const itemsById = new Map([["h", item("h", ["history"])]]);
  const events: EngagementEvent[] = [{ itemId: "h", type: "read", at: NOW }];
  const payload = buildTastePayload(profile, events, itemsById, { now: NOW });
  expect(payload.ready).toBe(true);
  expect(payload.topics).toEqual({ history: 1 });
  expect(payload.formatAffinity.chronicle).toBeGreaterThan(0);
});
