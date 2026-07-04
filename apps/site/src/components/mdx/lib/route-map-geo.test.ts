// apps/site/src/components/mdx/lib/route-map-geo.test.ts
//
// Unit tests for the pure great-circle / projection geometry behind <RouteMap>.
// Two things the spec demands we prove: (1) great-circle point generation is
// correct (endpoints exact, samples on the sphere, monotone along the arc), and
// (2) projected paths are FINITE and IN-BOUNDS of the SVG viewBox — using the
// same geoNaturalEarth1 projection the choropleth <Map> uses.
import { describe, expect, test } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import {
  greatCirclePoints,
  polylinePath,
  polylineLength,
  midpointOf,
  dashParams,
  projectScene,
  sceneFitCollection,
  niceStep,
  ticksInRange,
  niceRoundKm,
  formatKm,
  formatLat,
  formatLon,
  wrapLon,
  type Project,
  type RouteSpec,
} from "./route-map-geo.js";

// Same box + projection <Map> uses (W=960, H=480). fitExtent to the world so the
// projected coordinates land inside the viewBox exactly as the map does.
const W = 960;
const H = 480;
const projection = geoNaturalEarth1().fitSize([W, H], { type: "Sphere" });
const project: Project = (ll) => {
  const p = projection(ll);
  return p ? [p[0], p[1]] : null;
};

describe("greatCirclePoints — great-circle sampling", () => {
  test("endpoints are exactly from/to", () => {
    const from: [number, number] = [-0.13, 51.5]; // London
    const to: [number, number] = [2.35, 48.85]; // Paris
    const pts = greatCirclePoints(from, to, 16);
    expect(pts[0]).toEqual(from);
    expect(pts[pts.length - 1]).toEqual(to);
  });

  test("produces steps+1 points", () => {
    expect(greatCirclePoints([0, 0], [90, 0], 24)).toHaveLength(25);
  });

  test("steps clamps to >= 1 (never fewer than the two endpoints)", () => {
    expect(greatCirclePoints([0, 0], [10, 10], 0)).toHaveLength(2);
    expect(greatCirclePoints([0, 0], [10, 10], -5)).toHaveLength(2);
  });

  test("every sampled lng/lat is finite and in geographic bounds", () => {
    const pts = greatCirclePoints([-74, 40.7], [139.7, 35.7], 48); // NYC -> Tokyo
    for (const [lng, lat] of pts) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
      expect(lng).toBeGreaterThanOrEqual(-180.0001);
      expect(lng).toBeLessThanOrEqual(180.0001);
      expect(lat).toBeGreaterThanOrEqual(-90.0001);
      expect(lat).toBeLessThanOrEqual(90.0001);
    }
  });

  test("an equatorial arc interpolates monotonically in longitude", () => {
    const pts = greatCirclePoints([0, 0], [90, 0], 9);
    const lngs = pts.map((p) => p[0]);
    for (let i = 1; i < lngs.length; i++) {
      expect(lngs[i]).toBeGreaterThan(lngs[i - 1]);
    }
    // along the equator, latitude stays ~0
    for (const [, lat] of pts) expect(Math.abs(lat)).toBeLessThan(1e-6);
  });

  test("the arc bows off the straight lng/lat line (it is a great circle)", () => {
    // A far-northern chord: the great circle bulges poleward vs the naive
    // straight interpolation in lat, so a mid sample's lat exceeds the endpoints'.
    const from: [number, number] = [-140, 55];
    const to: [number, number] = [140, 55];
    const pts = greatCirclePoints(from, to, 20);
    const mid = pts[Math.floor(pts.length / 2)];
    expect(mid[1]).toBeGreaterThan(55); // bows toward the pole
  });
});

describe("projectScene — projected paths are finite & in-bounds", () => {
  const routes: RouteSpec[] = [
    { from: [-0.13, 51.5], to: [37.6, 55.75], label: "London → Moscow", kind: "march" },
    { from: [-74, 40.7], to: [139.7, 35.7], label: "NYC → Tokyo", kind: "arc" },
  ];
  const points = [
    { at: [-0.13, 51.5] as [number, number], label: "London" },
    { at: [139.7, 35.7] as [number, number], label: "Tokyo" },
  ];

  test("produces one projected route per input route with a non-empty path", () => {
    const scene = projectScene(routes, points, project, 48);
    expect(scene.routes).toHaveLength(2);
    for (const r of scene.routes) {
      expect(r.d.length).toBeGreaterThan(0);
      expect(r.d.startsWith("M")).toBe(true);
    }
  });

  test("every projected coordinate in a path `d` is finite and inside the viewBox", () => {
    const scene = projectScene(routes, points, project, 48);
    for (const r of scene.routes) {
      const nums = r.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(nums.length).toBeGreaterThan(0);
      for (let i = 0; i < nums.length; i += 2) {
        const x = nums[i];
        const y = nums[i + 1];
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        // in-bounds of the 0..W / 0..H viewBox (small epsilon for edge rounding)
        expect(x).toBeGreaterThanOrEqual(-1);
        expect(x).toBeLessThanOrEqual(W + 1);
        expect(y).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(H + 1);
      }
    }
  });

  test("route length is positive and finite", () => {
    const scene = projectScene(routes, points, project, 48);
    for (const r of scene.routes) {
      expect(Number.isFinite(r.length)).toBe(true);
      expect(r.length).toBeGreaterThan(0);
    }
  });

  test("midpoint anchors are finite and in-bounds", () => {
    const scene = projectScene(routes, points, project, 48);
    for (const r of scene.routes) {
      expect(Number.isFinite(r.mid[0])).toBe(true);
      expect(Number.isFinite(r.mid[1])).toBe(true);
      expect(r.mid[0]).toBeGreaterThanOrEqual(-1);
      expect(r.mid[0]).toBeLessThanOrEqual(W + 1);
      expect(r.mid[1]).toBeGreaterThanOrEqual(-1);
      expect(r.mid[1]).toBeLessThanOrEqual(H + 1);
    }
  });

  test("default kind is 'arc' when omitted", () => {
    const scene = projectScene([{ from: [0, 0], to: [10, 10] }], [], project);
    expect(scene.routes[0]?.kind).toBe("arc");
  });

  test("projects every point marker, in-bounds", () => {
    const scene = projectScene([], points, project);
    expect(scene.points).toHaveLength(2);
    for (const p of scene.points) {
      expect(Number.isFinite(p.at[0])).toBe(true);
      expect(Number.isFinite(p.at[1])).toBe(true);
      expect(p.at[0]).toBeGreaterThanOrEqual(-1);
      expect(p.at[0]).toBeLessThanOrEqual(W + 1);
    }
  });

  test("a route that cannot project at all is dropped (never a broken path)", () => {
    // A projector that always fails → the route's polyline is empty → dropped.
    const nullProject: Project = () => null;
    const scene = projectScene(routes, points, nullProject);
    expect(scene.routes).toHaveLength(0);
    expect(scene.points).toHaveLength(0);
  });
});

describe("polyline helpers", () => {
  test("polylinePath drops nulls and needs >= 2 usable points", () => {
    expect(polylinePath([[0, 0]])).toBe("");
    expect(polylinePath([[0, 0], null, [10, 10]])).toBe("M 0 0 L 10 10");
    expect(polylinePath([null, null])).toBe("");
  });

  test("polylineLength sums segment lengths, dropping nulls", () => {
    expect(polylineLength([[0, 0], [3, 4]])).toBe(5);
    expect(polylineLength([[0, 0], null, [3, 4]])).toBe(5);
    expect(polylineLength([[0, 0]])).toBe(0);
  });

  test("midpointOf is always finite, even for empty input", () => {
    expect(midpointOf([])).toEqual([0, 0]);
    expect(midpointOf([[2, 2], [4, 4], [6, 6]])).toEqual([4, 4]);
  });
});

describe("sceneFitCollection — the geometry we zoom the map to", () => {
  const routes: RouteSpec[] = [
    { from: [-0.37, 37.98], to: [7.75, 43.33], label: "Iberia → Alps", kind: "march" },
    { from: [12.11, 43.07], to: [15.82, 41.3], label: "→ Cannae", kind: "march" },
  ];
  const points = [
    { at: [12.48, 41.9] as [number, number], label: "Rome" },
    { at: [15.82, 41.3] as [number, number], label: "Cannae" },
  ];

  test("null when there is nothing to fit", () => {
    expect(sceneFitCollection([], [])).toBeNull();
  });

  test("one LineString feature per route + one MultiPoint for the points", () => {
    const fc = sceneFitCollection(routes, points, 16);
    expect(fc?.type).toBe("FeatureCollection");
    expect(fc?.features).toHaveLength(3); // 2 routes + 1 multipoint
    expect(fc?.features[0]?.geometry.type).toBe("LineString");
    expect(fc?.features[2]?.geometry.type).toBe("MultiPoint");
  });

  test("routes alone (no points) omit the MultiPoint feature", () => {
    const fc = sceneFitCollection(routes, [], 8);
    expect(fc?.features).toHaveLength(2);
  });

  test("the sampled LineString includes both endpoints", () => {
    const fc = sceneFitCollection([routes[0]!], [], 8);
    const coords = (fc!.features[0]!.geometry as { coordinates: [number, number][] }).coordinates;
    const last = coords[coords.length - 1]!;
    expect(coords[0]![0]).toBeCloseTo(routes[0]!.from[0], 6);
    expect(coords[0]![1]).toBeCloseTo(routes[0]!.from[1], 6);
    expect(last[0]).toBeCloseTo(routes[0]!.to[0], 6);
    expect(last[1]).toBeCloseTo(routes[0]!.to[1], 6);
  });
});

describe("niceStep / ticksInRange — graticule graduation", () => {
  test("niceStep returns a 1/2/5 × 10ⁿ value", () => {
    expect(niceStep(20, 4)).toBe(5);
    expect(niceStep(8, 4)).toBe(2);
    expect(niceStep(3, 4)).toBe(0.5);
    expect(niceStep(400, 4)).toBe(100);
  });
  test("niceStep never returns 0 for degenerate spans", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
  test("ticksInRange yields ascending step multiples inside [min,max]", () => {
    expect(ticksInRange(-3, 12, 5)).toEqual([0, 5, 10]);
    expect(ticksInRange(37, 46, 2)).toEqual([38, 40, 42, 44, 46]);
  });
  test("ticksInRange is empty on bad input", () => {
    expect(ticksInRange(0, 10, 0)).toEqual([]);
    expect(ticksInRange(10, 0, 2)).toEqual([]);
  });
});

describe("niceRoundKm / formatKm — the scale bar", () => {
  test("rounds down to a friendly 1/2/5 × 10ⁿ km value", () => {
    expect(niceRoundKm(473)).toBe(200);
    expect(niceRoundKm(600)).toBe(500);
    expect(niceRoundKm(1200)).toBe(1000);
    expect(niceRoundKm(2600)).toBe(2000);
  });
  test("0 for non-positive input (never a broken bar)", () => {
    expect(niceRoundKm(0)).toBe(0);
    expect(niceRoundKm(-10)).toBe(0);
  });
  test("formatKm groups thousands", () => {
    expect(formatKm(500)).toBe("500 km");
    expect(formatKm(2000)).toBe("2,000 km");
  });
});

describe("lat/lon formatting + wrap", () => {
  test("formatLat", () => {
    expect(formatLat(30)).toBe("30° N");
    expect(formatLat(-12)).toBe("12° S");
    expect(formatLat(0)).toBe("0°");
  });
  test("formatLon normalizes past ±180", () => {
    expect(formatLon(120)).toBe("120° E");
    expect(formatLon(-150)).toBe("150° W");
    expect(formatLon(210)).toBe("150° W"); // wrapped
    expect(formatLon(0)).toBe("0°");
    expect(formatLon(180)).toBe("180°");
  });
  test("wrapLon maps any longitude into [-180,180)", () => {
    expect(wrapLon(200)).toBeCloseTo(-160, 6);
    expect(wrapLon(-190)).toBeCloseTo(170, 6);
    expect(wrapLon(45)).toBeCloseTo(45, 6);
  });
});

describe("dashParams — draw-on-scroll reveal", () => {
  test("t=0 hides the whole arc (offset == length)", () => {
    expect(dashParams(100, 0)).toEqual({ array: 100, offset: 100 });
  });
  test("t=1 fully draws the arc (offset == 0)", () => {
    expect(dashParams(100, 1)).toEqual({ array: 100, offset: 0 });
  });
  test("t=0.5 draws half", () => {
    expect(dashParams(100, 0.5)).toEqual({ array: 100, offset: 50 });
  });
  test("t clamps outside [0,1]", () => {
    expect(dashParams(80, -2).offset).toBe(80);
    expect(dashParams(80, 5).offset).toBe(0);
  });
});
