import { describe, it, expect } from "vitest";
import {
  clamp,
  round,
  decayCurve,
  halfLife,
  crossover,
  yExtent,
  type DecayParams,
} from "./model-curve.js";

const base: DecayParams = { start: 3, floor: 0.5, rate: 0.2, samples: 5, span: 12 };

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
    expect(round(1.23456, 2)).toBe(1.23);
  });
});

describe("decayCurve", () => {
  it("returns `samples` points across [0, span]", () => {
    const pts = decayCurve(base);
    expect(pts).toHaveLength(5);
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBe(12);
  });
  it("starts at `start` and decays monotonically toward `floor`", () => {
    const pts = decayCurve(base);
    expect(pts[0].y).toBeCloseTo(3, 5);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].y).toBeLessThan(pts[i - 1].y);
    }
    expect(pts[pts.length - 1].y).toBeGreaterThan(base.floor);
  });
  it("a flat curve (rate 0) holds at start", () => {
    const pts = decayCurve({ ...base, rate: 0 });
    for (const p of pts) expect(p.y).toBeCloseTo(3, 5);
  });
  it("clamps samples to a minimum of 2", () => {
    expect(decayCurve({ ...base, samples: 1 })).toHaveLength(2);
    expect(decayCurve({ ...base, samples: 0 })).toHaveLength(2);
  });
  it("guards a non-positive span", () => {
    const pts = decayCurve({ ...base, span: 0 });
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBe(1);
  });
});

describe("halfLife", () => {
  it("is ln2 / rate", () => {
    expect(halfLife(0.2)).toBeCloseTo(Math.LN2 / 0.2, 3);
  });
  it("is Infinity for rate 0", () => {
    expect(halfLife(0)).toBe(Infinity);
  });
});

describe("crossover", () => {
  it("finds where the curve passes a threshold", () => {
    // start 3, floor 0.5, threshold 1 -> x = ln(2.5/0.5)/0.2 = ln5/0.2
    const x = crossover(base, 1);
    expect(x).toBeCloseTo(Math.log(2.5 / 0.5) / 0.2, 2);
  });
  it("returns null below the floor", () => {
    expect(crossover(base, 0.4)).toBeNull();
  });
  it("returns 0 when already below at x=0", () => {
    expect(crossover(base, 3.5)).toBe(0);
  });
  it("returns null for a flat curve", () => {
    expect(crossover({ ...base, rate: 0 }, 1)).toBeNull();
  });
});

describe("yExtent", () => {
  it("returns [min, max]", () => {
    expect(yExtent([{ x: 0, y: 2 }, { x: 1, y: 5 }, { x: 2, y: 1 }])).toEqual([1, 5]);
  });
  it("has a safe default for empty input", () => {
    expect(yExtent([])).toEqual([0, 1]);
  });
});
