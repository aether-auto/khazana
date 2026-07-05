// apps/site/src/components/mdx/RouteMap.tsx
//
// The <Map> choropleth EXTENDED with routes/arcs and points — an army's march, a
// storm's track, a trade route. A SIBLING of <Map> (Map is left untouched): it
// reuses Map's exact recipe (geoNaturalEarth1 fit to a 960×480 box, world-atlas
// land, the latitude graticule, the amber choropleth ramp, roving keyboard focus,
// viewBox SVG scaled to width:100%) and layers great-circle amber arcs + labeled
// point markers on top.
//
// ── What is new vs <Map> ─────────────────────────────────────────────────────
// • routes[] draw ON SCROLL along true great-circle paths (d3-geo geoInterpolate,
//   projected with the SAME projection so they register over the land). The
//   reveal is a single composited stroke-dashoffset transition, armed by one
//   IntersectionObserver flip (no per-frame JS) — exactly the DrawChart pattern.
// • hover/focus a route → its label surfaces in the readout + a highlight.
// • the keyboard cycles ROUTES (arrow keys), not countries — the routes are the
//   subject of this figure; a focus halo tracks the active route's midpoint.
//
// ── Invariants (every mdx island honors these) ───────────────────────────────
// • SSR / no-JS is NEVER blank: the full static map + all arcs render server-side
//   (arcs default to fully drawn until JS arms the undraw), and below it a
//   semantic <ol> lists every route and point with its label — so even with the
//   SVG unstyled the reader gets the labeled route/point list.
// • prefers-reduced-motion → arcs are drawn INSTANTLY, zero animation.
// • the figure may bleed wide but the prose column stays calm; the viewBox scales
//   to width:100% so there is no horizontal overflow at 360px.
// • props are serializable (plain arrays of {from,to,label,kind} / {at,label}).
// • all arc / projection / great-circle math lives in ./lib/route-map-geo.ts
//   (unit-tested); this island is a thin shell.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoMercator, geoPath, geoBounds, geoCentroid, geoDistance } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import worldTopo from "world-atlas/countries-110m.json"; // bundled asset — no runtime fetch
// Reuse Map's OWN pure helpers (choropleth.ts is shared; we do not edit it).
import { buildChoropleth, graticuleLatitudes } from "./lib/choropleth.js";
import { iso3ForNumeric } from "./lib/iso-numeric.js";
// Our own great-circle / projection geometry (sibling of choropleth.ts).
import {
  projectScene,
  dashParams,
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
  type PointSpec,
  type ProjectedRoute,
  type ProjectedPoint,
} from "./lib/route-map-geo.js";
import "./mdx.css";
import "./Map.css"; // reuse the map's panel/graticule/focus styling
import "./RouteMap.css";

export interface RouteMapProps {
  /** Optional choropleth values keyed by ISO 3166-1 alpha-3 (same as <Map>). */
  values?: Record<string, number>;
  /** Optional iso3->label for the choropleth readout (same as <Map>). */
  labels?: Record<string, string>;
  /** Routes drawn as great-circle arcs over the map. `kind` tints the arc. */
  routes?: RouteSpec[];
  /** Standalone labeled point markers (a city, a battle, a landfall). */
  points?: PointSpec[];
  caption?: string;
}

const W = 960;
const H = 480;
const ARC_STEPS = 64; // great-circle sample density — smooth at this width
const EARTH_KM = 6371; // mean radius; geoDistance returns radians → km
// Fit-to-route padding: the journey fills the frame but keeps breathing room so
// the surrounding coastlines (and the labels) are never jammed against the edge.
const PAD_X = 0.1; // 10% of width each side
const PAD_Y = 0.12; // 12% of height each side
// Above this longitude/latitude spread the "route" is effectively global — fall
// back to the calm whole-world view rather than a uselessly zoomed-out regional one.
const GLOBAL_LON_SPAN = 200;
const GLOBAL_LAT_SPAN = 130;
// A scene whose bounding box has ~zero width or height (a lone point, a
// zero-length route, coincident/collinear points) would make fitExtent's scale
// blow up to Infinity → NaN coordinates → nothing renders. Below this span (in
// degrees) we treat a dimension as degenerate and pad it to a sensible default
// zoom instead of fitting to it.
const DEGENERATE_EPS = 0.1;
// Half-span (degrees) used to pad a degenerate dimension: shows ~24° of land
// around a lone landfall — the point comfortably framed by its surroundings.
const MIN_HALF_SPAN = 12;

interface CountryProps {
  name?: string;
}
type WorldTopology = {
  type: "Topology";
  objects: { countries: object };
  arcs: unknown[];
};
interface CountryPath {
  iso3: string;
  d: string;
}
/** A graticule line (parallel or meridian) already projected to an SVG path. */
interface GLine {
  d: string;
  major: boolean;
}
/** A graticule edge label (lat at the left rail, lon along the bottom). */
interface GLabel {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
}
/** The scale bar: a pixel length that stands for a friendly round distance. */
interface ScaleBar {
  px: number;
  label: string;
}

/**
 * Build a regional graticule (parallels + meridians) by inverting the frame's
 * edges to discover the visible lon/lat window, then drawing nice-stepped grid
 * lines through the SAME projection so they register over the land. Straight,
 * labelled, instrument-like. Returns lines + edge labels.
 */
function regionalGraticule(projection: GeoProjection): { lines: GLine[]; labels: GLabel[] } {
  const invert = projection.invert;
  if (!invert) return { lines: [], labels: [] };
  const west = invert([0, H / 2])?.[0];
  const east = invert([W, H / 2])?.[0];
  const north = invert([W / 2, 0])?.[1];
  const south = invert([W / 2, H])?.[1];
  if (
    west === undefined || east === undefined || north === undefined || south === undefined ||
    ![west, east, north, south].every(Number.isFinite)
  ) {
    return { lines: [], labels: [] };
  }
  // Unwrap the eastern edge so an antimeridian-spanning view (Pacific) has a
  // positive longitude width to step across.
  let eastUnwrapped = east;
  while (eastUnwrapped < west) eastUnwrapped += 360;

  const lonStep = niceStep(eastUnwrapped - west, 5);
  const latStep = niceStep(north - south, 4);
  const lines: GLine[] = [];
  const labels: GLabel[] = [];

  // Meridians (vertical) — sampled top→bottom so mercator keeps them true.
  for (const lonRaw of ticksInRange(west, eastUnwrapped, lonStep)) {
    const lon = wrapLon(lonRaw);
    const pts: string[] = [];
    for (let i = 0; i <= 16; i++) {
      const lat = south + ((north - south) * i) / 16;
      const p = projection([lon, lat]);
      if (p) pts.push(`${i === 0 ? "M" : "L"} ${round1(p[0])} ${round1(p[1])}`);
    }
    if (pts.length < 2) continue;
    lines.push({ d: pts.join(" "), major: Math.round(lon) === 0 });
    const anchor = projection([lon, south]);
    if (anchor) labels.push({ x: anchor[0], y: H - 8, text: formatLon(lon), anchor: "middle" });
  }

  // Parallels (horizontal) — sampled west→east across the (possibly wrapped) span.
  for (const lat of ticksInRange(south, north, latStep)) {
    const pts: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const lon = wrapLon(west + ((eastUnwrapped - west) * i) / 32);
      const p = projection([lon, lat]);
      if (p) pts.push(`${i === 0 ? "M" : "L"} ${round1(p[0])} ${round1(p[1])}`);
    }
    if (pts.length < 2) continue;
    lines.push({ d: pts.join(" "), major: Math.round(lat) === 0 });
    const anchor = projection([west, lat]);
    if (anchor) labels.push({ x: 8, y: anchor[1] - 4, text: formatLat(lat), anchor: "start" });
  }

  return { lines, labels };
}

/** A scale bar sized for ~16% of the frame at the map's centre latitude. */
function scaleBarFor(projection: GeoProjection): ScaleBar | null {
  const invert = projection.invert;
  if (!invert) return null;
  const c = invert([W / 2, H / 2]);
  const e = invert([W / 2 + 120, H / 2]);
  if (!c || !e || !Number.isFinite(c[0]) || !Number.isFinite(e[0])) return null;
  const kmPerPx = (geoDistance(c, e) * EARTH_KM) / 120;
  if (!(kmPerPx > 0) || !Number.isFinite(kmPerPx)) return null;
  const km = niceRoundKm(kmPerPx * W * 0.16);
  if (km <= 0) return null;
  return { px: km / kmPerPx, label: formatKm(km) };
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

export default function RouteMap({
  values = {},
  labels = {},
  routes = [],
  points = [],
  caption,
}: RouteMapProps) {
  const choro = useMemo(() => buildChoropleth(values), [values]);

  // Project the land + graticule + the routes/points ONCE, all through ONE
  // projection FIT TO THE ROUTE (not the world) so the journey fills the frame
  // and the arcs/dots register exactly over the surrounding coastlines.
  const { paths, gridLines, gridLabels, scaleBar, scene } = useMemo(() => {
    const topo = worldTopo as unknown as WorldTopology;
    const fc = feature(
      topo as Parameters<typeof feature>[0],
      topo.objects.countries as Parameters<typeof feature>[1],
    ) as unknown as FeatureCollection<Geometry, CountryProps>;

    // Fit the projection to the SCENE's own geometry — the fix for the world-speck
    // bug. Fall back to a whole-world view when there is nothing to fit, or when
    // the scene is effectively global (a route that spans the planet).
    const fitFC = sceneFitCollection(routes, points, ARC_STEPS);
    let projection: GeoProjection | null = null;
    let regional = false;
    if (fitFC) {
      const [[w0, s0], [e0, n0]] = geoBounds(fitFC);
      let lonSpan = e0 - w0;
      if (lonSpan < 0) lonSpan += 360; // geoBounds wraps when the short span crosses ±180
      const latSpan = n0 - s0;
      const isGlobal = lonSpan > GLOBAL_LON_SPAN || latSpan > GLOBAL_LAT_SPAN;
      if (!isGlobal) {
        // Centre the projection on the scene's centroid FIRST (this is what tames
        // an antimeridian-spanning Pacific route), then fit its extent to the box.
        const [cLon] = geoCentroid(fitFC);
        const padX = W * PAD_X;
        const padY = H * PAD_Y;
        const extent: [[number, number], [number, number]] = [
          [padX, padY],
          [W - padX, H - padY],
        ];
        const mercator = geoMercator().rotate([-cLon, 0]);
        const degenerate = lonSpan < DEGENERATE_EPS || latSpan < DEGENERATE_EPS;
        if (degenerate) {
          // Zero-area (or near-zero) scene: pad each degenerate dimension so
          // fitExtent gets a real box instead of an Infinite scale. Real spans
          // are preserved; only the collapsed dimension(s) expand to a default
          // regional zoom around the centroid — a finite, land-showing view.
          const midLon = w0 + lonSpan / 2;
          const midLat = s0 + latSpan / 2;
          const halfLon = Math.max(lonSpan / 2, MIN_HALF_SPAN);
          const halfLat = Math.max(latSpan / 2, MIN_HALF_SPAN);
          const latLo = Math.max(-85, midLat - halfLat);
          const latHi = Math.min(85, midLat + halfLat);
          const box: FeatureCollection = {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "MultiPoint",
                  coordinates: [
                    [wrapLon(midLon - halfLon), latLo],
                    [wrapLon(midLon + halfLon), latLo],
                    [wrapLon(midLon + halfLon), latHi],
                    [wrapLon(midLon - halfLon), latHi],
                  ],
                },
              },
            ],
          };
          projection = mercator.fitExtent(extent, box);
        } else {
          projection = mercator.fitExtent(extent, fitFC);
        }
        regional = true;
      }
    }
    if (!projection) {
      projection = geoNaturalEarth1().fitSize([W, H], fc); // graceful world fallback
    }

    const path = geoPath(projection);
    const paths: CountryPath[] = fc.features.map((f) => ({
      iso3: iso3ForNumeric(f.id as string | number) ?? "",
      d: path(f) ?? "",
    }));

    // Graticule: a labelled regional grid when zoomed in; the world latitude
    // graticule (with a scale cue baked into its labels) when zoomed out.
    let gridLines: GLine[];
    let gridLabels: GLabel[];
    if (regional) {
      const g = regionalGraticule(projection);
      gridLines = g.lines;
      gridLabels = g.labels;
    } else {
      gridLines = [];
      gridLabels = [];
      for (const { lat, label, major } of graticuleLatitudes()) {
        const coordinates: [number, number][] = [];
        for (let lon = -180; lon <= 180; lon += 2) coordinates.push([lon, lat]);
        gridLines.push({ d: path({ type: "LineString", coordinates }) ?? "", major });
        const anchor = projection([178, lat]) ?? [W, 0];
        gridLabels.push({ x: anchor[0], y: anchor[1] - 3, text: label, anchor: "end" });
      }
    }

    const scaleBar = regional ? scaleBarFor(projection) : null;

    // Same projection → arcs and points register over the land.
    const project: Project = (ll) => {
      const p = projection!(ll);
      return p ? [p[0], p[1]] : null;
    };
    const scene = projectScene(routes, points, project, ARC_STEPS);

    return { paths, gridLines, gridLabels, scaleBar, scene };
  }, [routes, points]);

  const projRoutes: ProjectedRoute[] = scene.routes;
  const projPoints: ProjectedPoint[] = scene.points;

  // Place point labels with a light greedy vertical de-collision so nearby names
  // (Rome / Cannae / Trasimene) don't stack on top of each other. Labels flip to
  // the left of their dot near the right edge so they never run off-frame.
  const pointLabels = useMemo(() => {
    const placed: { x: number; y: number; anchor: "start" | "end"; text: string }[] = [];
    const sorted = projPoints
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p.at[1] - b.p.at[1] || a.p.at[0] - b.p.at[0]);
    for (const { p } of sorted) {
      const flip = p.at[0] > W * 0.82;
      const x = flip ? p.at[0] - 7 : p.at[0] + 7;
      let y = p.at[1] + 3;
      // nudge down while it would collide with an already-placed nearby label
      for (let guard = 0; guard < 6; guard++) {
        const clash = placed.some(
          (q) => Math.abs(q.x - x) < 90 && Math.abs(q.y - y) < 13,
        );
        if (!clash) break;
        y += 13;
      }
      placed.push({ x, y, anchor: flip ? "end" : "start", text: p.label });
    }
    return placed;
  }, [projPoints]);

  // ── Draw-on-scroll (progressive enhancement) ───────────────────────────────
  // Fail-safe: arcs start FULLY DRAWN. Only an effect that actually runs (and
  // only when motion is allowed) arms the undrawn start + animates the reveal.
  // If JS never hydrates or the reader prefers reduced motion → arcs are just
  // there, no animation, never blank.
  const [drawn, setDrawn] = useState(true);
  const [armed, setArmed] = useState(false);
  // hovered/focused route index (drives the readout, highlight, focus halo).
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window) || !ref.current || projRoutes.length === 0) {
      setDrawn(true); // reduced-motion / no-IO → instant, fully drawn
      return;
    }
    const el = ref.current;
    setDrawn(false); // arm the undrawn start
    setArmed(true);
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setDrawn(true);
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [projRoutes.length]);

  // While the group holds keyboard focus, default the active route to the first;
  // hover always wins. Nothing is active on blur so the halo doesn't linger.
  const activeIdx = active ?? (focused && projRoutes.length ? 0 : null);
  const activeRoute = activeIdx !== null ? projRoutes[activeIdx] : undefined;

  const moveActive = useCallback(
    (delta: number) => {
      if (projRoutes.length === 0) return;
      const cur = activeIdx ?? 0;
      const next = (cur + delta + projRoutes.length) % projRoutes.length;
      setActive(next);
    },
    [projRoutes.length, activeIdx],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          moveActive(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          moveActive(-1);
          break;
        case "Home":
          e.preventDefault();
          setActive(0);
          break;
        case "End":
          e.preventDefault();
          setActive(projRoutes.length - 1);
          break;
        default:
          break;
      }
    },
    [moveActive, projRoutes.length],
  );

  // Readout: the active route's label (or point-count context) — mirrors <Map>.
  const readout =
    activeRoute?.label ??
    (projRoutes.length
      ? `${projRoutes.length} route${projRoutes.length > 1 ? "s" : ""}${projPoints.length ? `, ${projPoints.length} point${projPoints.length > 1 ? "s" : ""}` : ""}`
      : projPoints.length
        ? `${projPoints.length} point${projPoints.length > 1 ? "s" : ""}`
        : "no routes");

  const groupLabel = projRoutes.length
    ? `Route map. ${projRoutes.length} route${projRoutes.length > 1 ? "s" : ""}. Use arrow keys to cycle routes. ` +
      projRoutes.map((r, i) => `${r.label ?? `route ${i + 1}`}`).join("; ")
    : "Route map";

  return (
    <figure className="mdx-figure mdx-figure--wide map routemap" ref={ref}>
      <div className="mdx-panel map-panel">
        <div className="map-readout" aria-hidden="true">
          <span className="mdx-label">route</span>{" "}
          <span className="map-readout-value">{readout}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" role="presentation">
          {/* one focusable group: roving arrow-key focus cycles the ROUTES */}
          <g
            tabIndex={0}
            role="application"
            aria-roledescription="interactive route map"
            aria-label={groupLabel}
            className="map-group"
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFocused(false);
                setActive(null);
              }
            }}
          >
            {/* choropleth land — same fills as <Map> */}
            {paths.map((p, i) => (
              <path
                key={`${p.iso3}-${i}`}
                d={p.d}
                className="map-country"
                style={{ fill: choro.fill(p.iso3) }}
                tabIndex={-1}
                aria-hidden="true"
              />
            ))}

            {/* graticule: regional grid when zoomed to the route, else world lats */}
            <g className="map-graticule" aria-hidden="true">
              {gridLines.map((l, i) => (
                <path
                  key={`gl${i}`}
                  d={l.d}
                  className={l.major ? "map-lat map-lat--major" : "map-lat"}
                  fill="none"
                />
              ))}
              {gridLabels.map((l, i) => (
                <text
                  key={`gt${i}`}
                  x={l.x}
                  y={l.y}
                  className="map-lat-label"
                  textAnchor={l.anchor}
                >
                  {l.text}
                </text>
              ))}
            </g>

            {/* the routes: amber great-circle arcs drawn on scroll */}
            <g className="rm-routes" aria-hidden="true">
              {projRoutes.map((r, i) => {
                const { array, offset } = dashParams(r.length, 1);
                // Only honor the undrawn start once the client armed it.
                const dashOffset = armed && !drawn ? array : offset;
                const isActive = activeIdx === i;
                return (
                  <g
                    key={i}
                    className={
                      "rm-route" +
                      ` rm-route--${r.kind}` +
                      (isActive ? " rm-route--active" : "")
                    }
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                  >
                    {/* fat transparent hit-path so a real pointer moving ALONG
                        the thin arc reliably triggers the hover label (mirrors
                        StateMachine's .sm-edge-hit). The visible arc is
                        pointer-events:none; this stroke owns the hover. */}
                    <path
                      d={r.d}
                      className="rm-arc-hit"
                      onMouseEnter={() => setActive(i)}
                    />
                    {/* the arc stroke */}
                    <path
                      d={r.d}
                      className={drawn ? "rm-arc is-drawn" : "rm-arc"}
                      style={{
                        strokeDasharray: array,
                        strokeDashoffset: dashOffset,
                      }}
                    />
                    {/* endpoint dots (from = origin, to = destination) */}
                    {r.from ? (
                      <circle cx={r.from[0]} cy={r.from[1]} r={3} className="rm-endpoint rm-endpoint--from" />
                    ) : null}
                    {r.to ? (
                      <circle cx={r.to[0]} cy={r.to[1]} r={3.5} className="rm-endpoint rm-endpoint--to" />
                    ) : null}
                    {/* label surfaces at the arc midpoint when active */}
                    {isActive && r.label ? (
                      <text x={r.mid[0]} y={r.mid[1] - 8} className="rm-route-label" textAnchor="middle">
                        {r.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>

            {/* standalone labeled points — dots register on the land; labels are
                de-collided and flip near the right edge so names stay legible */}
            <g className="rm-points" aria-hidden="true">
              {projPoints.map((p, i) => (
                <circle key={`pd${i}`} cx={p.at[0]} cy={p.at[1]} r={3.5} className="rm-point-dot" />
              ))}
              {pointLabels.map((l, i) => (
                <text
                  key={`pl${i}`}
                  x={l.x}
                  y={l.y}
                  className="rm-point-label"
                  textAnchor={l.anchor}
                >
                  {l.text}
                </text>
              ))}
            </g>

            {/* focus halo at the active route's midpoint (visible at any size) */}
            {activeRoute ? (
              <circle
                cx={activeRoute.mid[0]}
                cy={activeRoute.mid[1]}
                r={9}
                className="map-focus-halo"
                aria-hidden="true"
              />
            ) : null}
          </g>

          {/* scale bar — a sense of scale for the zoomed regional view */}
          {scaleBar ? (
            <g className="rm-scalebar" aria-hidden="true" transform={`translate(20 ${H - 26})`}>
              <line x1={0} y1={0} x2={scaleBar.px} y2={0} className="rm-scalebar-line" />
              <line x1={0} y1={-5} x2={0} y2={0} className="rm-scalebar-line" />
              <line x1={scaleBar.px} y1={-5} x2={scaleBar.px} y2={0} className="rm-scalebar-line" />
              <text x={scaleBar.px / 2} y={-8} className="rm-scalebar-label" textAnchor="middle">
                ~{scaleBar.label}
              </text>
            </g>
          ) : null}
        </svg>

        {/*
          Non-blank fallback that is ALSO the accessible equivalent: a semantic
          list of every route and point with its label. Present in the static
          HTML, so even with the SVG unstyled/hidden the reader gets the labeled
          route/point list — the figure is never blank.
        */}
        <ol className="rm-legend visually-hidden">
          {projRoutes.map((r, i) => (
            <li key={`r${i}`}>{`Route ${i + 1} (${r.kind}): ${r.label ?? "unlabeled"}`}</li>
          ))}
          {projPoints.map((p, i) => (
            <li key={`p${i}`}>{`Point: ${p.label}`}</li>
          ))}
          {/* choropleth-weighted countries, labeled like <Map> (labels ?? iso3) */}
          {Object.keys(values).map((iso3) => (
            <li key={`c-${iso3}`}>{`${labels[iso3] ?? iso3}: ${values[iso3]}`}</li>
          ))}
        </ol>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
