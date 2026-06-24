// apps/site/src/components/mdx/lib/scrolly-state.test.ts
import { expect, test } from "vitest";
import { resolveActiveStep, clampStepIndex } from "./scrolly-state.js";

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
