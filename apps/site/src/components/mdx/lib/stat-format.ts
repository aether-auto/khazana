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
 * Pick a sensible number of fractional digits for a value when the author did
 * not specify `decimals`. This is the DEFENSIVE rule that keeps a raw unrounded
 * float (e.g. an interpolated count-up frame, or an authored `1533.4509…`) from
 * ever printing full precision and smearing/overflowing the cell:
 *   |v| ≥ 100 → 0   (big numbers read as integers: 1,533 nT)
 *   |v| ≥ 1   → 1   (17.6, 2.6)
 *   |v| < 1   → 2   (0.82)
 * Auto-derived decimals are later trimmed of trailing zeros, so 40 → "40".
 */
export function resolveDecimals(value: number): number {
  const a = Math.abs(Number.isFinite(value) ? value : 0);
  if (a >= 100) return 0;
  if (a >= 1) return 1;
  return 2;
}

/**
 * Format a numeric value into the displayed string. Integers get thousands
 * grouping by default (20000000 → "20,000,000"); explicit `decimals` fixes the
 * precision (and still groups the integer part). When `decimals` is omitted the
 * value is DEFENSIVELY rounded (see resolveDecimals) and trailing zeros trimmed,
 * so no caller can smear the cell with a full-precision float. Set
 * `group: false` to suppress grouping (e.g. a year). prefix/suffix bracket it.
 */
export function format(value: number, opts: FormatOptions = {}): string {
  const { prefix = "", suffix = "", decimals, group = true } = opts;
  // Guard non-finite inputs so a NaN frame never paints "NaN".
  const v = Number.isFinite(value) ? value : 0;

  let body: string;
  if (decimals === undefined) {
    // Auto: round to a magnitude-appropriate precision, then trim trailing
    // zeros so tidy values stay clean (40 → "40", 0.8 → "0.8", 1,533 → "1,533").
    const fixed = v.toFixed(resolveDecimals(v));
    const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
    body = group ? groupFixed(trimmed) : trimmed;
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
 * Lowest scale a figure may shrink to before we stop (it stays legible rather
 * than collapsing to a sliver). At this floor a value would overflow, but the
 * cell's `overflow:hidden` backstop catches it — only an absurdly long value at
 * an absurdly narrow cell could hit this.
 */
export const MIN_FIT_SCALE = 0.35;

/**
 * Fit-to-cell scale for a figure: how much to multiply the base font-size by so
 * a `contentPx`-wide value fits within `availPx` of cell. Returns 1 when it
 * already fits (never enlarges), shrinks proportionally when it overflows, and
 * floors at MIN_FIT_SCALE. Degenerate inputs (zero/negative/non-finite) → 1, so
 * a not-yet-measured / SSR cell renders at full size rather than collapsing.
 */
export function fitScale(contentPx: number, availPx: number): number {
  if (
    !Number.isFinite(contentPx) ||
    !Number.isFinite(availPx) ||
    contentPx <= 0 ||
    availPx <= 0
  ) {
    return 1;
  }
  if (contentPx <= availPx) return 1;
  return Math.max(MIN_FIT_SCALE, availPx / contentPx);
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
  const raw = target * easeOutCubic(elapsedMs / durationMs);
  // Clamp into [0, target] (or [target, 0] for a negative target) so a frame can
  // never overshoot the final magnitude — belt-and-braces against the count-up
  // ever rendering a number wider than the reserved cell.
  const lo = Math.min(0, target);
  const hi = Math.max(0, target);
  return raw < lo ? lo : raw > hi ? hi : raw;
}
