import { expect, test } from "vitest";
import { computeGaps, normalizeDomain, renderBrief } from "./gaps.js";
import type { FeedItem, Registry } from "@khazana/core";

const registry: Registry = {
  version: 1,
  sources: [
    { id: "hn", type: "hn", url: "https://hnrss.org/frontpage", channels: ["tech", "ai"], enabled: true, trustScore: 0.7, addedBy: "seed", failureCount: 0 },
    { id: "qm", type: "rss", url: "https://www.quantamagazine.org/feed/", channels: ["science"], enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0 },
    { id: "off", type: "rss", url: "https://disabled.example.com/feed", channels: ["ai"], enabled: false, trustScore: 0.5, addedBy: "seed", failureCount: 0 },
  ],
};

const item = (id: string, url: string, score: number, topics: string[]): FeedItem => ({
  id, source: "x", sourceType: "rss", url, title: id,
  publishedAt: "2026-06-20T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
  topics, entities: [], summary: "", media: [], metrics: { score }, kind: "link",
});

const curated: FeedItem[] = [
  item("i1", "https://www.theverge.com/a", 500, ["tech"]),
  item("i2", "https://hnrss.org/x", 400, ["tech"]),       // domain already a source → excluded from outbound
  item("i3", "https://stratechery.com/b", 50, ["finance"]),
];

const events = [{ itemId: "i3", type: "read" as const, at: "2026-06-23T00:00:00.000Z" }];

test("normalizeDomain strips www and lowercases; null on garbage", () => {
  expect(normalizeDomain("https://WWW.Example.com/x")).toBe("example.com");
  expect(normalizeDomain("not a url")).toBeNull();
});

test("underserved channels: enabled-only count below threshold, in CHANNELS order", () => {
  const g = computeGaps(registry, curated, events, { minSourcesPerChannel: 1 });
  // tech(1, hn) and ai(1, hn — disabled 'off' not counted) and science(1, qm) meet >=1.
  expect(g.underservedChannels).not.toContain("tech");
  expect(g.underservedChannels).not.toContain("science");
  expect(g.underservedChannels).not.toContain("ai"); // disabled source ignored, hn still covers ai
  expect(g.underservedChannels).toContain("history");
  // ordering follows CHANNELS declaration order: history before geopolitics
  expect(g.underservedChannels.indexOf("history")).toBeLessThan(g.underservedChannels.indexOf("geopolitics"));
});

test("ai becomes underserved if only the disabled source covered it", () => {
  const reg2: Registry = { ...registry, sources: registry.sources.map((s) => (s.id === "hn" ? { ...s, channels: ["tech"] } : s)) };
  const g = computeGaps(reg2, curated, events, { minSourcesPerChannel: 1 });
  expect(g.underservedChannels).toContain("ai"); // only 'off' (disabled) covered ai
});

test("engagedDomains = domains of engaged curated items not already sources", () => {
  const g = computeGaps(registry, curated, events, { minSourcesPerChannel: 1 });
  expect(g.engagedDomains).toEqual(["stratechery.com"]); // i3 engaged; theverge not engaged; hnrss already a source
});

test("outboundDomains = top-scored curated domains not already sources, sorted", () => {
  const g = computeGaps(registry, curated, events, { minSourcesPerChannel: 1 });
  expect(g.outboundDomains).toContain("theverge.com"); // top score 500, not a source
  expect(g.outboundDomains).not.toContain("hnrss.org"); // already a registry domain
});

test("renderBrief is deterministic markdown that names gaps and the candidates.json contract", () => {
  const g = computeGaps(registry, curated, events, { minSourcesPerChannel: 1 });
  const md = renderBrief(g, "2026-06-23T00:00:00.000Z");
  expect(md).toContain("# Source Scout — discovery brief");
  expect(md).toContain("history");
  expect(md).toContain("stratechery.com");
  expect(md).toContain("data/scout/candidates.json");
  expect(md).toContain("claimedTrust");
  // generated twice → identical (deterministic)
  expect(renderBrief(g, "2026-06-23T00:00:00.000Z")).toBe(md);
});
