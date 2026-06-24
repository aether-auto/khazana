import { expect, test } from "vitest";
import { parseRedditListing } from "./reddit.js";
import type { SourceEntry } from "@khazana/core";

const entry: SourceEntry = {
  id: "r-dataisbeautiful", type: "reddit",
  url: "https://www.reddit.com/r/dataisbeautiful/top/.json?t=day", channels: ["data-science"],
  enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0,
};

const LISTING = {
  data: {
    children: [
      { data: {
          title: "[OC] World GDP over time", permalink: "/r/dataisbeautiful/comments/abc/oc/",
          url: "https://i.redd.it/x.png", author: "viz_guy", created_utc: 1750000000,
          num_comments: 42, score: 1200, selftext: "", thumbnail: "https://b.thumbs.redditmedia.com/t.jpg",
      } },
      { data: { title: "no permalink" } },
    ],
  },
};

test("parses reddit children into discussion FeedItems with canonical permalink url", () => {
  const items = parseRedditListing(LISTING, entry, "2026-06-23T00:00:00.000Z");
  expect(items).toHaveLength(1);
  const it = items[0]!;
  expect(it.kind).toBe("discussion");
  expect(it.url).toBe("https://www.reddit.com/r/dataisbeautiful/comments/abc/oc/");
  expect(it.author).toBe("viz_guy");
  expect(it.metrics).toEqual({ score: 1200, comments: 42 });
  expect(it.media[0]).toEqual({ type: "image", url: "https://b.thumbs.redditmedia.com/t.jpg" });
  expect(it.topics).toEqual(["data-science"]);
});

test("drops children without title or permalink", () => {
  expect(parseRedditListing({ data: { children: [{ data: {} }] } }, entry, "2026-06-23T00:00:00.000Z")).toHaveLength(0);
});
