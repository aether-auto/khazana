// apps/site/src/components/mdx/lib/parameter-play.ts
//
// Pure curve-sampling + readout math for <ParameterPlay>. Given an author's
// compiled `expr` (a function of the params + the x variable) and the current
// slider values, this samples the curve over `xRange` and evaluates each readout
// formula. No DOM, no React — the island stays a thin shell around this, exactly
// like model-curve.ts / kelly-curve.ts. Everything routes through the SANDBOXED
// evaluator in expr-eval.ts (no `eval`/`new Function`).

import {
  compileExpr,
  evalCompiled,
  type CompiledExpr,
} from "./expr-eval.js";

/** One slider's spec (mirrors the component prop). */
export interface PlayParam {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit?: string;
}

/** One live readout: a scalar formula of the params + x-independent context. */
export interface PlayReadout {
  label: string;
  expr: string;
  unit?: string;
}

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
  if (!Number.isFinite(v)) return v;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * Build the `{ [key]: value }` binding object from the param specs + current
 * values, clamped into each param's [min,max]. Missing/NaN values fall back to
 * the param default (also clamped). This is the ONLY place slider state becomes
 * evaluator variables — keeps the island honest.
 */
export function bindParams(
  params: readonly PlayParam[],
  values: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of params) {
    const raw = values[p.key];
    const v = typeof raw === "number" && Number.isFinite(raw) ? raw : p.default;
    out[p.key] = clamp(v, p.min, p.max);
  }
  return out;
}

/** The default-value binding, used for SSR / no-JS / reduced-motion first paint. */
export function defaultValues(params: readonly PlayParam[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of params) out[p.key] = clamp(p.default, p.min, p.max);
  return out;
}

/**
 * A ParameterPlay model compiled ONCE: the y-formula plus each readout formula,
 * all validated against the legal variable set (param keys + xVar). Compilation
 * surfaces author mistakes (unknown identifier, bad function, malformed) as a
 * list of human-readable errors instead of throwing in the reader's page.
 */
export interface CompiledModel {
  yExpr: CompiledExpr | null;
  readouts: { label: string; unit?: string; program: CompiledExpr | null }[];
  /** Author-facing compile errors (empty when everything compiled). */
  errors: string[];
  xVar: string;
}

export function compileModel(
  expr: string,
  params: readonly PlayParam[],
  xVar: string,
  readouts: readonly PlayReadout[] = [],
): CompiledModel {
  const errors: string[] = [];
  // The y-formula may read every param key AND the x variable. Readouts read the
  // params but NOT x (they are x-independent scalars — e.g. a peak, a crossover).
  const yVars = [...params.map((p) => p.key), xVar];
  const scalarVars = params.map((p) => p.key);

  const yCompiled = compileExpr(expr, yVars);
  let yProgram: CompiledExpr | null = null;
  if (yCompiled.ok) yProgram = yCompiled.program;
  else errors.push(`expr: ${yCompiled.error}`);

  const compiledReadouts = readouts.map((r) => {
    const c = compileExpr(r.expr, scalarVars);
    if (c.ok) return { label: r.label, unit: r.unit, program: c.program };
    errors.push(`readout "${r.label}": ${c.error}`);
    return { label: r.label, unit: r.unit, program: null };
  });

  return { yExpr: yProgram, readouts: compiledReadouts, errors, xVar };
}

/**
 * Sample the curve y = f(params, x) across [xRange[0], xRange[1]] at `samples`
 * evenly-spaced x's. Points where the formula yields a non-finite value (divide
 * by zero, log of a negative, etc.) are SKIPPED — the returned array may be
 * shorter than `samples`, so a discontinuous model plots as gapped segments
 * rather than a broken line to infinity.
 */
export function sampleCurve(
  model: CompiledModel,
  values: Readonly<Record<string, number>>,
  xRange: readonly [number, number],
  samples: number,
): Point[] {
  if (!model.yExpr) return [];
  const n = Math.max(2, Math.floor(samples));
  const [x0, x1] = xRange;
  const span = x1 - x0;
  const out: Point[] = [];
  const vars: Record<string, number> = { ...values };
  for (let i = 0; i < n; i++) {
    const x = x0 + (span * i) / (n - 1);
    vars[model.xVar] = x;
    const r = evalCompiled(model.yExpr, vars);
    if (r.ok) out.push({ x: round(x, 6), y: round(r.value, 6) });
  }
  return out;
}

/** One evaluated readout, ready to render. `value` is null when it failed. */
export interface ReadoutValue {
  label: string;
  unit?: string;
  value: number | null;
}

/** Evaluate each readout formula against the current (x-independent) bindings. */
export function evalReadouts(
  model: CompiledModel,
  values: Readonly<Record<string, number>>,
): ReadoutValue[] {
  return model.readouts.map((r) => {
    if (!r.program) return { label: r.label, unit: r.unit, value: null };
    const res = evalCompiled(r.program, values);
    return { label: r.label, unit: r.unit, value: res.ok ? res.value : null };
  });
}

/** [min, max] of a curve's finite y-values, for a stable chart domain. */
export function yExtent(points: readonly Point[]): [number, number] {
  if (points.length === 0) return [0, 1];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    if (p.y < lo) lo = p.y;
    if (p.y > hi) hi = p.y;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    // A flat curve: pad so the line isn't glued to an axis edge.
    const pad = Math.abs(lo) > 1e-9 ? Math.abs(lo) * 0.1 : 1;
    return [lo - pad, hi + pad];
  }
  return [lo, hi];
}

/** Format a readout value for display: null → "—", else rounded with unit. */
export function formatReadout(v: ReadoutValue, decimals = 3): string {
  if (v.value === null || !Number.isFinite(v.value)) return "—";
  const num = round(v.value, decimals);
  return v.unit ? `${num} ${v.unit}` : `${num}`;
}
