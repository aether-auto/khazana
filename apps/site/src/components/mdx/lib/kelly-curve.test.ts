import { describe, it, expect } from "vitest";
import {
  clamp,
  round,
  growthRate,
  kellyFraction,
  edge,
  growthCurve,
  drawdownProb,
  relativeGrowth,
} from "./kelly-curve.js";

describe("clamp", () => {
  it("bounds within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it("falls back to lo on NaN", () => {
    expect(clamp(Number.NaN, 2, 9)).toBe(2);
  });
});

describe("round", () => {
  it("clears float dust", () => {
    expect(round(0.1 + 0.2, 3)).toBe(0.3);
  });
});

describe("kellyFraction", () => {
  it("matches f* = p − q for an even-money bet (b = 1)", () => {
    // Thorp Example 2.1: p = .53 even money -> f* = .06
    expect(kellyFraction(0.53, 1)).toBeCloseTo(0.06, 5);
    expect(kellyFraction(0.6, 1)).toBeCloseTo(0.2, 5);
  });
  it("matches f* = (bp − q)/b for general odds", () => {
    // 5-to-1 with p = .2: f* = (5·.2 − .8)/5 = .04
    expect(kellyFraction(0.2, 5)).toBeCloseTo(0.04, 5);
  });
  it("returns 0 for a non-positive edge (do not bet)", () => {
    expect(kellyFraction(0.5, 1)).toBe(0); // fair coin
    expect(kellyFraction(0.4, 1)).toBe(0); // losing edge
  });
});

describe("edge", () => {
  it("is b·p − q", () => {
    expect(edge(0.53, 1)).toBeCloseTo(0.06, 5);
    expect(edge(0.5, 1)).toBeCloseTo(0, 5);
  });
});

describe("growthRate", () => {
  it("is 0 at f = 0 (no bet, no growth)", () => {
    expect(growthRate(0.6, 1, 0)).toBe(0);
  });
  it("peaks at f* (the Kelly fraction maximises growth)", () => {
    const p = 0.6;
    const fStar = kellyFraction(p, 1); // 0.2
    const at = growthRate(p, 1, fStar);
    expect(growthRate(p, 1, fStar - 0.05)).toBeLessThan(at);
    expect(growthRate(p, 1, fStar + 0.05)).toBeLessThan(at);
  });
  it("matches Thorp's closed form g(f*) = p·ln p + q·ln q + ln 2 for even money", () => {
    const p = 0.6,
      q = 0.4;
    const closed = p * Math.log(p) + q * Math.log(q) + Math.log(2);
    expect(growthRate(p, 1, kellyFraction(p, 1))).toBeCloseTo(closed, 6);
  });
  it("crosses back through zero near 2·f* for even money", () => {
    // Thorp Ex 2.1: p=.53 -> f*=.06, fc ≈ .11973 (just under 2f*)
    expect(growthRate(0.53, 1, 0.11973)).toBeCloseTo(0, 3);
  });
  it("is −Infinity once you bet the whole bankroll", () => {
    expect(growthRate(0.6, 1, 1)).toBe(-Infinity);
  });
});

describe("growthCurve", () => {
  it("returns `samples` points starting at g(0)=0", () => {
    const pts = growthCurve(0.6, 1, 0.5, 6);
    expect(pts).toHaveLength(6);
    expect(pts[0].x).toBe(0);
    expect(pts[0].y).toBe(0);
  });
  it("clamps samples to a minimum of 2", () => {
    expect(growthCurve(0.6, 1, 0.5, 1)).toHaveLength(2);
  });
});

describe("drawdownProb", () => {
  it("full-Kelly: probability of ever halving is exactly 1/2", () => {
    expect(drawdownProb(0.5, 1)).toBeCloseTo(0.5, 6);
  });
  it("full-Kelly: probability of ever falling to a tenth is 0.1", () => {
    expect(drawdownProb(0.1, 1)).toBeCloseTo(0.1, 6);
  });
  it("half-Kelly squares the full-Kelly chance (x^3 at c=1/2)", () => {
    expect(drawdownProb(0.5, 0.5)).toBeCloseTo(0.5 ** 3, 6);
  });
  it("guards the boundaries", () => {
    expect(drawdownProb(0, 1)).toBe(0);
    expect(drawdownProb(1, 1)).toBe(1);
  });
});

describe("relativeGrowth", () => {
  it("half-Kelly keeps 3/4 of the growth", () => {
    expect(relativeGrowth(0.5)).toBeCloseTo(0.75, 6);
  });
  it("full Kelly is the maximum (1.0)", () => {
    expect(relativeGrowth(1)).toBeCloseTo(1, 6);
  });
});
