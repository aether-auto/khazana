import { describe, expect, test } from "vitest";
import { FORMAT_NAMES } from "@khazana/core";
import { compareReads, sortReads, isReadsSortKey, READS_SORT_KEYS, READS_SORT_DEFAULT } from "./sort-reads.js";
import type { ReadCardData } from "./build-reads.js";

const card = (over: Partial<ReadCardData> & Pick<ReadCardData, "slug">): ReadCardData => ({
  slug: over.slug,
  title: over.title ?? `Title ${over.slug}`,
  format: over.format ?? "dispatch",
  channels: over.channels ?? ["tech"],
  summary: over.summary ?? "summary",
  publishedAt: over.publishedAt ?? "2026-06-10T09:00:00.000Z",
  dateLabel: over.dateLabel ?? "2026-06-10",
  readMin: over.readMin ?? 5,
  sourceCount: over.sourceCount ?? 2,
  href: over.href ?? `/reads/${over.slug}`,
  excerpt: over.excerpt ?? "an excerpt",
});

const cards: ReadCardData[] = [
  card({ slug: "bloom", format: "teardown", publishedAt: "2026-06-25T09:00:00.000Z", readMin: 8 }),
  card({ slug: "ruin", format: "dispatch", publishedAt: "2026-06-24T09:00:00.000Z", readMin: 6 }),
  card({ slug: "carrington", format: "chronicle", publishedAt: "2026-06-27T09:00:00.000Z", readMin: 22 }),
  card({ slug: "benford", format: "primer", publishedAt: "2026-06-26T09:00:00.000Z", readMin: 7 }),
];

describe("READS_SORT_KEYS / isReadsSortKey", () => {
  test("newest is the default sort key", () => {
    expect(READS_SORT_DEFAULT).toBe("newest");
  });

  test("recognizes exactly the three sort keys", () => {
    expect(READS_SORT_KEYS).toEqual(["newest", "longest", "format"]);
    expect(isReadsSortKey("newest")).toBe(true);
    expect(isReadsSortKey("longest")).toBe(true);
    expect(isReadsSortKey("format")).toBe(true);
    expect(isReadsSortKey("shortest")).toBe(false);
    expect(isReadsSortKey("")).toBe(false);
  });
});

describe("sortReads — newest", () => {
  test("orders newest publishedAt first (matches buildReadsIndex's SSR order)", () => {
    expect(sortReads(cards, "newest").map((c) => c.slug)).toEqual([
      "carrington",
      "benford",
      "bloom",
      "ruin",
    ]);
  });

  test("equal timestamps tiebreak by slug ascending, deterministically", () => {
    const same = "2026-06-20T00:00:00.000Z";
    const out = sortReads([card({ slug: "zeta", publishedAt: same }), card({ slug: "alpha", publishedAt: same })], "newest");
    expect(out.map((c) => c.slug)).toEqual(["alpha", "zeta"]);
  });
});

describe("sortReads — longest", () => {
  test("orders by readMin descending", () => {
    expect(sortReads(cards, "longest").map((c) => c.slug)).toEqual([
      "carrington",
      "bloom",
      "benford",
      "ruin",
    ]);
  });

  test("ties on readMin fall back to newest-first", () => {
    const out = sortReads(
      [
        card({ slug: "old", readMin: 5, publishedAt: "2026-01-01T00:00:00.000Z" }),
        card({ slug: "new", readMin: 5, publishedAt: "2026-02-01T00:00:00.000Z" }),
      ],
      "longest",
    );
    expect(out.map((c) => c.slug)).toEqual(["new", "old"]);
  });
});

describe("sortReads — format", () => {
  test("orders by the canonical FORMAT_NAMES sequence", () => {
    const out = sortReads(cards, "format", FORMAT_NAMES).map((c) => c.format);
    // chronicle < dispatch < teardown < primer in FORMAT_NAMES order.
    const ranks = out.map((f) => FORMAT_NAMES.indexOf(f as (typeof FORMAT_NAMES)[number]));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  test("formats outside the provided order sort after every listed format", () => {
    const out = sortReads(
      [card({ slug: "x", format: "mystery-format" }), card({ slug: "y", format: "dispatch" })],
      "format",
      FORMAT_NAMES,
    );
    expect(out.map((c) => c.slug)).toEqual(["y", "x"]);
  });

  test("within the same format, ties fall back to newest-first", () => {
    const out = sortReads(
      [
        card({ slug: "old", format: "dispatch", publishedAt: "2026-01-01T00:00:00.000Z" }),
        card({ slug: "new", format: "dispatch", publishedAt: "2026-02-01T00:00:00.000Z" }),
      ],
      "format",
      FORMAT_NAMES,
    );
    expect(out.map((c) => c.slug)).toEqual(["new", "old"]);
  });

  test("empty formatOrder still produces a stable, deterministic order (all rank equally)", () => {
    const out = sortReads(cards, "format", []);
    expect(out.map((c) => c.slug)).toEqual(sortReads(cards, "newest").map((c) => c.slug));
  });
});

describe("sortReads — purity", () => {
  test("never mutates the input array", () => {
    const copy = [...cards];
    sortReads(cards, "longest");
    expect(cards).toEqual(copy);
  });
});

describe("compareReads", () => {
  test("is a valid comparator usable directly with Array.prototype.sort", () => {
    const a = card({ slug: "a", readMin: 3 });
    const b = card({ slug: "b", readMin: 9 });
    expect(compareReads(a, b, "longest")).toBeGreaterThan(0);
    expect(compareReads(b, a, "longest")).toBeLessThan(0);
  });
});
