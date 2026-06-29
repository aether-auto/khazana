import { expect, test, describe } from "vitest";
import { buildReadsIndex, type ReadInput } from "./build-reads.js";
import { FORMAT_NAMES } from "@khazana/core";

// ── Deterministic fixtures ────────────────────────────────────────────────
// Bodies are padded to a known prose word count so read-time is reproducible.
// estimateReadMinutes uses 230 wpm, floor 1; `prose(min)` ≈ that many minutes.
const proseOf = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const body = (minutes: number) => proseOf(minutes * 230);

const read = (over: Partial<ReadInput> & Pick<ReadInput, "slug">): ReadInput => ({
  slug: over.slug,
  title: over.title ?? `Title ${over.slug}`,
  format: over.format ?? "dispatch",
  channels: over.channels ?? ["tech"],
  summary: over.summary ?? `Summary ${over.slug}`,
  publishedAt: over.publishedAt ?? "2026-06-10T09:00:00.000Z",
  body: over.body ?? body(5),
  sourceCount: over.sourceCount ?? 2,
});

// Four reads with distinct dates so newest-first is unambiguous.
const reads: ReadInput[] = [
  read({ slug: "bloom", format: "teardown", channels: ["tech", "data-science"], publishedAt: "2026-06-25T09:00:00.000Z", body: body(8), sourceCount: 5 }),
  read({ slug: "ruin", format: "dispatch", channels: ["finance", "data-science"], publishedAt: "2026-06-24T09:00:00.000Z", body: body(6), sourceCount: 2 }),
  read({ slug: "carrington", format: "chronicle", channels: ["science", "history"], publishedAt: "2026-06-27T09:00:00.000Z", body: body(12), sourceCount: 7 }),
  read({ slug: "benford", format: "primer", channels: ["data-science", "science"], publishedAt: "2026-06-26T09:00:00.000Z", body: body(7), sourceCount: 5 }),
];

describe("buildReadsIndex — ordering & featured split", () => {
  test("featured is the single most-recent read", () => {
    const { featured } = buildReadsIndex(reads);
    expect(featured?.slug).toBe("carrington"); // 06-27 is newest
  });

  test("gallery is newest-first and EXCLUDES the featured read", () => {
    const { gallery } = buildReadsIndex(reads);
    expect(gallery.map((c) => c.slug)).toEqual(["benford", "bloom", "ruin"]);
  });

  test("View-Transition contract: featured slug never appears in the gallery", () => {
    const { featured, gallery } = buildReadsIndex(reads);
    expect(gallery.some((c) => c.slug === featured?.slug)).toBe(false);
  });

  test("featured + gallery together cover every read exactly once", () => {
    const { featured, gallery } = buildReadsIndex(reads);
    const all = [featured!.slug, ...gallery.map((c) => c.slug)].sort();
    expect(all).toEqual(["benford", "bloom", "carrington", "ruin"]);
  });

  test("equal timestamps tiebreak by slug for stable ordering", () => {
    const same = "2026-06-20T00:00:00.000Z";
    const { featured, gallery } = buildReadsIndex([
      read({ slug: "zeta", publishedAt: same }),
      read({ slug: "alpha", publishedAt: same }),
    ]);
    expect(featured?.slug).toBe("alpha"); // alpha < zeta
    expect(gallery.map((c) => c.slug)).toEqual(["zeta"]);
  });
});

describe("buildReadsIndex — read-time", () => {
  test("read-time matches the slug-page strip-then-count logic", () => {
    // 12*230 prose words at 230 wpm → 12 min.
    const { featured } = buildReadsIndex([read({ slug: "carrington", body: body(12) })]);
    expect(featured?.readMin).toBe(12);
  });

  test("strips import lines, code fences, JSX tags and {expressions} before counting", () => {
    const mdx = [
      'import Chart from "../Chart.astro";',
      "```js",
      proseOf(1000), // inside a fence — must NOT count
      "```",
      "<Chart data={foo} />", // tag + expression — must NOT count
      proseOf(230), // the only real prose: 230 words → 1 min
    ].join("\n");
    const { featured } = buildReadsIndex([read({ slug: "x", body: mdx })]);
    expect(featured?.readMin).toBe(1);
  });

  test("empty body floors to 1 minute (never 0)", () => {
    const { featured } = buildReadsIndex([read({ slug: "x", body: "" })]);
    expect(featured?.readMin).toBe(1);
  });
});

describe("buildReadsIndex — facets (whole-collection: a chip's count = reads it reveals, hero + gallery)", () => {
  test("formatFacet honors the canonical FORMAT_NAMES order, over the WHOLE collection", () => {
    const { formatFacet } = buildReadsIndex(reads, { formatOrder: FORMAT_NAMES });
    // All 4 reads count: carrington(chronicle, the FEATURED read) is a filter
    // target too (the hero dims/hides), so chronicle MUST appear with count 1.
    expect(formatFacet).toEqual([
      { value: "chronicle", count: 1 },
      { value: "dispatch", count: 1 },
      { value: "teardown", count: 1 },
      { value: "primer", count: 1 },
    ]);
  });

  test("channelFacet counts channels across the WHOLE collection, count desc then value asc", () => {
    const { channelFacet } = buildReadsIndex(reads);
    // All reads: benford[ds,sci] + bloom[tech,ds] + ruin[finance,ds] +
    // carrington[sci,history] → data-science×3, science×2, then finance/history/tech ×1.
    expect(channelFacet[0]).toEqual({ value: "data-science", count: 3 });
    expect(channelFacet[1]).toEqual({ value: "science", count: 2 });
    const rest = channelFacet.slice(2);
    expect(rest).toEqual([
      { value: "finance", count: 1 },
      { value: "history", count: 1 },
      { value: "tech", count: 1 },
    ]);
  });

  test("each facet count equals the number of reads (featured + gallery) that match it", () => {
    const { featured, gallery, formatFacet, channelFacet } = buildReadsIndex(reads, { formatOrder: FORMAT_NAMES });
    const all = [featured!, ...gallery];
    for (const f of formatFacet) {
      expect(f.count).toBe(all.filter((c) => c.format === f.value).length);
    }
    for (const c of channelFacet) {
      expect(c.count).toBe(all.filter((g) => g.channels.includes(c.value)).length);
    }
  });

  test("the featured read's format/channels ARE represented in the facets", () => {
    const { featured, formatFacet, channelFacet } = buildReadsIndex(reads, { formatOrder: FORMAT_NAMES });
    expect(formatFacet.some((f) => f.value === featured!.format)).toBe(true);
    for (const ch of featured!.channels) {
      expect(channelFacet.some((c) => c.value === ch)).toBe(true);
    }
  });
});

describe("buildReadsIndex — stats", () => {
  test("editorial stats sum across every read", () => {
    const { stats } = buildReadsIndex(reads, { formatOrder: FORMAT_NAMES });
    expect(stats.total).toBe(4);
    expect(stats.totalMinutes).toBe(8 + 6 + 12 + 7); // 33
    expect(stats.formats).toBe(4); // teardown, dispatch, chronicle, primer
    expect(stats.channels).toBe(5); // tech, data-science, finance, science, history
    expect(stats.sources).toBe(5 + 2 + 7 + 5); // 19
  });
});

describe("buildReadsIndex — base + href + edge cases", () => {
  test("href is base-prefixed and trailing-slash-normalized", () => {
    const { featured } = buildReadsIndex([read({ slug: "x" })], { base: "/khazana/" });
    expect(featured?.href).toBe("/khazana/reads/x");
  });

  test("empty base yields a root-relative href", () => {
    const { featured } = buildReadsIndex([read({ slug: "x" })]);
    expect(featured?.href).toBe("/reads/x");
  });

  test("zero reads → null featured, empty gallery, zeroed stats", () => {
    const out = buildReadsIndex([]);
    expect(out.featured).toBeNull();
    expect(out.gallery).toEqual([]);
    expect(out.formatFacet).toEqual([]);
    expect(out.channelFacet).toEqual([]);
    expect(out.stats).toEqual({ total: 0, totalMinutes: 0, formats: 0, channels: 0, sources: 0 });
  });

  test("single read → it is featured, gallery empty", () => {
    const out = buildReadsIndex([read({ slug: "only" })]);
    expect(out.featured?.slug).toBe("only");
    expect(out.gallery).toEqual([]);
    expect(out.stats.total).toBe(1);
  });

  test("dateLabel is the YYYY-MM-DD prefix of the ISO timestamp", () => {
    const { featured } = buildReadsIndex([read({ slug: "x", publishedAt: "2026-06-27T09:00:00.000Z" })]);
    expect(featured?.dateLabel).toBe("2026-06-27");
  });
});
