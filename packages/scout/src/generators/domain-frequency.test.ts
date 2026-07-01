import { describe, expect, test } from "vitest";
import type { FeedItem, Registry } from "@khazana/core";
import { domainFrequency } from "./domain-frequency.js";

function item(partial: Partial<FeedItem> & { id: string; url: string; sourceType: FeedItem["sourceType"] }): FeedItem {
  return {
    source: "s",
    title: "t",
    publishedAt: "2026-06-01T00:00:00.000Z",
    fetchedAt: "2026-06-01T00:00:00.000Z",
    topics: [],
    entities: [],
    summary: "",
    media: [],
    kind: "link",
    ...partial,
  } as FeedItem;
}

const registry: Registry = {
  version: 1,
  sources: [
    { id: "hn", type: "hn", url: "https://hnrss.org/frontpage", channels: ["tech"], enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0 },
    { id: "known", type: "rss", url: "https://known.example.com/feed", channels: ["ai"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
  ],
};

describe("domainFrequency", () => {
  test("counts external link domains across aggregator items and ranks by frequency", () => {
    const raw: FeedItem[] = [
      item({ id: "1", sourceType: "hn", url: "https://busy.example.com/a" }),
      item({ id: "2", sourceType: "hn", url: "https://busy.example.com/b" }),
      item({ id: "3", sourceType: "hn", url: "https://busy.example.com/c" }),
      item({ id: "4", sourceType: "reddit", url: "https://rare.example.com/z" }),
      item({ id: "5", sourceType: "reddit", url: "https://rare.example.com/y" }),
    ];
    const out = domainFrequency(raw, registry, { minCount: 2 });
    // busy (3) ranks above rare (2)
    expect(out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""))).toEqual([
      "busy.example.com",
      "rare.example.com",
    ]);
    expect(out[0]!.seenCount).toBe(3);
    expect(out[0]!.discoveredVia).toBe("domain-frequency");
  });

  test("applies the minCount threshold", () => {
    const raw: FeedItem[] = [
      item({ id: "1", sourceType: "hn", url: "https://recurs.example.com/a" }),
      item({ id: "2", sourceType: "hn", url: "https://recurs.example.com/b" }),
      item({ id: "3", sourceType: "hn", url: "https://recurs.example.com/c" }),
      item({ id: "4", sourceType: "hn", url: "https://once.example.com/x" }),
    ];
    const out = domainFrequency(raw, registry, { minCount: 3 });
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).toContain("recurs.example.com");
    expect(domains).not.toContain("once.example.com");
  });

  test("excludes registry domains and the aggregator's own domain", () => {
    const raw: FeedItem[] = [
      item({ id: "1", sourceType: "hn", url: "https://known.example.com/a" }),
      item({ id: "2", sourceType: "hn", url: "https://known.example.com/b" }),
      item({ id: "3", sourceType: "hn", url: "https://hnrss.org/self" }),
      item({ id: "4", sourceType: "hn", url: "https://hnrss.org/self2" }),
      item({ id: "5", sourceType: "hn", url: "https://fresh.example.com/a" }),
      item({ id: "6", sourceType: "hn", url: "https://fresh.example.com/b" }),
    ];
    const out = domainFrequency(raw, registry, { minCount: 2 });
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).toEqual(["fresh.example.com"]);
  });

  test("ignores infrastructure / platform domains (github, wikipedia, x, …)", () => {
    const raw: FeedItem[] = [
      item({ id: "1", sourceType: "hn", url: "https://github.com/a/b" }),
      item({ id: "2", sourceType: "hn", url: "https://github.com/c/d" }),
      item({ id: "3", sourceType: "hn", url: "https://en.wikipedia.org/wiki/X" }),
      item({ id: "4", sourceType: "hn", url: "https://en.wikipedia.org/wiki/Y" }),
      item({ id: "5", sourceType: "hn", url: "https://realblog.example.com/a" }),
      item({ id: "6", sourceType: "hn", url: "https://realblog.example.com/b" }),
    ];
    const out = domainFrequency(raw, registry, { minCount: 2 });
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).toEqual(["realblog.example.com"]);
  });

  test("only considers aggregator source types (ignores eng-blog/rss first-party)", () => {
    const raw: FeedItem[] = [
      item({ id: "1", sourceType: "eng-blog", url: "https://firstparty.example.com/a" }),
      item({ id: "2", sourceType: "eng-blog", url: "https://firstparty.example.com/b" }),
      item({ id: "3", sourceType: "hn", url: "https://agg.example.com/a" }),
      item({ id: "4", sourceType: "hn", url: "https://agg.example.com/b" }),
    ];
    const out = domainFrequency(raw, registry, { minCount: 2 });
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).toEqual(["agg.example.com"]);
  });
});
