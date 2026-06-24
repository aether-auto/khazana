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
