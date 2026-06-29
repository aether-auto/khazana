// apps/site/src/components/mdx/lib/scrolly-state.test.ts
import { expect, test } from "vitest";
import {
  resolveActiveStep,
  clampStepIndex,
  safeActiveStep,
  isActiveStep,
  STEP_TRIGGER_OFFSET,
  activeStepFromScroll,
} from "./scrolly-state.js";

test("clampStepIndex keeps index within [0, count-1]", () => {
  expect(clampStepIndex(-2, 3)).toBe(0);
  expect(clampStepIndex(5, 3)).toBe(2);
  expect(clampStepIndex(1, 3)).toBe(1);
});

test("clamp with zero steps yields 0", () => {
  expect(clampStepIndex(3, 0)).toBe(0);
});

test("resolveActiveStep returns the entered index when in range", () => {
  expect(resolveActiveStep({ entered: 2, count: 4, current: 0 })).toBe(2);
});

test("resolveActiveStep clamps and falls back to current on NaN", () => {
  expect(resolveActiveStep({ entered: 9, count: 4, current: 1 })).toBe(3);
  expect(resolveActiveStep({ entered: Number.NaN, count: 4, current: 1 })).toBe(1);
});

// ── safeActiveStep ────────────────────────────────────────────────────────────

test("safeActiveStep: returns null when count is 0 (empty steps)", () => {
  expect(safeActiveStep(0, 0)).toBeNull();
});

test("safeActiveStep: returns null for any active value when count is 0", () => {
  expect(safeActiveStep(99, 0)).toBeNull();
  expect(safeActiveStep(-1, 0)).toBeNull();
});

test("safeActiveStep: returns clamped index when count > 0", () => {
  expect(safeActiveStep(1, 3)).toBe(1);
});

test("safeActiveStep: clamps high out-of-range active to last index", () => {
  expect(safeActiveStep(10, 3)).toBe(2);
});

test("safeActiveStep: clamps negative active to 0", () => {
  expect(safeActiveStep(-5, 3)).toBe(0);
});

test("safeActiveStep: single step always returns 0", () => {
  expect(safeActiveStep(0, 1)).toBe(0);
  expect(safeActiveStep(99, 1)).toBe(0);
});

// ── lockstep: ONE predicate drives both the chart swap and the prose highlight ─

test("isActiveStep: the active index is the one and only active step", () => {
  // both the sticky chart (renders steps[active]) and the prose highlight
  // (adds --active to step i) must agree on the SAME index.
  const active = safeActiveStep(2, 4)!;
  expect([0, 1, 2, 3].filter((i) => isActiveStep(i, active))).toEqual([2]);
});

test("isActiveStep: clamps the active index before comparing", () => {
  // an out-of-range active value still highlights exactly one (clamped) step,
  // so the prose never gets stuck while the chart moves.
  expect(isActiveStep(3, 99)).toBe(false);
  // count is unknown here, so callers clamp via safeActiveStep first; isActiveStep
  // is a pure equality on already-resolved indices.
  expect(isActiveStep(3, 3)).toBe(true);
});

test("STEP_TRIGGER_OFFSET: a single centered trigger line (same threshold for both)", () => {
  // the chart swap and the prose highlight share ONE scrollama offset, so the
  // step crossing the line is simultaneously the active prose and the shown chart.
  expect(STEP_TRIGGER_OFFSET).toBeGreaterThan(0);
  expect(STEP_TRIGGER_OFFSET).toBeLessThan(1);
  // centered (~0.5) so the active prose sits beside the vertically-centered sticky graphic
  expect(STEP_TRIGGER_OFFSET).toBeCloseTo(0.5, 1);
});

// ── activeStepFromScroll: position-based resolver (never freezes on late hydration) ─
//
// Root cause of the round-1/round-2 FAIL: <Scrolly> is `client:visible`, so the
// island hydrates LATE (the figure is ~2500px down). scrollama sets up its
// IntersectionObservers at that moment and only fires onStepEnter on subsequent
// THRESHOLD CROSSINGS — so `active` freezes wherever it happened to land at
// hydration (step 0 if scrolling slowly into view, step 2 if scrolled past fast).
// This pure resolver computes the active step from the steps' current
// viewport-relative tops at ANY scroll position, so it is always correct.

const VH = 1000; // viewport height; trigger line at 0.5*VH = 500px from top.

// tops[i] = step i's getBoundingClientRect().top (viewport-relative px).
test("activeStepFromScroll: before any step reaches the line → step 0", () => {
  // all steps still below the trigger line (top > 500)
  expect(activeStepFromScroll([700, 1700, 2700], VH, 0.5)).toBe(0);
});

test("activeStepFromScroll: step whose top crossed the line but next has not → that step", () => {
  // step 0 top=-200 (crossed), step 1 top=400 (crossed, ≤500), step 2 top=1400 (not)
  expect(activeStepFromScroll([-200, 400, 1400], VH, 0.5)).toBe(1);
});

test("activeStepFromScroll: scrolled past everything → last step (no freeze on step 0)", () => {
  // ALL tops above the line (negative) — this is the late-hydration/fast-scroll case
  expect(activeStepFromScroll([-2000, -1300, -600], VH, 0.5)).toBe(2);
});

test("activeStepFromScroll: the active step advances monotonically with scroll", () => {
  // simulate scrolling down: every step's top decreases by the same delta.
  const base = [600, 1600, 2600];
  const seen = new Set<number>();
  for (let scrolled = 0; scrolled <= 3000; scrolled += 100) {
    seen.add(activeStepFromScroll(base.map((t) => t - scrolled), VH, 0.5));
  }
  // it must visit ALL three steps across the sweep (not get stuck on 0 or 2).
  expect([...seen].sort()).toEqual([0, 1, 2]);
});

test("activeStepFromScroll: empty / single-step inputs are safe", () => {
  expect(activeStepFromScroll([], VH, 0.5)).toBe(0);
  expect(activeStepFromScroll([300], VH, 0.5)).toBe(0);
});
