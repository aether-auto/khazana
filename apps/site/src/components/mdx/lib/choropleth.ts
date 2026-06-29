// apps/site/src/components/mdx/lib/choropleth.ts
/** Pure choropleth color scale for <Map>. Token-driven amber ramp. No DOM. */

export const NO_DATA_FILL = "var(--bg-raised)";

export interface Choropleth {
  domain: [number, number];
  /** iso3 -> CSS color (amber ramp) or NO_DATA_FILL when absent. */
  fill: (iso3: string) => string;
}

/**
 * Map values to an amber ramp expressed as a color-mix weight so it tracks the
 * live --accent token. weight in [12%, 88%] of --accent over --bg-inset.
 */
export function buildChoropleth(values: Readonly<Record<string, number>>): Choropleth {
  const entries = Object.values(values);
  const hasData = entries.length > 0;
  const min = hasData ? Math.min(...entries) : 0;
  const max = hasData ? Math.max(...entries) : 0;
  const span = max - min;

  const fill = (iso3: string): string => {
    const v = values[iso3];
    if (v === undefined) return NO_DATA_FILL;
    const norm = span === 0 ? 1 : (v - min) / span; // flat domain => full weight
    const weight = (12 + norm * 76).toFixed(1); // 12%..88%
    return `color-mix(in oklab, var(--accent) ${weight}%, var(--bg-inset))`;
  };

  return { domain: [min, max], fill };
}

export interface LatitudeLine {
  /** Latitude in degrees, positive north. */
  lat: number;
  /** Human label, e.g. "Equator", "30° N". */
  label: string;
  /** Equator (and other emphasis lines) draw heavier than the rest. */
  major: boolean;
}

/**
 * The latitude graticule for <Map>: an equator plus a symmetric set of parallels
 * north and south. Returned north-to-south so the order matches top-to-bottom in
 * the rendered SVG. Kept just inside |lat| < 90 so the projection stays drawable.
 */
export function graticuleLatitudes(): LatitudeLine[] {
  const parallels = [60, 30]; // degrees from the equator, both hemispheres
  const lines: LatitudeLine[] = [];
  for (const lat of parallels) {
    lines.push({ lat, label: `${lat}° N`, major: false });
  }
  lines.push({ lat: 0, label: "Equator", major: true });
  for (const lat of [...parallels].reverse()) {
    lines.push({ lat: -lat, label: `${lat}° S`, major: false });
  }
  return lines; // already north-to-south
}

/**
 * Readout text for the hovered/focused country. Returns null when nothing is
 * active OR when the country carries no data — so the map never surfaces a raw
 * ISO3 code for an undocumented country, and the default state shows no value.
 */
export function formatReadout(
  iso3: string | null,
  values: Readonly<Record<string, number>>,
  labels: Readonly<Record<string, string>>,
): string | null {
  if (!iso3) return null;
  const v = values[iso3];
  if (v === undefined) return null; // not in the dataset → suppress
  return `${labels[iso3] ?? iso3}: ${v}`;
}
