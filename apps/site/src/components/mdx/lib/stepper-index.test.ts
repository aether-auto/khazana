// apps/site/src/components/mdx/lib/stepper-index.test.ts
import { describe, expect, test } from "vitest";
import {
  clampStepIndex,
  nextStepIndex,
  prevStepIndex,
  canGoPrev,
  canGoNext,
  stepNumberLabel,
} from "./stepper-index.js";

describe("clampStepIndex", () => {
  test("clamps into [0, length-1]", () => {
    expect(clampStepIndex(-3, 5)).toBe(0);
    expect(clampStepIndex(2, 5)).toBe(2);
    expect(clampStepIndex(9, 5)).toBe(4);
  });
  test("empty / non-finite → 0", () => {
    expect(clampStepIndex(3, 0)).toBe(0);
    expect(clampStepIndex(Number.NaN, 5)).toBe(0);
    expect(clampStepIndex(Infinity, 5)).toBe(0);
  });
  test("truncates fractional indices", () => {
    expect(clampStepIndex(2.9, 5)).toBe(2);
  });
});

describe("next/prev (non-wrapping)", () => {
  test("next stops at the last step", () => {
    expect(nextStepIndex(0, 3)).toBe(1);
    expect(nextStepIndex(2, 3)).toBe(2); // no wrap to 0
  });
  test("prev stops at the first step", () => {
    expect(prevStepIndex(2, 3)).toBe(1);
    expect(prevStepIndex(0, 3)).toBe(0); // no wrap to last
  });
});

describe("canGoPrev / canGoNext", () => {
  test("disabled at the ends, enabled in the middle", () => {
    expect(canGoPrev(0, 3)).toBe(false);
    expect(canGoPrev(1, 3)).toBe(true);
    expect(canGoNext(2, 3)).toBe(false);
    expect(canGoNext(1, 3)).toBe(true);
  });
  test("empty sequence → both false", () => {
    expect(canGoPrev(0, 0)).toBe(false);
    expect(canGoNext(0, 0)).toBe(false);
  });
});

describe("stepNumberLabel", () => {
  test("1-based, zero-padded to 2 digits", () => {
    expect(stepNumberLabel(0)).toBe("01");
    expect(stepNumberLabel(8)).toBe("09");
    expect(stepNumberLabel(9)).toBe("10");
    expect(stepNumberLabel(11)).toBe("12");
  });
});
