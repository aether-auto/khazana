// apps/site/src/components/mdx/Map.tsx
import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import worldTopo from "world-atlas/countries-110m.json"; // bundled asset — no runtime fetch
import { buildChoropleth } from "./lib/choropleth.js";
import { iso3ForNumeric } from "./lib/iso-numeric.js";
import "./mdx.css";
import "./Map.css";

export interface MapProps {
  /** Optional choropleth values keyed by ISO 3166-1 alpha-3. */
  values?: Record<string, number>;
  /** Optional iso3->label for hover readout. */
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

export default function Map({ values = {}, labels = {}, caption }: MapProps) {
  const [hover, setHover] = useState<string | null>(null);
  const choro = useMemo(() => buildChoropleth(values), [values]);

  const { paths } = useMemo(() => {
    const topo = worldTopo as unknown as WorldTopology;
    const fc = feature(topo as Parameters<typeof feature>[0], topo.objects.countries as Parameters<typeof feature>[1]) as unknown as FeatureCollection<Geometry, CountryProps>;
    const projection = geoNaturalEarth1().fitSize([W, H], fc);
    const path = geoPath(projection);
    const paths = fc.features.map((f) => {
      const iso3 = iso3ForNumeric(f.id as string | number) ?? "";
      return { iso3, name: (f.properties as CountryProps)?.name ?? iso3, d: path(f) ?? "" };
    });
    return { paths };
  }, []);

  const readout = hover
    ? `${labels[hover] ?? hover}${values[hover] !== undefined ? `: ${values[hover]}` : ""}`
    : "—";

  return (
    <figure className="mdx-figure mdx-figure--wide map">
      <div className="mdx-panel map-panel">
        <div className="map-readout">
          <span className="mdx-label">region</span> {readout}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" role="img" aria-label="World map">
          {paths.map((p, i) => (
            <path
              key={`${p.iso3}-${i}`}
              d={p.d}
              className={hover === p.iso3 ? "map-country map-country--hover" : "map-country"}
              style={{ fill: choro.fill(p.iso3) }}
              tabIndex={p.iso3 ? 0 : -1}
              role={p.iso3 ? "button" : undefined}
              aria-label={p.iso3 ? p.name : undefined}
              onMouseEnter={() => setHover(p.iso3 || null)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.iso3 || null)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
