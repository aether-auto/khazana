import { describe, it, expect } from "vitest";
import { countWords, estimateReadMinutes, readTimeFromHtml } from "./read-time.js";

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

describe("readTimeFromHtml", () => {
  it("strips HTML tags and computes read time at 225 wpm", () => {
    // 225 words at 225 wpm = exactly 1 min
    const words = Array.from({ length: 225 }, (_, i) => `word${i}`).join(" ");
    const html = `<p>${words}</p>`;
    expect(readTimeFromHtml(html)).toBe(1);
  });
  it("floors at 1 minute for very short bodies", () => {
    expect(readTimeFromHtml("<p>hello world</p>")).toBe(1);
    expect(readTimeFromHtml("")).toBe(1);
  });
  it("returns 1 for undefined / falsy body", () => {
    expect(readTimeFromHtml(undefined)).toBe(1);
  });
  it("ignores HTML tags when counting words", () => {
    // "hello world" = 2 words, but the tags themselves must not count
    expect(readTimeFromHtml("<div><p>hello</p><span>world</span></div>")).toBe(1);
  });
  it("correctly rounds up for 450 words at 225 wpm", () => {
    const words = Array.from({ length: 450 }, (_, i) => `word${i}`).join(" ");
    expect(readTimeFromHtml(`<article>${words}</article>`)).toBe(2);
  });
});
