import { expect, test } from "vitest";
import type { Source } from "./source.js";
import { FeedItemSchema } from "./feed-item.js";

test("a Source implementation type-checks and yields FeedItems", async () => {
  const fake: Source = {
    id: "fake",
    type: "rss",
    channels: ["tech"],
    async fetch() {
      return [
        FeedItemSchema.parse({
          id: "1", source: "fake", sourceType: "rss",
          url: "https://e.com/a", title: "A",
          publishedAt: "2026-06-20T00:00:00.000Z",
          fetchedAt: "2026-06-23T00:00:00.000Z", kind: "link",
        }),
      ];
    },
  };
  const items = await fake.fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(items[0]?.source).toBe("fake");
});
