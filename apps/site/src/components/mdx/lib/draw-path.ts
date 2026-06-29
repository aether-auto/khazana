// apps/site/src/components/mdx/lib/draw-path.ts
// Pure geometry for the DRAW-ON-SCROLL line figure (art-direction §5:
// "Draw-on-scroll for line charts"). Builds an SVG path `d` from points mapped
// into a viewBox, plus the dash math that reveals it as a fraction `t` ∈ [0,1].
// No DOM — the island just feeds these strings to <path>.

import type { Point } from "./model-curve.js";

export interface Box {
  width: number;
  height: number;
  padX: number;
  padY: number;
}

export interface Scales {
  x: (v: number) => number;
  y: (v: number) => number;
  /** the data extents these scales were built from (for axis ticks). */
  domain: { xMin: number; xMax: number; yMin: number; yMax: number };
}

/** One named trajectory drawn as its own animated stroke in DrawChart. */
export interface Series {
  /** stable key (drives the per-series CSS hue + dash timing). */
  id: string;
  /** legend label. */
  label: string;
  points: Point[];
}

/** Build padded linear pixel scales for the given data extents. */
function scalesForExtent(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  box: Box,
): Scales {
  const innerW = Math.max(1, box.width - box.padX * 2);
  const innerH = Math.max(1, box.height - box.padY * 2);
  const spanX = xMax - xMin || 1;
  const spanY = yMax - yMin || 1;
  return {
    x: (v) => box.padX + ((v - xMin) / spanX) * innerW,
    // y is flipped: larger data values sit higher (smaller pixel y).
    y: (v) => box.padY + (1 - (v - yMin) / spanY) * innerH,
    domain: { xMin, xMax, yMin, yMax },
  };
}

/** Build linear pixel scales mapping a single series' data extents into the box. */
export function makeScales(points: Point[], box: Box): Scales {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return scalesForExtent(
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
    box,
  );
}

/**
 * Build ONE shared scale spanning the union of every series' extent, so the
 * series are plotted on the same axes and their divergence (one path climbing,
 * another round-tripping to the floor) is visible. Empty input yields a finite
 * degenerate [0,1] scale rather than NaN.
 */
export function makeScalesMulti(series: Series[], box: Box): Scales {
  const pts = series.flatMap((s) => s.points);
  if (pts.length === 0) return scalesForExtent(0, 1, 0, 1, box);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return scalesForExtent(
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
    box,
  );
}

/** A polyline `d` string ("M x y L x y …"). Empty for <2 points. */
export function linePath(points: Point[], s: Scales): string {
  if (points.length < 2) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${round2(s.x(p.x))} ${round2(s.y(p.y))}`)
    .join(" ");
}

/** An area `d` (line, then down to baseline and back) for a filled draw. */
export function areaPath(points: Point[], s: Scales, baseline: number): string {
  if (points.length < 2) return "";
  const top = points.map((p, i) => `${i === 0 ? "M" : "L"} ${round2(s.x(p.x))} ${round2(s.y(p.y))}`);
  const last = points[points.length - 1];
  const first = points[0];
  return [
    ...top,
    `L ${round2(s.x(last.x))} ${round2(baseline)}`,
    `L ${round2(s.x(first.x))} ${round2(baseline)}`,
    "Z",
  ].join(" ");
}

/**
 * Dash offset for revealing a path of `total` length by fraction `t`.
 * With `stroke-dasharray: total`, `stroke-dashoffset: dashOffset(total, t)`
 * draws 0%→100% of the stroke as t goes 0→1. (Composited; no layout.)
 */
export function dashOffset(total: number, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return round2(total * (1 - clamped));
}

/** Approximate polyline length in pixels (sum of segment lengths). */
export function pathLength(points: Point[], s: Scales): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = s.x(points[i].x) - s.x(points[i - 1].x);
    const dy = s.y(points[i].y) - s.y(points[i - 1].y);
    len += Math.hypot(dx, dy);
  }
  return round2(len);
}

export interface AxisTick {
  /** the data value at this tick. */
  value: number;
  /** the pixel position (from the supplied scale fn). */
  pos: number;
}

/**
 * Evenly spaced axis ticks across [min, max]. For a real range, `count` is
 * clamped to at least 2 (the two endpoints); a degenerate range (min === max)
 * collapses to a single tick. `scale` maps a data value to its pixel position.
 */
export function axisTicks(
  min: number,
  max: number,
  count: number,
  scale: (v: number) => number,
): AxisTick[] {
  if (max === min) return [{ value: min, pos: round2(scale(min)) }];
  const n = Math.max(2, Math.floor(count));
  const out: AxisTick[] = [];
  for (let i = 0; i < n; i++) {
    const value = min + ((max - min) * i) / (n - 1);
    out.push({ value: round2(value), pos: round2(scale(value)) });
  }
  return out;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
