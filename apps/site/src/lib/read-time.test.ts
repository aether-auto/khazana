import { describe, it, expect } from "vitest";
import { countWords, estimateReadMinutes } from "./read-time.js";

describe("countWords", () => {
  it("counts whitespace-delimited words", () => {
    expect(countWords("the quick brown fox")).toBe(4);
  });
  it("collapses runs of whitespace and newlines", () => {
    expect(countWords("a\n\n  b\t c")).toBe(3);
  });
  it("is 0 for empty / whitespace-only input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n ")).toBe(0);
  });
});

describe("estimateReadMinutes", () => {
  it("rounds words/wpm to whole minutes", () => {
    expect(estimateReadMinutes(2300)).toBe(10);
    expect(estimateReadMinutes(345)).toBe(2); // 345/230 = 1.5 -> 2
  });
  it("floors at 1 minute", () => {
    expect(estimateReadMinutes(10)).toBe(1);
    expect(estimateReadMinutes(0)).toBe(1);
  });
  it("respects a custom wpm", () => {
    expect(estimateReadMinutes(600, 300)).toBe(2);
  });
});
