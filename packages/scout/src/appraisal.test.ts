import { describe, expect, test } from "vitest";
import type { CandidateSource } from "@khazana/core";
import { mergeAppraisal } from "./appraisal.js";

describe("mergeAppraisal", () => {
  const candidates: CandidateSource[] = [
    { url: "https://good.com/", feedUrl: "https://good.com/rss", discoveredVia: "link-mine", evidence: ["cited by A"], seenCount: 3 },
    { url: "https://maybe.com/", discoveredVia: "domain-frequency", evidence: ["recurs"], seenCount: 2 },
    { url: "https://unjudged.com/", discoveredVia: "opml", evidence: [], seenCount: 1 },
  ];

  test("joins appraisals onto candidates by domain and produces evaluate-ready Candidates", () => {
    const merged = mergeAppraisal(candidates, [
      { url: "https://good.com", channels: ["ai", "tech"], trust: 0.9 },
      { url: "https://maybe.com", channels: ["tech"], trust: 0.45 },
    ]);
    const good = merged.find((c) => c.url === "https://good.com/")!;
    expect(good.channels).toEqual(["ai", "tech"]);
    expect(good.claimedTrust).toBe(0.9);
  });

  test("drops candidates the appraiser explicitly rejected", () => {
    const merged = mergeAppraisal(candidates, [
      { url: "https://good.com", channels: ["ai"], trust: 0.9, decision: "approve" },
      { url: "https://maybe.com", channels: ["tech"], trust: 0.1, decision: "reject" },
    ]);
    expect(merged.map((c) => c.url)).toContain("https://good.com/");
    expect(merged.map((c) => c.url)).not.toContain("https://maybe.com/");
  });

  test("skips candidates with no matching appraisal (appraiser hasn't judged them)", () => {
    const merged = mergeAppraisal(candidates, [{ url: "https://good.com", channels: ["ai"], trust: 0.9 }]);
    expect(merged.map((c) => c.url)).toEqual(["https://good.com/"]);
  });

  test("carries the candidate feedUrl through as a hint on the Candidate", () => {
    const merged = mergeAppraisal(candidates, [{ url: "https://good.com", channels: ["ai"], trust: 0.9 }]);
    expect(merged[0]!.feedUrl).toBe("https://good.com/rss");
  });
});
