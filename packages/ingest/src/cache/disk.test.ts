import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { DiskCache, CacheStats } from "./disk.js";

const Shape = z.object({ url: z.string(), body: z.string() });

describe("DiskCache", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "khazana-cache-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined + counts a miss on a cold cache", () => {
    const stats = new CacheStats();
    const cache = new DiskCache(join(dir, "transcripts"), Shape, stats);
    expect(cache.get("abc")).toBeUndefined();
    expect(stats.snapshot()).toEqual({ hits: 0, misses: 1 });
  });

  it("round-trips a value and counts a hit", () => {
    const stats = new CacheStats();
    const cache = new DiskCache(join(dir, "transcripts"), Shape, stats);
    cache.set("abc", { url: "https://x", body: "hello" });
    expect(cache.get("abc")).toEqual({ url: "https://x", body: "hello" });
    expect(stats.snapshot()).toEqual({ hits: 1, misses: 0 });
  });

  it("persists across instances (survives process restart)", () => {
    const c1 = new DiskCache(join(dir, "t"), Shape, new CacheStats());
    c1.set("k", { url: "u", body: "b" });
    const c2 = new DiskCache(join(dir, "t"), Shape, new CacheStats());
    expect(c2.get("k")).toEqual({ url: "u", body: "b" });
  });

  it("treats a corrupt/invalid entry as a miss (safe to delete)", () => {
    const stats = new CacheStats();
    const cache = new DiskCache(join(dir, "t"), Shape, stats);
    // Write a file that doesn't match the schema.
    cache.set("k", { url: "u", body: "b" });
    writeFileSync(cache.pathFor("k"), "{ not valid json");
    expect(cache.get("k")).toBeUndefined();
    // A schema-mismatching but valid-JSON entry is also a miss.
    writeFileSync(cache.pathFor("k"), JSON.stringify({ wrong: 1 }));
    expect(cache.get("k")).toBeUndefined();
  });

  it("aggregates stats across multiple caches", () => {
    const stats = new CacheStats();
    const a = new DiskCache(join(dir, "a"), Shape, stats);
    const b = new DiskCache(join(dir, "b"), Shape, stats);
    a.get("x"); // miss
    a.set("x", { url: "u", body: "b" });
    a.get("x"); // hit
    b.get("y"); // miss
    expect(stats.snapshot()).toEqual({ hits: 1, misses: 2 });
  });
});
