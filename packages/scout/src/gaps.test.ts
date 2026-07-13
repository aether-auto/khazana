import { expect, test } from "vitest";
import { backfillTargets, computeGaps, normalizeDomain, renderBrief } from "./gaps.js";
import type { FeedItem, Registry, SourceEntry } from "@khazana/core";

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

// ── depletion-aware rebalancing: prioritize backfilling channels that just LOST
// sources to auto-disable, even while they remain above the absolute floor ──

const s = (over: Partial<SourceEntry>): SourceEntry => ({
  id: "s", type: "rss", url: "https://e.com/feed", channels: ["tech"],
  enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0, ...over,
});

// science: 3 enabled + 2 auto-disabled youtube (lost the most).
// tech: 2 enabled + 1 auto-disabled rss.
// A hand-disabled source (enabled:false but status:"active") is NOT a loss.
const depletedReg: Registry = {
  version: 1,
  sources: [
    s({ id: "sci1", type: "rss", channels: ["science"] }),
    s({ id: "sci2", type: "rss", channels: ["science"] }),
    s({ id: "sci3", type: "rss", channels: ["science"] }),
    s({ id: "sci-yt1", type: "youtube", channels: ["science"], enabled: false, status: "disabled" }),
    s({ id: "sci-yt2", type: "youtube", channels: ["science"], enabled: false, status: "disabled" }),
    s({ id: "tech1", type: "rss", channels: ["tech"] }),
    s({ id: "tech2", type: "rss", channels: ["tech"] }),
    s({ id: "tech-dead", type: "rss", channels: ["tech"], enabled: false, status: "disabled" }),
    s({ id: "hand-off", type: "rss", channels: ["tech"], enabled: false, status: "active" }),
  ],
};

test("depletedChannels ranks channels by number of auto-disabled sources, with the lost source types", () => {
  const g = computeGaps(depletedReg, [], [], { minSourcesPerChannel: 1 });
  // Both channels are above the floor (science 3 enabled, tech 2), so neither is
  // "underserved" — but both LOST sources and must surface for backfill.
  expect(g.underservedChannels).not.toContain("science");
  expect(g.underservedChannels).not.toContain("tech");
  expect(g.depletedChannels.map((d) => d.channel)).toEqual(["science", "tech"]); // science lost more → first
  const sci = g.depletedChannels.find((d) => d.channel === "science")!;
  expect(sci).toEqual({ channel: "science", enabled: 3, disabled: 2, lostTypes: ["youtube"] });
  const tech = g.depletedChannels.find((d) => d.channel === "tech")!;
  expect(tech).toEqual({ channel: "tech", enabled: 2, disabled: 1, lostTypes: ["rss"] });
});

test("a hand-disabled source (status:active) is NOT counted as a loss", () => {
  const g = computeGaps(depletedReg, [], [], { minSourcesPerChannel: 1 });
  const tech = g.depletedChannels.find((d) => d.channel === "tech")!;
  expect(tech.disabled).toBe(1); // only tech-dead (status:disabled), not hand-off (status:active)
});

test("backfillTargets orders depleted channels (most-lost first) ahead of floor-underserved, deduped", () => {
  const g = computeGaps(depletedReg, [], [], { minSourcesPerChannel: 1 });
  const targets = backfillTargets(g);
  // depleted first, in loss order
  expect(targets.indexOf("science")).toBeLessThan(targets.indexOf("tech"));
  // floor-underserved channels (e.g. history) still present, after the depleted ones
  expect(targets).toContain("history");
  expect(targets.indexOf("science")).toBeLessThan(targets.indexOf("history"));
  // no duplicates
  expect(targets.length).toBe(new Set(targets).size);
});

test("renderBrief surfaces the depleted channels with their lost types for aggressive backfill", () => {
  const g = computeGaps(depletedReg, [], [], { minSourcesPerChannel: 1 });
  const md = renderBrief(g, "2026-06-23T00:00:00.000Z");
  expect(md).toContain("science");
  expect(md).toContain("youtube"); // the lost type is named so backfill is type-aware
  expect(renderBrief(g, "2026-06-23T00:00:00.000Z")).toBe(md); // deterministic
});
