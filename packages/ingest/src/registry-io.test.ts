import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { loadRegistry, saveRegistry, writeFeed } from "./registry-io.js";

let dir: string;
const seed = {
  version: 1,
  sources: [{ id: "hn", type: "hn", url: "https://hnrss.org/frontpage", channels: ["tech"] }],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-"));
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify(seed));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("loadRegistry falls back to seed and applies defaults", () => {
  const reg = loadRegistry(dir);
  expect(reg.sources[0]!.id).toBe("hn");
  expect(reg.sources[0]!.enabled).toBe(true);
});

test("saveRegistry then loadRegistry prefers sources.json", () => {
  const reg = loadRegistry(dir);
  reg.sources[0]!.failureCount = 3;
  saveRegistry(dir, reg);
  expect(loadRegistry(dir).sources[0]!.failureCount).toBe(3);
});

test("writeFeed writes the items array and returns the path", () => {
  const item = {
    id: "1", source: "hn", sourceType: "hn", url: "https://e.com/a", title: "A",
    publishedAt: "2026-06-20T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: [], entities: [], summary: "", media: [], kind: "link",
  } as const;
  const path = writeFeed(dir, [item as never]);
  expect(path).toContain(join("feed", "raw.json"));
  expect(JSON.parse(readFileSync(path, "utf8"))).toHaveLength(1);
});
