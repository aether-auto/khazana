import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import {
  loadCurated,
  filterByChannel,
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

// ── Directed maker selector (TDD — written BEFORE implementation) ──────────────
import { makerScore, selectIdeas as selectMaker, type MakerSets } from "./feed.js";

/** A maker-source set fixture mirroring the real registry-derived sets. */
const sets = (over: Partial<MakerSets> = {}): MakerSets => ({
  pure: new Set(["random-nerd-tutorials", "arduino-blog", "hackaday", "adafruit-blog"]),
  hard: new Set([
    "random-nerd-tutorials",
    "arduino-blog",
    "hackaday",
    "adafruit-blog",
    "ieee-spectrum-tech",
    "matklad-blog",
  ]),
  exclude: new Set(["ieee-spectrum-tech", "matklad-blog"]),
  ...over,
});

test("makerScore: a PURE-allowlist build (ESP32 tutorial) scores well above threshold", () => {
  const it = item({
    id: "esp32",
    source: "random-nerd-tutorials",
    topics: ["iot", "embedded", "diy"],
    title: "ESP32 Web BLE: Live Sensor Data Visualization (BME280 Charts)",
  });
  expect(makerScore(it, sets())).toBeGreaterThanOrEqual(3);
});

test("makerScore: an op-ed carrying only `ideas`/essay topics is excluded (below threshold)", () => {
  const leisure = item({
    id: "leisure",
    source: "laphams-quarterly",
    topics: ["history", "ideas"],
    title: "In Praise of Leisure",
    summary: "A meditation on rest and the good life.",
  });
  const incomeTax = item({
    id: "income-tax",
    source: "some-essay-blog",
    topics: ["politics", "ideas", "finance"],
    title: "Protect the Income Tax",
  });
  expect(makerScore(leisure, sets())).toBeLessThan(3);
  expect(makerScore(incomeTax, sets())).toBeLessThan(3);
});

test("makerScore: EXCLUDE source with a false maker tag (matklad CSS post) stays out", () => {
  const css = item({
    id: "css",
    source: "matklad-blog",
    topics: ["tech", "embedded"], // noisy false `embedded` tag
    title: "CSS: Unavoidable Bad Parts",
  });
  expect(makerScore(css, sets())).toBeLessThan(3);
});

test("makerScore: EXCLUDE source with a genuine title build signal can still pass", () => {
  const genuineBuild = item({
    id: "real-build",
    source: "ieee-spectrum-tech",
    topics: ["tech", "embedded"],
    title: "How I Built a Raspberry Pi Geiger Counter From Scratch",
  });
  // −5 exclude + (+1 hard) + (+2 title build) → still below 3, by design the
  // EXCLUDE penalty dominates a single title hit; a strong build needs more.
  // The contract we assert: the title signal is COUNTED (not zeroed) for excludes.
  expect(makerScore(genuineBuild, sets())).toBeGreaterThan(
    makerScore(item({ ...genuineBuild, title: "Quarterly Earnings Review" }), sets()),
  );
});

test("makerScore: kind=idea is a strong positive", () => {
  const idea = item({
    id: "synth-idea",
    source: "some-feed",
    kind: "idea",
    topics: ["ai-projects"],
    title: "A weekend build",
  });
  expect(makerScore(idea, sets())).toBeGreaterThanOrEqual(3);
});

test("makerScore: title build vocabulary does NOT false-hit on essay words like 'marketing'", () => {
  const essay = item({
    id: "mktg",
    source: "some-blog",
    topics: ["ideas", "finance"],
    title: "The Future of Marketing in a Post-Ad World",
  });
  // "make" inside "marketing" must not trigger; no maker source, essay topics → out
  expect(makerScore(essay, sets())).toBeLessThan(3);
});

test("selectIdeas: keeps buildable items, drops op-eds, sorts by score then taste", () => {
  const items = [
    item({
      id: "esp-ble",
      source: "random-nerd-tutorials",
      topics: ["iot", "embedded", "diy"],
      title: "ESP32 Web BLE: Live Sensor Data Visualization",
      tasteScore: 0.4,
    }),
    item({
      id: "leisure",
      source: "laphams-quarterly",
      topics: ["history", "ideas"],
      title: "In Praise of Leisure",
    }),
    item({
      id: "css",
      source: "matklad-blog",
      topics: ["tech", "embedded"],
      title: "CSS: Unavoidable Bad Parts",
    }),
    item({
      id: "arduino-llm",
      source: "arduino-blog",
      topics: ["embedded", "diy", "iot"],
      title: "Running local LLMs on the Arduino UNO Q board: a practical guide",
      tasteScore: 0.9,
    }),
  ];
  const out = selectMaker(items, sets()).map((i) => i.id);
  expect(out).toContain("esp-ble");
  expect(out).toContain("arduino-llm");
  expect(out).not.toContain("leisure");
  expect(out).not.toContain("css");
});

test("selectIdeas: `ideas` channel alone never qualifies an item", () => {
  const items = [
    item({ id: "pure-essay", source: "essay-blog", topics: ["ideas"], title: "On Thinking Slowly" }),
  ];
  expect(selectMaker(items, sets())).toHaveLength(0);
});

// ── Task 4: short (sub-5-min) maker items need a TITLE build signal ────────────
import { MIN_FEED_MINUTES, dropBelowFeedFloor } from "./feed.js";

/** Body string that reads as ~N minutes at 225 wpm (wrapped in <p> like real bodies). */
const bodyMin = (minutes: number): string =>
  "<p>" + Array.from({ length: Math.round(minutes * 225) }, (_, i) => `word${i}`).join(" ") + "</p>";

test("selectIdeas: a SHORT (3-min) item with a build title qualifies for the Workshop", () => {
  const logger = item({
    id: "esp32-logger",
    source: "random-nerd-tutorials",
    topics: ["iot", "embedded"],
    title: "ESP32 sensor logger: log temperature to an SD card",
    body: bodyMin(3),
  });
  expect(selectMaker([logger], sets()).map((i) => i.id)).toEqual(["esp32-logger"]);
});

test("selectIdeas: a SHORT (3-min) maker-source product announcement (no build title) does NOT qualify", () => {
  // maker source (cnx-software-blog) scores ≥3 via the source bonus, but with a
  // sub-5-min read AND no hands-on build tell in the title it must be rejected —
  // this is a news/product item, not a build.
  const chuwi = item({
    id: "chuwi",
    source: "cnx-software-blog",
    topics: ["tech"],
    title: "$449 CHUWI UniBook laptop ships with Intel N150",
    body: bodyMin(3),
  });
  // sanity: it WOULD pass the bare score gate (pure source = +3) without the floor.
  expect(makerScore(chuwi, { ...sets(), pure: new Set(["cnx-software-blog"]) })).toBeGreaterThanOrEqual(3);
  expect(
    selectMaker([chuwi], { ...sets(), pure: new Set(["cnx-software-blog"]) }).map((i) => i.id),
  ).toEqual([]);
});

test("selectIdeas: a SHORT (4-min) item from a HANDS-ON source qualifies even with NO build keyword", () => {
  // "Prusament PLA High Speed" has no hardware keyword and no build verb, but
  // prusa-blog is a hands-on build source — a short item from it IS real signal.
  const prusament = item({
    id: "prusament",
    source: "prusa-blog",
    topics: ["3d-printing"],
    title: "Prusament PLA High Speed",
    body: bodyMin(4),
  });
  expect(
    selectMaker([prusament], { ...sets(), pure: new Set(["prusa-blog"]) }).map((i) => i.id),
  ).toEqual(["prusament"]);
});

test("selectIdeas: a SHORT (4-min) Raspberry-Pi 'LEAP' item (hands-on source, no keyword) qualifies", () => {
  const leap = item({
    id: "leap",
    source: "raspberry-pi-blog",
    topics: ["diy"],
    title: "LEAP",
    body: bodyMin(4),
  });
  expect(
    selectMaker([leap], { ...sets(), pure: new Set(["raspberry-pi-blog"]) }).map((i) => i.id),
  ).toEqual(["leap"]);
});

test("selectIdeas: a SHORT industry-news item (no hands-on source, no build keyword) does NOT qualify", () => {
  // Industry/news source (3dprintingindustry, NOT hands-on) + a title with no
  // hardware tell and no build verb → fails BOTH legs of the short-item rule.
  const news = item({
    id: "news",
    source: "3dprintingindustry",
    topics: ["3d-printing"],
    title: "Company X raises a Series B funding round",
    body: bodyMin(3),
  });
  expect(
    selectMaker([news], { ...sets(), pure: new Set(["3dprintingindustry"]) }).map((i) => i.id),
  ).toEqual([]);
});

test("selectIdeas: a LONG (≥5-min) maker item keeps the plain score>=threshold rule (no build title needed)", () => {
  // A long maker-source piece with no explicit build tell in the title still
  // qualifies — the build-title requirement only kicks in for SHORT items.
  const longArticle = item({
    id: "long-maker",
    source: "hackaday",
    topics: ["diy"],
    title: "A retrospective on the maker movement",
    body: bodyMin(9),
  });
  expect(
    selectMaker([longArticle], { ...sets(), pure: new Set(["hackaday"]) }).map((i) => i.id),
  ).toEqual(["long-maker"]);
});

// ── Task 3: the Feed floor keeps short maker items OUT of the Feed surfaces ────

test("MIN_FEED_MINUTES is 5 (the sacred Feed floor)", () => {
  expect(MIN_FEED_MINUTES).toBe(5);
});

test("dropBelowFeedFloor removes items whose body reads under 5 min, keeps the rest", () => {
  const items = [
    item({ id: "short-maker", source: "hackaday", topics: ["diy"], body: bodyMin(3) }),
    item({ id: "long", topics: ["tech"], body: bodyMin(9) }),
    item({ id: "exactly5", topics: ["tech"], body: bodyMin(5) }),
  ];
  expect(dropBelowFeedFloor(items).map((i) => i.id)).toEqual(["long", "exactly5"]);
});

test("dropBelowFeedFloor preserves existing behavior for bare-link / no-body items (kept)", () => {
  // No-body items have always reached the register; the floor must not change that.
  const items = [
    item({ id: "bare", body: undefined }),
    item({ id: "video-nobody", kind: "video", body: undefined }),
    item({ id: "short-article", body: bodyMin(2) }),
  ];
  expect(dropBelowFeedFloor(items).map((i) => i.id)).toEqual(["bare", "video-nobody"]);
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
