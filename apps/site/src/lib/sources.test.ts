import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { SourceEntry } from "@khazana/core";
import { loadRegistry, loadPending, groupByChannel } from "./sources.js";

let dir: string;

const entry = (over: Partial<SourceEntry> & { id: string }): Record<string, unknown> => ({
  type: "rss",
  url: "https://example.com/feed",
  channels: ["tech"],
  enabled: true,
  trustScore: 0.5,
  addedBy: "seed",
  failureCount: 0,
  ...over,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-sources-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("loadRegistry prefers sources.json over the seed", () => {
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify({ version: 1, sources: [entry({ id: "seed" })] }));
  writeFileSync(join(dir, "sources.json"), JSON.stringify({ version: 1, sources: [entry({ id: "live" })] }));
  expect(loadRegistry(dir).sources.map((s) => s.id)).toEqual(["live"]);
});

test("loadRegistry falls back to the seed when sources.json is absent", () => {
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify({ version: 1, sources: [entry({ id: "seed" })] }));
  expect(loadRegistry(dir).sources.map((s) => s.id)).toEqual(["seed"]);
});

test("loadRegistry returns an empty registry when nothing is present", () => {
  expect(loadRegistry(dir)).toEqual({ version: 1, sources: [] });
});

test("loadPending returns [] when the queue is absent", () => {
  expect(loadPending(dir)).toEqual([]);
});

test("loadPending reads a bare array of candidates", () => {
  writeFileSync(join(dir, "sources.pending.json"), JSON.stringify([entry({ id: "cand", addedBy: "scout" })]));
  expect(loadPending(dir).map((s) => s.id)).toEqual(["cand"]);
});

test("loadPending reads a registry-shaped queue", () => {
  writeFileSync(
    join(dir, "sources.pending.json"),
    JSON.stringify({ version: 1, sources: [entry({ id: "cand", addedBy: "scout" })] }),
  );
  expect(loadPending(dir).map((s) => s.id)).toEqual(["cand"]);
});

test("groupByChannel fans a multi-channel source into each channel, ordered by channelOrder", () => {
  writeFileSync(
    join(dir, "sources.json"),
    JSON.stringify({
      version: 1,
      sources: [entry({ id: "a", channels: ["tech", "finance"] }), entry({ id: "b", channels: ["finance"] })],
    }),
  );
  const groups = groupByChannel(loadRegistry(dir).sources, ["finance", "tech"]);
  expect(groups.map((g) => g.channel)).toEqual(["finance", "tech"]);
  expect(groups[0]!.sources.map((s) => s.id)).toEqual(["a", "b"]); // finance: trust tie → id order
  expect(groups[1]!.sources.map((s) => s.id)).toEqual(["a"]); // tech
});

test("groupByChannel sorts within a channel by trustScore desc then id", () => {
  writeFileSync(
    join(dir, "sources.json"),
    JSON.stringify({
      version: 1,
      sources: [
        entry({ id: "low", trustScore: 0.4 }),
        entry({ id: "high", trustScore: 0.9 }),
      ],
    }),
  );
  const groups = groupByChannel(loadRegistry(dir).sources);
  expect(groups[0]!.sources.map((s) => s.id)).toEqual(["high", "low"]);
});

test("groupByChannel buckets channel-less sources under 'unsorted'", () => {
  writeFileSync(join(dir, "sources.json"), JSON.stringify({ version: 1, sources: [entry({ id: "x", channels: [] })] }));
  const groups = groupByChannel(loadRegistry(dir).sources);
  expect(groups.map((g) => g.channel)).toEqual(["unsorted"]);
});
