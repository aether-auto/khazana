// apps/site/src/components/mdx/lib/stat-format.test.ts
import { expect, test } from "vitest";
import { format, easeOutCubic, frameValue } from "./stat-format.js";

// ── format ────────────────────────────────────────────────────────────────────

test("format groups integers with thousands separators", () => {
  expect(format(20000000)).toBe("20,000,000");
  expect(format(1000)).toBe("1,000");
  expect(format(999)).toBe("999");
});

test("format applies prefix and suffix", () => {
  expect(format(2.6, { prefix: "$", suffix: "T", decimals: 1 })).toBe("$2.6T");
  expect(format(40, { suffix: " MILLION" })).toBe("40 MILLION");
});

test("format respects fixed decimals and still groups the integer part", () => {
  expect(format(1234.5, { decimals: 2 })).toBe("1,234.50");
  expect(format(2, { decimals: 1 })).toBe("2.0");
  expect(format(2.6, { decimals: 0 })).toBe("3");
});

test("format leaves natural floats intact when decimals omitted", () => {
  expect(format(2.6)).toBe("2.6");
});

test("format handles negatives with grouping", () => {
  expect(format(-12000, { decimals: 0 })).toBe("-12,000");
});

test("format suppresses grouping when group: false (years/IDs)", () => {
  expect(format(1859, { group: false })).toBe("1859");
  expect(format(1859)).toBe("1,859"); // default still groups
  expect(format(12000.5, { decimals: 1, group: false })).toBe("12000.5");
});

test("format coerces non-finite input to 0", () => {
  expect(format(Number.NaN)).toBe("0");
  expect(format(Infinity, { decimals: 2 })).toBe("0.00");
});

// ── easeOutCubic ────────────────────────────────────────────────────────────────

test("easeOutCubic pins endpoints and clamps out-of-range t", () => {
  expect(easeOutCubic(0)).toBe(0);
  expect(easeOutCubic(1)).toBe(1);
  expect(easeOutCubic(-0.5)).toBe(0);
  expect(easeOutCubic(2)).toBe(1);
});

test("easeOutCubic is front-loaded (past halfway at t=0.5)", () => {
  expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
});

// ── frameValue ──────────────────────────────────────────────────────────────────

test("frameValue starts at 0 and lands exactly on target", () => {
  expect(frameValue(100, 0, 1000)).toBe(0);
  expect(frameValue(100, 1000, 1000)).toBe(100);
  expect(frameValue(100, 1200, 1000)).toBe(100); // past the end stays pinned
});

test("frameValue returns target immediately for non-positive duration", () => {
  expect(frameValue(42, 0, 0)).toBe(42);
  expect(frameValue(42, 0, -10)).toBe(42);
});

test("frameValue is monotonic and bounded mid-tween", () => {
  const a = frameValue(100, 250, 1000);
  const b = frameValue(100, 500, 1000);
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  expect(b).toBeLessThan(100);
});
