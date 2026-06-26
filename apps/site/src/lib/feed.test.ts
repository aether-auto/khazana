import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import {
  loadCurated,
  filterByChannel,
  selectIdeas,
  tickerTitles,
  splitFeatured,
  dropShorts,
  dropJunkVideos,
  selectWatchRail,
  selectListenRail,
} from "./feed.js";

let dir: string;

const item = (over: Record<string, unknown>): FeedItem => ({
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
} as FeedItem);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-site-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("loadCurated returns an empty feed (no fake samples) when curated.json is absent", () => {
  expect(loadCurated(dir)).toEqual([]);
});

test("loadCurated loads curated.json when present and preserves order", () => {
  writeFileSync(
    join(dir, "curated.json"),
    JSON.stringify([item({ id: "first" }), item({ id: "second" })]),
  );
  const items = loadCurated(dir);
  expect(items.map((i) => i.id)).toEqual(["first", "second"]);
});

test("loadCurated drops items that fail FeedItemSchema validation", () => {
  writeFileSync(
    join(dir, "curated.json"),
    JSON.stringify([item({ id: "ok" }), { id: "broken", title: "no required fields" }]),
  );
  const items = loadCurated(dir);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("ok");
});

test("filterByChannel matches the channel in topics; null returns all", () => {
  const items = [item({ id: "a", topics: ["tech"] }), item({ id: "b", topics: ["finance"] })];
  expect(filterByChannel(items, "finance").map((i) => i.id)).toEqual(["b"]);
  expect(filterByChannel(items, null)).toHaveLength(2);
  expect(filterByChannel(items, "")).toHaveLength(2);
});

test("selectIdeas picks kind=idea or any workshop channel", () => {
  const items = [
    item({ id: "idea-kind", kind: "idea", topics: ["tech"] }),
    item({ id: "workshop-topic", kind: "link", topics: ["3d-printing"] }),
    item({ id: "plain", kind: "link", topics: ["finance"] }),
  ];
  expect(selectIdeas(items).map((i) => i.id)).toEqual(["idea-kind", "workshop-topic"]);
});

test("tickerTitles returns the first n titles", () => {
  const items = [item({ id: "1", title: "One" }), item({ id: "2", title: "Two" }), item({ id: "3", title: "Three" })];
  expect(tickerTitles(items, 2)).toEqual(["One", "Two"]);
});

test("splitFeatured promotes the top slice and keeps the rest in rank order", () => {
  const items = Array.from({ length: 25 }, (_, i) => item({ id: `i${i}` }));
  const { featured, rest } = splitFeatured(items, 10);
  expect(featured.map((i) => i.id)).toEqual(items.slice(0, 10).map((i) => i.id));
  expect(rest.map((i) => i.id)).toEqual(items.slice(10).map((i) => i.id));
  expect(featured.length + rest.length).toBe(items.length);
});

test("splitFeatured clamps the count to the available items", () => {
  const items = [item({ id: "a" }), item({ id: "b" })];
  const { featured, rest } = splitFeatured(items, 10);
  expect(featured.map((i) => i.id)).toEqual(["a", "b"]);
  expect(rest).toEqual([]);
});

test("splitFeatured handles an empty feed", () => {
  expect(splitFeatured([], 10)).toEqual({ featured: [], rest: [] });
});

test("dropShorts removes YouTube Shorts but keeps every other item", () => {
  const items = [
    item({ id: "watch", kind: "video", url: "https://www.youtube.com/watch?v=abc12345678" }),
    item({ id: "short", kind: "video", url: "https://www.youtube.com/shorts/vbScYtKALdY" }),
    item({ id: "article", kind: "link", url: "https://example.com/a" }),
    item({ id: "pod", kind: "audio", url: "https://example.com/ep.mp3" }),
  ];
  expect(dropShorts(items).map((i) => i.id)).toEqual(["watch", "article", "pod"]);
});

test("dropJunkVideos removes obvious non-content raw clips, keeps real videos", () => {
  const items = [
    item({ id: "real", kind: "video", title: "The Fixed Point Theorem - Numberphile" }),
    item({ id: "noaudio", kind: "video", title: "Pool Testing Video 4 (No Audio)" }),
    item({ id: "pool", kind: "video", title: "Pool Testing Video 1" }),
    item({ id: "river", kind: "video", title: "River Testing Video" }),
    // "(no audio)" anywhere in the title is the raw-clip tell
    item({ id: "rawclip", kind: "video", title: "Wind Tunnel Run 12 (no audio)" }),
    // a real video that merely mentions a pool is NOT junk
    item({ id: "keep", kind: "video", title: "How Olympic Pool Design Affects Records" }),
    // junk patterns must NOT touch non-video kinds
    item({ id: "article", kind: "link", title: "Pool Testing Video (No Audio)" }),
  ];
  expect(dropJunkVideos(items).map((i) => i.id)).toEqual(["real", "keep", "article"]);
});

test("dropJunkVideos is a no-op when there is no junk", () => {
  const items = [
    item({ id: "a", kind: "video", title: "Normal Title" }),
    item({ id: "b", kind: "link", title: "An Article" }),
  ];
  expect(dropJunkVideos(items).map((i) => i.id)).toEqual(["a", "b"]);
});

test("dropShorts is a no-op when there are no Shorts", () => {
  const items = [
    item({ id: "a", kind: "video", url: "https://www.youtube.com/watch?v=abc12345678" }),
    item({ id: "b", kind: "link", url: "https://example.com/a" }),
  ];
  expect(dropShorts(items).map((i) => i.id)).toEqual(["a", "b"]);
});

test("selectWatchRail picks only embeddable (non-Short) video items, top-ranked", () => {
  const items = [
    item({ id: "v1", source: "ch-a", kind: "video", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }),
    item({ id: "short", source: "ch-b", kind: "video", url: "https://www.youtube.com/shorts/bbbbbbbbbbb" }),
    item({ id: "article", source: "ch-c", kind: "link", url: "https://example.com/a" }),
    item({ id: "v2", source: "ch-d", kind: "video", url: "https://youtu.be/ccccccccccc" }),
    // a "video" kind whose URL is not YouTube / yields no id → no thumbnail → excluded
    item({ id: "notyt", source: "ch-e", kind: "video", url: "https://vimeo.com/12345" }),
  ];
  // Order preserved (rank order); only v1 + v2 are embeddable videos.
  expect(selectWatchRail(items).map((i) => i.id)).toEqual(["v1", "v2"]);
});

test("selectWatchRail takes at most ONE per source (diversity)", () => {
  const v = (id: string, source: string) =>
    item({ id, source, kind: "video", url: `https://www.youtube.com/watch?v=${id}0000000000`.slice(0, 38) });
  const items = [
    v("a1", "ch-a"),
    v("a2", "ch-a"), // dup source — should be skipped while distinct sources remain
    v("b1", "ch-b"),
    v("a3", "ch-a"), // dup source — skipped
    v("c1", "ch-c"),
  ];
  // One per source, in rank order: a1, b1, c1
  expect(selectWatchRail(items, 12).map((i) => i.id)).toEqual(["a1", "b1", "c1"]);
});

test("selectWatchRail falls back to a 2nd-per-source only to fill the rail", () => {
  const v = (id: string, source: string) =>
    item({ id, source, kind: "video", url: `https://www.youtube.com/watch?v=${id}0000000000`.slice(0, 38) });
  // 2 distinct sources, want 3 → after one-per-source (a1,b1) it back-fills the
  // next-best remaining (a2) so the rail isn't left short.
  const items = [v("a1", "ch-a"), v("a2", "ch-a"), v("b1", "ch-b")];
  expect(selectWatchRail(items, 3).map((i) => i.id)).toEqual(["a1", "b1", "a2"]);
});

test("selectWatchRail caps the rail at the requested limit", () => {
  const items = Array.from({ length: 20 }, (_, i) =>
    item({ id: `v${i}`, source: `ch-${i}`, kind: "video", url: `https://www.youtube.com/watch?v=vid${i}0000000` }),
  );
  expect(selectWatchRail(items, 8)).toHaveLength(8);
  expect(selectWatchRail(items, 8).map((i) => i.id)).toEqual(
    items.slice(0, 8).map((i) => i.id),
  );
});

test("selectListenRail picks only audio items, top-ranked", () => {
  const items = [
    item({ id: "a1", source: "show-a", kind: "audio", url: "https://example.com/1.mp3" }),
    item({ id: "v", source: "ch", kind: "video", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }),
    item({ id: "a2", source: "show-b", kind: "audio", url: "https://example.com/2.mp3" }),
    item({ id: "link", source: "s", kind: "link", url: "https://example.com/a" }),
  ];
  expect(selectListenRail(items).map((i) => i.id)).toEqual(["a1", "a2"]);
});

test("selectListenRail takes at most ONE per source (diversity)", () => {
  const a = (id: string, source: string) =>
    item({ id, source, kind: "audio", url: `https://example.com/${id}.mp3` });
  const items = [a("x1", "show-a"), a("x2", "show-a"), a("y1", "show-b"), a("z1", "show-c")];
  expect(selectListenRail(items).map((i) => i.id)).toEqual(["x1", "y1", "z1"]);
});

test("selectListenRail caps the rail at the requested limit", () => {
  const items = Array.from({ length: 15 }, (_, i) =>
    item({ id: `a${i}`, source: `show-${i}`, kind: "audio", url: `https://example.com/${i}.mp3` }),
  );
  expect(selectListenRail(items, 6)).toHaveLength(6);
});

// ── NEW: bucketByChannel (TDD — tests written BEFORE implementation) ─────────
import { bucketByChannel } from "./feed.js";

test("bucketByChannel groups items by their primary topic", () => {
  const items = [
    item({ id: "t1", topics: ["tech", "ai"] }),
    item({ id: "t2", topics: ["tech"] }),
    item({ id: "f1", topics: ["finance"] }),
    item({ id: "h1", topics: ["history"] }),
  ];
  const buckets = bucketByChannel(items);
  expect(buckets.get("tech")?.map((i) => i.id)).toEqual(["t1", "t2"]);
  expect(buckets.get("finance")?.map((i) => i.id)).toEqual(["f1"]);
  expect(buckets.get("history")?.map((i) => i.id)).toEqual(["h1"]);
});

test("bucketByChannel skips items with no topics", () => {
  const items = [item({ id: "notopic", topics: [] }), item({ id: "t1", topics: ["tech"] })];
  const buckets = bucketByChannel(items);
  expect(buckets.has("tech")).toBe(true);
  // no entry for empty-topic items
  expect([...buckets.values()].flat().map((i) => i.id)).not.toContain("notopic");
});

test("bucketByChannel preserves rank order within each bucket", () => {
  const items = [
    item({ id: "a", topics: ["ai"] }),
    item({ id: "b", topics: ["ai"] }),
    item({ id: "c", topics: ["ai"] }),
  ];
  expect(bucketByChannel(items).get("ai")?.map((i) => i.id)).toEqual(["a", "b", "c"]);
});

test("bucketByChannel returns an empty map for an empty list", () => {
  expect(bucketByChannel([])).toEqual(new Map());
});
