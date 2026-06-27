import { expect, test } from "vitest";
import type { FeedItem } from "./feed-item.js";
import {
  makerScore,
  isMakerCandidate,
  titleBuildSignal,
  MAKER_THRESHOLD,
  MAKER_MIN_READ_MINUTES,
  PURE_MAKER_ALLOWLIST,
  HANDS_ON_MAKER_SOURCES,
  MAKER_EXCLUDE,
  HARD_MAKER_CHANNELS,
  type MakerSets,
} from "./maker.js";

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
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

// ── constants ─────────────────────────────────────────────────────────────────

test("MAKER_THRESHOLD is 3", () => {
  expect(MAKER_THRESHOLD).toBe(3);
});

test("MAKER_MIN_READ_MINUTES is 3 (the relaxed maker floor)", () => {
  expect(MAKER_MIN_READ_MINUTES).toBe(3);
});

test("the canonical maker sets/regexes are exported from core", () => {
  expect(PURE_MAKER_ALLOWLIST.has("hackaday")).toBe(true);
  expect(MAKER_EXCLUDE.has("ieee-spectrum-tech")).toBe(true);
  expect(HARD_MAKER_CHANNELS.has("embedded")).toBe(true);
});

// ── HANDS_ON_MAKER_SOURCES tier ───────────────────────────────────────────────

test("HANDS_ON_MAKER_SOURCES contains hands-on build blogs but NOT industry/news", () => {
  // hands-on build blogs
  expect(HANDS_ON_MAKER_SOURCES.has("hackaday")).toBe(true);
  expect(HANDS_ON_MAKER_SOURCES.has("prusa-blog")).toBe(true);
  expect(HANDS_ON_MAKER_SOURCES.has("raspberry-pi-blog")).toBe(true);
  expect(HANDS_ON_MAKER_SOURCES.has("make-magazine")).toBe(true);
  // industry / news sources are NOT hands-on
  expect(HANDS_ON_MAKER_SOURCES.has("cnx-software-blog")).toBe(false);
  expect(HANDS_ON_MAKER_SOURCES.has("3dprintingindustry")).toBe(false);
  expect(HANDS_ON_MAKER_SOURCES.has("all3dp")).toBe(false);
  expect(HANDS_ON_MAKER_SOURCES.has("voxelmatters")).toBe(false);
});

test("HANDS_ON_MAKER_SOURCES is a strict subset of PURE_MAKER_ALLOWLIST (the union)", () => {
  for (const id of HANDS_ON_MAKER_SOURCES) {
    expect(PURE_MAKER_ALLOWLIST.has(id)).toBe(true);
  }
});

test("the +3 PURE scoring is unchanged — industry sources still score full source bonus", () => {
  const industry = item({ source: "3dprintingindustry", topics: ["3d-printing"], title: "Some news" });
  // pure (+3) + hard channel bonus only via sets; here just assert source bonus present.
  const withPure = makerScore(industry, { ...sets(), pure: new Set(["3dprintingindustry"]) });
  const withoutPure = makerScore(industry, { ...sets(), pure: new Set() });
  expect(withPure - withoutPure).toBe(3);
});

// ── makerScore ranking ─────────────────────────────────────────────────────────

test("makerScore: a PURE-allowlist build (ESP32 tutorial) scores at/above threshold", () => {
  const it = item({
    source: "random-nerd-tutorials",
    topics: ["iot", "embedded", "diy"],
    title: "ESP32 Web BLE: Live Sensor Data Visualization (BME280 Charts)",
  });
  expect(makerScore(it, sets())).toBeGreaterThanOrEqual(MAKER_THRESHOLD);
});

test("makerScore: an essay-topic op-ed stays below threshold", () => {
  const leisure = item({
    source: "laphams-quarterly",
    topics: ["history", "ideas"],
    title: "In Praise of Leisure",
  });
  expect(makerScore(leisure, sets())).toBeLessThan(MAKER_THRESHOLD);
});

test("makerScore: EXCLUDE source with a false maker tag stays out", () => {
  const css = item({
    source: "matklad-blog",
    topics: ["tech", "embedded"],
    title: "CSS: Unavoidable Bad Parts",
  });
  expect(makerScore(css, sets())).toBeLessThan(MAKER_THRESHOLD);
});

test("makerScore: EXCLUDE penalty is applied (a genuine build title is still counted, not zeroed)", () => {
  const genuineBuild = item({
    source: "ieee-spectrum-tech",
    topics: ["tech", "embedded"],
    title: "How I Built a Raspberry Pi Geiger Counter From Scratch",
  });
  // Title build signal is COUNTED for excludes — strictly greater than the same
  // item without a build title.
  expect(makerScore(genuineBuild, sets())).toBeGreaterThan(
    makerScore(item({ ...genuineBuild, title: "Quarterly Earnings Review" }), sets()),
  );
});

test("makerScore: kind=idea is a strong positive", () => {
  const idea = item({ source: "some-feed", kind: "idea", topics: ["ai-projects"], title: "A weekend build" });
  expect(makerScore(idea, sets())).toBeGreaterThanOrEqual(MAKER_THRESHOLD);
});

// ── titleBuildSignal ──────────────────────────────────────────────────────────

test("titleBuildSignal: a hardware title (ESP32) is a build signal on its own", () => {
  const it = item({ source: "x", topics: ["tech"], title: "ESP32 sensor logger build" });
  expect(titleBuildSignal(it, sets())).toBe(true);
});

test("titleBuildSignal: a maker-source product announcement (no build tell) is NOT a build signal", () => {
  const it = item({
    source: "cnx-software-blog",
    topics: ["tech"],
    title: "$449 CHUWI UniBook laptop ships with Intel N150",
  });
  // weak "ships" is not in the vocab; no hardware tell; maker source alone ≠ build
  expect(titleBuildSignal(it, sets())).toBe(false);
});

test("titleBuildSignal: 'marketing' does not false-hit the weak `make` verb", () => {
  const essay = item({ source: "some-blog", topics: ["ideas", "finance"], title: "The Future of Marketing" });
  expect(titleBuildSignal(essay, sets())).toBe(false);
});

// ── isMakerCandidate (registry-free) ──────────────────────────────────────────

test("isMakerCandidate: true when source ∈ PURE_MAKER_ALLOWLIST", () => {
  expect(isMakerCandidate(item({ source: "hackaday", topics: ["tech"] }))).toBe(true);
});

test("isMakerCandidate: true when topics intersect a HARD maker channel", () => {
  expect(isMakerCandidate(item({ source: "random-blog", topics: ["embedded"] }))).toBe(true);
  expect(isMakerCandidate(item({ source: "random-blog", topics: ["3d-printing"] }))).toBe(true);
});

test("isMakerCandidate: false for a plain tech essay from a non-maker source", () => {
  expect(isMakerCandidate(item({ source: "ryg-blog", topics: ["tech", "ai"] }))).toBe(false);
});

test("isMakerCandidate: false when ai-projects is the only maker-ish tag (not a HARD channel)", () => {
  // ai-projects is a browse channel, deliberately NOT a hard maker channel.
  expect(isMakerCandidate(item({ source: "random-blog", topics: ["ai-projects", "ai"] }))).toBe(false);
});

test("isMakerCandidate: registry-free — uses the static PURE allowlist, no MakerSets needed", () => {
  // arduino-blog is in the static allowlist even with no maker topic tag.
  expect(isMakerCandidate(item({ source: "arduino-blog", topics: ["tech"] }))).toBe(true);
});
