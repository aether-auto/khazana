// apps/site/src/components/mdx/lib/stat-format.test.ts
import { expect, test } from "vitest";
import { format, easeOutCubic, frameValue, resolveDecimals, fitScale } from "./stat-format.js";

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

test("format keeps a tidy short float when decimals omitted", () => {
  expect(format(2.6)).toBe("2.6");
  expect(format(17.6)).toBe("17.6");
});

// ── defensive auto-rounding (B2 / B3 / MOB): a raw unrounded float must NEVER
//    print full precision — it would smear and overflow the cell mid-count. ──

test("format defensively rounds raw unrounded floats when decimals omitted", () => {
  // a long float that an author passed without decimals (Carrington nT values)
  expect(format(1533.4509264339)).toBe("1,533");
  expect(format(-1686.7960190773)).toBe("-1,687");
  // a mid-count interpolated frame value must also collapse to something tidy
  expect(format(4.79203414510624)).toBe("4.8");
  expect(format(935557240655.12)).toBe("935,557,240,655");
});

test("format auto-derives decimals by magnitude and trims trailing zeros", () => {
  expect(format(100.0)).toBe("100"); // |v|>=100 -> integer
  expect(format(123.456)).toBe("123"); // |v|>=100 -> integer
  expect(format(40)).toBe("40"); // integer stays clean
  expect(format(0.824)).toBe("0.82"); // |v|<1 -> up to 2 decimals
  expect(format(0.8)).toBe("0.8"); // trailing zero trimmed
});

test("explicit decimals always win over auto-rounding", () => {
  expect(format(1533.4509, { decimals: 0 })).toBe("1,533");
  expect(format(1533.4509, { decimals: 2 })).toBe("1,533.45");
  expect(format(100, { decimals: 2 })).toBe("100.00"); // explicit keeps zeros
});

// ── fitScale (fit-to-cell, B3) ──────────────────────────────────────────────────

test("fitScale is 1 when content already fits the available width", () => {
  expect(fitScale(80, 120)).toBe(1);
  expect(fitScale(120, 120)).toBe(1); // exactly fits
});

test("fitScale shrinks proportionally when content overflows the cell", () => {
  expect(fitScale(200, 100)).toBe(0.5);
  expect(fitScale(150, 120)).toBeCloseTo(0.8, 5);
});

test("fitScale never returns above 1 (only ever shrinks)", () => {
  expect(fitScale(10, 1000)).toBe(1);
});

test("fitScale guards degenerate inputs (zero/negative/non-finite) → 1", () => {
  expect(fitScale(0, 100)).toBe(1);
  expect(fitScale(100, 0)).toBe(1);
  expect(fitScale(100, -5)).toBe(1);
  expect(fitScale(Number.NaN, 100)).toBe(1);
  expect(fitScale(100, Number.POSITIVE_INFINITY)).toBe(1);
});

test("fitScale floors at a readable minimum so it never collapses to nothing", () => {
  // an absurd overflow still clamps to the floor, not 0
  expect(fitScale(100000, 10)).toBe(0.35);
});

// ── resolveDecimals ─────────────────────────────────────────────────────────────

test("resolveDecimals scales precision down as magnitude grows", () => {
  expect(resolveDecimals(0.824)).toBe(2);
  expect(resolveDecimals(2.6)).toBe(1);
  expect(resolveDecimals(17.6)).toBe(1);
  expect(resolveDecimals(100)).toBe(0);
  expect(resolveDecimals(1533.45)).toBe(0);
  expect(resolveDecimals(0)).toBe(2);
  expect(resolveDecimals(-1686.79)).toBe(0);
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

test("frameValue never exceeds the target magnitude at any frame (clamp)", () => {
  // sample the whole tween for a positive and a negative target
  for (let ms = 0; ms <= 1000; ms += 37) {
    const p = frameValue(1600, ms, 1000);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1600);
    const n = frameValue(-1760, ms, 1000);
    expect(n).toBeLessThanOrEqual(0);
    expect(n).toBeGreaterThanOrEqual(-1760);
  }
});

test("frameValue interpolates a negative target from 0 toward it", () => {
  expect(frameValue(-1760, 0, 1000)).toBe(0);
  expect(frameValue(-1760, 1000, 1000)).toBe(-1760);
  const mid = frameValue(-1760, 500, 1000);
  expect(mid).toBeLessThan(0);
  expect(mid).toBeGreaterThan(-1760);
});
