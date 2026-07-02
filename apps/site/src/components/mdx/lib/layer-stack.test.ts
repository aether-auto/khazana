// apps/site/src/components/mdx/lib/layer-stack.test.ts
import { describe, expect, test } from "vitest";
import { toggleActive, clampActive, isExpanded, stepActive } from "./layer-stack.js";

describe("toggleActive", () => {
  test("clicking a new layer makes it active", () => {
    expect(toggleActive(null, 2)).toBe(2);
    expect(toggleActive(0, 3)).toBe(3);
  });
  test("clicking the active layer collapses it (null)", () => {
    expect(toggleActive(2, 2)).toBeNull();
  });
});

describe("clampActive", () => {
  test("passes through valid indices", () => {
    expect(clampActive(0, 4)).toBe(0);
    expect(clampActive(3, 4)).toBe(3);
  });
  test("null stays null", () => {
    expect(clampActive(null, 4)).toBeNull();
  });
  test("out-of-range → null", () => {
    expect(clampActive(4, 4)).toBeNull();
    expect(clampActive(-1, 4)).toBeNull();
  });
  test("non-finite → null", () => {
    expect(clampActive(Number.NaN, 4)).toBeNull();
    expect(clampActive(Infinity, 4)).toBeNull();
  });
});

describe("isExpanded", () => {
  test("reduced → every layer expanded", () => {
    expect(isExpanded(0, null, true)).toBe(true);
    expect(isExpanded(3, 1, true)).toBe(true);
  });
  test("interactive → only the active layer expands", () => {
    expect(isExpanded(2, 2, false)).toBe(true);
    expect(isExpanded(0, 2, false)).toBe(false);
    expect(isExpanded(0, null, false)).toBe(false);
  });
});

describe("stepActive", () => {
  test("Down/Right advance and clamp at the end", () => {
    expect(stepActive("ArrowDown", 0, 4)).toBe(1);
    expect(stepActive("ArrowRight", 2, 4)).toBe(3);
    expect(stepActive("ArrowDown", 3, 4)).toBe(3); // clamped
  });
  test("Up/Left retreat and clamp at the start", () => {
    expect(stepActive("ArrowUp", 2, 4)).toBe(1);
    expect(stepActive("ArrowLeft", 0, 4)).toBe(0); // clamped
  });
  test("from null, Down goes to first, Up goes to first", () => {
    expect(stepActive("ArrowDown", null, 4)).toBe(0);
    expect(stepActive("ArrowUp", null, 4)).toBe(0);
  });
  test("Home/End jump to bounds", () => {
    expect(stepActive("Home", 2, 4)).toBe(0);
    expect(stepActive("End", 1, 4)).toBe(3);
  });
  test("unhandled key → null", () => {
    expect(stepActive("Enter", 1, 4)).toBeNull();
    expect(stepActive("x", 1, 4)).toBeNull();
  });
  test("empty stack → null", () => {
    expect(stepActive("ArrowDown", 0, 0)).toBeNull();
  });
});
