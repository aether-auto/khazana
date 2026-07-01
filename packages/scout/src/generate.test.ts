import { describe, expect, test } from "vitest";
import type { FeedItem, Registry } from "@khazana/core";
import { generateCandidates, renderCandidateBrief } from "./generate.js";

function item(p: Partial<FeedItem> & { id: string; url: string; sourceType: FeedItem["sourceType"] }): FeedItem {
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
    ...p,
  } as FeedItem;
}

const registry: Registry = {
  version: 1,
  sources: [
    { id: "qm", type: "rss", url: "https://www.quantamagazine.org/feed/", channels: ["science"], enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0 },
    { id: "hn", type: "hn", url: "https://hnrss.org/frontpage", channels: ["tech"], enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0 },
  ],
};

describe("generateCandidates", () => {
  const curated: FeedItem[] = [
    item({ id: "c1", sourceType: "rss", url: "https://foreignpolicy.com/x", title: "Deep Read", tasteScore: 4, body: `<a href="https://simonwillison.net/a">x</a>` }),
  ];
  const raw: FeedItem[] = [
    item({ id: "r1", sourceType: "hn", url: "https://simonwillison.net/b" }),
    item({ id: "r2", sourceType: "hn", url: "https://simonwillison.net/c" }),
    item({ id: "r3", sourceType: "reddit", url: "https://other.example.com/a" }),
    item({ id: "r4", sourceType: "reddit", url: "https://other.example.com/b" }),
  ];

  test("runs all generators and merges cross-generator evidence for the same domain", () => {
    const out = generateCandidates({ registry, curated, raw }, { domainFrequency: { minCount: 2 }, linkMine: { minTasteScore: 1 } });
    const sw = out.find((c) => new URL(c.url).hostname === "simonwillison.net")!;
    expect(sw).toBeTruthy();
    // seen by BOTH link-mine (1 citation) and domain-frequency (2 hn items) → 3
    expect(sw.seenCount).toBe(3);
    expect(sw.evidence.length).toBeGreaterThanOrEqual(2);
  });

  test("excludes already-registered domains and ranks by seenCount", () => {
    const out = generateCandidates({ registry, curated, raw }, { domainFrequency: { minCount: 2 }, linkMine: { minTasteScore: 1 } });
    expect(out.map((c) => new URL(c.url).hostname)).not.toContain("www.quantamagazine.org");
    // simonwillison (3) ranks above other.example.com (2)
    expect(new URL(out[0]!.url).hostname).toBe("simonwillison.net");
  });

  test("importOpml candidates fold in when an opml string is supplied", () => {
    const opml = `<opml><body><outline type="rss" text="New" xmlUrl="https://newfeed.example.com/rss" htmlUrl="https://newfeed.example.com/"/></body></opml>`;
    const out = generateCandidates({ registry, curated, raw, opml }, { domainFrequency: { minCount: 2 }, linkMine: { minTasteScore: 1 } });
    expect(out.map((c) => new URL(c.url).hostname)).toContain("newfeed.example.com");
  });
});

describe("renderCandidateBrief", () => {
  test("lists candidates with evidence, provenance, and seenCount for the appraiser", () => {
    const brief = renderCandidateBrief(
      [
        { url: "https://simonwillison.net/", feedUrl: "https://simonwillison.net/rss", discoveredVia: "link-mine", evidence: ['cited by "Deep Read"', "recurs across 2 aggregator items"], seenCount: 3 },
      ],
      "2026-06-30T00:00:00.000Z",
    );
    expect(brief).toContain("simonwillison.net");
    expect(brief).toContain("Deep Read");
    expect(brief).toContain("seen 3");
    // instructs the cloud appraiser without making the call for it
    expect(brief.toLowerCase()).toContain("credibility");
    expect(brief).toContain("sources.pending.json");
  });

  test("handles an empty candidate list", () => {
    const brief = renderCandidateBrief([], "2026-06-30T00:00:00.000Z");
    expect(brief).toContain("(none)");
  });
});
