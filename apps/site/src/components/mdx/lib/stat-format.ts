// apps/site/src/components/mdx/lib/stat-format.ts
/**
 * Pure helpers for <StatBand>'s count-up: number formatting + an eased tween
 * value. No DOM, no rAF — testable offline. The island wires these to an
 * IntersectionObserver + requestAnimationFrame loop.
 */

export interface FormatOptions {
  prefix?: string;
  suffix?: string;
  /** fixed decimal places; when omitted, integers print plain and floats keep
   *  their natural precision (so a value like 2.6 reads "2.6", not "3"). */
  decimals?: number;
  /** thousands-grouping (default true). Set false for years/IDs (1859, not
   *  1,859). */
  group?: boolean;
}

/**
 * Format a numeric value into the displayed string. Integers get thousands
 * grouping by default (20000000 → "20,000,000"); explicit `decimals` fixes the
 * precision (and still groups the integer part). Set `group: false` to suppress
 * grouping (e.g. a year). prefix/suffix bracket the number.
 */
export function format(value: number, opts: FormatOptions = {}): string {
  const { prefix = "", suffix = "", decimals, group = true } = opts;
  // Guard non-finite inputs so a NaN frame never paints "NaN".
  const v = Number.isFinite(value) ? value : 0;

  let body: string;
  if (decimals === undefined) {
    // No fixed precision: group integers (unless disabled); floats stay as-is.
    if (Number.isInteger(v)) body = group ? groupThousands(v) : String(v);
    else body = String(v);
  } else {
    const d = Math.max(0, Math.min(20, Math.trunc(decimals)));
    const fixed = v.toFixed(d);
    body = group ? groupFixed(fixed) : fixed;
  }
  return `${prefix}${body}${suffix}`;
}

/** Group the integer part of an already-toFixed string, preserving decimals. */
function groupFixed(fixed: string): string {
  const neg = fixed.startsWith("-");
  const unsigned = neg ? fixed.slice(1) : fixed;
  const dot = unsigned.indexOf(".");
  const intPart = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? "" : unsigned.slice(dot); // includes the "."
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${frac}`;
}

/** Thousands-group an integer value. */
function groupThousands(v: number): string {
  return groupFixed(String(v));
}

/**
 * cubic ease-out, matching the snappy --ease-out feel: fast start, gentle
 * settle. t is the clamped [0,1] progress; returns eased [0,1].
 */
export function easeOutCubic(t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - x, 3);
}

/**
 * The tweened value at elapsed `ms` of a `durationMs` count-up to `target`.
 * Always lands exactly on `target` once elapsed ≥ duration (no float drift),
 * and returns `target` immediately for a non-positive duration.
 */
export function frameValue(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  if (elapsedMs <= 0) return 0;
  return target * easeOutCubic(elapsedMs / durationMs);
}
