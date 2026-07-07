import { expect, test } from "vitest";
import type { CitationLedger, FeedItem } from "@khazana/core";
import { computeCitationStats } from "./citation-stats.js";

function item(id: string, url: string): FeedItem {
  return {
    id, source: "s", sourceType: "rss", url, title: id,
    publishedAt: "2026-06-22T00:00:00.000Z", fetchedAt: "2026-06-22T00:00:00.000Z",
    topics: ["ai"], entities: [], summary: "", media: [], kind: "link",
  };
}

const LEDGER: CitationLedger = [
  { url: "https://academic.oup.com/mnras/1859", title: "MNRAS 1859", tier: "high", origin: "researched" },
  { url: "https://ntrs.nasa.gov/report", title: "NASA NTRS", tier: "high", origin: "researched" },
  { url: "https://blog.example.com/post", title: "Some blog", tier: "low", origin: "researched" },
];

const CURATED: FeedItem[] = [item("c1", "https://e.com/curated-1")];

test("this is deterministic per-draft ledger-grounding stats, not a claims-level gate", () => {
  const stats = computeCitationStats(
    [
      { url: "https://academic.oup.com/mnras/1859" },
      { url: "https://ntrs.nasa.gov/report" },
    ],
    LEDGER,
    CURATED,
  );
  expect(stats.citedCount).toBe(2);
  expect(stats.groundedCount).toBe(2);
  expect(stats.ledgerCoverage).toBe(1);
  expect(stats.tierBreakdown).toEqual({ high: 2, med: 0, low: 0, unknown: 0 });
  // academic.oup.com and ntrs.nasa.gov are distinct domains, same origin ("researched") -> independent.
  expect(stats.independentSourceCount).toBe(2);
});

test("a curated-only source (no ledger entry) is grounded but tier-unknown", () => {
  const stats = computeCitationStats([{ url: "https://e.com/curated-1" }], LEDGER, CURATED);
  expect(stats.citedCount).toBe(1);
  expect(stats.groundedCount).toBe(1);
  expect(stats.ledgerCoverage).toBe(1);
  expect(stats.tierBreakdown.unknown).toBe(1);
});

test("a source cited by neither curated nor ledger drops coverage and counts as ungrounded", () => {
  const stats = computeCitationStats(
    [{ url: "https://academic.oup.com/mnras/1859" }, { url: "https://made-up.example/x" }],
    LEDGER,
    CURATED,
  );
  expect(stats.citedCount).toBe(2);
  expect(stats.groundedCount).toBe(1);
  expect(stats.ledgerCoverage).toBe(0.5);
});

test("two sources on the SAME domain count as only one independent source", () => {
  const sameSiteLedger: CitationLedger = [
    { url: "https://academic.oup.com/a", title: "A", tier: "high", origin: "researched" },
    { url: "https://academic.oup.com/b", title: "B", tier: "high", origin: "researched" },
  ];
  const stats = computeCitationStats(
    [{ url: "https://academic.oup.com/a" }, { url: "https://academic.oup.com/b" }],
    sameSiteLedger,
    [],
  );
  expect(stats.independentSourceCount).toBe(1);
});

test("zero cited sources reports full coverage (nothing to fail) and zero independents", () => {
  const stats = computeCitationStats([], LEDGER, CURATED);
  expect(stats.citedCount).toBe(0);
  expect(stats.ledgerCoverage).toBe(1);
  expect(stats.independentSourceCount).toBe(0);
});
