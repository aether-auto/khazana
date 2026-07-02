// apps/site/src/components/mdx/lib/route-map-geo.ts
//
// Pure great-circle / projection geometry for <RouteMap> — the choropleth <Map>
// extended with routes (arcs) and points. NO DOM: the island feeds these strings
// to <path>/<circle>. Kept a sibling of choropleth.ts (which we do NOT edit) so
// the arc math is verifiable in isolation and RouteMap stays a thin shell.
//
// Great-circle arcs use d3-geo's `geoInterpolate` (already vendored) to sample
// the shortest surface path between two lng/lat points, which we then project
// with the SAME projection <Map> uses (geoNaturalEarth1, fit to the same box) so
// arcs sit exactly over the choropleth. The draw-on-scroll reveal reuses the
// stroke-dasharray/offset trick: `dashParams` returns the total polyline length
// and the offset for a reveal fraction t ∈ [0,1].

import { geoInterpolate } from "d3-geo";

/** A projector: lng/lat degrees -> pixel [x,y] (or null when unprojectable). */
export type Project = (lngLat: [number, number]) => [number, number] | null;

export type RouteKind = "march" | "arc" | "path";

export interface RouteSpec {
  from: [number, number]; // [lng, lat]
  to: [number, number]; // [lng, lat]
  label?: string;
  kind?: RouteKind;
}

export interface PointSpec {
  at: [number, number]; // [lng, lat]
  label: string;
}

/** A single projected great-circle arc ready to render. */
export interface ProjectedRoute {
  /** SVG path `d` — "M x y L x y …" through the sampled great-circle. */
  d: string;
  /** total polyline length in px (for the draw-on-scroll dash math). */
  length: number;
  /** projected midpoint of the arc — anchors the hover label + focus halo. */
  mid: [number, number];
  /** projected endpoints (nulls dropped) — for the terminal dots. */
  from: [number, number] | null;
  to: [number, number] | null;
  label?: string;
  kind: RouteKind;
}

/** A projected point marker ready to render. */
export interface ProjectedPoint {
  at: [number, number]; // pixel
  label: string;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Sample `steps + 1` positions along the great-circle from `from` to `to`.
 * Returns [lng, lat] pairs. `geoInterpolate` walks the shortest surface path,
 * so this is a true great circle (an army's march / a storm's track), not a
 * straight line in projected space. `steps` is clamped to at least 1 so the
 * result always has both endpoints.
 */
export function greatCirclePoints(
  from: [number, number],
  to: [number, number],
  steps = 48,
): [number, number][] {
  const n = Math.max(1, Math.floor(steps));
  const interp = geoInterpolate(from, to);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [lng, lat] = interp(t);
    out.push([lng, lat]);
  }
  return out;
}

/**
 * Build a polyline `d` from already-projected pixel points, dropping any that
 * failed to project (off-globe under the projection). Returns "" for < 2 usable
 * points so a degenerate arc renders nothing rather than a broken path.
 */
export function polylinePath(pixels: ([number, number] | null)[]): string {
  const usable = pixels.filter((p): p is [number, number] => p !== null);
  if (usable.length < 2) return "";
  return usable
    .map((p, i) => `${i === 0 ? "M" : "L"} ${round2(p[0])} ${round2(p[1])}`)
    .join(" ");
}

/** Sum of segment lengths of a projected polyline, in px. */
export function polylineLength(pixels: ([number, number] | null)[]): number {
  const usable = pixels.filter((p): p is [number, number] => p !== null);
  let len = 0;
  for (let i = 1; i < usable.length; i++) {
    len += Math.hypot(usable[i][0] - usable[i - 1][0], usable[i][1] - usable[i - 1][1]);
  }
  return round2(len);
}

/**
 * The projected midpoint of a polyline — the vertex nearest the halfway index,
 * used to anchor the route's hover label and focus halo. Falls back to the first
 * usable vertex, then to [0,0], so it is ALWAYS finite.
 */
export function midpointOf(pixels: ([number, number] | null)[]): [number, number] {
  const usable = pixels.filter((p): p is [number, number] => p !== null);
  if (usable.length === 0) return [0, 0];
  const mid = usable[Math.floor(usable.length / 2)] ?? usable[0]!;
  return [round2(mid[0]), round2(mid[1])];
}

/**
 * Dash-array + dash-offset for revealing an arc of `length` by fraction `t`.
 * With `stroke-dasharray: length`, `stroke-dashoffset: offset` draws 0%→100% of
 * the arc as t goes 0→1. Composited (no layout) — the draw-on-scroll animation.
 */
export function dashParams(length: number, t: number): { array: number; offset: number } {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return { array: round2(length), offset: round2(length * (1 - clamped)) };
}

/**
 * Project a full RouteMap scene: turn each route spec into a projected
 * great-circle path (with length + midpoint + endpoints) and each point spec
 * into a projected marker. `project` is the SAME projection the choropleth uses,
 * so arcs and dots register exactly over the land. Routes whose path is empty
 * (both endpoints unprojectable) are DROPPED so nothing renders a broken line;
 * points that fail to project are dropped too. Pure — deterministic, offline.
 */
export function projectScene(
  routes: readonly RouteSpec[],
  points: readonly PointSpec[],
  project: Project,
  steps = 48,
): { routes: ProjectedRoute[]; points: ProjectedPoint[] } {
  const projectedRoutes: ProjectedRoute[] = [];
  for (const r of routes) {
    const geo = greatCirclePoints(r.from, r.to, steps);
    const pixels = geo.map(project);
    const d = polylinePath(pixels);
    if (d === "") continue; // both endpoints off-globe → skip, never a broken path
    projectedRoutes.push({
      d,
      length: polylineLength(pixels),
      mid: midpointOf(pixels),
      from: project(r.from),
      to: project(r.to),
      label: r.label,
      kind: r.kind ?? "arc",
    });
  }

  const projectedPoints: ProjectedPoint[] = [];
  for (const p of points) {
    const at = project(p.at);
    if (at === null || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue;
    projectedPoints.push({ at: [round2(at[0]), round2(at[1])], label: p.label });
  }

  return { routes: projectedRoutes, points: projectedPoints };
}
