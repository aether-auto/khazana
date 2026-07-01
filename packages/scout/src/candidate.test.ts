import { describe, expect, test } from "vitest";
import type { Registry } from "@khazana/core";
import { dedupeCandidates, registryDomainSet, toCandidate } from "./candidate.js";

const registry: Registry = {
  version: 1,
  sources: [
    { id: "qm", type: "rss", url: "https://www.quantamagazine.org/feed/", channels: ["science"], enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0 },
  ],
};

describe("registryDomainSet", () => {
  test("normalizes registry domains (drops www)", () => {
    const set = registryDomainSet(registry);
    expect(set.has("quantamagazine.org")).toBe(true);
    expect(set.has("www.quantamagazine.org")).toBe(false);
  });
});

describe("dedupeCandidates", () => {
  test("drops candidates whose domain is already registered", () => {
    const out = dedupeCandidates(
      [
        { url: "https://www.quantamagazine.org/feed/", discoveredVia: "link-mine", evidence: ["x"], seenCount: 1 },
        { url: "https://newblog.example.com", discoveredVia: "link-mine", evidence: ["y"], seenCount: 1 },
      ],
      registry,
    );
    expect(out.map((c) => c.url)).toEqual(["https://newblog.example.com"]);
  });

  test("merges same-domain candidates: sums seenCount, unions evidence", () => {
    const out = dedupeCandidates(
      [
        { url: "https://blog.example.com/a", discoveredVia: "link-mine", evidence: ["cited by A"], seenCount: 2 },
        { url: "https://blog.example.com/b", discoveredVia: "domain-frequency", evidence: ["recurs on HN"], seenCount: 3 },
        { url: "https://blog.example.com/a", discoveredVia: "link-mine", evidence: ["cited by A"], seenCount: 1 },
      ],
      registry,
    );
    expect(out).toHaveLength(1);
    const merged = out[0]!;
    expect(merged.seenCount).toBe(6);
    expect(merged.evidence).toEqual(expect.arrayContaining(["cited by A", "recurs on HN"]));
    // evidence deduped
    expect(merged.evidence.filter((e) => e === "cited by A")).toHaveLength(1);
  });

  test("ranks by seenCount descending", () => {
    const out = dedupeCandidates(
      [
        { url: "https://low.example.com", discoveredVia: "link-mine", evidence: [], seenCount: 1 },
        { url: "https://high.example.com", discoveredVia: "link-mine", evidence: [], seenCount: 9 },
        { url: "https://mid.example.com", discoveredVia: "link-mine", evidence: [], seenCount: 4 },
      ],
      registry,
    );
    expect(out.map((c) => c.url)).toEqual([
      "https://high.example.com",
      "https://mid.example.com",
      "https://low.example.com",
    ]);
  });

  test("preserves a feedUrl when merging (first non-empty wins)", () => {
    const out = dedupeCandidates(
      [
        { url: "https://blog.example.com/a", discoveredVia: "domain-frequency", evidence: [], seenCount: 1 },
        { url: "https://blog.example.com/b", discoveredVia: "opml", feedUrl: "https://blog.example.com/rss", evidence: [], seenCount: 1 },
      ],
      registry,
    );
    expect(out[0]!.feedUrl).toBe("https://blog.example.com/rss");
  });
});

describe("toCandidate", () => {
  test("bridges a CandidateSource into the evaluate/apply Candidate shape", () => {
    const c = toCandidate({
      url: "https://blog.example.com",
      feedUrl: "https://blog.example.com/rss",
      discoveredVia: "link-mine",
      evidence: ["cited by A", "recurs on HN"],
      seenCount: 5,
    });
    expect(c.url).toBe("https://blog.example.com");
    expect(c.channels).toEqual([]); // channels are the appraiser's job
    expect(c.title).toContain("blog.example.com");
    expect(c.rationale).toContain("link-mine");
  });
});
