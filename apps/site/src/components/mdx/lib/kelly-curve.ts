// apps/site/src/components/mdx/lib/kelly-curve.ts
// Pure recompute logic for the reader-CONTROLLED Kelly chart (art-direction §5:
// "sliders/toggles that recompute — the founder *controls* the visualization").
// No DOM, no React — just the math, so it is unit-testable and the island stays
// a thin shell around it.
//
// All formulas are Thorp's, verbatim:
//   - growth rate of a fixed-fraction bettor: g(f) = p·ln(1+b·f) + q·ln(1−f)
//   - optimal fraction (general odds):        f* = (b·p − q) / b
//   - drawdown property at full Kelly:        P(ever fall to fraction x) = x
// (Thorp, "The Kelly Criterion in Blackjack Sports Betting, and the Stock
//  Market", §2–3 and §7.) We keep `log` natural throughout; the f* that
//  maximises growth is invariant to the log base.

export interface Point {
  x: number;
  y: number;
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

/**
 * Long-run exponential growth rate of a bettor who stakes fraction `f` of
 * bankroll on a bet that pays `b`-to-1 with win probability `p`:
 *   g(f) = p·ln(1 + b·f) + q·ln(1 − f),   q = 1 − p.
 * Returns −Infinity once f ≥ 1 (a loss wipes the bankroll: ln(1−f) → −∞).
 */
export function growthRate(p: number, b: number, f: number): number {
  const q = 1 - p;
  if (f >= 1) return -Infinity;
  if (f <= 0) return 0;
  return p * Math.log(1 + b * f) + q * Math.log(1 - f);
}

/**
 * The Kelly-optimal fraction for a `b`-to-1 bet won with probability `p`:
 *   f* = (b·p − q) / b.
 * Clamped to [0, 1): a non-positive edge means "do not bet" (f* = 0).
 */
export function kellyFraction(p: number, b: number): number {
  if (b <= 0) return 0;
  const q = 1 - p;
  const f = (b * p - q) / b;
  return clamp(f, 0, 0.999);
}

/** The bettor's edge (expected profit per unit staked): b·p − q. */
export function edge(p: number, b: number): number {
  return b * p - (1 - p);
}

/**
 * Sample g(f) across f ∈ [0, fMax] for plotting the growth-rate parabola.
 * The curve rises from g(0)=0, peaks at f*, returns through zero near 2·f*
 * (for even money), then plunges — the geometry that makes over-betting ruinous.
 */
export function growthCurve(p: number, b: number, fMax: number, samples: number): Point[] {
  const n = Math.max(2, Math.floor(samples));
  const hi = clamp(fMax, 0.01, 0.999);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const x = (hi * i) / (n - 1);
    const y = growthRate(p, b, x);
    out.push({ x: round(x, 4), y: Number.isFinite(y) ? round(y, 5) : -99 });
  }
  return out;
}

/**
 * Thorp's drawdown law for the full-Kelly bettor (continuous approximation,
 * §3.2): the probability the bankroll ever falls to fraction `x` of its start
 * equals `x` itself. Half-Kelly squares it (a c-fraction Kelly gives x^(2/c−1));
 * here we expose the headline full-Kelly result and the c-scaled generalisation.
 */
export function drawdownProb(x: number, c = 1): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (c <= 0) return 0;
  return clamp(x ** (2 / c - 1), 0, 1);
}

/**
 * Relative long-run growth of fractional Kelly vs full Kelly (Thorp §7.3):
 *   g(c·f*) / g(f*) = c·(2 − c).
 * So half-Kelly (c = ½) keeps 0.75 of the growth; the relative risk (the std
 * dev of the growth rate) scales as just `c`.
 */
export function relativeGrowth(c: number): number {
  return c * (2 - c);
}
