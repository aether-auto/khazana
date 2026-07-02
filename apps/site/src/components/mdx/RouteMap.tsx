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
import { geoNaturalEarth1, geoPath } from "d3-geo";
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
interface LatLine {
  d: string;
  label: string;
  lx: number;
  ly: number;
  major: boolean;
}

export default function RouteMap({
  values = {},
  labels = {},
  routes = [],
  points = [],
  caption,
}: RouteMapProps) {
  const choro = useMemo(() => buildChoropleth(values), [values]);

  // Project the land + graticule + the routes/points ONCE, all through the same
  // geoNaturalEarth1 projection so arcs and dots sit exactly over the choropleth.
  const { paths, latLines, scene } = useMemo(() => {
    const topo = worldTopo as unknown as WorldTopology;
    const fc = feature(
      topo as Parameters<typeof feature>[0],
      topo.objects.countries as Parameters<typeof feature>[1],
    ) as unknown as FeatureCollection<Geometry, CountryProps>;
    const projection = geoNaturalEarth1().fitSize([W, H], fc);
    const path = geoPath(projection);

    const paths: CountryPath[] = fc.features.map((f) => ({
      iso3: iso3ForNumeric(f.id as string | number) ?? "",
      d: path(f) ?? "",
    }));

    const latLines: LatLine[] = graticuleLatitudes().map(({ lat, label, major }) => {
      const coordinates: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 2) coordinates.push([lon, lat]);
      const d = path({ type: "LineString", coordinates }) ?? "";
      const anchor = projection([178, lat]) ?? [W, 0];
      return { d, label, lx: anchor[0], ly: anchor[1], major };
    });

    // Same projection → arcs and points register over the land.
    const project: Project = (ll) => {
      const p = projection(ll);
      return p ? [p[0], p[1]] : null;
    };
    const scene = projectScene(routes, points, project, ARC_STEPS);

    return { paths, latLines, scene };
  }, [routes, points]);

  const projRoutes: ProjectedRoute[] = scene.routes;
  const projPoints: ProjectedPoint[] = scene.points;

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

            {/* latitude graticule (reused verbatim from Map) */}
            <g className="map-graticule" aria-hidden="true">
              {latLines.map((l) => (
                <g key={l.label}>
                  <path
                    d={l.d}
                    className={l.major ? "map-lat map-lat--major" : "map-lat"}
                    fill="none"
                  />
                  <text x={l.lx} y={l.ly - 3} className="map-lat-label" textAnchor="end">
                    {l.label}
                  </text>
                </g>
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

            {/* standalone labeled points */}
            <g className="rm-points" aria-hidden="true">
              {projPoints.map((p, i) => (
                <g key={i} className="rm-point">
                  <circle cx={p.at[0]} cy={p.at[1]} r={3.5} className="rm-point-dot" />
                  <text x={p.at[0] + 6} y={p.at[1] + 3} className="rm-point-label">
                    {p.label}
                  </text>
                </g>
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
