import { describe, expect, test } from "vitest";
import { AppraisalSchema, CandidateSourceSchema, parseAppraisals, parseCandidateSources } from "./candidate-source.js";

describe("CandidateSourceSchema", () => {
  test("accepts a minimal candidate and defaults evidence/seenCount", () => {
    const c = CandidateSourceSchema.parse({
      url: "https://example.com",
      discoveredVia: "link-mine",
    });
    expect(c.url).toBe("https://example.com");
    expect(c.discoveredVia).toBe("link-mine");
    expect(c.evidence).toEqual([]);
    expect(c.seenCount).toBe(1);
  });

  test("keeps optional feedUrl and provided evidence + seenCount", () => {
    const c = CandidateSourceSchema.parse({
      url: "https://blog.example.com",
      feedUrl: "https://blog.example.com/rss.xml",
      discoveredVia: "domain-frequency",
      evidence: ["cited by 'A Great Post'", "recurs across 4 HN items"],
      seenCount: 4,
    });
    expect(c.feedUrl).toBe("https://blog.example.com/rss.xml");
    expect(c.evidence).toHaveLength(2);
    expect(c.seenCount).toBe(4);
  });

  test("rejects a non-URL", () => {
    expect(() => CandidateSourceSchema.parse({ url: "not a url", discoveredVia: "opml" })).toThrow();
  });

  test("rejects an unknown discoveredVia", () => {
    expect(() =>
      CandidateSourceSchema.parse({ url: "https://x.com", discoveredVia: "telepathy" }),
    ).toThrow();
  });

  test("parseCandidateSources validates an array", () => {
    const arr = parseCandidateSources([
      { url: "https://a.com", discoveredVia: "link-mine" },
      { url: "https://b.com", discoveredVia: "opml", seenCount: 3 },
    ]);
    expect(arr).toHaveLength(2);
    expect(arr[1]!.seenCount).toBe(3);
  });
});

describe("AppraisalSchema", () => {
  test("accepts a verdict and leaves decision optional", () => {
    const a = AppraisalSchema.parse({ url: "https://x.com", channels: ["ai"], trust: 0.8 });
    expect(a.channels).toEqual(["ai"]);
    expect(a.trust).toBe(0.8);
    expect(a.decision).toBeUndefined();
  });

  test("rejects out-of-range trust", () => {
    expect(() => AppraisalSchema.parse({ url: "https://x.com", channels: [], trust: 2 })).toThrow();
  });

  test("parseAppraisals validates an array", () => {
    const arr = parseAppraisals([
      { url: "https://a.com", channels: ["ai"], trust: 0.9, decision: "approve" },
      { url: "https://b.com", channels: ["tech"], trust: 0.3, decision: "reject" },
    ]);
    expect(arr).toHaveLength(2);
  });
});
