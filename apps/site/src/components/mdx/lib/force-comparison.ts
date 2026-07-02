// apps/site/src/components/mdx/lib/force-comparison.ts
/**
 * Pure deterministic math for <ForceComparison> — a head-to-head "diverging
 * paired bar" of two forces' metrics (troops, tanks, artillery, casualties …).
 * No DOM, no dep: bar-scale + ratio math live here so the island / fallback are
 * thin renderers. Every metric is normalized independently: the larger side's
 * bar fills the half-width, the other scales proportionally. Ratio is reported
 * bigger-over-smaller with the winning side's index attached.
 *
 * `higherIsWorse` (casualties, losses) flips the semantic winner: with more =
 * worse, the side with the SMALLER value is the "advantaged" one. The bar
 * lengths are unaffected (they're a magnitude comparison); only `advantage`
 * points the other way, so styling can mark the favorable side.
 */

export type Tone = "friendly" | "enemy" | "neutral";

export interface ForceSide {
  label: string;
  tone?: Tone;
}

export interface ForceMetric {
  label: string;
  /** Values aligned to sides[] — usually length 2. */
  values: number[];
  /** unit suffix, e.g. "men", "tanks", "%". */
  unit?: string;
  /** When true, a higher value is worse (casualties, losses). */
  higherIsWorse?: boolean;
}

export interface ForceComparisonProps {
  sides: ForceSide[]; // usually 2
  metrics: ForceMetric[];
  caption?: string;
}

/** A laid-out per-side cell inside a metric row. */
export interface ForceBarCell {
  /** index into sides[]. */
  side: number;
  label: string;
  tone: Tone;
  value: number;
  /** formatted value + unit for display. */
  display: string;
  /** bar fill fraction 0..1 of this side's half-width (1 = the larger side). */
  frac: number;
  /** percentage string "0%".."100%" for CSS width. */
  pct: string;
  /** true when this side is the larger magnitude in the metric. */
  isMax: boolean;
  /** true when this side is the "advantaged" one (accounts for higherIsWorse). */
  isAdvantaged: boolean;
}

export interface ForceRow {
  label: string;
  unit?: string;
  higherIsWorse: boolean;
  cells: ForceBarCell[];
  /** ratio bigger:smaller, e.g. 3.2 for 3.2:1. null when not comparable. */
  ratio: number | null;
  /** "3.2:1" pre-formatted, or "—" when undefined (zero/degenerate). */
  ratioLabel: string;
  /** index of the side the ratio favors (advantaged), or null. */
  advantageSide: number | null;
}

export interface ForceLayout {
  sides: (ForceSide & { tone: Tone })[];
  rows: ForceRow[];
}

/** Normalize a side's tone, defaulting missing/unknown to "neutral". */
export function normalizeTone(tone: Tone | undefined): Tone {
  return tone === "friendly" || tone === "enemy" || tone === "neutral"
    ? tone
    : "neutral";
}

/**
 * Compact human number: 12000 → "12,000" stays exact for military counts, but
 * we also allow a `unit` suffix appended by the caller. We keep full precision
 * (armies are counted, not estimated to 2 sig-figs) but group thousands.
 */
export function formatForceValue(v: number, unit?: string): string {
  if (!Number.isFinite(v)) return "—";
  const grouped = Number.isInteger(v)
    ? v.toLocaleString("en-US")
    : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return unit ? `${grouped} ${unit}` : grouped;
}

/**
 * Ratio of the two magnitudes, bigger over smaller, rounded to 1 decimal (but
 * whole ratios stay whole). Returns null when it can't be formed (a zero on the
 * smaller side, or fewer than two finite comparable values).
 */
export function computeRatio(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const max = Math.max(...finite);
  const min = Math.min(...finite);
  if (min <= 0) return null; // n:0 is not a finite ratio
  const r = max / min;
  return Number(r.toFixed(r >= 10 ? 0 : 1));
}

/** "3.2:1" / "12:1" / "—". */
export function formatRatio(ratio: number | null): string {
  if (ratio == null) return "—";
  return `${Number.isInteger(ratio) ? ratio : ratio.toFixed(1)}:1`;
}

/**
 * Build the full render layout: for every metric, compute each side's bar
 * fraction (relative to the metric's max magnitude) and the ratio, and mark the
 * larger / advantaged side. Bars are normalized PER METRIC (troops don't share
 * a scale with tanks) — the diverging bars are a within-row comparison.
 */
export function layoutForceComparison(props: ForceComparisonProps): ForceLayout {
  const rawSides = props.sides ?? [];
  if (rawSides.length === 0) throw new Error("ForceComparison: needs at least one side");
  const sides = rawSides.map((s) => ({
    label: (s.label ?? "").trim(),
    tone: normalizeTone(s.tone),
  }));

  const rows: ForceRow[] = (props.metrics ?? []).map((m) => {
    const higherIsWorse = m.higherIsWorse === true;
    // Align values to sides length; missing → NaN (renders as "—", zero bar).
    const values = sides.map((_, i) => {
      const v = m.values?.[i];
      return typeof v === "number" ? v : NaN;
    });
    const finite = values.filter(Number.isFinite);
    const maxMag = finite.length ? Math.max(...finite.map(Math.abs)) : 0;
    const maxVal = finite.length ? Math.max(...finite) : NaN;
    const minVal = finite.length ? Math.min(...finite) : NaN;

    const ratio = computeRatio(values);
    // Advantaged side = larger value, unless higherIsWorse flips it to smaller.
    const targetVal = higherIsWorse ? minVal : maxVal;
    let advantageSide: number | null = null;
    if (Number.isFinite(targetVal) && ratio != null) {
      advantageSide = values.findIndex((v) => v === targetVal);
      if (advantageSide < 0) advantageSide = null;
    }

    const cells: ForceBarCell[] = sides.map((s, i) => {
      const value = values[i];
      const has = Number.isFinite(value);
      const frac = has && maxMag > 0 ? Math.abs(value) / maxMag : 0;
      const isMax = has && Number.isFinite(maxVal) && value === maxVal;
      const isAdvantaged = advantageSide === i;
      return {
        side: i,
        label: s.label,
        tone: s.tone,
        value,
        display: has ? formatForceValue(value, m.unit) : "—",
        frac,
        pct: `${(frac * 100).toFixed(2)}%`,
        isMax,
        isAdvantaged,
      };
    });

    return {
      label: (m.label ?? "").trim(),
      unit: m.unit,
      higherIsWorse,
      cells,
      ratio,
      ratioLabel: formatRatio(ratio),
      advantageSide,
    };
  });

  return { sides, rows };
}
