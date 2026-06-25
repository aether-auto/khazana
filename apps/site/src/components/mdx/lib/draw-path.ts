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
}

/** Build linear pixel scales mapping data extents into the padded box. */
export function makeScales(points: Point[], box: Box): Scales {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const innerW = Math.max(1, box.width - box.padX * 2);
  const innerH = Math.max(1, box.height - box.padY * 2);
  const spanX = xMax - xMin || 1;
  const spanY = yMax - yMin || 1;
  return {
    x: (v) => box.padX + ((v - xMin) / spanX) * innerW,
    // y is flipped: larger data values sit higher (smaller pixel y).
    y: (v) => box.padY + (1 - (v - yMin) / spanY) * innerH,
  };
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

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
