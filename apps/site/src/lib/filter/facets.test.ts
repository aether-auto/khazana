import { describe, expect, test } from "vitest";
import { filterItems, matchesFacet } from "./facets.js";
import { applyFacetVisibility } from "./visibility.js";

describe("matchesFacet", () => {
  test("empty active array shows everything, regardless of item value", () => {
    expect(matchesFacet("ai", [])).toBe(true);
    expect(matchesFacet(["ai", "tech"], [])).toBe(true);
    expect(matchesFacet("", [])).toBe(true);
    expect(matchesFacet([], [])).toBe(true);
  });

  test("empty active Set shows everything too", () => {
    expect(matchesFacet("ai", new Set())).toBe(true);
    expect(matchesFacet(["ai"], new Set())).toBe(true);
  });

  test("single-value item matches when present in active selection", () => {
    expect(matchesFacet("ai", ["ai"])).toBe(true);
    expect(matchesFacet("ai", ["tech", "ai"])).toBe(true);
  });

  test("single-value item does not match when absent from active selection", () => {
    expect(matchesFacet("ai", ["tech"])).toBe(false);
  });

  test("multi-value item matches on ANY overlap (OR-within-facet, Feed/Workshop semantics)", () => {
    expect(matchesFacet(["ai", "quantum"], ["tech", "quantum"])).toBe(true);
  });

  test("multi-value item with no overlap does not match", () => {
    expect(matchesFacet(["ai", "quantum"], ["tech", "finance"])).toBe(false);
  });

  test("an item with no facet value at all never satisfies a specific (non-empty) filter", () => {
    expect(matchesFacet([], ["ai"])).toBe(false);
    expect(matchesFacet("", ["ai"])).toBe(false);
  });

  test("multi-select: item matching more than one active value still matches once", () => {
    expect(matchesFacet(["ai", "tech"], ["ai", "tech"])).toBe(true);
  });

  test("works with a Set as the active selection (SourcesExplorer facet shape)", () => {
    const active = new Set(["reddit", "hn"]);
    expect(matchesFacet("hn", active)).toBe(true);
    expect(matchesFacet("rss", active)).toBe(false);
    // a multi-value facet (e.g. a source's declared channels) against a Set
    expect(matchesFacet(["ai", "finance"], new Set(["finance"]))).toBe(true);
  });

  test("AND-across-facets composition matches ReadsFilter's two-facet intersection", () => {
    // A fully-tagged card: format "primer", channels ["ai", "tech"].
    const cardMatches = (format: string, channels: string[], fmtSel: string, chanSel: string) =>
      matchesFacet(format, fmtSel ? [fmtSel] : []) &&
      matchesFacet(channels, chanSel ? [chanSel] : []);

    // "all" / "all" always shows it.
    expect(cardMatches("primer", ["ai", "tech"], "", "")).toBe(true);
    // format matches, channel unfiltered.
    expect(cardMatches("primer", ["ai", "tech"], "primer", "")).toBe(true);
    // format mismatches.
    expect(cardMatches("primer", ["ai", "tech"], "dispatch", "")).toBe(false);
    // channel matches, format unfiltered.
    expect(cardMatches("primer", ["ai", "tech"], "", "tech")).toBe(true);
    // both must hold (AND across facets).
    expect(cardMatches("primer", ["ai", "tech"], "primer", "finance")).toBe(false);
    // a card with no facet metadata at all never satisfies a specific selection,
    // but is shown under "all"/"all" — matches the original ReadsFilter's
    // untagged-card guard without needing a separate `tagged` flag.
    expect(cardMatches("", [], "", "")).toBe(true);
    expect(cardMatches("", [], "", "tech")).toBe(false);
    expect(cardMatches("", [], "primer", "")).toBe(false);
  });
});

describe("filterItems", () => {
  interface Item {
    id: string;
    topics: string[];
  }
  const items: Item[] = [
    { id: "a", topics: ["ai", "tech"] },
    { id: "b", topics: ["finance"] },
    { id: "c", topics: [] },
  ];

  test("empty active selection returns every item (Feed register default)", () => {
    expect(filterItems(items, (it) => it.topics, [])).toEqual(items);
  });

  test("non-empty active selection filters via OR-within-facet", () => {
    const result = filterItems(items, (it) => it.topics, ["finance"]);
    expect(result.map((i) => i.id)).toEqual(["b"]);
  });

  test("an item with no topics never matches a specific filter", () => {
    const result = filterItems(items, (it) => it.topics, ["ai", "finance"]);
    expect(result.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("applyFacetVisibility", () => {
  interface FakeEl {
    hidden: boolean;
    channels: string[];
  }
  const makeEl = (channels: string[]): FakeEl => ({ hidden: false, channels });

  test("hides elements that don't match and returns the shown count", () => {
    const els = [makeEl(["ai"]), makeEl(["finance"]), makeEl(["ai", "tech"])];
    const shown = applyFacetVisibility(els, (el) => el.channels, ["ai"]);
    expect(shown).toBe(2);
    expect(els.map((e) => e.hidden)).toEqual([false, true, false]);
  });

  test("empty active selection shows every element", () => {
    const els = [makeEl(["ai"]), makeEl([])];
    els[1]!.hidden = true; // previously hidden by a prior filter pass
    const shown = applyFacetVisibility(els, (el) => el.channels, []);
    expect(shown).toBe(2);
    expect(els.every((e) => !e.hidden)).toBe(true);
  });

  test("supports a single-value getValue for single-facet rows (Feed browse rows)", () => {
    interface Row {
      hidden: boolean;
      channel: string;
    }
    const rows: Row[] = [{ hidden: false, channel: "ai" }, { hidden: false, channel: "finance" }];
    const shown = applyFacetVisibility(rows, (r) => r.channel, ["finance"]);
    expect(shown).toBe(1);
    expect(rows.map((r) => r.hidden)).toEqual([true, false]);
  });
});
