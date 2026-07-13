import { expect, test } from "vitest";
import { containsUnsafeMarkup, feedItemUnsafeReasons, partitionSafeFeedItems } from "./sanitize.js";
import type { FeedItem } from "./feed-item.js";

const base: FeedItem = {
  id: "id0",
  source: "src0",
  sourceType: "rss",
  url: "https://example.com/a",
  title: "T",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  topics: [],
  entities: [],
  summary: "",
  media: [],
  kind: "link",
};

test("containsUnsafeMarkup flags script/iframe/event-handlers/javascript URIs", () => {
  expect(containsUnsafeMarkup("<script>alert(1)</script>")).toBe(true);
  expect(containsUnsafeMarkup("<iframe src='x'></iframe>")).toBe(true);
  expect(containsUnsafeMarkup('<img src=x onerror="steal()">')).toBe(true);
  expect(containsUnsafeMarkup('<a href="javascript:alert(1)">x</a>')).toBe(true);
  expect(containsUnsafeMarkup("<object data='x'></object>")).toBe(true);
});

test("containsUnsafeMarkup allows benign prose and allowlisted markup", () => {
  expect(containsUnsafeMarkup("")).toBe(false);
  expect(containsUnsafeMarkup("Just some plain text.")).toBe(false);
  expect(containsUnsafeMarkup("<p>Hello <strong>world</strong></p>")).toBe(false);
  // A benign leaked <figure><img> is ugly but not dangerous — not the drop-net's job.
  expect(containsUnsafeMarkup('<figure class="zine"><img src="x.jpg"></figure>')).toBe(false);
});

test("feedItemUnsafeReasons reports which field carries unsafe markup", () => {
  expect(feedItemUnsafeReasons({ ...base, summary: "clean", body: "clean" })).toEqual([]);
  const reasons = feedItemUnsafeReasons({ ...base, summary: "<script>x</script>", body: "<p>ok</p>" });
  expect(reasons.length).toBe(1);
  expect(reasons[0]).toMatch(/summary/i);
});

test("partitionSafeFeedItems drops unsafe items and keeps clean ones with reasons", () => {
  const clean: FeedItem = { ...base, id: "clean", summary: "safe", body: "<p>fine</p>" };
  const badBody: FeedItem = { ...base, id: "badbody", source: "evil", body: "<iframe></iframe>" };
  const badSummary: FeedItem = { ...base, id: "badsum", source: "evil2", summary: '<img onerror="x">' };
  const { safe, dropped } = partitionSafeFeedItems([clean, badBody, badSummary]);
  expect(safe.map((i) => i.id)).toEqual(["clean"]);
  expect(dropped.map((d) => d.item.id).sort()).toEqual(["badbody", "badsum"]);
  const bodyDrop = dropped.find((d) => d.item.id === "badbody")!;
  expect(bodyDrop.item.source).toBe("evil");
  expect(bodyDrop.reasons.join(" ")).toMatch(/body/i);
});
