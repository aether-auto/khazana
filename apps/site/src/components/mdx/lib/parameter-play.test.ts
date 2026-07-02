import { describe, it, expect } from "vitest";
import {
  clamp,
  round,
  bindParams,
  defaultValues,
  compileModel,
  sampleCurve,
  evalReadouts,
  yExtent,
  formatReadout,
  type PlayParam,
} from "./parameter-play.js";

const params: PlayParam[] = [
  { key: "a", label: "slope", min: 0, max: 5, default: 2, step: 0.1 },
  { key: "b", label: "intercept", min: -10, max: 10, default: 1, step: 0.5 },
];

describe("clamp / round", () => {
  it("clamps into range and defaults NaN to lo", () => {
    expect(clamp(3, 0, 5)).toBe(3);
    expect(clamp(-1, 0, 5)).toBe(0);
    expect(clamp(9, 0, 5)).toBe(5);
    expect(clamp(Number.NaN, 2, 5)).toBe(2);
  });
  it("rounds without float dust and passes through non-finite", () => {
    expect(round(0.1 + 0.2, 3)).toBe(0.3);
    expect(round(Infinity)).toBe(Infinity);
  });
});

describe("bindParams / defaultValues", () => {
  it("clamps provided values into each param range", () => {
    expect(bindParams(params, { a: 99, b: -99 })).toEqual({ a: 5, b: -10 });
  });
  it("falls back to default for missing / NaN values", () => {
    expect(bindParams(params, { a: Number.NaN })).toEqual({ a: 2, b: 1 });
    expect(bindParams(params, {})).toEqual({ a: 2, b: 1 });
  });
  it("defaultValues returns the clamped defaults", () => {
    expect(defaultValues(params)).toEqual({ a: 2, b: 1 });
  });
});

describe("compileModel", () => {
  it("compiles a valid y-expr + readouts with no errors", () => {
    const m = compileModel("a * x + b", params, "x", [
      { label: "y at 0", expr: "b" },
      { label: "double slope", expr: "a * 2" },
    ]);
    expect(m.errors).toEqual([]);
    expect(m.yExpr).not.toBeNull();
    expect(m.readouts.every((r) => r.program !== null)).toBe(true);
  });
  it("lets the y-expr read the x variable but readouts may NOT", () => {
    const m = compileModel("a * x", params, "x", [{ label: "bad", expr: "x + 1" }]);
    // y-expr fine; readout referencing x is an unknown identifier for readouts.
    expect(m.yExpr).not.toBeNull();
    expect(m.readouts[0]!.program).toBeNull();
    expect(m.errors.some((e) => e.includes('readout "bad"'))).toBe(true);
  });
  it("honors a custom xVar name", () => {
    const m = compileModel("m * t + c", [
      { key: "m", label: "m", min: 0, max: 5, default: 1, step: 0.1 },
      { key: "c", label: "c", min: 0, max: 5, default: 0, step: 0.1 },
    ], "t");
    expect(m.errors).toEqual([]);
    expect(m.xVar).toBe("t");
  });
  it("collects author errors instead of throwing", () => {
    const m = compileModel("a * nope", params, "x", [{ label: "r", expr: "b +" }]);
    expect(m.yExpr).toBeNull();
    expect(m.errors.length).toBeGreaterThanOrEqual(2);
    expect(m.errors[0]).toMatch(/^expr:/);
  });
});

describe("sampleCurve", () => {
  it("samples a linear model across xRange", () => {
    const m = compileModel("a * x + b", params, "x");
    const pts = sampleCurve(m, { a: 2, b: 1 }, [0, 10], 11);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual({ x: 0, y: 1 });
    expect(pts[10]).toEqual({ x: 10, y: 21 });
  });
  it("matches a realistic GPS relation sigma_pos = dop * sigma_range", () => {
    const gp: PlayParam[] = [
      { key: "dop", label: "DOP", min: 1, max: 10, default: 2, step: 0.1 },
    ];
    // here x plays the role of sigma_range on the axis
    const m = compileModel("dop * x", gp, "x");
    const pts = sampleCurve(m, { dop: 2.5 }, [0, 4], 5);
    expect(pts[4]).toEqual({ x: 4, y: 10 });
  });
  it("skips non-finite points (gapped, not broken)", () => {
    const m = compileModel("1 / x", [], "x");
    const pts = sampleCurve(m, {}, [-1, 1], 3); // x = -1, 0, 1 → 0 is skipped
    expect(pts).toHaveLength(2);
    expect(pts.map((p) => p.x)).toEqual([-1, 1]);
  });
  it("returns [] when the y-expr failed to compile", () => {
    const m = compileModel("bogus_ident", params, "x");
    expect(sampleCurve(m, { a: 1, b: 1 }, [0, 1], 4)).toEqual([]);
  });
  it("clamps samples to a minimum of 2", () => {
    const m = compileModel("x", [], "x");
    expect(sampleCurve(m, {}, [0, 1], 1)).toHaveLength(2);
  });
});

describe("evalReadouts", () => {
  it("evaluates each readout against current bindings", () => {
    const m = compileModel("a * x + b", params, "x", [
      { label: "intercept", expr: "b", unit: "m" },
      { label: "slope*10", expr: "a * 10" },
    ]);
    const rs = evalReadouts(m, { a: 3, b: 7 });
    expect(rs[0]).toEqual({ label: "intercept", unit: "m", value: 7 });
    expect(rs[1]!.value).toBe(30);
  });
  it("returns null value for a readout that failed to compile", () => {
    const m = compileModel("a * x", params, "x", [{ label: "bad", expr: "b +" }]);
    const rs = evalReadouts(m, { a: 1, b: 1 });
    expect(rs[0]!.value).toBeNull();
  });
  it("returns null value when a readout evaluates non-finite", () => {
    const m = compileModel("a * x", params, "x", [{ label: "div0", expr: "a / 0" }]);
    const rs = evalReadouts(m, { a: 1, b: 1 });
    expect(rs[0]!.value).toBeNull();
  });
});

describe("yExtent", () => {
  it("returns [min,max] of finite y-values", () => {
    expect(yExtent([{ x: 0, y: 2 }, { x: 1, y: 5 }, { x: 2, y: 1 }])).toEqual([1, 5]);
  });
  it("pads a flat curve so it isn't glued to an axis", () => {
    const [lo, hi] = yExtent([{ x: 0, y: 4 }, { x: 1, y: 4 }]);
    expect(lo).toBeLessThan(4);
    expect(hi).toBeGreaterThan(4);
  });
  it("has a safe default for empty input", () => {
    expect(yExtent([])).toEqual([0, 1]);
  });
});

describe("formatReadout", () => {
  it("renders — for null / non-finite", () => {
    expect(formatReadout({ label: "x", value: null })).toBe("—");
    expect(formatReadout({ label: "x", value: Infinity })).toBe("—");
  });
  it("renders rounded value with optional unit", () => {
    expect(formatReadout({ label: "x", value: 1.23456, unit: "m" }, 2)).toBe("1.23 m");
    expect(formatReadout({ label: "x", value: 42 })).toBe("42");
  });
});
