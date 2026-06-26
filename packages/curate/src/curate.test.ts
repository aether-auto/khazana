import { expect, test } from "vitest";
import { runCurate } from "./curate.js";
import { MIN_READ_MINUTES } from "./rank.js";
import type { LlmClient } from "./enrich.js";
import type { EngagementEvent } from "./io.js";
import type { FeedItem } from "@khazana/core";

/** Build a body string that produces ~N minutes of read time at 225 wpm. */
function makeBodyForCurate(minutes: number): string {
  const words = Math.round(minutes * 225);
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

// Default body gives ~10 minutes of read time so items survive the MIN_READ_MINUTES filter.
const DEFAULT_BODY = makeBodyForCurate(10);

function makeItem(id: string, title: string, topics: string[]): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${id}`,
    title,
    publishedAt: "2026-06-22T00:00:00.000Z",
    fetchedAt: "2026-06-23T00:00:00.000Z",
    topics,
    entities: [],
    summary: "",
    body: DEFAULT_BODY,
    media: [],
    kind: "link",
  };
}

const NOW = "2026-06-23T00:00:00.000Z";

test("runCurate with client=null clusters, ranks, and reports counts ($0 path)", async () => {
  const items = [
    makeItem("a", "OpenAI releases GPT-5 with agentic tool use", ["ai"]),
    makeItem("b", "OpenAI releases GPT-5 featuring agentic tool use", ["ai"]),
    makeItem("c", "Spring gardening tips for beginners", ["diy"]),
  ];
  const result = await runCurate(items, [], null, { now: NOW });
  expect(result.items).toHaveLength(3);
  expect(result.items.every((it) => typeof it.clusterId === "string")).toBe(true);
  expect(result.items.every((it) => typeof it.tasteScore === "number")).toBe(true);
  // a and b are the same story → one shared cluster among the three items
  expect(result.clusterCount).toBe(2);
  expect(result.profileReady).toBe(false);
});

test("runCurate uses the injected LlmClient to fill summaries", async () => {
  const client: LlmClient = {
    complete: async () =>
      JSON.stringify({ topics: ["ai"], entities: ["OpenAI"], summary: "GPT-5 ships." }),
  };
  const items = [makeItem("a", "GPT-5 is here", ["tech"])];
  const result = await runCurate(items, [], client, { now: NOW });
  expect(result.items[0]!.summary).toBe("GPT-5 ships.");
  expect(result.items[0]!.entities).toEqual(["OpenAI"]);
});

test("runCurate marks the profile ready and personalizes when events suffice", async () => {
  const items = [
    makeItem("ai", "Frontier model breakthrough", ["ai"]),
    makeItem("fin", "Quarterly earnings recap", ["finance"]),
  ];
  const events: EngagementEvent[] = [];
  for (let d = 0; d < 6; d += 1) {
    const at = `2026-06-${String(10 + d).padStart(2, "0")}T00:00:00.000Z`;
    events.push({ itemId: "ai", type: "read", at });
    events.push({ itemId: "ai", type: "read", at });
    events.push({ itemId: "ai", type: "open", at });
    events.push({ itemId: "fin", type: "open", at });
  }
  const result = await runCurate(items, events, null, { now: NOW });
  expect(result.profileReady).toBe(true);
  expect(result.items[0]!.id).toBe("ai"); // affinity dominates
});

// ── MIN_READ_MINUTES reject filter tests (Task B) ─────────────────────────────

/** Build a body string that produces ~N minutes of read time at 225 wpm. */
function makeBody(minutes: number): string {
  const words = Math.round(minutes * 225);
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

test("MIN_READ_MINUTES is exported from rank.ts and equals 5", () => {
  expect(MIN_READ_MINUTES).toBe(5);
});

test("runCurate drops items with no body (0-min read) from output", async () => {
  const items = [
    // Explicitly remove the default body so this item has no body.
    { ...makeItem("no-body", "A bare link item", []), body: undefined },
    { ...makeItem("long-read", "A substantial article", ["tech"]), body: makeBody(10) },
  ];
  const result = await runCurate(items, [], null, { now: NOW });
  const ids = result.items.map((it) => it.id);
  expect(ids).not.toContain("no-body");
  expect(ids).toContain("long-read");
});

test("runCurate drops items with body shorter than MIN_READ_MINUTES", async () => {
  // 2-minute body: 2 * 225 = 450 words — below the 5-min threshold.
  const items = [
    { ...makeItem("short-body", "A very short article", []), body: makeBody(2) },
    { ...makeItem("long-read", "A substantial article", ["tech"]), body: makeBody(12) },
  ];
  const result = await runCurate(items, [], null, { now: NOW });
  const ids = result.items.map((it) => it.id);
  expect(ids).not.toContain("short-body");
  expect(ids).toContain("long-read");
});

test("runCurate keeps items that meet the MIN_READ_MINUTES threshold exactly", async () => {
  // A body at exactly 5 minutes (5 * 225 = 1125 words) must survive.
  const items = [
    { ...makeItem("exactly-five", "Exactly five minutes", []), body: makeBody(MIN_READ_MINUTES) },
  ];
  const result = await runCurate(items, [], null, { now: NOW });
  const ids = result.items.map((it) => it.id);
  expect(ids).toContain("exactly-five");
});

test("runCurate emits no sub-5-min items in the output (curated.json guarantee)", async () => {
  // Mix of short, boundary, and long items.
  const items = [
    // bare-link: no body at all (explicit undefined so it is not overridden by makeItem's default body)
    { ...makeItem("bare-link", "No body at all", []), body: undefined },
    { ...makeItem("two-min", "Two minute read", []), body: makeBody(2) },
    { ...makeItem("four-min", "Four minute read", []), body: makeBody(4) },
    { ...makeItem("five-min", "Five minute read", []), body: makeBody(5) },
    { ...makeItem("fifteen-min", "Fifteen minute read", []), body: makeBody(15) },
  ];
  const result = await runCurate(items, [], null, { now: NOW });
  // Only the ≥5-min items should survive.
  const ids = result.items.map((it) => it.id);
  expect(ids).not.toContain("bare-link");
  expect(ids).not.toContain("two-min");
  expect(ids).not.toContain("four-min");
  expect(ids).toContain("five-min");
  expect(ids).toContain("fifteen-min");
});
