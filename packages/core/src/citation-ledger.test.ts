import { expect, test } from "vitest";
import {
  CitationLedgerEntrySchema,
  CitationLedgerSchema,
  SourceTierSchema,
  SourceOriginSchema,
  ledgerUrls,
  type CitationLedger,
} from "./citation-ledger.js";

test("tier and origin vocabularies are fixed", () => {
  expect(SourceTierSchema.options).toEqual(["high", "med", "low"]);
  expect(SourceOriginSchema.options).toEqual(["curated", "researched"]);
});

test("a well-formed researched high-tier entry parses", () => {
  const r = CitationLedgerEntrySchema.safeParse({
    url: "https://academic.oup.com/mnras/article/1859",
    title: "The solar storm of 1859 (MNRAS)",
    tier: "high",
    origin: "researched",
    firstSeen: "2026-07-01T00:00:00.000Z",
  });
  expect(r.success).toBe(true);
});

test("firstSeen is optional", () => {
  const r = CitationLedgerEntrySchema.safeParse({
    url: "https://e.com/1",
    title: "Curated seed",
    tier: "med",
    origin: "curated",
  });
  expect(r.success).toBe(true);
});

test("a non-url, empty title, or bad tier is rejected", () => {
  expect(CitationLedgerEntrySchema.safeParse({ url: "not-a-url", title: "x", tier: "high", origin: "curated" }).success).toBe(false);
  expect(CitationLedgerEntrySchema.safeParse({ url: "https://e.com/1", title: "", tier: "high", origin: "curated" }).success).toBe(false);
  expect(CitationLedgerEntrySchema.safeParse({ url: "https://e.com/1", title: "x", tier: "gold", origin: "curated" }).success).toBe(false);
  expect(CitationLedgerEntrySchema.safeParse({ url: "https://e.com/1", title: "x", tier: "high", origin: "invented" }).success).toBe(false);
});

test("the ledger is an array of entries", () => {
  const ledger: CitationLedger = [
    { url: "https://e.com/1", title: "A", tier: "high", origin: "curated" },
    { url: "https://e.com/2", title: "B", tier: "low", origin: "researched" },
  ];
  expect(CitationLedgerSchema.safeParse(ledger).success).toBe(true);
});

test("ledgerUrls collects every url", () => {
  const ledger: CitationLedger = [
    { url: "https://e.com/1", title: "A", tier: "high", origin: "curated" },
    { url: "https://e.com/2", title: "B", tier: "low", origin: "researched" },
  ];
  expect(ledgerUrls(ledger)).toEqual(new Set(["https://e.com/1", "https://e.com/2"]));
});
