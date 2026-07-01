import { describe, expect, test } from "vitest";
import type { FeedItem, Registry } from "@khazana/core";
import { mineLinks } from "./link-mine.js";

function item(partial: Partial<FeedItem> & { id: string; url: string }): FeedItem {
  return {
    source: "s",
    sourceType: "rss",
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
    { id: "qm", type: "rss", url: "https://www.quantamagazine.org/feed/", channels: ["science"], enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0 },
  ],
};

describe("mineLinks", () => {
  test("extracts outbound domains from high-quality item bodies", () => {
    const curated: FeedItem[] = [
      item({
        id: "1",
        url: "https://foreignpolicy.com/article",
        title: "A Great Post",
        tasteScore: 4.5,
        body: `<p>See <a href="https://simonwillison.net/2026/thing/">this</a> and <a href="https://www.example-blog.com/x">that</a>.</p>`,
      }),
    ];
    const out = mineLinks(curated, registry);
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).toContain("simonwillison.net");
    expect(domains).toContain("example-blog.com");
  });

  test("excludes domains already in the registry", () => {
    const curated: FeedItem[] = [
      item({
        id: "1",
        url: "https://foreignpolicy.com/article",
        tasteScore: 4.5,
        body: `<a href="https://www.quantamagazine.org/some-piece">already a source</a> <a href="https://fresh.example.com/x">new</a>`,
      }),
    ];
    const out = mineLinks(curated, registry);
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).not.toContain("quantamagazine.org");
    expect(domains).toContain("fresh.example.com");
  });

  test("excludes the item's OWN host (self-links are not new sources)", () => {
    const curated: FeedItem[] = [
      item({
        id: "1",
        url: "https://foreignpolicy.com/article",
        tasteScore: 4.5,
        body: `<a href="https://foreignpolicy.com/2026/other">internal</a> <a href="https://out.example.com/x">external</a>`,
      }),
    ];
    const out = mineLinks(curated, registry);
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).not.toContain("foreignpolicy.com");
    expect(domains).toContain("out.example.com");
  });

  test("skips low-quality items below the tasteScore floor", () => {
    const curated: FeedItem[] = [
      item({ id: "lo", url: "https://a.com/x", tasteScore: 0.1, body: `<a href="https://spam.example.com/x">x</a>` }),
      item({ id: "hi", url: "https://a.com/y", tasteScore: 4.5, body: `<a href="https://quality.example.com/y">y</a>` }),
    ];
    const out = mineLinks(curated, registry, { minTasteScore: 2 });
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).not.toContain("spam.example.com");
    expect(domains).toContain("quality.example.com");
  });

  test("tallies seenCount across items and records citing-title evidence", () => {
    const curated: FeedItem[] = [
      item({ id: "1", url: "https://a.com/x", title: "First", tasteScore: 4, body: `<a href="https://repeat.example.com/1">a</a>` }),
      item({ id: "2", url: "https://b.com/y", title: "Second", tasteScore: 4, body: `<a href="https://repeat.example.com/2">b</a>` }),
    ];
    const out = mineLinks(curated, registry);
    const rep = out.find((c) => new URL(c.url).hostname === "repeat.example.com")!;
    expect(rep.seenCount).toBe(2);
    expect(rep.discoveredVia).toBe("link-mine");
    expect(rep.evidence.join(" ")).toMatch(/First|Second/);
  });

  test("ignores infrastructure / platform / CDN domains (not real sources)", () => {
    const curated: FeedItem[] = [
      item({
        id: "1",
        url: "https://a.com/x",
        tasteScore: 4,
        body: `<a href="https://github.com/foo/bar">code</a>
               <a href="https://en.wikipedia.org/wiki/Thing">wiki</a>
               <a href="https://x.com/user/status/1">tweet</a>
               <a href="https://doi.org/10.1/xyz">doi</a>
               <a href="https://substackcdn.com/image.png">cdn</a>
               <a href="https://web.archive.org/web/123/http://y.com">archive</a>
               <a href="https://realpublisher.example.com/post">real</a>`,
      }),
    ];
    const out = mineLinks(curated, registry);
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).toEqual(["realpublisher.example.com"]);
  });

  test("ignores junk / mailto / relative hrefs", () => {
    const curated: FeedItem[] = [
      item({
        id: "1",
        url: "https://a.com/x",
        tasteScore: 4,
        body: `<a href="mailto:x@y.com">mail</a> <a href="/relative">rel</a> <a href="https://good.example.com/z">ok</a>`,
      }),
    ];
    const out = mineLinks(curated, registry);
    const domains = out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""));
    expect(domains).toEqual(["good.example.com"]);
  });
});
