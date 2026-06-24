import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { readRawFeed, readEvents, writeCuratedFeed } from "./io.js";

let dir: string;

const item = {
  id: "1",
  source: "hn",
  sourceType: "hn",
  url: "https://e.com/a",
  title: "A",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  topics: ["tech"],
  entities: [],
  summary: "",
  media: [],
  kind: "link",
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-curate-io-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("readRawFeed returns [] when the file is missing", () => {
  expect(readRawFeed(dir)).toEqual([]);
});

test("readRawFeed validates items and drops invalid ones", () => {
  mkdirSync(join(dir, "feed"), { recursive: true });
  writeFileSync(join(dir, "feed", "raw.json"), JSON.stringify([item, { id: "bad" }]));
  const items = readRawFeed(dir);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("1");
});

test("readEvents returns [] when absent and validates when present", () => {
  expect(readEvents(dir)).toEqual([]);
  writeFileSync(
    join(dir, "events.json"),
    JSON.stringify([
      { itemId: "1", type: "open", at: "2026-06-20T00:00:00.000Z" },
      { itemId: "1", type: "bogus", at: "2026-06-20T00:00:00.000Z" },
    ]),
  );
  const events = readEvents(dir);
  expect(events).toHaveLength(1);
  expect(events[0]!.type).toBe("open");
});

test("writeCuratedFeed writes the array and returns the path", () => {
  const path = writeCuratedFeed(dir, [item as never]);
  expect(path).toContain(join("feed", "curated.json"));
  expect(JSON.parse(readFileSync(path, "utf8"))).toHaveLength(1);
});
