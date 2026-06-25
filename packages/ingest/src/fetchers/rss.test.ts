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
  expect(it.summary).toBe("How we scaled the edge tier."); // RSS snippet seeds summary (graceful fallback)
});

test("arxiv entries are mapped to kind=paper", async () => {
  const arxiv: SourceEntry = { ...entry, id: "arxiv-cs-ai", type: "arxiv", channels: ["ai"] };
  const items = await parseRssFeed(RSS, arxiv, "2026-06-23T00:00:00.000Z");
  expect(items[0]!.kind).toBe("paper");
});

test("youtube/podcast entries map to video/audio kinds; summary seeded from snippet", async () => {
  const yt: SourceEntry = { ...entry, id: "yt-chan", type: "youtube", channels: ["tech"] };
  const ytItems = await parseRssFeed(RSS, yt, "2026-06-23T00:00:00.000Z");
  expect(ytItems[0]!.kind).toBe("video");
  expect(ytItems[0]!.summary).toBe("How we scaled the edge tier.");

  const pod: SourceEntry = { ...entry, id: "pod", type: "podcast", channels: ["tech"] };
  const podItems = await parseRssFeed(RSS, pod, "2026-06-23T00:00:00.000Z");
  expect(podItems[0]!.kind).toBe("audio");
});

test("captures <podcast:transcript> url onto the item for the enrich step", async () => {
  const PODCAST_RSS = `<?xml version="1.0"?>
  <rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel><title>Pod</title>
    <item>
      <title>Ep 1</title>
      <link>https://pod.example.com/ep1</link>
      <description>Show notes here.</description>
      <podcast:transcript url="https://cdn.example.com/ep1.txt" type="text/plain" />
    </item>
  </channel></rss>`;
  const pod: SourceEntry = { ...entry, id: "pod", type: "podcast", channels: ["tech"] };
  const items = await parseRssFeed(PODCAST_RSS, pod, "2026-06-23T00:00:00.000Z");
  expect((items[0] as { transcriptUrl?: string }).transcriptUrl).toBe("https://cdn.example.com/ep1.txt");
});
