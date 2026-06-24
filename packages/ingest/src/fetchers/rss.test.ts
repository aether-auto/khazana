import { expect, test } from "vitest";
import { parseRssFeed } from "./rss.js";
import type { SourceEntry } from "@khazana/core";

const entry: SourceEntry = {
  id: "netflix-techblog", type: "eng-blog",
  url: "https://netflixtechblog.com/feed", channels: ["tech", "data-science"],
  enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0,
};

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Netflix Tech</title>
  <item>
    <title>Scaling the Edge</title>
    <link>https://netflixtechblog.com/scaling-edge</link>
    <pubDate>Sat, 20 Jun 2026 10:00:00 GMT</pubDate>
    <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Jane Eng</dc:creator>
    <description>How we scaled the edge tier.</description>
  </item>
  <item><title>No Link Item</title></item>
</channel></rss>`;

test("parses valid RSS items into FeedItems and seeds topics from channels", async () => {
  const items = await parseRssFeed(RSS, entry, "2026-06-23T00:00:00.000Z");
  expect(items).toHaveLength(1); // the no-link item is dropped
  const it = items[0]!;
  expect(it.title).toBe("Scaling the Edge");
  expect(it.url).toBe("https://netflixtechblog.com/scaling-edge");
  expect(it.sourceType).toBe("eng-blog");
  expect(it.topics).toEqual(["tech", "data-science"]);
  expect(it.author).toBe("Jane Eng");
  expect(it.publishedAt).toBe("2026-06-20T10:00:00.000Z");
  expect(it.fetchedAt).toBe("2026-06-23T00:00:00.000Z");
  expect(it.kind).toBe("link");
  expect(it.summary).toBe("");
});

test("arxiv entries are mapped to kind=paper", async () => {
  const arxiv: SourceEntry = { ...entry, id: "arxiv-cs-ai", type: "arxiv", channels: ["ai"] };
  const items = await parseRssFeed(RSS, arxiv, "2026-06-23T00:00:00.000Z");
  expect(items[0]!.kind).toBe("paper");
});
