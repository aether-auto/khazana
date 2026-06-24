import { expect, test } from "vitest";
import { runCurate } from "./curate.js";
import type { LlmClient } from "./enrich.js";
import type { EngagementEvent } from "./io.js";
import type { FeedItem } from "@khazana/core";

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
