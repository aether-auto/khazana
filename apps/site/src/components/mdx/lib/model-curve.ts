// apps/site/src/components/mdx/lib/model-curve.ts
// Pure recompute logic for the reader-CONTROLLED chart (art-direction §5:
// "sliders/toggles that recompute — the founder *controls* the visualization").
// No DOM, no React — just the math, so it is unit-testable and the island stays
// a thin shell around it.

export interface Point {
  x: number;
  y: number;
}

/**
 * A monotone-decreasing cost curve under exponential decay:
 *   y(x) = floor + (start - floor) * exp(-rate * x)
 *
 * This is the shape behind "compute is getting cheaper" — a learning/decay
 * curve the reader steers with a single `rate` slider. `floor` is the
 * asymptotic marginal cost it can never beat; `start` is today's cost.
 */
export interface DecayParams {
  start: number;
  floor: number;
  rate: number;
  /** number of samples across [0, span] inclusive (>= 2). */
  samples: number;
  /** x-axis extent (e.g. months). */
  span: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Round to a fixed number of decimals without float dust. */
export function round(v: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function decayCurve(params: DecayParams): Point[] {
  const samples = Math.max(2, Math.floor(params.samples));
  const span = params.span <= 0 ? 1 : params.span;
  const rate = Math.max(0, params.rate);
  const out: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const x = (span * i) / (samples - 1);
    const y = params.floor + (params.start - params.floor) * Math.exp(-rate * x);
    out.push({ x: round(x, 4), y: round(y, 4) });
  }
  return out;
}

/**
 * The "half-life" of the curve — x at which the gap to the floor halves.
 * Useful as a live read-out beside the slider ("cost halves every N months").
 * Returns Infinity when rate is 0 (never halves).
 */
export function halfLife(rate: number): number {
  if (rate <= 0) return Infinity;
  return round(Math.LN2 / rate, 3);
}

/**
 * The crossover point (months) where this curve drops below a constant
 * `threshold`, found analytically. Returns null when it never crosses (the
 * threshold is at/below the floor, or at/above the start).
 */
export function crossover(params: DecayParams, threshold: number): number | null {
  const { start, floor, rate } = params;
  if (rate <= 0) return null;
  if (threshold <= floor) return null; // asymptote never reaches it
  if (threshold >= start) return 0; // already below at x=0
  // floor + (start-floor) e^{-rate x} = threshold  ->  x = ln((start-floor)/(threshold-floor)) / rate
  const x = Math.log((start - floor) / (threshold - floor)) / rate;
  if (!Number.isFinite(x) || x < 0) return null;
  return round(x, 3);
}

/** Min/max of a curve's y-values, for a stable chart domain. */
export function yExtent(points: Point[]): [number, number] {
  if (points.length === 0) return [0, 1];
  let lo = points[0].y;
  let hi = points[0].y;
  for (const p of points) {
    if (p.y < lo) lo = p.y;
    if (p.y > hi) hi = p.y;
  }
  return [lo, hi];
}
