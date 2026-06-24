import { expect, test } from "vitest";
import { clusterItems, titleTokens } from "./cluster.js";
import type { FeedItem } from "@khazana/core";

function makeItem(id: string, title: string, entities: string[] = []): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${id}`,
    title,
    publishedAt: "2026-06-20T00:00:00.000Z",
    fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: ["tech"],
    entities,
    summary: "",
    media: [],
    kind: "link",
  };
}

test("titleTokens lowercases, strips punctuation, and removes stopwords", () => {
  const tokens = titleTokens("The Rise of GPT-5: A New Era!");
  expect(tokens.has("the")).toBe(false);
  expect(tokens.has("rise")).toBe(true);
  expect(tokens.has("gpt")).toBe(true);
  expect(tokens.has("5")).toBe(true);
});

test("near-duplicate titles cluster together; unrelated stay separate", () => {
  const items = [
    makeItem("a", "OpenAI releases GPT-5 with agentic tool use"),
    makeItem("b", "OpenAI releases GPT-5 featuring agentic tool use"),
    makeItem("c", "Local bakery wins national sourdough award"),
  ];
  const clustered = clusterItems(items);
  const byId = new Map(clustered.map((it) => [it.id, it.clusterId]));
  expect(byId.get("a")).toBe(byId.get("b"));
  expect(byId.get("a")).not.toBe(byId.get("c"));
});

test("items sharing >= 2 entities cluster even with different titles", () => {
  const items = [
    makeItem("a", "Markets dip on rate fears", ["Federal Reserve", "Jerome Powell"]),
    makeItem("b", "Investors weigh policy signals", ["Federal Reserve", "Jerome Powell"]),
  ];
  const clustered = clusterItems(items);
  expect(clustered[0]!.clusterId).toBe(clustered[1]!.clusterId);
});

test("clusterId is deterministic and order-independent", () => {
  const a = makeItem("a", "OpenAI releases GPT-5 with agentic tool use");
  const b = makeItem("b", "OpenAI releases GPT-5 featuring agentic tool use");
  const fwd = clusterItems([a, b]).find((it) => it.id === "a")!.clusterId;
  const rev = clusterItems([b, a]).find((it) => it.id === "a")!.clusterId;
  expect(fwd).toBe(rev);
  expect(fwd).toMatch(/^[0-9a-f]{12}$/);
});

test("singletons each get their own clusterId", () => {
  const clustered = clusterItems([
    makeItem("a", "Quantum computing milestone reached"),
    makeItem("b", "Gardening tips for spring planting"),
  ]);
  expect(clustered[0]!.clusterId).not.toBe(clustered[1]!.clusterId);
  expect(clustered[0]!.clusterId).toMatch(/^[0-9a-f]{12}$/);
});
