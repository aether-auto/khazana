// apps/site/src/components/mdx/lib/distribution-spec.ts
/**
 * Pure spec-builder + histogram binning for <Distribution>. The island maps this
 * onto Observable Plot's `rectY`+`binX` (histogram) or `density`. The binning
 * math here is duplicated deliberately so the SSR / no-JS fallback can render a
 * real bin table WITHOUT loading Plot, and so it's unit-testable offline.
 */

export type DistMark = "hist" | "density";

export interface DistMarker {
  /** Value on the `value` axis where the reference line is drawn. */
  at: number;
  /** Short label for the line (the threshold that IS the argument). */
  label: string;
}

export interface DistributionProps {
  /** Row-oriented data. */
  data: ReadonlyArray<Record<string, unknown>>;
  /** Field holding the numeric quantity whose distribution we plot. */
  value: string;
  /** Bin count (histogram only). Default: Freedman–Diaconis-ish auto. */
  bins?: number;
  /** Optional reference lines (mean, threshold, cutoff …). */
  marker?: DistMarker[];
  /** "hist" (default) or "density". */
  mark?: DistMark;
  /** Caption rendered in the figcaption. */
  caption?: string;
  /** Human-readable axis label (defaults to `value`). */
  valueLabel?: string;
  /** Pixel height (default 300). */
  height?: number;
}

export interface HistBin {
  /** Inclusive lower edge. */
  x0: number;
  /** Exclusive upper edge (inclusive for the final bin). */
  x1: number;
  /** Number of values that fell in this bin. */
  count: number;
}

export interface DistributionSpec {
  markType: DistMark;
  /** Cleaned, finite numeric values extracted from `data[value]`. */
  values: number[];
  /** Computed histogram bins (present for both marks — density also uses range). */
  bins: HistBin[];
  /** Requested/derived bin count. */
  binCount: number;
  markers: DistMarker[];
  height: number;
  caption?: string;
  valueLabel: string;
  min: number;
  max: number;
  /** Terminal-aesthetic style block (token-driven). */
  style: { fontFamily: string; background: string; color: string; fontSize: string };
}

/** Pull finite numbers out of a column, dropping null/NaN/non-numeric rows. */
export function extractValues(
  data: ReadonlyArray<Record<string, unknown>>,
  key: string,
): number[] {
  const out: number[] = [];
  for (const row of data) {
    const raw = row[key];
    // Drop null/undefined/empty-string explicitly: Number(null)===0 and
    // Number("")===0 would otherwise smuggle spurious zeros into the histogram.
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Sturges' rule with a sane clamp — a stable default bin count when the author
 * doesn't specify one. Clamped to [5, 40] so tiny samples aren't over-binned and
 * large ones don't produce a comb.
 */
export function autoBinCount(n: number): number {
  if (n <= 1) return 1;
  const sturges = Math.ceil(Math.log2(n) + 1);
  return Math.max(5, Math.min(40, sturges));
}

/**
 * Uniform-width binning over [min, max]. Values equal to the max land in the
 * final bin (right edge inclusive there only). Deterministic and Plot-free so
 * the SSR fallback and the live chart agree on counts.
 */
export function computeBins(values: ReadonlyArray<number>, binCount: number): HistBin[] {
  if (values.length === 0 || binCount < 1) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    // Degenerate: a single spike. One bin holding everything.
    return [{ x0: min, x1: max, count: values.length }];
  }
  const width = (max - min) / binCount;
  const bins: HistBin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1; // v === max
    if (idx < 0) idx = 0;
    bins[idx]!.count += 1;
  }
  return bins;
}

export function buildDistributionSpec(props: DistributionProps): DistributionSpec {
  const { data, value, marker, caption, valueLabel, height } = props;
  if (!data || data.length === 0)
    throw new Error("Distribution: `data` must be a non-empty array");
  if (!value) throw new Error("Distribution: `value` field is required");
  const markType: DistMark = props.mark === "density" ? "density" : "hist";

  const values = extractValues(data, value);
  if (values.length === 0)
    throw new Error(`Distribution: column "${value}" holds no finite numbers`);

  const binCount =
    props.bins !== undefined && Number.isFinite(props.bins)
      ? Math.max(1, Math.floor(props.bins))
      : autoBinCount(values.length);
  const bins = computeBins(values, binCount);

  return {
    markType,
    values,
    bins,
    binCount,
    markers: Array.isArray(marker) ? marker : [],
    height: height ?? 300,
    caption,
    valueLabel: valueLabel ?? value,
    min: Math.min(...values),
    max: Math.max(...values),
    style: {
      fontFamily:
        'var(--font-mono, "Berkeley Mono", "JetBrains Mono", "SF Mono", ui-monospace, monospace)',
      background: "transparent",
      color: "var(--ink-dim)",
      fontSize: "var(--t-xs, 0.75rem)",
    },
  };
}
