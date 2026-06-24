import { expect, test } from "vitest";
import {
  buildEnrichPrompt,
  enrichItems,
  parseEnrichResponse,
  type LlmClient,
} from "./enrich.js";
import type { FeedItem } from "@khazana/core";

function makeItem(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: over.id ?? "1",
    source: "hn",
    sourceType: "hn",
    url: over.url ?? "https://e.com/a",
    title: over.title ?? "GPT-5 ships with agentic tool use",
    publishedAt: "2026-06-20T00:00:00.000Z",
    fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: over.topics ?? ["tech"],
    entities: over.entities ?? [],
    summary: over.summary ?? "",
    media: [],
    kind: "link",
    ...over,
  };
}

test("buildEnrichPrompt lists the allowed channels and the item title", () => {
  const prompt = buildEnrichPrompt(makeItem({ title: "Quantum error correction milestone" }));
  expect(prompt).toContain("Quantum error correction milestone");
  expect(prompt).toContain("quantum");
  expect(prompt).toContain("topics");
  expect(prompt).toContain("summary");
});

test("parseEnrichResponse strips fences, validates, and filters topics to CHANNELS", () => {
  const text = "```json\n" +
    JSON.stringify({ topics: ["ai", "not-a-channel"], entities: ["OpenAI"], summary: "It ships." }) +
    "\n```";
  const parsed = parseEnrichResponse(text);
  expect(parsed).not.toBeNull();
  expect(parsed!.topics).toEqual(["ai"]);
  expect(parsed!.entities).toEqual(["OpenAI"]);
  expect(parsed!.summary).toBe("It ships.");
});

test("parseEnrichResponse returns null on invalid JSON", () => {
  expect(parseEnrichResponse("not json at all")).toBeNull();
  expect(parseEnrichResponse('{"topics": "wrong-shape"}')).toBeNull();
});

test("enrichItems with client=null leaves items untouched ($0 path)", async () => {
  const items = [makeItem({ topics: ["tech"], summary: "" })];
  const out = await enrichItems(items, null);
  expect(out).toHaveLength(1);
  expect(out[0]!.topics).toEqual(["tech"]);
  expect(out[0]!.summary).toBe("");
  expect(out).not.toBe(items); // new array
});

test("enrichItems merges LLM topics with seeded topics and sets summary/entities", async () => {
  const client: LlmClient = {
    complete: async () =>
      JSON.stringify({ topics: ["ai"], entities: ["OpenAI"], summary: "GPT-5 adds tool use." }),
  };
  const out = await enrichItems([makeItem({ topics: ["tech"] })], client);
  expect(out[0]!.topics.sort()).toEqual(["ai", "tech"]);
  expect(out[0]!.entities).toEqual(["OpenAI"]);
  expect(out[0]!.summary).toBe("GPT-5 adds tool use.");
});

test("enrichItems retries once then keeps seeded topics on persistent failure", async () => {
  let calls = 0;
  const client: LlmClient = {
    complete: async () => {
      calls += 1;
      throw new Error("boom");
    },
  };
  const out = await enrichItems([makeItem({ topics: ["tech"] })], client);
  expect(calls).toBe(2); // one retry
  expect(out[0]!.topics).toEqual(["tech"]);
  expect(out[0]!.summary).toBe("");
  expect(out[0]!.entities).toEqual([]);
});

test("enrichItems keeps seeded topics when the model returns garbage", async () => {
  const client: LlmClient = { complete: async () => "I cannot help with that." };
  const out = await enrichItems([makeItem({ topics: ["tech"] })], client);
  expect(out[0]!.topics).toEqual(["tech"]);
  expect(out[0]!.summary).toBe("");
});
