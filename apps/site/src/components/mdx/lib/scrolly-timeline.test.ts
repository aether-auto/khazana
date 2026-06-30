// apps/site/src/components/mdx/lib/scrolly-timeline.test.ts
import { expect, test } from "vitest";
import {
  activeIndexFromScroll,
  sectionProgress,
  playheadFraction,
  fractionToIndex,
  indexToScrollY,
  nearestIndexByX,
  clampIndex,
  reachedScrollTarget,
} from "./scrolly-timeline.js";

// ── activeIndexFromScroll ───────────────────────────────────────────────────────
// Position-based (NOT crossing-event) active resolution — correct at ANY scroll
// position, so it can never freeze under late `client:visible` hydration. The
// active panel is the LAST one whose viewport-relative top has reached the line.

test("activeIndexFromScroll: before any panel reaches the line → index 0", () => {
  // every panel still below the trigger line (line = 0.5 * 1000 = 500)
  expect(activeIndexFromScroll([900, 1800, 2700], 1000, 0.5)).toBe(0);
});

test("activeIndexFromScroll: returns the last panel whose top crossed the line", () => {
  // line = 500. tops 100 and 480 have crossed; 1300 has not → index 1.
  expect(activeIndexFromScroll([100, 480, 1300], 1000, 0.5)).toBe(1);
});

test("activeIndexFromScroll: all panels scrolled past the line → last index", () => {
  expect(activeIndexFromScroll([-2000, -1000, -50], 1000, 0.5)).toBe(2);
});

test("activeIndexFromScroll: empty → 0 (caller renders fallback)", () => {
  expect(activeIndexFromScroll([], 1000, 0.5)).toBe(0);
});

test("activeIndexFromScroll: a panel exactly on the line counts as reached", () => {
  expect(activeIndexFromScroll([500, 1500], 1000, 0.5)).toBe(0);
});

// ── sectionProgress ─────────────────────────────────────────────────────────────
// Continuous 0..1 progress of the reader through the scrolly section, used to
// glide the playhead smoothly between event ticks (not just snap to the active).

test("sectionProgress: section top below viewport → 0 (not started)", () => {
  // sectionTop is viewport-relative; +200 means it starts 200px below the top.
  expect(sectionProgress(200, 4000, 1000)).toBe(0);
});

test("sectionProgress: scrolled fully past the section → 1", () => {
  // section is 4000 tall, viewport 1000; once we've scrolled (4000-1000) past the
  // top, progress saturates at 1. sectionTop = -(3000) → progress 1.
  expect(sectionProgress(-3000, 4000, 1000)).toBe(1);
});

test("sectionProgress: halfway through the scrollable range → ~0.5", () => {
  // scrollable = sectionHeight - viewportH = 3000; halfway = sectionTop -1500.
  expect(sectionProgress(-1500, 4000, 1000)).toBeCloseTo(0.5, 5);
});

test("sectionProgress: degenerate (section shorter than viewport) → clamped finite", () => {
  const p = sectionProgress(0, 500, 1000);
  expect(Number.isFinite(p)).toBe(true);
  expect(p).toBeGreaterThanOrEqual(0);
  expect(p).toBeLessThanOrEqual(1);
});

// ── playheadFraction ────────────────────────────────────────────────────────────
// Maps continuous section progress → a fraction along the rail [0,1]. With N
// panels each owning an equal slice of scroll, progress 0 sits the playhead at
// the first tick and progress 1 at the last tick (so it spans tick0..tickLast,
// not 0..railWidth, keeping it glued to real events).

test("playheadFraction: progress 0 → first event's fraction", () => {
  // tickFractions are the normalized x of each event tick on the rail.
  expect(playheadFraction(0, [0.0, 0.4, 1.0])).toBeCloseTo(0.0, 5);
});

test("playheadFraction: progress 1 → last event's fraction", () => {
  expect(playheadFraction(1, [0.0, 0.4, 1.0])).toBeCloseTo(1.0, 5);
});

test("playheadFraction: progress glides linearly between adjacent ticks", () => {
  // 3 ticks → 2 equal progress segments. progress 0.25 is halfway through the
  // first segment → halfway between tick0 (0.0) and tick1 (0.4) = 0.2.
  expect(playheadFraction(0.25, [0.0, 0.4, 1.0])).toBeCloseTo(0.2, 5);
  // progress 0.75 → halfway between tick1 (0.4) and tick2 (1.0) = 0.7.
  expect(playheadFraction(0.75, [0.0, 0.4, 1.0])).toBeCloseTo(0.7, 5);
});

test("playheadFraction: single tick → always that tick", () => {
  expect(playheadFraction(0.3, [0.5])).toBeCloseTo(0.5, 5);
});

test("playheadFraction: empty ticks → 0 (no crash)", () => {
  expect(playheadFraction(0.3, [])).toBe(0);
});

// ── fractionToIndex ─────────────────────────────────────────────────────────────
// Scrub: a drag fraction along the rail → the nearest event index to snap to.

test("fractionToIndex: snaps a drag fraction to the nearest tick index", () => {
  const ticks = [0.0, 0.4, 1.0];
  expect(fractionToIndex(0.0, ticks)).toBe(0);
  expect(fractionToIndex(0.19, ticks)).toBe(0); // closer to 0.0 than 0.4
  expect(fractionToIndex(0.21, ticks)).toBe(1); // closer to 0.4
  expect(fractionToIndex(0.71, ticks)).toBe(2); // closer to 1.0 than 0.4
  expect(fractionToIndex(1.0, ticks)).toBe(2);
});

test("fractionToIndex: clamps out-of-range drag", () => {
  const ticks = [0.0, 0.5, 1.0];
  expect(fractionToIndex(-0.4, ticks)).toBe(0);
  expect(fractionToIndex(1.7, ticks)).toBe(2);
});

test("fractionToIndex: empty → 0", () => {
  expect(fractionToIndex(0.5, [])).toBe(0);
});

// ── nearestIndexByX (click a tick) ───────────────────────────────────────────────

test("nearestIndexByX: maps a click x to the nearest tick's index", () => {
  const xs = [0, 400, 1000];
  expect(nearestIndexByX(10, xs)).toBe(0);
  expect(nearestIndexByX(390, xs)).toBe(1);
  expect(nearestIndexByX(900, xs)).toBe(2);
});

// ── indexToScrollY (jump to an event) ────────────────────────────────────────────
// Two-way scrub: given the target panel's CURRENT viewport-relative top, the
// current window.scrollY, viewport height, and the trigger offset, returns the
// absolute scrollY that lands that panel exactly on the trigger line.

test("indexToScrollY: returns the absolute scrollY that puts the panel on the line", () => {
  // panel top currently at +800 (viewport-relative), we're at scrollY=2000,
  // viewport 1000, offset 0.5 → line at 500. We must scroll DOWN by (800-500)=300.
  // target scrollY = 2000 + 300 = 2300.
  expect(indexToScrollY(800, 2000, 1000, 0.5)).toBe(2300);
});

test("indexToScrollY: panel above the line → scrolls back up", () => {
  // panel top at +100, line 500 → scroll up by 400. 2000 + (100-500) = 1600.
  expect(indexToScrollY(100, 2000, 1000, 0.5)).toBe(1600);
});

test("indexToScrollY: never returns a negative scroll target", () => {
  // would compute 100 + (10-500) = -390 → clamp to 0.
  expect(indexToScrollY(10, 100, 1000, 0.5)).toBe(0);
});

// ── clampIndex ───────────────────────────────────────────────────────────────────

test("clampIndex: keeps an index inside [0, count-1]", () => {
  expect(clampIndex(-3, 5)).toBe(0);
  expect(clampIndex(9, 5)).toBe(4);
  expect(clampIndex(2, 5)).toBe(2);
});

test("clampIndex: empty count → 0", () => {
  expect(clampIndex(2, 0)).toBe(0);
});

// ── reachedScrollTarget (programmatic smooth-jump settle test) ─────────────────────
// While a smooth jump is in flight, the scroll handler must NOT overwrite `active`
// with the still-in-transit position (it would land one event short until the
// animation settles — bug #2). The component suppresses setActive until the scroll
// reaches the target within a tolerance; this is that predicate.

test("reachedScrollTarget: true once scrollY is within tolerance of the target", () => {
  expect(reachedScrollTarget(2300, 2300, 2)).toBe(true);
  expect(reachedScrollTarget(2299, 2300, 2)).toBe(true); // within ±2
  expect(reachedScrollTarget(2301, 2300, 2)).toBe(true);
});

test("reachedScrollTarget: false while still mid-flight (outside tolerance)", () => {
  // smooth scroll still climbing toward 2300 — one event short until it arrives
  expect(reachedScrollTarget(1800, 2300, 2)).toBe(false);
  expect(reachedScrollTarget(2290, 2300, 2)).toBe(false);
});

test("reachedScrollTarget: clamps to document max — target beyond max still resolves", () => {
  // The browser can't scroll past maxScrollY, so a target beyond it is reached
  // once scrollY sits at max (passed in as the effective target by the caller).
  expect(reachedScrollTarget(4885, 4885, 2)).toBe(true);
});

test("reachedScrollTarget: default tolerance is forgiving of sub-pixel rounding", () => {
  expect(reachedScrollTarget(2300.4, 2300, undefined)).toBe(true);
});
