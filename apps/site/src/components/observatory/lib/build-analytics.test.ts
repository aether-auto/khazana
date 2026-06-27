import { expect, test, describe } from "vitest";
import {
  analyze,
  channelGroup,
  GROUP_COLORS,
  type AnalyticsItem,
  type AnalyticsPost,
  type AnalyticsTaste,
} from "./build-analytics.js";

// ── Deterministic fixture ────────────────────────────────────────────────
// Eight items across a few channels/groups/sources, with stable timestamps so
// weekly bins and span are reproducible. read time is derived from the body word
// count (225 wpm, floor 1) — we pad bodies to land in known minute bins.
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const body = (minutes: number) => `<p>${words(minutes * 225)}</p>`;

const item = (over: Partial<AnalyticsItem> & Pick<AnalyticsItem, "id">): AnalyticsItem => ({
  id: over.id,
  source: over.source ?? "Acme Blog",
  sourceType: over.sourceType ?? "eng-blog",
  url: over.url ?? `https://x/${over.id}`,
  title: over.title ?? `Title ${over.id}`,
  author: over.author,
  publishedAt: over.publishedAt ?? "2026-06-10T00:00:00.000Z",
  topics: over.topics ?? ["tech"],
  summary: over.summary ?? "",
  body: over.body ?? body(10),
  trustScore: over.trustScore,
  tasteScore: over.tasteScore,
  clusterId: over.clusterId,
  kind: over.kind ?? "link",
});

const items: AnalyticsItem[] = [
  item({ id: "a", topics: ["tech", "ai"], source: "Acme", author: "Ada", trustScore: 0.9, tasteScore: 5, clusterId: "c1", body: body(8) }),
  item({ id: "b", topics: ["ai"], source: "Acme", author: "Ada", trustScore: 0.8, tasteScore: 9, clusterId: "c1", body: body(15) }),
  item({ id: "c", topics: ["tech", "data-science"], source: "Beta", author: "Bo", trustScore: 0.7, tasteScore: 3, clusterId: "c2", body: body(20) }),
  item({ id: "d", topics: ["finance"], source: "Beta", trustScore: 0.6, tasteScore: 1, clusterId: "c2", body: body(4) }),
  item({ id: "e", topics: ["history"], source: "Gamma", sourceType: "news", author: "Cy", trustScore: 0.5, tasteScore: 7, clusterId: "c3", body: body(12) }),
  item({ id: "f", topics: ["history", "geopolitics"], source: "Gamma", sourceType: "news", trustScore: 0.4, tasteScore: 2, clusterId: "c3", body: body(30) }),
  item({ id: "g", topics: ["ai"], source: "Acme", sourceType: "podcast", author: "Ada", trustScore: 0.95, tasteScore: 8, clusterId: "c4", body: body(6), publishedAt: "2026-06-17T00:00:00.000Z" }),
  item({ id: "h", topics: ["tech"], source: "Delta", trustScore: 0.3, tasteScore: 4, body: body(10), publishedAt: "2026-06-17T00:00:00.000Z" }),
];

const posts: AnalyticsPost[] = [{ slug: "the-week", title: "The Week", channels: ["tech", "ai"] }];
const taste: AnalyticsTaste = { ready: true, topics: { ai: 0.9, tech: 0.5 }, entities: {}, formatAffinity: {} };

const A = analyze(items, posts, taste);

describe("channelGroup + GROUP_COLORS", () => {
  test("maps every channel to one of the known groups", () => {
    expect(channelGroup("tech")).toBe("science");
    expect(channelGroup("ai")).toBe("ai");
    expect(channelGroup("history")).toBe("world");
    expect(channelGroup("finance")).toBe("data");
    expect(channelGroup("diy")).toBe("make");
  });
  test("unknown channel falls back to a stable group, never throws", () => {
    expect(() => channelGroup("not-a-channel")).not.toThrow();
    expect(typeof channelGroup("not-a-channel")).toBe("string");
  });
  test("GROUP_COLORS has a color for every group used", () => {
    for (const g of ["world", "science", "data", "make", "ai"]) {
      expect(typeof GROUP_COLORS[g]).toBe("string");
      expect(GROUP_COLORS[g]!.length).toBeGreaterThan(0);
    }
  });
});

describe("hero", () => {
  test("produces labeled stat cards including total items", () => {
    expect(A.hero.length).toBeGreaterThanOrEqual(6);
    const total = A.hero.find((h) => /item/i.test(h.label));
    expect(total?.value).toBe("8");
  });
  test("every hero stat has a label and value", () => {
    for (const h of A.hero) {
      expect(h.label.length).toBeGreaterThan(0);
      expect(h.value.length).toBeGreaterThan(0);
    }
  });
});

describe("cooc", () => {
  test("channels list is unique and matrix is square + symmetric", () => {
    const n = A.cooc.channels.length;
    expect(new Set(A.cooc.channels).size).toBe(n);
    expect(A.cooc.matrix.length).toBe(n);
    for (const row of A.cooc.matrix) expect(row.length).toBe(n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) expect(A.cooc.matrix[i]![j]).toBe(A.cooc.matrix[j]![i]);
  });
  test("off-diagonal counts items tagged BOTH channels", () => {
    const ti = A.cooc.channels.indexOf("tech");
    const ai = A.cooc.channels.indexOf("ai");
    // item a is tagged both tech & ai -> exactly 1
    expect(A.cooc.matrix[ti]![ai]).toBe(1);
  });
  test("counts[ch] is the total items tagged ch", () => {
    expect(A.cooc.counts.ai).toBe(3); // a, b, g
    expect(A.cooc.counts.tech).toBe(3); // a, c, h
  });
});

describe("clusters", () => {
  test("one datum per clusterId, sorted size desc then taste desc", () => {
    const ids = A.clusters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("c1");
    for (let i = 1; i < A.clusters.length; i++) {
      const prev = A.clusters[i - 1]!;
      const cur = A.clusters[i]!;
      expect(prev.size > cur.size || (prev.size === cur.size && prev.taste >= cur.taste)).toBe(true);
    }
  });
  test("size, title (highest-taste item) and max taste are correct", () => {
    const c1 = A.clusters.find((c) => c.id === "c1")!;
    expect(c1.size).toBe(2);
    expect(c1.taste).toBe(9); // max of 5,9
    expect(c1.title).toBe("Title b"); // taste 9 wins
  });
});

describe("scatter", () => {
  test("one point per item with href to /item/<id> and group", () => {
    expect(A.scatter.length).toBe(8);
    const a = A.scatter.find((p) => p.id === "a")!;
    expect(a.href).toContain("/item/a");
    expect(a.trust).toBe(0.9);
    expect(a.taste).toBe(5);
    expect(a.readMin).toBeGreaterThan(0);
    expect(a.group).toBe(channelGroup(a.channel));
  });
});

describe("readDist", () => {
  test("bins cover the data and peak is a 15-centered curve scaled to max bin", () => {
    const totalBinned = A.readDist.bins.reduce((s, b) => s + b.count, 0);
    expect(totalBinned).toBe(8);
    expect(A.readDist.median).toBeGreaterThan(0);
    expect(A.readDist.mean).toBeGreaterThan(0);
    const maxBin = Math.max(...A.readDist.bins.map((b) => b.count));
    const maxPeak = Math.max(...A.readDist.peak.map((p) => p.y));
    expect(Math.abs(maxPeak - maxBin)).toBeLessThan(1e-6);
    // peak should crest near x=15
    const crest = A.readDist.peak.reduce((m, p) => (p.y > m.y ? p : m), A.readDist.peak[0]!);
    expect(Math.abs(crest.x - 15)).toBeLessThan(4);
  });
});

describe("timeSeries", () => {
  test("weekly bins keyed by ISO week-start with one numeric key per group", () => {
    expect(A.timeSeries.bins.length).toBeGreaterThan(0);
    expect(A.timeSeries.groups.length).toBeGreaterThan(0);
    const bin = A.timeSeries.bins[0]!;
    expect(typeof bin.date).toBe("string");
    for (const g of A.timeSeries.groups) expect(typeof bin[g]).toBe("number");
  });
});

describe("readBySource", () => {
  test("one row per sourceType with a five-number summary", () => {
    const types = A.readBySource.map((r) => r.sourceType);
    expect(new Set(types).size).toBe(types.length);
    for (const r of A.readBySource) {
      expect(r.min).toBeLessThanOrEqual(r.q1);
      expect(r.q1).toBeLessThanOrEqual(r.median);
      expect(r.median).toBeLessThanOrEqual(r.q3);
      expect(r.q3).toBeLessThanOrEqual(r.max);
      expect(r.values.length).toBeGreaterThan(0);
    }
  });
});

describe("treemap / sourceMix / topSources / topAuthors / topItems", () => {
  test("treemap has one entry per channel with group + avgTaste", () => {
    const chans = A.treemap.map((t) => t.channel);
    expect(new Set(chans).size).toBe(chans.length);
    const tech = A.treemap.find((t) => t.channel === "tech")!;
    expect(tech.count).toBe(3);
    expect(tech.group).toBe("science");
  });
  test("sourceMix counts items per sourceType", () => {
    const total = A.sourceMix.reduce((s, m) => s + m.count, 0);
    expect(total).toBe(8);
  });
  test("topSources ranked by count with avgTaste", () => {
    expect(A.topSources[0]!.source).toBe("Acme"); // 3 items (a, b, g)
    expect(A.topSources[0]!.count).toBe(3);
  });
  test("topAuthors skips empty authors", () => {
    expect(A.topAuthors.every((a) => a.author.length > 0)).toBe(true);
    expect(A.topAuthors[0]!.author).toBe("Ada"); // 3 items
  });
  test("topItems are the 10 highest-taste items with hrefs", () => {
    expect(A.topItems.length).toBeLessThanOrEqual(10);
    expect(A.topItems[0]!.taste).toBe(9); // item b
    expect(A.topItems[0]!.href).toContain("/item/b");
  });
});

describe("trustHist / tasteByChannel", () => {
  test("trustHist bins span 0..1 and sum to item count", () => {
    const total = A.trustHist.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(8);
  });
  test("tasteByChannel sorted by avgTaste desc with group + count", () => {
    for (let i = 1; i < A.tasteByChannel.length; i++) {
      expect(A.tasteByChannel[i - 1]!.avgTaste).toBeGreaterThanOrEqual(A.tasteByChannel[i]!.avgTaste);
    }
    const tech = A.tasteByChannel.find((t) => t.channel === "tech")!;
    expect(tech.group).toBe("science");
    expect(tech.count).toBe(3);
  });
});

describe("base href + purity + empty input", () => {
  test("scatter/topItems honor the base prefix", () => {
    const withBase = analyze(items, posts, taste, { base: "/khazana", now: new Date("2026-06-20T00:00:00Z") });
    expect(withBase.scatter[0]!.href.startsWith("/khazana/item/")).toBe(true);
    expect(withBase.topItems[0]!.href.startsWith("/khazana/item/")).toBe(true);
  });
  test("pure: same inputs -> deeply equal output, inputs not mutated", () => {
    const before = JSON.stringify(items);
    const a = analyze(items, posts, taste);
    const b = analyze(items, posts, taste);
    expect(a).toEqual(b);
    expect(JSON.stringify(items)).toBe(before);
  });
  test("empty input renders zeroes/empty arrays, never throws", () => {
    const z = analyze([], [], { ready: false, topics: {}, entities: {}, formatAffinity: {} });
    expect(z.scatter).toEqual([]);
    expect(z.clusters).toEqual([]);
    expect(z.cooc.channels).toEqual([]);
    expect(z.cooc.matrix).toEqual([]);
    expect(z.timeSeries.bins).toEqual([]);
    expect(z.readBySource).toEqual([]);
    expect(z.hero.length).toBeGreaterThan(0); // hero still renders, with zeroes
    const totalStat = z.hero.find((h) => /item/i.test(h.label));
    expect(totalStat?.value).toBe("0");
  });
});
