import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTaste, topN, formatBars, type TastePayload } from "./taste.js";

const sample: TastePayload = {
  ready: true,
  topics: { ai: 1, tech: 0.8, finance: 0.2 },
  entities: { OpenAI: 1, ECB: 0.3 },
  formatAffinity: { dispatch: 1, teardown: 0.5 },
};

test("topN returns the n highest, sorted desc, as label/value bars", () => {
  const bars = topN(sample.topics, 2);
  expect(bars).toEqual([
    { label: "ai", value: 1 },
    { label: "tech", value: 0.8 },
  ]);
});

test("topN is deterministic and stable on equal values (label asc tiebreak)", () => {
  const bars = topN({ b: 0.5, a: 0.5, c: 0.9 }, 3);
  expect(bars.map((x) => x.label)).toEqual(["c", "a", "b"]);
});

test("topN on an empty map returns []", () => {
  expect(topN({}, 5)).toEqual([]);
});

test("formatBars preserves FORMAT_NAMES order, drops absent formats", () => {
  const bars = formatBars(sample.formatAffinity);
  // dispatch & teardown present; order follows FORMAT_NAMES (chronicle..build-log)
  expect(bars.map((b) => b.label)).toEqual(["dispatch", "teardown"]);
  expect(bars[0].value).toBe(1);
});

test("loadTaste prefers taste.json over taste.sample.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "taste-"));
  writeFileSync(join(dir, "taste.sample.json"), JSON.stringify({ ...sample, ready: false }));
  writeFileSync(join(dir, "taste.json"), JSON.stringify(sample));
  expect(loadTaste(dir).ready).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("loadTaste falls back to the sample when taste.json is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "taste-"));
  writeFileSync(join(dir, "taste.sample.json"), JSON.stringify(sample));
  expect(loadTaste(dir).ready).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("loadTaste returns a safe not-ready payload when nothing exists or json is malformed", () => {
  const dir = mkdtempSync(join(tmpdir(), "taste-"));
  expect(loadTaste(dir)).toEqual({ ready: false, topics: {}, entities: {}, formatAffinity: {} });
  writeFileSync(join(dir, "taste.json"), "{ not json");
  expect(loadTaste(dir).ready).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});
