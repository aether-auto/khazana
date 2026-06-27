import { expect, test, describe } from "vitest";
import {
  buildSources,
  type SourcesItem,
  type SourcesEntry,
} from "./build-sources.js";

// ── Deterministic fixture ────────────────────────────────────────────────
// A small registry + a curated feed that joins to it by `item.source === entry.id`.
// Stable timestamps so lastPublished / recentItems sort reproducibly. read time is
// derived from the body word count (225 wpm, floor 1); we pad bodies to known mins.
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const body = (minutes: number) => `<p>${words(minutes * 225)}</p>`;

const entry = (over: Partial<SourcesEntry> & Pick<SourcesEntry, "id">): SourcesEntry => ({
  id: over.id,
  type: over.type ?? "rss",
  url: over.url ?? `https://www.${over.id}.com/feed`,
  channels: over.channels ?? ["tech"],
  enabled: over.enabled ?? true,
  trustScore: over.trustScore ?? 0.5,
  addedBy: over.addedBy ?? "seed",
  failureCount: over.failureCount ?? 0,
  notes: over.notes,
});

const item = (over: Partial<SourcesItem> & Pick<SourcesItem, "id" | "source">): SourcesItem => ({
  id: over.id,
  source: over.source,
  sourceType: over.sourceType ?? "rss",
  url: over.url ?? `https://x/${over.id}`,
  title: over.title ?? `Title ${over.id}`,
  publishedAt: over.publishedAt ?? "2026-06-10T00:00:00.000Z",
  topics: over.topics ?? ["tech"],
  trustScore: over.trustScore,
  tasteScore: over.tasteScore,
  body: over.body ?? body(10),
  kind: over.kind ?? "link",
});

const sources: SourcesEntry[] = [
  // producing — has items
  entry({ id: "acme", type: "eng-blog", trustScore: 0.9, channels: ["tech", "ai"] }),
  // producing — has items, lower trust
  entry({ id: "beta", type: "rss", trustScore: 0.7, channels: ["science"] }),
  // dormant — enabled, no items, no failures
  entry({ id: "dorm", type: "arxiv", trustScore: 0.6, channels: ["science"] }),
  // failing — enabled, no items, failureCount > 0
  entry({ id: "fail", type: "news", trustScore: 0.4, channels: ["history"], failureCount: 3 }),
  // disabled — enabled false (even though it has items)
  entry({ id: "dis", type: "podcast", trustScore: 0.8, channels: ["ai"], enabled: false }),
];

const items: SourcesItem[] = [
  item({ id: "a1", source: "acme", topics: ["tech", "ai"], tasteScore: 5, body: body(8), publishedAt: "2026-06-10T00:00:00.000Z" }),
  item({ id: "a2", source: "acme", topics: ["ai"], tasteScore: 9, body: body(12), publishedAt: "2026-06-15T00:00:00.000Z" }),
  item({ id: "a3", source: "acme", topics: ["tech"], tasteScore: 3, body: body(20), publishedAt: "2026-06-12T00:00:00.000Z" }),
  item({ id: "b1", source: "beta", topics: ["science"], tasteScore: 7, body: body(10), publishedAt: "2026-06-11T00:00:00.000Z" }),
  item({ id: "d1", source: "dis", topics: ["ai"], tasteScore: 4, body: body(6), publishedAt: "2026-06-09T00:00:00.000Z" }),
  // orphan: source id matches nothing in the registry — must be ignored gracefully
  item({ id: "o1", source: "ghost", topics: ["tech"], tasteScore: 2, body: body(5) }),
];

const pending: SourcesEntry[] = [
  entry({ id: "cand1", type: "rss", addedBy: "scout", trustScore: 0.55 }),
  entry({ id: "cand2", type: "youtube", addedBy: "scout", trustScore: 0.45 }),
];

const D = buildSources(sources, items, pending);

describe("enriched sources", () => {
  test("one enriched record per registry source (orphans ignored)", () => {
    expect(D.sources.length).toBe(sources.length);
    expect(D.sources.map((s) => s.id).sort()).toEqual(["acme", "beta", "dis", "dorm", "fail"]);
  });

  test("host is the url hostname without leading www.", () => {
    const acme = D.sources.find((s) => s.id === "acme")!;
    expect(acme.host).toBe("acme.com");
  });

  test("itemCount joins curated items by id", () => {
    expect(D.sources.find((s) => s.id === "acme")!.itemCount).toBe(3);
    expect(D.sources.find((s) => s.id === "beta")!.itemCount).toBe(1);
    expect(D.sources.find((s) => s.id === "dorm")!.itemCount).toBe(0);
  });

  test("avgReadMin and avgTaste are 0 when itemCount === 0", () => {
    const dorm = D.sources.find((s) => s.id === "dorm")!;
    expect(dorm.avgReadMin).toBe(0);
    expect(dorm.avgTaste).toBe(0);
    const acme = D.sources.find((s) => s.id === "acme")!;
    expect(acme.avgReadMin).toBeGreaterThan(0);
    expect(acme.avgTaste).toBeGreaterThan(0);
  });

  test("lastPublished is the max publishedAt among its items, else null", () => {
    expect(D.sources.find((s) => s.id === "acme")!.lastPublished).toBe("2026-06-15T00:00:00.000Z");
    expect(D.sources.find((s) => s.id === "dorm")!.lastPublished).toBeNull();
  });

  test("producedChannels are the item topics by freq desc", () => {
    const acme = D.sources.find((s) => s.id === "acme")!;
    // tech appears on a1,a3 (2); ai on a1,a2 (2) — both 2, stable order
    expect(acme.producedChannels).toContain("tech");
    expect(acme.producedChannels).toContain("ai");
  });

  test("recentItems are top 5 by publishedAt desc with /item/<id> hrefs", () => {
    const acme = D.sources.find((s) => s.id === "acme")!;
    expect(acme.recentItems.length).toBe(3);
    expect(acme.recentItems[0]!.id).toBe("a2"); // newest
    expect(acme.recentItems[0]!.href).toContain("/item/a2");
    expect(acme.recentItems.map((r) => r.id)).toEqual(["a2", "a3", "a1"]);
  });

  test("recentItems caps at 5", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      item({ id: `m${i}`, source: "mass", publishedAt: `2026-06-${10 + i}T00:00:00.000Z` }),
    );
    const out = buildSources([entry({ id: "mass" })], many, []);
    expect(out.sources[0]!.recentItems.length).toBe(5);
  });

  test("status: disabled / failing / producing / dormant", () => {
    expect(D.sources.find((s) => s.id === "dis")!.status).toBe("disabled");
    expect(D.sources.find((s) => s.id === "fail")!.status).toBe("failing");
    expect(D.sources.find((s) => s.id === "acme")!.status).toBe("producing");
    expect(D.sources.find((s) => s.id === "dorm")!.status).toBe("dormant");
  });

  test("notes normalize to string | null", () => {
    expect(D.sources.find((s) => s.id === "acme")!.notes).toBeNull();
    const withNote = buildSources([entry({ id: "n", notes: "hi" })], [], []);
    expect(withNote.sources[0]!.notes).toBe("hi");
  });

  test("default sort: trustScore desc, then id asc", () => {
    const ids = D.sources.map((s) => s.id);
    // trust: acme .9, dis .8, beta .7, dorm .6, fail .4
    expect(ids).toEqual(["acme", "dis", "beta", "dorm", "fail"]);
  });
});

describe("facets", () => {
  test("type facet counts every registry source by type, count desc", () => {
    const total = D.facets.type.reduce((s, f) => s + f.count, 0);
    expect(total).toBe(sources.length);
    for (let i = 1; i < D.facets.type.length; i++) {
      expect(D.facets.type[i - 1]!.count).toBeGreaterThanOrEqual(D.facets.type[i]!.count);
    }
  });

  test("channel facet counts declared channels (a source per channel it serves)", () => {
    const tech = D.facets.channel.find((f) => f.value === "tech")!;
    expect(tech.count).toBe(1); // only acme declares tech
    const science = D.facets.channel.find((f) => f.value === "science")!;
    expect(science.count).toBe(2); // beta + dorm
  });

  test("status facet covers the four statuses", () => {
    const byVal = Object.fromEntries(D.facets.status.map((f) => [f.value, f.count]));
    expect(byVal.producing).toBe(2);
    expect(byVal.dormant).toBe(1);
    expect(byVal.failing).toBe(1);
    expect(byVal.disabled).toBe(1);
  });

  test("provenance facet counts addedBy", () => {
    const byVal = Object.fromEntries(D.facets.provenance.map((f) => [f.value, f.count]));
    expect(byVal.seed).toBe(5);
  });
});

describe("health", () => {
  test("totals reflect the registry + statuses + candidates", () => {
    expect(D.health.total).toBe(5);
    expect(D.health.enabled).toBe(4);
    expect(D.health.disabled).toBe(1);
    expect(D.health.producing).toBe(2);
    expect(D.health.dormant).toBe(1);
    expect(D.health.failing).toBe(1);
    expect(D.health.candidates).toBe(2);
  });

  test("avgTrust is the mean trustScore across the registry", () => {
    const mean = sources.reduce((s, e) => s + e.trustScore, 0) / sources.length;
    expect(D.health.avgTrust).toBeCloseTo(mean, 5);
  });

  test("byType is the type facet (count desc)", () => {
    expect(D.health.byType).toEqual(D.facets.type);
  });
});

describe("base href + purity + empty input", () => {
  test("recentItems honor the base prefix", () => {
    const withBase = buildSources(sources, items, pending, { base: "/khazana" });
    const acme = withBase.sources.find((s) => s.id === "acme")!;
    expect(acme.recentItems[0]!.href.startsWith("/khazana/item/")).toBe(true);
  });

  test("pure: same inputs -> deeply equal output, inputs not mutated", () => {
    const before = JSON.stringify({ sources, items, pending });
    const a = buildSources(sources, items, pending);
    const b = buildSources(sources, items, pending);
    expect(a).toEqual(b);
    expect(JSON.stringify({ sources, items, pending })).toBe(before);
  });

  test("empty input returns zeroed structures, never throws", () => {
    const z = buildSources([], [], []);
    expect(z.sources).toEqual([]);
    expect(z.facets.type).toEqual([]);
    expect(z.facets.channel).toEqual([]);
    expect(z.facets.status).toEqual([]);
    expect(z.facets.provenance).toEqual([]);
    expect(z.health.total).toBe(0);
    expect(z.health.enabled).toBe(0);
    expect(z.health.candidates).toBe(0);
    expect(z.health.avgTrust).toBe(0);
    expect(z.health.byType).toEqual([]);
  });
});
