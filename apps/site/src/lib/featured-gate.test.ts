// featured-gate.test.ts — TDD: failing tests for the ≥7-min featured gate
import { expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import { splitFeaturedGated } from "./feed.js";

const item = (over: Partial<FeedItem> & { body?: string }): FeedItem => ({
  id: "id1",
  source: "s",
  sourceType: "rss",
  url: "https://e.com/a",
  title: "A",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  topics: ["tech"],
  entities: [],
  summary: "",
  media: [],
  kind: "link",
  ...over,
});

// Helper: build a body string that reads as approx N minutes at 225 wpm
function bodyOfMinutes(minutes: number): string {
  const words = Math.ceil(minutes * 225);
  return "<p>" + Array.from({ length: words }, (_, i) => `word${i}`).join(" ") + "</p>";
}

test("splitFeaturedGated promotes only items with readMinutes >= 7", () => {
  const short = item({ id: "short", body: bodyOfMinutes(4) });  // 4 min — fails gate
  const long1 = item({ id: "long1", body: bodyOfMinutes(8) });  // 8 min — passes
  const long2 = item({ id: "long2", body: bodyOfMinutes(10) }); // 10 min — passes
  const noBody = item({ id: "nobody" });                         // null body — fails gate

  const { featured, rest } = splitFeaturedGated([long1, short, long2, noBody], 2);
  expect(featured.map((i) => i.id)).toEqual(["long1", "long2"]);
  // short and noBody go to the rest tail
  expect(rest.map((i) => i.id)).toContain("short");
  expect(rest.map((i) => i.id)).toContain("nobody");
});

test("splitFeaturedGated exactly at the 7-min boundary passes", () => {
  // 7 * 225 = 1575 words → readTimeFromHtml = 7 min
  const exactly7 = item({ id: "e7", body: bodyOfMinutes(7) });
  const { featured } = splitFeaturedGated([exactly7], 1);
  expect(featured.map((i) => i.id)).toEqual(["e7"]);
});

test("splitFeaturedGated respects the count cap", () => {
  const items = Array.from({ length: 10 }, (_, i) =>
    item({ id: `i${i}`, body: bodyOfMinutes(9) }),
  );
  const { featured, rest } = splitFeaturedGated(items, 5);
  expect(featured).toHaveLength(5);
  expect(rest).toHaveLength(5);
});

test("splitFeaturedGated bento may be smaller than count when too few long items", () => {
  const long = item({ id: "long", body: bodyOfMinutes(12) });
  const short = item({ id: "short", body: bodyOfMinutes(2) });
  // Request 5 featured but only 1 qualifies — bento gets 1, rest gets both remaining
  const { featured, rest } = splitFeaturedGated([long, short], 5);
  expect(featured).toHaveLength(1);
  expect(featured[0]!.id).toBe("long");
  expect(rest.map((i) => i.id)).toContain("short");
});

test("splitFeaturedGated preserves rank order within featured", () => {
  const items = Array.from({ length: 6 }, (_, i) =>
    item({ id: `ranked${i}`, body: bodyOfMinutes(8) }),
  );
  const { featured } = splitFeaturedGated(items, 4);
  expect(featured.map((i) => i.id)).toEqual(["ranked0", "ranked1", "ranked2", "ranked3"]);
});

test("splitFeaturedGated handles empty feed", () => {
  expect(splitFeaturedGated([], 10)).toEqual({ featured: [], rest: [] });
});

// Content-agnostic gate: kind / sourceType are irrelevant — only the rendered
// body length determines eligibility. A video with a long transcript is as
// featurable as an article of equal length; a link-only video is not.
test("gate is content-agnostic: a video with long transcript IS featured", () => {
  const videoLong = item({ id: "vtrans", kind: "video", sourceType: "youtube", body: bodyOfMinutes(9) });
  const videoShort = item({ id: "vshort", kind: "video", sourceType: "youtube" }); // no body
  const audioLong = item({ id: "apod", kind: "audio", sourceType: "rss", body: bodyOfMinutes(72) });
  const articleShort = item({ id: "alink", kind: "link", body: bodyOfMinutes(3) });

  const { featured, rest } = splitFeaturedGated([videoLong, videoShort, audioLong, articleShort], 5);
  // Long-transcript video and long-body audio both qualify
  expect(featured.map((i) => i.id)).toContain("vtrans");
  expect(featured.map((i) => i.id)).toContain("apod");
  // No-body video and short article do not
  expect(rest.map((i) => i.id)).toContain("vshort");
  expect(rest.map((i) => i.id)).toContain("alink");
});
