import { describe, it, expect } from "vitest";
import {
  makeScales,
  linePath,
  areaPath,
  dashOffset,
  pathLength,
  type Box,
} from "./draw-path.js";
import type { Point } from "./model-curve.js";

const box: Box = { width: 100, height: 100, padX: 0, padY: 0 };
const pts: Point[] = [
  { x: 0, y: 0 },
  { x: 5, y: 10 },
  { x: 10, y: 0 },
];

describe("makeScales", () => {
  it("maps x extents into the padded box", () => {
    const s = makeScales(pts, box);
    expect(s.x(0)).toBeCloseTo(0, 5);
    expect(s.x(10)).toBeCloseTo(100, 5);
    expect(s.x(5)).toBeCloseTo(50, 5);
  });
  it("flips y so larger values sit higher (smaller pixel y)", () => {
    const s = makeScales(pts, box);
    expect(s.y(10)).toBeCloseTo(0, 5); // max -> top
    expect(s.y(0)).toBeCloseTo(100, 5); // min -> bottom
  });
  it("respects padding", () => {
    const s = makeScales(pts, { width: 120, height: 120, padX: 10, padY: 10 });
    expect(s.x(0)).toBeCloseTo(10, 5);
    expect(s.x(10)).toBeCloseTo(110, 5);
  });
  it("survives a degenerate (single-value) extent", () => {
    const flat: Point[] = [{ x: 1, y: 4 }, { x: 1, y: 4 }];
    const s = makeScales(flat, box);
    expect(Number.isFinite(s.x(1))).toBe(true);
    expect(Number.isFinite(s.y(4))).toBe(true);
  });
});

describe("linePath", () => {
  it("builds an M…L… polyline", () => {
    const s = makeScales(pts, box);
    const d = linePath(pts, s);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("L ");
    expect(d.match(/L /g)).toHaveLength(2);
  });
  it("is empty for fewer than two points", () => {
    const s = makeScales(pts, box);
    expect(linePath([{ x: 0, y: 0 }], s)).toBe("");
  });
});

describe("areaPath", () => {
  it("closes back to the baseline", () => {
    const s = makeScales(pts, box);
    const d = areaPath(pts, s, 100);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("L 100 100");
  });
});

describe("dashOffset", () => {
  it("hides the whole stroke at t=0 and reveals it at t=1", () => {
    expect(dashOffset(200, 0)).toBe(200);
    expect(dashOffset(200, 1)).toBe(0);
    expect(dashOffset(200, 0.5)).toBe(100);
  });
  it("clamps t outside [0,1]", () => {
    expect(dashOffset(200, -1)).toBe(200);
    expect(dashOffset(200, 2)).toBe(0);
  });
});

describe("pathLength", () => {
  it("sums segment lengths", () => {
    const s = makeScales(pts, box);
    // (0,100)->(50,0) = hypot(50,100); (50,0)->(100,100) = hypot(50,100)
    const expected = 2 * Math.hypot(50, 100);
    expect(pathLength(pts, s)).toBeCloseTo(Math.round(expected * 100) / 100, 1);
  });
  it("is 0 for a single point", () => {
    const s = makeScales(pts, box);
    expect(pathLength([{ x: 0, y: 0 }], s)).toBe(0);
  });
});
