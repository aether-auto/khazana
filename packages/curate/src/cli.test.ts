import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { main } from "./cli.js";
import type { LlmClient } from "./enrich.js";

let dir: string;

function rawItem(id: string, title: string, topics: string[]): unknown {
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-curate-cli-"));
  mkdirSync(join(dir, "feed"), { recursive: true });
  writeFileSync(
    join(dir, "feed", "raw.json"),
    JSON.stringify([
      rawItem("a", "OpenAI releases GPT-5 with agentic tool use", ["ai"]),
      rawItem("b", "OpenAI releases GPT-5 featuring agentic tool use", ["ai"]),
      rawItem("c", "Spring gardening tips for beginners", ["diy"]),
    ]),
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("main writes curated.json with clusterIds and ranking ordering", async () => {
  const client: LlmClient = {
    complete: async () =>
      JSON.stringify({ topics: ["ai"], entities: ["OpenAI"], summary: "It ships." }),
  };
  await main(dir, "2026-06-23T00:00:00.000Z", { client });

  const curated = JSON.parse(readFileSync(join(dir, "feed", "curated.json"), "utf8"));
  expect(curated).toHaveLength(3);
  expect(curated.every((it: { clusterId?: string }) => typeof it.clusterId === "string")).toBe(true);
  expect(curated.every((it: { tasteScore?: number }) => typeof it.tasteScore === "number")).toBe(true);
  // sorted descending by tasteScore
  const scores = curated.map((it: { tasteScore: number }) => it.tasteScore);
  expect(scores).toEqual([...scores].sort((x: number, y: number) => y - x));
  // a and b share a cluster
  const byId = new Map(curated.map((it: { id: string; clusterId: string }) => [it.id, it.clusterId]));
  expect(byId.get("a")).toBe(byId.get("b"));
  expect(byId.get("a")).not.toBe(byId.get("c"));
});

test("main runs at $0 with client=null and no events file", async () => {
  await main(dir, "2026-06-23T00:00:00.000Z", { client: null });
  const curated = JSON.parse(readFileSync(join(dir, "feed", "curated.json"), "utf8"));
  expect(curated).toHaveLength(3);
  // null client leaves seeded topics and empty summaries
  expect(curated.every((it: { summary: string }) => it.summary === "")).toBe(true);
});
