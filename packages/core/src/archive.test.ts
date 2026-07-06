import { describe, it, expect } from "vitest";
import { FeedItemSchema, type FeedItem } from "./feed-item.js";
import { mergeIntoArchive, toArchiveItem, ARCHIVE_WINDOW_DAYS } from "./archive.js";

const NOW = "2026-07-20T00:00:00.000Z";

/** A full FeedItem (with body + author) to prove the archive PROJECTS it down. */
function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "id1",
    source: "s",
    sourceType: "rss",
    url: "https://e.com/a",
    title: "A",
    author: "someone",
    publishedAt: "2026-07-15T00:00:00.000Z",
    fetchedAt: "2026-07-15T00:00:00.000Z",
    topics: ["tech"],
    entities: ["Foo"],
    summary: "a short summary",
    body: "<p>the full body that must NOT be stored in the archive</p>",
    media: [],
    kind: "link",
    tasteScore: 0.5,
    trustScore: 0.9,
    clusterId: "c1",
    ...over,
  };
}

describe("mergeIntoArchive", () => {
  it("exposes a 14-day default window", () => {
    expect(ARCHIVE_WINDOW_DAYS).toBe(14);
  });

  it("empty inputs produce an empty archive", () => {
    expect(mergeIntoArchive([], [], NOW)).toEqual([]);
  });

  it("adds fresh items and keeps only those within the window (by publishedAt)", () => {
    const fresh = [
      item({ id: "fresh", publishedAt: "2026-07-19T00:00:00.000Z" }), // age 1 → kept
      item({ id: "edge", publishedAt: "2026-07-06T12:00:00.000Z" }), // ~13.5d → kept
      item({ id: "old", publishedAt: "2026-07-01T00:00:00.000Z" }), // 19d → dropped
    ];
    const ids = mergeIntoArchive([], fresh, NOW).map((i) => i.id);
    expect(ids).toContain("fresh");
    expect(ids).toContain("edge");
    expect(ids).not.toContain("old");
  });

  it("dedupes by id and lets the FRESH item win on conflict (e.g. updated tasteScore)", () => {
    const existing = [item({ id: "dup", tasteScore: 0.1, title: "stale" })];
    const fresh = [item({ id: "dup", tasteScore: 0.9, title: "updated" })];
    const out = mergeIntoArchive(existing, fresh, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.tasteScore).toBe(0.9);
    expect(out[0]!.title).toBe("updated");
  });

  it("unions existing archive with fresh, keeping archive-only items still in window", () => {
    const existing = [item({ id: "archived", publishedAt: "2026-07-17T00:00:00.000Z" })];
    const fresh = [item({ id: "new", publishedAt: "2026-07-19T00:00:00.000Z" })];
    const ids = mergeIntoArchive(existing, fresh, NOW).map((i) => i.id);
    expect(ids.sort()).toEqual(["archived", "new"]);
  });

  it("ages out an existing archive item that has now fallen outside the window", () => {
    const existing = [item({ id: "expired", publishedAt: "2026-06-01T00:00:00.000Z" })];
    expect(mergeIntoArchive(existing, [], NOW)).toEqual([]);
  });

  it("sorts newest-first by publishedAt", () => {
    const fresh = [
      item({ id: "mid", publishedAt: "2026-07-12T00:00:00.000Z" }),
      item({ id: "newest", publishedAt: "2026-07-19T00:00:00.000Z" }),
      item({ id: "older", publishedAt: "2026-07-08T00:00:00.000Z" }),
    ];
    expect(mergeIntoArchive([], fresh, NOW).map((i) => i.id)).toEqual(["newest", "mid", "older"]);
  });

  it("teaser-trims summaries and DROPS the full body (small committed file)", () => {
    const huge = "sentence ".repeat(5000); // ~45k chars
    const out = mergeIntoArchive([], [item({ id: "big", summary: huge })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.summary.length).toBeLessThanOrEqual(281);
    expect(out[0]!.summary.endsWith("…")).toBe(true);
    expect(out[0]!.body).toBeUndefined();
  });

  it("falls back to fetchedAt for aging when publishedAt is unparseable", () => {
    const good = item({ id: "byfetched", publishedAt: "not-a-date", fetchedAt: "2026-07-18T00:00:00.000Z" });
    const stale = item({ id: "stalefetched", publishedAt: "not-a-date", fetchedAt: "2026-06-01T00:00:00.000Z" });
    const ids = mergeIntoArchive([], [good, stale], NOW).map((i) => i.id);
    expect(ids).toEqual(["byfetched"]);
  });

  it("drops items with neither a parseable publishedAt nor fetchedAt", () => {
    const undatable = item({ id: "nodate", publishedAt: "nope", fetchedAt: "also-nope" });
    expect(mergeIntoArchive([], [undatable], NOW)).toEqual([]);
  });

  it("fails open on aging when now is unparseable (keeps every datable item)", () => {
    const fresh = [
      item({ id: "a", publishedAt: "2020-01-01T00:00:00.000Z" }),
      item({ id: "b", publishedAt: "2026-07-19T00:00:00.000Z" }),
    ];
    expect(mergeIntoArchive([], fresh, "garbage").map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("every merged item still satisfies FeedItemSchema", () => {
    const out = mergeIntoArchive([], [item({ id: "x" })], NOW);
    for (const it of out) {
      expect(FeedItemSchema.safeParse(it).success).toBe(true);
    }
  });
});

describe("toArchiveItem", () => {
  it("keeps only display fields and omits optional scores when absent", () => {
    const minimal: FeedItem = {
      id: "m",
      source: "s",
      sourceType: "rss",
      url: "https://e.com/a",
      title: "A",
      publishedAt: "2026-07-15T00:00:00.000Z",
      fetchedAt: "2026-07-15T00:00:00.000Z",
      topics: [],
      entities: [],
      summary: "",
      media: [],
      kind: "link",
    };
    const out = toArchiveItem(minimal);
    expect(out.body).toBeUndefined();
    expect("author" in out).toBe(false);
    expect(out.tasteScore).toBeUndefined();
    expect(FeedItemSchema.safeParse(out).success).toBe(true);
  });
});
