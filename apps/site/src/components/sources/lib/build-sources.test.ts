import { expect, test, describe } from "vitest";
import {
  buildSources,
  assessTrust,
  type SourcesItem,
  type SourcesEntry,
  type EnrichedSource,
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

// ── deferred (Actions-only) status ────────────────────────────────────────
// YouTube is disabled LOCALLY (its ingestion only runs in GitHub Actions, where
// this IP is not blocked). Those sources are cloud-gated, not dead — "deferred",
// not "disabled". Other disabled types remain plainly "disabled".
describe("deferred status (Actions-only types)", () => {
  test("a disabled youtube source is deferred, not disabled", () => {
    const out = buildSources(
      [entry({ id: "yt", type: "youtube", enabled: false })],
      [],
      [],
    );
    expect(out.sources[0]!.status).toBe("deferred");
  });

  test("a disabled non-youtube source stays disabled", () => {
    const out = buildSources(
      [entry({ id: "pod", type: "podcast", enabled: false })],
      [],
      [],
    );
    expect(out.sources[0]!.status).toBe("disabled");
  });

  test("an ENABLED youtube source is not forced to deferred", () => {
    // deferred is only the off-but-cloud-gated state; an enabled youtube with
    // items still produces, an enabled one with none is dormant.
    const dormantYt = buildSources([entry({ id: "yt", type: "youtube" })], [], []);
    expect(dormantYt.sources[0]!.status).toBe("dormant");
    const failingYt = buildSources(
      [entry({ id: "yt", type: "youtube", failureCount: 2 })],
      [],
      [],
    );
    expect(failingYt.sources[0]!.status).toBe("failing");
  });

  test("status facet includes deferred in canonical order", () => {
    const out = buildSources(
      [
        entry({ id: "p", type: "rss" }), // producing? no items -> dormant
        entry({ id: "yt1", type: "youtube", enabled: false }),
        entry({ id: "yt2", type: "youtube", enabled: false }),
        entry({ id: "off", type: "rss", enabled: false }),
      ],
      [item({ id: "i1", source: "p" })],
      [],
    );
    const order = out.facets.status.map((f) => f.value);
    // canonical: producing → dormant → deferred → failing → disabled
    const producingIdx = order.indexOf("producing");
    const deferredIdx = order.indexOf("deferred");
    const disabledIdx = order.indexOf("disabled");
    expect(deferredIdx).toBeGreaterThan(-1);
    expect(out.facets.status.find((f) => f.value === "deferred")!.count).toBe(2);
    expect(out.facets.status.find((f) => f.value === "disabled")!.count).toBe(1);
    if (producingIdx > -1) expect(producingIdx).toBeLessThan(deferredIdx);
    expect(deferredIdx).toBeLessThan(disabledIdx);
  });

  test("health splits deferred from disabled", () => {
    const out = buildSources(
      [
        entry({ id: "yt1", type: "youtube", enabled: false }),
        entry({ id: "yt2", type: "youtube", enabled: false }),
        entry({ id: "off", type: "rss", enabled: false }),
      ],
      [],
      [],
    );
    expect(out.health.deferred).toBe(2);
    expect(out.health.disabled).toBe(1); // truly-disabled only
  });
});

// ── trust basis (the "why this score" explanation) ────────────────────────
describe("assessTrust", () => {
  // Build a single enriched source through buildSources so we test the real shape.
  const enrich = (e: Partial<SourcesEntry> & Pick<SourcesEntry, "id">, its: SourcesItem[] = []): EnrichedSource =>
    buildSources([entry(e)], its, []).sources[0]!;

  test("score is the source's stored trustScore, unchanged", () => {
    const b = assessTrust(enrich({ id: "s", trustScore: 0.82 }));
    expect(b.score).toBe(0.82);
  });

  test("tier reflects the source type", () => {
    expect(assessTrust(enrich({ id: "a", type: "arxiv" })).tier).toMatch(/scholarly|preprint/i);
    expect(assessTrust(enrich({ id: "e", type: "eng-blog" })).tier).toMatch(/engineering/i);
    expect(assessTrust(enrich({ id: "n", type: "news" })).tier).toMatch(/press|journalism/i);
    expect(assessTrust(enrich({ id: "r", type: "reddit" })).tier).toMatch(/community/i);
  });

  test("provenance factor: seed is curator-vetted (positive)", () => {
    const b = assessTrust(enrich({ id: "s", addedBy: "seed" }));
    const f = b.factors.find((x) => /vetted|curator/i.test(x.label + x.detail))!;
    expect(f).toBeTruthy();
    expect(f.polarity).toBe("positive");
  });

  test("provenance factor: scout is auto-added (neutral)", () => {
    const b = assessTrust(enrich({ id: "s", addedBy: "scout" }));
    const f = b.factors.find((x) => /scout/i.test(x.label + x.detail))!;
    expect(f.polarity).toBe("neutral");
  });

  test("transport: http is a caution, https is positive", () => {
    const insecure = assessTrust(enrich({ id: "s", url: "http://x.com/feed" }));
    const tf = insecure.factors.find((x) => /transport|http/i.test(x.label))!;
    expect(tf.polarity).toBe("caution");
    const secure = assessTrust(enrich({ id: "s", url: "https://x.com/feed" }));
    const tf2 = secure.factors.find((x) => /transport|http/i.test(x.label))!;
    expect(tf2.polarity).toBe("positive");
  });

  test("reliability: failures are a caution factor", () => {
    const b = assessTrust(enrich({ id: "s", failureCount: 3 }));
    const f = b.factors.find((x) => /reliab|failure/i.test(x.label + x.detail))!;
    expect(f.polarity).toBe("caution");
    expect(f.detail).toContain("3");
    const clean = assessTrust(enrich({ id: "s", failureCount: 0 }));
    const cf = clean.factors.find((x) => /reliab|failure/i.test(x.label + x.detail))!;
    expect(cf.polarity).toBe("positive");
  });

  test("track record: producing is positive with item count", () => {
    const its = [
      item({ id: "i1", source: "s", body: "<p>" + Array.from({ length: 2250 }, () => "w").join(" ") + "</p>" }),
    ];
    const b = assessTrust(enrich({ id: "s" }, its));
    const f = b.factors.find((x) => /track|producing|items/i.test(x.label + x.detail))!;
    expect(f.polarity).toBe("positive");
    expect(f.detail).toMatch(/1/);
  });

  test("track record: no items is neutral", () => {
    const b = assessTrust(enrich({ id: "s" }));
    const f = b.factors.find((x) => /track|item/i.test(x.label + x.detail))!;
    expect(f.polarity).toBe("neutral");
  });

  test("editorial notes surface as a neutral factor when present", () => {
    const b = assessTrust(enrich({ id: "s", notes: "primary source, well-edited" }));
    const f = b.factors.find((x) => x.detail.includes("primary source, well-edited"));
    expect(f).toBeTruthy();
    expect(f!.polarity).toBe("neutral");
  });

  test("divergence: high stored trust but currently failing is flagged caution", () => {
    const b = assessTrust(enrich({ id: "s", trustScore: 0.9, failureCount: 2 }));
    const f = b.factors.find((x) => /review|diverg|currently failing/i.test(x.detail));
    expect(f).toBeTruthy();
    expect(f!.polarity).toBe("caution");
  });

  test("rationale is a non-empty plain sentence", () => {
    const b = assessTrust(enrich({ id: "s", trustScore: 0.8, type: "eng-blog" }));
    expect(typeof b.rationale).toBe("string");
    expect(b.rationale.length).toBeGreaterThan(10);
    expect(b.rationale.trim().endsWith(".")).toBe(true);
  });

  test("pure: same input -> deeply equal basis", () => {
    const s = enrich({ id: "s", trustScore: 0.7, type: "rss", notes: "x" });
    expect(assessTrust(s)).toEqual(assessTrust(s));
  });

  test("guards a source missing optional fields without throwing", () => {
    const bare: EnrichedSource = {
      id: "bare",
      type: "x",
      url: "not a url",
      host: "not a url",
      channels: [],
      enabled: true,
      trustScore: 0.5,
      addedBy: "manual",
      failureCount: 0,
      notes: null,
      itemCount: 0,
      avgReadMin: 0,
      avgTaste: 0,
      lastPublished: null,
      producedChannels: [],
      recentItems: [],
      status: "dormant",
    };
    expect(() => assessTrust(bare)).not.toThrow();
    expect(assessTrust(bare).factors.length).toBeGreaterThan(0);
  });
});
