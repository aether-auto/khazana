import { describe, expect, test } from "vitest";
import type { Registry } from "@khazana/core";
import { importOpml } from "./opml.js";

const registry: Registry = {
  version: 1,
  sources: [
    { id: "qm", type: "rss", url: "https://www.quantamagazine.org/feed/", channels: ["science"], enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0 },
  ],
};

const OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My feeds</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="Simon Willison" xmlUrl="https://simonwillison.net/atom/everything/" htmlUrl="https://simonwillison.net/"/>
      <outline type="rss" text="Quanta" xmlUrl="https://www.quantamagazine.org/feed/" htmlUrl="https://www.quantamagazine.org/"/>
    </outline>
    <outline type="rss" text="Dupe" xmlUrl="https://simonwillison.net/atom/everything/"/>
    <outline text="A folder with no feed"/>
  </body>
</opml>`;

describe("importOpml", () => {
  test("parses feed outlines into candidates with feedUrl", () => {
    const out = importOpml(OPML, registry);
    const willison = out.find((c) => new URL(c.url).hostname === "simonwillison.net")!;
    expect(willison).toBeTruthy();
    expect(willison.feedUrl).toBe("https://simonwillison.net/atom/everything/");
    expect(willison.discoveredVia).toBe("opml");
  });

  test("prefers htmlUrl as the candidate url, falling back to xmlUrl", () => {
    const out = importOpml(OPML, registry);
    const willison = out.find((c) => new URL(c.url).hostname === "simonwillison.net")!;
    expect(willison.url).toBe("https://simonwillison.net/");
  });

  test("drops feeds whose domain is already registered", () => {
    const out = importOpml(OPML, registry);
    expect(out.map((c) => new URL(c.url).hostname.replace(/^www\./, ""))).not.toContain("quantamagazine.org");
  });

  test("dedupes repeated feeds and records the OPML title as evidence", () => {
    const out = importOpml(OPML, registry, { fileLabel: "my-feeds.opml" });
    const willison = out.filter((c) => new URL(c.url).hostname === "simonwillison.net");
    expect(willison).toHaveLength(1);
    expect(willison[0]!.evidence.join(" ")).toContain("my-feeds.opml");
  });

  test("ignores non-feed outlines and malformed input gracefully", () => {
    expect(importOpml("not xml at all", registry)).toEqual([]);
    expect(importOpml("<opml><body></body></opml>", registry)).toEqual([]);
  });
});
