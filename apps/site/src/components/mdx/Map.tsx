// apps/site/src/components/mdx/Map.tsx
import { useCallback, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import worldTopo from "world-atlas/countries-110m.json"; // bundled asset — no runtime fetch
import { buildChoropleth, formatReadout, graticuleLatitudes } from "./lib/choropleth.js";
import { iso3ForNumeric } from "./lib/iso-numeric.js";
import "./mdx.css";
import "./Map.css";

export interface MapProps {
  /** Optional choropleth values keyed by ISO 3166-1 alpha-3. Doubles as the
   *  shading weight, so higher values read as more intense fills. */
  values?: Record<string, number>;
  /** Optional iso3->label for hover/focus readout. */
  labels?: Record<string, string>;
  caption?: string;
}

const W = 960;
const H = 480;

interface CountryProps { name?: string }

// Topology type — world-atlas ships pre-baked TopoJSON which topojson-client understands
type WorldTopology = {
  type: "Topology";
  objects: { countries: object };
  arcs: unknown[];
};

interface CountryPath {
  iso3: string;
  name: string;
  d: string;
  /** Projected centroid, used to place the keyboard focus halo. */
  cx: number;
  cy: number;
}

interface LatLine {
  d: string;
  label: string;
  /** Projected label anchor at the line's eastern edge. */
  lx: number;
  ly: number;
  major: boolean;
}

export default function Map({ values = {}, labels = {}, caption }: MapProps) {
  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const choro = useMemo(() => buildChoropleth(values), [values]);

  const { paths, latLines } = useMemo(() => {
    const topo = worldTopo as unknown as WorldTopology;
    const fc = feature(
      topo as Parameters<typeof feature>[0],
      topo.objects.countries as Parameters<typeof feature>[1],
    ) as unknown as FeatureCollection<Geometry, CountryProps>;
    const projection = geoNaturalEarth1().fitSize([W, H], fc);
    const path = geoPath(projection);

    const paths: CountryPath[] = fc.features.map((f) => {
      const iso3 = iso3ForNumeric(f.id as string | number) ?? "";
      const [cx, cy] = path.centroid(f);
      return {
        iso3,
        name: (f.properties as CountryProps)?.name ?? iso3,
        d: path(f) ?? "",
        cx: Number.isFinite(cx) ? cx : 0,
        cy: Number.isFinite(cy) ? cy : 0,
      };
    });

    // Latitude graticule — the rhetorical core of this figure: it lets the map
    // show how far from the pole toward the equator the aurora reached.
    const latLines: LatLine[] = graticuleLatitudes().map(({ lat, label, major }) => {
      const coordinates: [number, number][] = [];
      for (let lon = -180; lon <= 180; lon += 2) coordinates.push([lon, lat]);
      const d = path({ type: "LineString", coordinates }) ?? "";
      const anchor = projection([178, lat]) ?? [W, 0];
      return { d, label, lx: anchor[0], ly: anchor[1], major };
    });

    return { paths, latLines };
  }, []);

  // Countries that actually carry data, in west-to-east order — this is the set
  // the keyboard navigates (roving focus) and the screen-reader list enumerates.
  const dataCountries = useMemo(
    () =>
      paths
        .filter((p) => values[p.iso3] !== undefined)
        .sort((a, b) => a.cx - b.cx),
    [paths, values],
  );

  const readout = formatReadout(hover, values, labels);
  // While the group holds keyboard focus we default the selection to the first
  // data country; hover always wins. Nothing is "active" when neither applies,
  // so the halo/highlight don't linger after blur.
  const active = hover ?? (focused ? dataCountries[0]?.iso3 ?? null : null);
  const activePath = active ? paths.find((p) => p.iso3 === active) : undefined;

  const moveActive = useCallback(
    (delta: number) => {
      if (dataCountries.length === 0) return;
      const idx = dataCountries.findIndex((p) => p.iso3 === active);
      const next = (idx + delta + dataCountries.length) % dataCountries.length;
      setHover(dataCountries[next]?.iso3 ?? null);
    },
    [dataCountries, active],
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
          setHover(dataCountries[0]?.iso3 ?? null);
          break;
        case "End":
          e.preventDefault();
          setHover(dataCountries[dataCountries.length - 1]?.iso3 ?? null);
          break;
        default:
          break;
      }
    },
    [moveActive, dataCountries],
  );

  // Accessible name for the whole figure: the data countries and their values,
  // so an AT user gets the full picture without tabbing through 177 paths.
  const groupLabel = dataCountries.length
    ? `World map. ${dataCountries.length} countries with documented sightings. Use arrow keys to move between them. ` +
      dataCountries.map((p) => `${labels[p.iso3] ?? p.name}, ${values[p.iso3]}`).join("; ")
    : "World map";

  return (
    <figure className="mdx-figure mdx-figure--wide map">
      <div className="mdx-panel map-panel">
        <div className="map-readout" aria-hidden="true">
          <span className="mdx-label">region</span>{" "}
          <span className="map-readout-value">{readout ?? "hover or focus the map"}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" role="presentation">
          {/* one focusable group: roving arrow-key focus, not 177 tab stops */}
          <g
            tabIndex={0}
            role="application"
            aria-roledescription="interactive map"
            aria-label={groupLabel}
            className="map-group"
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              // only clear when focus leaves the group entirely
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFocused(false);
                setHover(null);
              }
            }}
          >
            {paths.map((p, i) => {
              const inData = values[p.iso3] !== undefined;
              return (
                <path
                  key={`${p.iso3}-${i}`}
                  d={p.d}
                  className={
                    active === p.iso3 ? "map-country map-country--active" : "map-country"
                  }
                  style={{ fill: choro.fill(p.iso3) }}
                  tabIndex={-1}
                  aria-hidden="true"
                  onMouseEnter={inData ? () => setHover(p.iso3) : undefined}
                  onMouseLeave={inData ? () => setHover(null) : undefined}
                />
              );
            })}

            {/* latitude graticule drawn over the fills, under the focus halo */}
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

            {/* visible focus halo at the active country's centroid */}
            {activePath ? (
              <circle
                cx={activePath.cx}
                cy={activePath.cy}
                r={9}
                className="map-focus-halo"
                aria-hidden="true"
              />
            ) : null}
          </g>
        </svg>

        {/* screen-reader equivalent of the choropleth — the data as a list */}
        <ul className="visually-hidden">
          {dataCountries.map((p) => (
            <li key={p.iso3}>{`${labels[p.iso3] ?? p.name}: ${values[p.iso3]}`}</li>
          ))}
        </ul>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
