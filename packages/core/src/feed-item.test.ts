import { expect, test } from "vitest";
import { FeedItemSchema, makeFeedItemId } from "./feed-item.js";

const base = {
  source: "netflix-techblog",
  sourceType: "eng-blog",
  url: "https://netflixtechblog.com/x",
  title: "Scaling X",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  kind: "link",
};

test("defaults fill optional enrichment fields", () => {
  const item = FeedItemSchema.parse({ id: "a", ...base });
  expect(item.topics).toEqual([]);
  expect(item.entities).toEqual([]);
  expect(item.summary).toBe("");
  expect(item.media).toEqual([]);
});

test("rejects bad sourceType and missing required fields", () => {
  expect(FeedItemSchema.safeParse({ id: "a", ...base, sourceType: "nope" }).success).toBe(false);
  expect(FeedItemSchema.safeParse({ id: "a" }).success).toBe(false);
});

test("makeFeedItemId is stable and deterministic", () => {
  const a = makeFeedItemId("eng-blog", "https://netflixtechblog.com/x");
  const b = makeFeedItemId("eng-blog", "https://netflixtechblog.com/x");
  expect(a).toBe(b);
  expect(a).not.toBe(makeFeedItemId("eng-blog", "https://netflixtechblog.com/y"));
});
