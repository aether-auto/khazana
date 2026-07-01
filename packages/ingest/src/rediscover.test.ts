import { expect, test } from "vitest";
import type { Registry, SourceEntry } from "@khazana/core";
import { reconcileRegistry, type FetchOutcome } from "@khazana/core";
import { rediscoverMovedFeeds } from "./rediscover.js";
import type { FetchFn, FetchResult } from "./fetchers/build-source.js";

const NOW = "2026-06-30T00:00:00.000Z";

const src = (over: Partial<SourceEntry>): SourceEntry => ({
  id: "s",
  type: "rss",
  url: "https://e.com/blog",
  channels: ["tech"],
  enabled: true,
  trustScore: 0.6,
  addedBy: "seed",
  failureCount: 0,
  ...over,
});

const html = (text: string): FetchResult => ({ ok: true, status: 200, text: async () => text, json: async () => ({}) });

const HTML_WITH_FEED = `<html><head>
  <link rel="alternate" type="application/rss+xml" href="/new-feed.xml">
</head></html>`;

const permanent404 = (sourceId: string): FetchOutcome => ({
  sourceId,
  ok: false,
  errorKind: "http-4xx",
  httpStatus: 404,
  itemCount: 0,
});

test("rediscovery repairs a moved feed and re-enables the source, no disable", async () => {
  const registry: Registry = { version: 1, sources: [src({ id: "moved", consecutiveFailures: 2 })] };
  // 3rd permanent strike hits the threshold → reconcile flags it for rediscovery.
  const { registry: reconciled, rediscover } = reconcileRegistry(registry, [permanent404("moved")], { now: NOW });
  expect(rediscover.map((r) => r.id)).toEqual(["moved"]); // reconcile flagged it
  expect(reconciled.sources[0]!.status).toBe("disabled"); // pre-rediscovery

  const fetchFn: FetchFn = async () => html(HTML_WITH_FEED);
  const healed = await rediscoverMovedFeeds(reconciled, rediscover, fetchFn, { now: NOW });

  const s = healed.sources[0]!;
  expect(s.enabled).toBe(true);
  expect(s.status).toBe("active");
  expect(s.consecutiveFailures).toBe(0);
  expect(s.resolvedUrl).toBe("https://e.com/new-feed.xml");
  expect(s.lastError).toBeUndefined();
});

test("rediscovery leaves the source disabled when no moved feed is found", async () => {
  const registry: Registry = { version: 1, sources: [src({ id: "gone", consecutiveFailures: 2 })] };
  const { registry: reconciled, rediscover } = reconcileRegistry(registry, [permanent404("gone")], { now: NOW });

  const noFeed: FetchFn = async () => html("<html><head></head></html>");
  const healed = await rediscoverMovedFeeds(reconciled, rediscover, noFeed, { now: NOW });

  const s = healed.sources[0]!;
  expect(s.enabled).toBe(false);
  expect(s.status).toBe("disabled");
});

test("rediscovery ignores a discovered URL identical to the current one (real 404)", async () => {
  const registry: Registry = { version: 1, sources: [src({ id: "same", url: "https://e.com/feed.xml", consecutiveFailures: 2 })] };
  const { registry: reconciled, rediscover } = reconcileRegistry(registry, [permanent404("same")], { now: NOW });

  // fetchAndDiscoverFeed short-circuits a feed-looking URL to itself → same URL.
  const fetchFn: FetchFn = async () => html(HTML_WITH_FEED);
  const healed = await rediscoverMovedFeeds(reconciled, rediscover, fetchFn, { now: NOW });

  const s = healed.sources[0]!;
  expect(s.enabled).toBe(false); // not repaired — same URL is not a fix
  expect(s.status).toBe("disabled");
});

test("no rediscovery candidates → registry returned unchanged", async () => {
  const registry: Registry = { version: 1, sources: [src({ id: "a" })] };
  const fetchFn: FetchFn = async () => html(HTML_WITH_FEED);
  const healed = await rediscoverMovedFeeds(registry, [], fetchFn, { now: NOW });
  expect(healed).toEqual(registry);
});
