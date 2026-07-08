import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loadCurated } from "./ideation-eval.mts";

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
  dir = mkdtempSync(join(tmpdir(), "khz-ideation-eval-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("loadCurated falls back to the committed archive.json when curated.json is absent", () => {
  mkdirSync(join(dir, "feed"), { recursive: true });
  writeFileSync(join(dir, "feed", "archive.json"), JSON.stringify([item, { id: "bad" }]));
  const items = loadCurated(dir);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("1");
});

test("loadCurated prefers curated.json over archive.json when both are present", () => {
  mkdirSync(join(dir, "feed"), { recursive: true });
  writeFileSync(join(dir, "feed", "curated.json"), JSON.stringify([item]));
  writeFileSync(join(dir, "feed", "archive.json"), JSON.stringify([{ ...item, id: "2" }]));
  const items = loadCurated(dir);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("1");
});

test("loadCurated returns [] and emits a loud, distinct warning when neither file exists", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const items = loadCurated(dir);
  expect(items).toEqual([]);
  expect(warnSpy).toHaveBeenCalledTimes(1);
  // The warning must be distinguishable from "genuinely no data" — it should
  // name the missing-precondition explicitly, not just report a zero count.
  const message = String(warnSpy.mock.calls[0]![0]);
  expect(message).toMatch(/missing/i);
  expect(message).toMatch(/curated\.json/);
  expect(message).toMatch(/archive\.json/);
  warnSpy.mockRestore();
});
