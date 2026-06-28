// apps/site/src/components/mdx/lib/scrolly-state.test.ts
import { expect, test } from "vitest";
import { resolveActiveStep, clampStepIndex, safeActiveStep } from "./scrolly-state.js";

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
