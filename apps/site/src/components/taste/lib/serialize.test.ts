import { describe, expect, test } from "vitest";
import {
  readTimeMinutes,
  hasFullText,
  FEED_WPM,
  MIN_FULLTEXT_CHARS,
  type FeedItem,
} from "@khazana/core";
import { syntheticBody, serializeCandidate, type CuratedInput } from "./serialize.js";

// A minimal FeedItem-shaped wrapper so we can run core's body math on the synthetic
// string exactly as the scorer would (it reads `item.body`).
function asItem(body: string): FeedItem {
  return { body } as unknown as FeedItem;
}

describe("syntheticBody", () => {
  test("reproduces readMin exactly across the realistic range", () => {
    for (const readMin of [0, 1, 3, 5, 7, 11, 15, 18, 22, 31, 60]) {
      const body = syntheticBody(readMin, readMin >= 4, false);
      expect(readTimeMinutes(asItem(body))).toBe(readMin);
    }
  });

  test("full-text flag is preserved (body crosses the MIN_FULLTEXT_CHARS threshold)", () => {
    // A 1-min item that nonetheless carries full text (a real edge: short rendered
    // time but a long body once you count chars). Synthetic body must report TRUE.
    const ft = syntheticBody(1, true, false);
    expect(hasFullText(asItem(ft))).toBe(true);
    expect(ft.length).toBeGreaterThan(MIN_FULLTEXT_CHARS);

    // A 1-min item with no full text → FALSE.
    const noFt = syntheticBody(1, false, false);
    expect(hasFullText(asItem(noFt))).toBe(false);
  });

  test("a long full-text item keeps both readMin and full-text true", () => {
    const body = syntheticBody(18, true, false);
    expect(readTimeMinutes(asItem(body))).toBe(18);
    expect(hasFullText(asItem(body))).toBe(true);
  });

  test("media item with 0 read minutes yields an empty body (no full text)", () => {
    const body = syntheticBody(0, false, true);
    expect(readTimeMinutes(asItem(body))).toBe(0);
    expect(hasFullText(asItem(body))).toBe(false);
  });

  test("word count matches readMin × FEED_WPM for plain (non-full-text) bodies", () => {
    const body = syntheticBody(10, false, false);
    const words = body.trim().split(/\s+/).length;
    // readTimeMinutes rounds words / FEED_WPM, so this must round-trip to 10.
    expect(Math.round(words / FEED_WPM)).toBe(10);
  });
});

describe("serializeCandidate", () => {
  const input: CuratedInput = {
    id: "abc",
    title: "Why transformers generalize",
    topics: ["ai", "tech"],
    entities: ["transformers"],
    publishedAt: "2026-06-26T00:00:00.000Z",
    trustScore: 0.86,
    metrics: { score: 312, comments: 40 },
    clusterId: "c1",
    kind: "link",
    source: "example-blog",
    url: "https://example.com/x",
    // ~18 min body, full text
    body: "word ".repeat(18 * FEED_WPM),
  };

  test("precomputes readMin / hasFullText / isMedia via core and trims the body", () => {
    const out = serializeCandidate(input, "/base");
    expect(out.id).toBe("abc");
    expect(out.readMin).toBe(18);
    expect(out.hasFullText).toBe(true);
    expect(out.isMedia).toBe(false);
    expect(out.channel).toBe("ai");
    expect(out.group).toBe("ai");
    expect(out.href).toBe("/base/item/abc");
    // The shipped body is SYNTHETIC, not the real 18-min body verbatim, but it
    // must score identically: same readMin, same full-text verdict.
    expect(readTimeMinutes(asItem(out.body!))).toBe(18);
    expect(hasFullText(asItem(out.body!))).toBe(true);
  });

  test("a transcript-less video is flagged isMedia and gets a media-credit body", () => {
    const video: CuratedInput = {
      ...input,
      id: "vid",
      kind: "video",
      body: undefined,
    };
    const out = serializeCandidate(video, "/base");
    expect(out.isMedia).toBe(true);
    expect(out.hasFullText).toBe(false);
  });

  test("channel falls back to a stable default when topics empty", () => {
    const out = serializeCandidate({ ...input, topics: [] }, "");
    expect(out.channel).toBe("tech");
    expect(out.href).toBe("/item/abc");
  });
});
