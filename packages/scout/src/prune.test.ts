import { expect, test } from "vitest";
import { DISABLE_AFTER, STALE_DAYS, pruneRegistry } from "./prune.js";
import type { Registry, SourceEntry } from "@khazana/core";

const src = (over: Partial<SourceEntry>): SourceEntry => ({
  id: "s", type: "rss", url: "https://e.com/feed", channels: ["tech"],
  enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0, ...over,
});

const now = "2026-06-23T00:00:00.000Z";

test("constants are the documented defaults", () => {
  expect(DISABLE_AFTER).toBe(5);
  expect(STALE_DAYS).toBe(30);
});

test("disables (not deletes) sources at/over the failure threshold", () => {
  const reg: Registry = { version: 1, sources: [src({ id: "dead", failureCount: 5 }), src({ id: "ok", failureCount: 1 })] };
  const { registry, actions } = pruneRegistry(reg, { now });
  expect(registry.sources).toHaveLength(2); // nothing deleted
  expect(registry.sources.find((s) => s.id === "dead")!.enabled).toBe(false);
  expect(registry.sources.find((s) => s.id === "ok")!.enabled).toBe(true);
  expect(actions).toEqual([{ id: "dead", action: "disable", reason: "failures>=5" }]);
});

test("flags stale sources without disabling them", () => {
  const reg: Registry = {
    version: 1,
    sources: [src({ id: "stale", lastFetchedAt: "2026-04-01T00:00:00.000Z" })], // > 30d before now
  };
  const { registry, actions } = pruneRegistry(reg, { now });
  expect(registry.sources[0]!.enabled).toBe(true); // still enabled
  expect(actions).toEqual([{ id: "stale", action: "flag-stale", reason: "stale>30d" }]);
});

test("fresh source produces no actions", () => {
  const reg: Registry = { version: 1, sources: [src({ id: "fresh", lastFetchedAt: "2026-06-22T00:00:00.000Z" })] };
  expect(pruneRegistry(reg, { now }).actions).toEqual([]);
});

test("already-disabled sources are untouched", () => {
  const reg: Registry = { version: 1, sources: [src({ id: "off", enabled: false, failureCount: 9 })] };
  const { actions } = pruneRegistry(reg, { now });
  expect(actions).toEqual([]);
});

test("does not mutate the input registry", () => {
  const reg: Registry = { version: 1, sources: [src({ id: "dead", failureCount: 7 })] };
  pruneRegistry(reg, { now });
  expect(reg.sources[0]!.enabled).toBe(true); // original untouched
});
