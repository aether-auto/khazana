import { describe, expect, test } from "vitest";
import { domainOf, groupSourcesByTier, summarizeSources, type RailSource } from "./source-ledger.js";

describe("domainOf", () => {
  test("extracts the hostname, stripping a leading www.", () => {
    expect(domainOf("https://www.nasa.gov/report")).toBe("nasa.gov");
    expect(domainOf("https://academic.oup.com/mnras/1859")).toBe("academic.oup.com");
  });

  test("two urls on the same host count as the same domain regardless of path/query", () => {
    expect(domainOf("https://e.com/a?x=1")).toBe(domainOf("https://e.com/b"));
  });

  test("an unparseable url falls back to the lowercased raw string rather than throwing", () => {
    expect(() => domainOf("not a url")).not.toThrow();
    expect(domainOf("NOT-A-URL")).toBe("not-a-url");
  });
});

describe("summarizeSources", () => {
  test("back-compat: sources with no tier/origin (the 13 pre-existing Reads) summarize with everything unknown", () => {
    const sources: RailSource[] = [
      { title: "A", url: "https://a.com/1" },
      { title: "B", url: "https://b.com/1" },
    ];
    const s = summarizeSources(sources);
    expect(s.total).toBe(2);
    expect(s.tiers).toEqual({ high: 0, med: 0, low: 0, unknown: 2 });
    expect(s.origins).toEqual({ curated: 0, researched: 0, unknown: 2 });
    expect(s.hasTierData).toBe(false);
    expect(s.hasOriginData).toBe(false);
    expect(s.independentDomains).toBe(2);
  });

  test("tallies tier + origin when present", () => {
    const sources: RailSource[] = [
      { title: "A", url: "https://a.com/1", tier: "high", origin: "researched" },
      { title: "B", url: "https://b.com/1", tier: "high", origin: "curated" },
      { title: "C", url: "https://c.com/1", tier: "med", origin: "curated" },
      { title: "D", url: "https://d.com/1", tier: "low", origin: "researched" },
    ];
    const s = summarizeSources(sources);
    expect(s.tiers).toEqual({ high: 2, med: 1, low: 1, unknown: 0 });
    expect(s.origins).toEqual({ curated: 2, researched: 2, unknown: 0 });
    expect(s.hasTierData).toBe(true);
    expect(s.hasOriginData).toBe(true);
  });

  test("a partially-enriched list (mixed known/unknown) is not treated as back-compat", () => {
    const sources: RailSource[] = [
      { title: "A", url: "https://a.com/1", tier: "high", origin: "researched" },
      { title: "B", url: "https://b.com/1" },
    ];
    const s = summarizeSources(sources);
    expect(s.tiers).toEqual({ high: 1, med: 0, low: 0, unknown: 1 });
    expect(s.hasTierData).toBe(true);
  });

  test("independent domains counts distinct hostnames, deduping repeats and www", () => {
    const sources: RailSource[] = [
      { title: "A", url: "https://www.e.com/1" },
      { title: "B", url: "https://e.com/2" },
      { title: "C", url: "https://other.com/1" },
    ];
    expect(summarizeSources(sources).independentDomains).toBe(2);
  });

  test("zero sources summarizes to all-zero, non-crashing", () => {
    const s = summarizeSources([]);
    expect(s.total).toBe(0);
    expect(s.independentDomains).toBe(0);
    expect(s.hasTierData).toBe(false);
    expect(s.hasOriginData).toBe(false);
  });
});

describe("groupSourcesByTier", () => {
  test("groups high -> med -> low -> unknown, in that order, omitting empty groups", () => {
    const sources: RailSource[] = [
      { title: "low-1", url: "https://a.com/1", tier: "low", origin: "researched" },
      { title: "high-1", url: "https://b.com/1", tier: "high", origin: "curated" },
      { title: "no-tier", url: "https://c.com/1" },
      { title: "high-2", url: "https://d.com/1", tier: "high", origin: "researched" },
    ];
    const groups = groupSourcesByTier(sources);
    expect(groups.map((g) => g.tier)).toEqual(["high", "low", "unknown"]);
    expect(groups.find((g) => g.tier === "high")!.sources.map((s) => s.title)).toEqual(["high-1", "high-2"]);
    expect(groups.find((g) => g.tier === "low")!.sources.map((s) => s.title)).toEqual(["low-1"]);
    expect(groups.find((g) => g.tier === "unknown")!.sources.map((s) => s.title)).toEqual(["no-tier"]);
  });

  test("every source with no tier lands in a single 'unknown' group (back-compat)", () => {
    const sources: RailSource[] = [
      { title: "A", url: "https://a.com/1" },
      { title: "B", url: "https://b.com/1" },
    ];
    const groups = groupSourcesByTier(sources);
    expect(groups).toEqual([{ tier: "unknown", sources }]);
  });

  test("empty input yields no groups", () => {
    expect(groupSourcesByTier([])).toEqual([]);
  });
});
