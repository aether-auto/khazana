import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { loadCurated, filterByChannel, selectIdeas, tickerTitles } from "./feed.js";

let dir: string;

const item = (over: Record<string, unknown>) => ({
  id: "id1",
  source: "s",
  sourceType: "rss",
  url: "https://e.com/a",
  title: "A",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  topics: ["tech"],
  entities: [],
  summary: "",
  media: [],
  kind: "link",
  ...over,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-site-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("loadCurated falls back to the sample when curated.json is absent", () => {
  writeFileSync(join(dir, "curated.sample.json"), JSON.stringify([item({ id: "sample" })]));
  const items = loadCurated(dir);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("sample");
});

test("loadCurated prefers curated.json when present and preserves order", () => {
  writeFileSync(join(dir, "curated.sample.json"), JSON.stringify([item({ id: "sample" })]));
  writeFileSync(
    join(dir, "curated.json"),
    JSON.stringify([item({ id: "first" }), item({ id: "second" })]),
  );
  const items = loadCurated(dir);
  expect(items.map((i) => i.id)).toEqual(["first", "second"]);
});

test("loadCurated drops items that fail FeedItemSchema validation", () => {
  writeFileSync(
    join(dir, "curated.sample.json"),
    JSON.stringify([item({ id: "ok" }), { id: "broken", title: "no required fields" }]),
  );
  const items = loadCurated(dir);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("ok");
});

test("filterByChannel matches the channel in topics; null returns all", () => {
  const items = [item({ id: "a", topics: ["tech"] }), item({ id: "b", topics: ["finance"] })];
  expect(filterByChannel(items, "finance").map((i) => i.id)).toEqual(["b"]);
  expect(filterByChannel(items, null)).toHaveLength(2);
  expect(filterByChannel(items, "")).toHaveLength(2);
});

test("selectIdeas picks kind=idea or any workshop channel", () => {
  const items = [
    item({ id: "idea-kind", kind: "idea", topics: ["tech"] }),
    item({ id: "workshop-topic", kind: "link", topics: ["3d-printing"] }),
    item({ id: "plain", kind: "link", topics: ["finance"] }),
  ];
  expect(selectIdeas(items).map((i) => i.id)).toEqual(["idea-kind", "workshop-topic"]);
});

test("tickerTitles returns the first n titles", () => {
  const items = [item({ id: "1", title: "One" }), item({ id: "2", title: "Two" }), item({ id: "3", title: "Three" })];
  expect(tickerTitles(items, 2)).toEqual(["One", "Two"]);
});
