import { expect, test } from "vitest";
import type { CitationLedger } from "@khazana/core";
import { enrichSourcesFromLedger } from "./source-enrichment.js";

const LEDGER: CitationLedger = [
  { url: "https://academic.oup.com/mnras/1859", title: "MNRAS 1859", tier: "high", origin: "researched" },
  { url: "https://e.com/curated-1", title: "GPT-5 launch", tier: "med", origin: "curated" },
];

test("a source whose url matches a ledger entry is enriched with tier + origin", () => {
  const out = enrichSourcesFromLedger([{ url: "https://academic.oup.com/mnras/1859" }], LEDGER);
  expect(out).toEqual([
    { url: "https://academic.oup.com/mnras/1859", tier: "high", origin: "researched" },
  ]);
});

test("a source with no matching ledger entry is returned un-enriched (no tier/origin keys)", () => {
  const out = enrichSourcesFromLedger([{ url: "https://made-up.example/x" }], LEDGER);
  expect(out).toEqual([{ url: "https://made-up.example/x" }]);
  expect(out[0]).not.toHaveProperty("tier");
  expect(out[0]).not.toHaveProperty("origin");
});

test("back-compat: an empty ledger leaves every source unchanged", () => {
  const sources = [{ url: "https://e.com/curated-1" }, { url: "https://e.com/other" }];
  expect(enrichSourcesFromLedger(sources, [])).toEqual(sources);
});

test("matches by exact url string only (no fuzzy/host matching)", () => {
  const out = enrichSourcesFromLedger([{ url: "https://e.com/curated-1?utm=x" }], LEDGER);
  expect(out).toEqual([{ url: "https://e.com/curated-1?utm=x" }]);
});

test("preserves an existing title when present, alongside the enriched tier/origin", () => {
  const out = enrichSourcesFromLedger(
    [{ title: "My own citation text", url: "https://e.com/curated-1" }],
    LEDGER,
  );
  expect(out).toEqual([
    { title: "My own citation text", url: "https://e.com/curated-1", tier: "med", origin: "curated" },
  ]);
});

test("a mixed batch enriches only the matched entries", () => {
  const out = enrichSourcesFromLedger(
    [{ url: "https://e.com/curated-1" }, { url: "https://not-in-ledger.example/z" }],
    LEDGER,
  );
  expect(out).toEqual([
    { url: "https://e.com/curated-1", tier: "med", origin: "curated" },
    { url: "https://not-in-ledger.example/z" },
  ]);
});
