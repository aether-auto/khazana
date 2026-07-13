import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { containsUnsafeMarkup } from "@khazana/core";
import { loadRegistry, loadSourceHealth, saveRegistry, saveSourceHealth, writeFeed } from "./registry-io.js";

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

// ── data/source-health.json: committed cross-clone health persistence ────────

test("loadSourceHealth returns an empty file when data/source-health.json is absent", () => {
  const health = loadSourceHealth(dir);
  expect(health.sources).toEqual([]);
});

test("saveSourceHealth then loadSourceHealth round-trips", () => {
  saveSourceHealth(dir, { version: 1, sources: [{ id: "gone", status: "disabled", enabled: false, consecutiveFailures: 3 }] });
  const health = loadSourceHealth(dir);
  expect(health.sources).toEqual([{ id: "gone", status: "disabled", enabled: false, consecutiveFailures: 3 }]);
});

test("loadRegistry falls back to the seed when sources.json is absent, with no health file: unchanged (backward-compatible)", () => {
  const reg = loadRegistry(dir);
  expect(reg.sources[0]!.id).toBe("hn");
  expect(reg.sources[0]!.status).toBeUndefined();
});

test("loadRegistry layers committed source-health.json onto the seed when sources.json is absent (the fresh-clone / CI path)", () => {
  saveSourceHealth(dir, {
    version: 1,
    sources: [{ id: "hn", status: "disabled", enabled: false, consecutiveFailures: 3, disabledAt: "2026-06-01T00:00:00.000Z" }],
  });
  const reg = loadRegistry(dir);
  expect(reg.sources[0]!.enabled).toBe(false);
  expect(reg.sources[0]!.status).toBe("disabled");
  expect(reg.sources[0]!.consecutiveFailures).toBe(3);
});

test("loadRegistry does NOT layer source-health.json when a local sources.json already exists (that full snapshot is already self-consistent and should win)", () => {
  // Local sources.json says the source is healthy (loadRegistry fully defaults
  // it from the seed first, matching the "saveRegistry then loadRegistry" test above).
  saveRegistry(dir, loadRegistry(dir));
  // ...even though a (stale) committed health file says it was disabled.
  saveSourceHealth(dir, { version: 1, sources: [{ id: "hn", status: "disabled", enabled: false }] });
  const reg = loadRegistry(dir);
  expect(reg.sources[0]!.enabled).toBe(true);
  expect(reg.sources[0]!.status).toBeUndefined();
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

test("writeFeed sanitizes summary to plain text and body to allowlisted HTML before persisting", () => {
  const item = {
    id: "1", source: "julia-evans-blog", sourceType: "rss", url: "https://e.com/a", title: "A",
    publishedAt: "2026-06-20T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: [], entities: [],
    summary: '<figure class="zine horizontal"><img src="whatever.jpg"></figure>Excerpt text',
    body: '<p>Real prose long enough to survive the boilerplate stripping pass and be kept as body.</p><script>alert(1)</script>',
    media: [], kind: "link",
  } as const;
  const path = writeFeed(dir, [item as never]);
  const written = JSON.parse(readFileSync(path, "utf8"));
  expect(written).toHaveLength(1);
  expect(written[0].summary).toBe("Excerpt text");
  expect(written[0].body).not.toMatch(/<script/i);
  expect(written[0].body).toMatch(/Real prose/);
});

test("writeFeed guarantees every persisted item is free of unsafe markup, even from nasty raw input", () => {
  const nasty = [
    {
      id: "1", source: "a", sourceType: "rss", url: "https://e.com/1", title: "A",
      publishedAt: "2026-06-20T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
      topics: [], entities: [], summary: '<img src=x onerror="steal()">hi',
      body: '<iframe src="evil"></iframe><p>prose long enough to survive the boilerplate strip and stay.</p>',
      media: [], kind: "link",
    },
    {
      id: "2", source: "b", sourceType: "reddit", url: "https://e.com/2", title: "B",
      publishedAt: "2026-06-20T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
      topics: [], entities: [], summary: "clean",
      body: '<a href="javascript:alert(1)">bad</a> raw selftext',
      media: [], kind: "discussion",
    },
  ] as const;
  const path = writeFeed(dir, nasty as never);
  const written = JSON.parse(readFileSync(path, "utf8")) as { summary: string; body?: string }[];
  for (const it of written) {
    expect(containsUnsafeMarkup(it.summary)).toBe(false);
    expect(containsUnsafeMarkup(it.body ?? "")).toBe(false);
  }
});
