import { expect, test } from "vitest";
import type { CitationLedger } from "@khazana/core";
import { checkClaims, type ClaimEntry } from "./fact-checker.js";

const LEDGER: CitationLedger = [
  { url: "https://academic.oup.com/mnras/1859", title: "MNRAS 1859", tier: "high", origin: "researched" },
  { url: "https://ntrs.nasa.gov/report", title: "NASA NTRS", tier: "high", origin: "researched" },
  { url: "https://e.com/curated-1", title: "Curated 1", tier: "med", origin: "curated" },
  { url: "https://blog.example.com/post", title: "Some blog", tier: "low", origin: "researched" },
];

function claim(over: Partial<ClaimEntry> & Pick<ClaimEntry, "claim">): ClaimEntry {
  return {
    loadBearing: false,
    highStakes: false,
    sourceUrls: [],
    ...over,
  };
}

test("all claims sourced + load-bearing claims double-corroborated => pass", () => {
  const claims: ClaimEntry[] = [
    claim({
      claim: "The 1859 storm induced telegraph fires.",
      loadBearing: true,
      highStakes: true,
      sourceUrls: ["https://academic.oup.com/mnras/1859", "https://ntrs.nasa.gov/report"],
    }),
    claim({
      claim: "It was observed by Carrington.",
      loadBearing: true,
      sourceUrls: ["https://academic.oup.com/mnras/1859", "https://e.com/curated-1"],
    }),
    claim({ claim: "Colorful aside.", sourceUrls: ["https://blog.example.com/post"] }),
  ];
  const verdict = checkClaims(claims, LEDGER);
  expect(verdict.pass).toBe(true);
  expect(verdict.claimsCovered).toBe(1); // 100% cite a ledger source
  expect(verdict.corroborationRate).toBe(1); // both load-bearing corroborated by 2+
  expect(verdict.violations).toEqual([]);
});

test("a claim citing a url NOT in the ledger is a violation and drops coverage", () => {
  const claims: ClaimEntry[] = [
    claim({ claim: "Grounded.", loadBearing: true, sourceUrls: ["https://academic.oup.com/mnras/1859", "https://ntrs.nasa.gov/report"] }),
    claim({ claim: "Fabricated.", sourceUrls: ["https://made-up.example/x"] }),
  ];
  const verdict = checkClaims(claims, LEDGER);
  expect(verdict.claimsCovered).toBe(0.5); // 1 of 2 cite a ledger source
  expect(verdict.pass).toBe(false); // below 0.9 coverage
  expect(verdict.violations.some((v) => v.includes("not in ledger"))).toBe(true);
});

test("coverage below 90% fails the gate", () => {
  const claims: ClaimEntry[] = [];
  for (let i = 0; i < 9; i++) {
    claims.push(claim({ claim: `c${i}`, sourceUrls: ["https://e.com/curated-1"] }));
  }
  claims.push(claim({ claim: "uncited", sourceUrls: [] }));
  const verdict = checkClaims(claims, LEDGER);
  expect(verdict.claimsCovered).toBeCloseTo(0.9, 5);
  // 0.9 is the threshold (>=), so exactly 0.9 passes coverage; add one more uncited to drop it.
  claims.push(claim({ claim: "uncited2", sourceUrls: [] }));
  const v2 = checkClaims(claims, LEDGER);
  expect(v2.claimsCovered).toBeLessThan(0.9);
  expect(v2.pass).toBe(false);
});

test("corroboration counts only INDEPENDENT sources (distinct domain AND origin)", () => {
  // Two urls, same domain => not independent.
  const sameDomain: ClaimEntry[] = [
    claim({ claim: "x", loadBearing: true, sourceUrls: ["https://academic.oup.com/a", "https://academic.oup.com/b"] }),
  ];
  const ledger: CitationLedger = [
    { url: "https://academic.oup.com/a", title: "A", tier: "high", origin: "researched" },
    { url: "https://academic.oup.com/b", title: "B", tier: "high", origin: "researched" },
  ];
  const v = checkClaims(sameDomain, ledger);
  expect(v.corroborationRate).toBe(0); // only one independent source
  expect(v.pass).toBe(false);
});

test("<60% of load-bearing claims corroborated fails the gate", () => {
  const claims: ClaimEntry[] = [
    claim({ claim: "solo1", loadBearing: true, sourceUrls: ["https://academic.oup.com/mnras/1859"] }),
    claim({ claim: "solo2", loadBearing: true, sourceUrls: ["https://ntrs.nasa.gov/report"] }),
    claim({
      claim: "corroborated",
      loadBearing: true,
      sourceUrls: ["https://academic.oup.com/mnras/1859", "https://e.com/curated-1"],
    }),
  ];
  const v = checkClaims(claims, LEDGER);
  expect(v.corroborationRate).toBeCloseTo(1 / 3, 5); // only 1 of 3 corroborated
  expect(v.pass).toBe(false);
  expect(v.violations.some((x) => x.toLowerCase().includes("corrobor"))).toBe(true);
});

test("an uncorroborated HIGH-STAKES claim is always flagged", () => {
  const claims: ClaimEntry[] = [
    claim({ claim: "big scary number", loadBearing: true, highStakes: true, sourceUrls: ["https://academic.oup.com/mnras/1859"] }),
  ];
  const v = checkClaims(claims, LEDGER);
  expect(v.violations.some((x) => x.toLowerCase().includes("high-stakes"))).toBe(true);
  expect(v.pass).toBe(false);
});

test("empty claims map is a hard fail (nothing to ground)", () => {
  const v = checkClaims([], LEDGER);
  expect(v.pass).toBe(false);
  expect(v.violations.length).toBeGreaterThan(0);
});
