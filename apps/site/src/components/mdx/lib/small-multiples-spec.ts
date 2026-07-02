// apps/site/src/components/mdx/lib/small-multiples-spec.ts
/**
 * Pure spec-builder for <SmallMultiples>: a grid of the same chart faceted by a
 * category (the Tufte staple). No DOM, no Plot import — the island maps this
 * onto Observable Plot's built-in `fx` faceting. Everything here is deterministic
 * and unit-testable offline.
 */

export type SmallMark = "line" | "bar" | "area" | "dot";

export interface SmallMultiplesProps {
  /** Row-oriented data. Every row carries x, y and the `facet` field. */
  data: ReadonlyArray<Record<string, unknown>>;
  /** Mark family drawn in each panel. */
  mark: SmallMark;
  /** Field name for the x channel. */
  x: string;
  /** Field name for the y channel. */
  y: string;
  /** Field whose distinct values become one panel each. */
  facet: string;
  /** Target columns in the grid (default: auto from panel count). */
  columns?: number;
  /** Share the y-scale across panels so heights compare (default true). */
  sharedY?: boolean;
  /** Caption rendered in the figcaption. */
  caption?: string;
  /** Pixel height of the whole faceted figure (default derived). */
  height?: number;
}

export interface SmallMultiplesSpec {
  /** Distinct facet values, numeric-aware sorted — the panel order. */
  facets: string[];
  /** Column count actually used for the grid (clamped, reflows on mobile). */
  columns: number;
  /** Whether the y-domain is shared across panels. */
  sharedY: boolean;
  /** Plot mark family key. */
  markType: "line" | "barY" | "areaY" | "dot";
  /** Whether this mark should be drawn without a flood fill (line/dot). */
  noFill: boolean;
  /** Total figure height. */
  height: number;
  caption?: string;
  /** Axis titles. */
  xLabel: string;
  yLabel: string;
  /** Terminal-aesthetic style block (token-driven). */
  style: { fontFamily: string; background: string; color: string; fontSize: string };
}

const MARK_TYPE: Record<SmallMark, SmallMultiplesSpec["markType"]> = {
  line: "line",
  bar: "barY",
  area: "areaY",
  dot: "dot",
};

const MARK_ALIASES: Partial<Record<string, SmallMark>> = {
  barY: "bar",
  areaY: "area",
};

const NO_FILL_MARKS: ReadonlySet<SmallMark> = new Set(["line", "dot"]);

/** Numeric-aware distinct sort ("A2" < "A10", "10%" < "100%"). */
export function distinctFacets(
  rows: ReadonlyArray<Record<string, unknown>>,
  key: string,
): string[] {
  return [...new Set(rows.map((r) => String(r[key])))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

/**
 * Choose a column count for `n` panels. Honors an explicit request (clamped to
 * [1, n]); otherwise picks a near-square grid that never exceeds 4 columns so a
 * many-facet grid REFLOWS (more rows) on narrow screens rather than widening the
 * page. The island additionally caps columns responsively at render time.
 */
export function gridColumns(n: number, requested?: number): number {
  if (n <= 0) return 1;
  if (requested !== undefined && Number.isFinite(requested)) {
    return Math.max(1, Math.min(Math.floor(requested), n));
  }
  const square = Math.ceil(Math.sqrt(n));
  return Math.max(1, Math.min(square, 4, n));
}

/**
 * Convert camelCase / snake_case into a human label. Mirrors chart-spec so the
 * two figure families read identically.
 */
export function humanizeLabel(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

export function buildSmallMultiplesSpec(props: SmallMultiplesProps): SmallMultiplesSpec {
  const { data, x, y, facet, columns, sharedY = true, caption, height } = props;
  if (!data || data.length === 0)
    throw new Error("SmallMultiples: `data` must be a non-empty array");
  const mark: SmallMark = MARK_ALIASES[props.mark as string] ?? (props.mark as SmallMark);
  if (!(mark in MARK_TYPE)) throw new Error(`SmallMultiples: unknown mark "${props.mark}"`);
  if (!facet) throw new Error("SmallMultiples: `facet` field is required");

  const facets = distinctFacets(data, facet);
  const cols = gridColumns(facets.length, columns);
  const rows = Math.ceil(facets.length / cols);
  // ~110px per panel row + axis chrome; clamped so tall grids stay reasonable.
  const derivedHeight = Math.min(720, Math.max(180, rows * 130 + 40));

  return {
    facets,
    columns: cols,
    sharedY,
    markType: MARK_TYPE[mark],
    noFill: NO_FILL_MARKS.has(mark),
    height: height ?? derivedHeight,
    caption,
    xLabel: props.x ? humanizeLabel(x) : x,
    yLabel: props.y ? humanizeLabel(y) : y,
    style: {
      fontFamily:
        'var(--font-mono, "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace)',
      background: "transparent",
      color: "var(--ink-dim)",
      fontSize: "var(--t-xs, 0.75rem)",
    },
  };
}

/**
 * Grid placement for each facet value: which (col, row) it occupies given a
 * column count. Observable Plot 0.6 draws a single `fx` in ONE row — to get a
 * true grid we synthesize an fx (column index) and fy (row index) per row of
 * data. This returns the lookup the island uses to derive those channels.
 *
 * Column index is a zero-padded string so Plot's ordinal fx scale sorts them
 * left-to-right ("00" < "01" < … < "10"); row index likewise top-to-bottom.
 */
export function facetGrid(
  facets: ReadonlyArray<string>,
  columns: number,
): Map<string, { col: string; row: string }> {
  const cols = Math.max(1, columns);
  const pad = (n: number) => String(n).padStart(2, "0");
  const grid = new Map<string, { col: string; row: string }>();
  facets.forEach((f, i) => {
    grid.set(f, { col: pad(i % cols), row: pad(Math.floor(i / cols)) });
  });
  return grid;
}

/**
 * A compact per-facet data summary for the non-blank SSR / no-JS fallback:
 * one row per panel with its point count. Mirrors Chart's text fallback.
 */
export function facetSummary(
  data: ReadonlyArray<Record<string, unknown>>,
  facet: string,
): { facet: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of data) {
    const k = String(row[facet]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return distinctFacets(data, facet).map((f) => ({ facet: f, count: counts.get(f) ?? 0 }));
}
