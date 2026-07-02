// apps/site/src/components/mdx/lib/compare-slider.test.ts
import { describe, expect, test } from "vitest";
import {
  clampSplit,
  stepSplit,
  splitFromPointer,
  afterClip,
} from "./compare-slider.js";

describe("clampSplit", () => {
  test("clamps into 0..100", () => {
    expect(clampSplit(-10)).toBe(0);
    expect(clampSplit(150)).toBe(100);
    expect(clampSplit(42)).toBe(42);
  });
  test("NaN → safe middle 50", () => {
    expect(clampSplit(Number.NaN)).toBe(50);
  });
});

describe("stepSplit", () => {
  test("arrows step and clamp", () => {
    expect(stepSplit("ArrowRight", 50)).toBe(52);
    expect(stepSplit("ArrowUp", 50)).toBe(52);
    expect(stepSplit("ArrowLeft", 50)).toBe(48);
    expect(stepSplit("ArrowDown", 50)).toBe(48);
    expect(stepSplit("ArrowRight", 99)).toBe(100); // clamped
    expect(stepSplit("ArrowLeft", 1)).toBe(0); // clamped
  });
  test("Home/End jump to bounds", () => {
    expect(stepSplit("Home", 50)).toBe(0);
    expect(stepSplit("End", 50)).toBe(100);
  });
  test("PageUp/PageDown take a larger step", () => {
    expect(stepSplit("PageUp", 50, 2)).toBe(60);
    expect(stepSplit("PageDown", 50, 2)).toBe(40);
  });
  test("respects a custom step", () => {
    expect(stepSplit("ArrowRight", 50, 5)).toBe(55);
  });
  test("unhandled key → null", () => {
    expect(stepSplit("Enter", 50)).toBeNull();
    expect(stepSplit("a", 50)).toBeNull();
  });
});

describe("splitFromPointer", () => {
  test("maps position/size to a percentage", () => {
    expect(splitFromPointer(50, 200)).toBe(25);
    expect(splitFromPointer(200, 200)).toBe(100);
    expect(splitFromPointer(-5, 200)).toBe(0); // clamped
  });
  test("zero/invalid size → 50", () => {
    expect(splitFromPointer(10, 0)).toBe(50);
    expect(splitFromPointer(10, -3)).toBe(50);
  });
});

describe("afterClip", () => {
  test("horizontal clips from the right", () => {
    expect(afterClip(30, "h")).toBe("inset(0 70% 0 0)");
    expect(afterClip(100, "h")).toBe("inset(0 0% 0 0)");
  });
  test("vertical clips from the bottom", () => {
    expect(afterClip(30, "v")).toBe("inset(0 0 70% 0)");
    expect(afterClip(0, "v")).toBe("inset(0 0 100% 0)");
  });
  test("out-of-range split is clamped inside the clip", () => {
    expect(afterClip(200, "h")).toBe("inset(0 0% 0 0)");
  });
});
