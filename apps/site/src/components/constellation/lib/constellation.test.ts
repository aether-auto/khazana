import { describe, it, expect } from "vitest";
import type { FeedItem } from "@khazana/core";
import { CHANNELS } from "@khazana/core";
import {
  buildConstellation,
  toStar,
  primaryChannelIndex,
  projectXY,
  hash01,
  MAX_AGE_MS,
} from "./constellation.js";

const NOW = Date.parse("2026-06-24T00:00:00.000Z");

function item(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: over.id ?? "id-0",
    source: "src",
    sourceType: "rss",
    url: "https://example.com/x",
    title: "t",
    publishedAt: over.publishedAt ?? "2026-06-24T00:00:00.000Z",
    fetchedAt: "2026-06-24T00:00:00.000Z",
    topics: over.topics ?? [],
    entities: [],
    summary: "",
    media: [],
    kind: "link",
    ...over,
  };
}

describe("primaryChannelIndex", () => {
  it("returns the index of the first known channel topic", () => {
    expect(primaryChannelIndex(item({ topics: ["tech"] }))).toBe(CHANNELS.indexOf("tech"));
  });
  it("skips unknown topics to find a known channel", () => {
    expect(primaryChannelIndex(item({ topics: ["nonsense", "finance"] }))).toBe(
      CHANNELS.indexOf("finance"),
    );
  });
  it("returns -1 when no topic is a known channel", () => {
    expect(primaryChannelIndex(item({ topics: ["nonsense"] }))).toBe(-1);
    expect(primaryChannelIndex(item({ topics: [] }))).toBe(-1);
  });
});

describe("hash01", () => {
  it("is deterministic and in [0,1)", () => {
    const a = hash01("abc");
    const b = hash01("abc");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
  it("differs for different inputs", () => {
    expect(hash01("abc")).not.toBe(hash01("abd"));
  });
});

describe("toStar", () => {
  it("places fresh items near the center, old items near the rim", () => {
    const fresh = toStar(item({ id: "f", publishedAt: "2026-06-24T00:00:00.000Z" }), 0, 10, NOW);
    const old = toStar(
      item({ id: "o", publishedAt: new Date(NOW - MAX_AGE_MS).toISOString() }),
      0,
      10,
      NOW,
    );
    expect(fresh.radius).toBeLessThan(old.radius);
    expect(fresh.radius).toBeGreaterThanOrEqual(0.12);
    expect(old.radius).toBeLessThanOrEqual(1);
  });

  it("brightness decreases monotonically-ish with rank (lead is brightest)", () => {
    const lead = toStar(item({ id: "a" }), 0, 10, NOW);
    const mid = toStar(item({ id: "b" }), 5, 10, NOW);
    const tail = toStar(item({ id: "c" }), 9, 10, NOW);
    expect(lead.brightness).toBe(1);
    expect(lead.brightness).toBeGreaterThan(mid.brightness);
    expect(mid.brightness).toBeGreaterThan(tail.brightness);
    expect(tail.brightness).toBeGreaterThan(0);
  });

  it("angle is bound to the channel slice (same channel → same base sector)", () => {
    const slice = (2 * Math.PI) / CHANNELS.length;
    const ci = CHANNELS.indexOf("tech");
    for (const id of ["a", "b", "c", "d"]) {
      const s = toStar(item({ id, topics: ["tech"] }), 0, 10, NOW);
      // within ±0.5 slice of the channel's base angle (jitter is ±0.4 slice)
      let delta = Math.abs(s.angle - ci * slice);
      delta = Math.min(delta, 2 * Math.PI - delta);
      expect(delta).toBeLessThanOrEqual(slice * 0.5);
    }
  });

  it("all coordinates stay in their documented ranges", () => {
    const s = toStar(item({ id: "q", topics: ["finance"] }), 3, 20, NOW);
    expect(s.angle).toBeGreaterThanOrEqual(0);
    expect(s.angle).toBeLessThan(2 * Math.PI);
    expect(s.radius).toBeGreaterThanOrEqual(0.12);
    expect(s.radius).toBeLessThanOrEqual(1);
    expect(s.brightness).toBeGreaterThan(0);
    expect(s.brightness).toBeLessThanOrEqual(1);
    expect(s.depth).toBeGreaterThanOrEqual(-1);
    expect(s.depth).toBeLessThanOrEqual(1);
  });

  it("is fully deterministic for the same inputs (SSR == client)", () => {
    const a = toStar(item({ id: "same", topics: ["ai"] }), 2, 8, NOW);
    const b = toStar(item({ id: "same", topics: ["ai"] }), 2, 8, NOW);
    expect(a).toEqual(b);
  });

  it("handles a single-item feed without dividing by zero", () => {
    const s = toStar(item({ id: "solo" }), 0, 1, NOW);
    expect(s.brightness).toBe(1);
    expect(Number.isFinite(s.angle)).toBe(true);
  });
});

describe("buildConstellation", () => {
  it("preserves order as rank and maps every item", () => {
    const items = [item({ id: "0" }), item({ id: "1" }), item({ id: "2" })];
    const stars = buildConstellation(items, NOW);
    expect(stars.map((s) => s.id)).toEqual(["0", "1", "2"]);
    expect(stars.map((s) => s.rank)).toEqual([0, 1, 2]);
    expect(stars[0].brightness).toBe(1);
  });
  it("returns an empty field for an empty feed", () => {
    expect(buildConstellation([], NOW)).toEqual([]);
  });
});

describe("projectXY", () => {
  it("projects within the unit disc", () => {
    for (const it of [item({ id: "p1", topics: ["tech"] }), item({ id: "p2", topics: ["diy"] })]) {
      const s = toStar(it, 1, 5, NOW);
      const { x, y } = projectXY(s);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0001);
    }
  });
});
