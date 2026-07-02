// apps/site/src/components/mdx/lib/simulation-kinds.ts
// Pure, DOM-free, deterministic kernels for the <Simulation> primer island.
//
// The design doctrine (component-expansion-design §4.4): "ship as a registry so
// writers pick a `kind` rather than write physics." Each sim kind is a small
// self-contained pair:
//   - init(params, rng)   → the initial state (given tunable params + a seeded PRNG)
//   - step(state, params) → the next state (one rAF tick of the system)
//   - draw(ctx, state, w, h, params) → paint the current state onto a 2D canvas
// The framework (Simulation.tsx) owns sliders, play/pause/reset, the rAF loop
// and canvas sizing; it never knows any physics. Kinds are added here WITHOUT
// touching any React component or writer skill — a new entry in SIM_KINDS is all
// it takes.
//
// DETERMINISM: no kernel calls Math.random. Randomness flows through a seeded
// PRNG (`mulberry32`) that the caller constructs and passes in, so every state
// transition is reproducible and unit-testable. The framework seeds it once per
// reset; tests seed it explicitly.

// ── Seeded PRNG ──────────────────────────────────────────────────────────────
// mulberry32 — a tiny, fast, well-distributed 32-bit generator. Deterministic
// given the seed; returns a float in [0, 1). This is the ONLY source of
// randomness any kernel is allowed to use.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Read a param by key with a fallback (params arrive as a flat record). */
export function param(p: Params, key: string, fallback: number): number {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export type Params = Record<string, number>;

// A 2D drawing surface — the real CanvasRenderingContext2D satisfies this, and
// tests pass a tiny recording stub so `draw` is exercised without a DOM.
export interface Ctx2D {
  canvas: { width: number; height: number };
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
}

// The framework resolves CSS custom-property colors once and passes them in, so
// kernels never hardcode a hex — they paint with whatever the theme says.
export interface Palette {
  bg: string; // --bg
  bgInset: string; // --bg-inset
  ink: string; // --ink
  inkDim: string; // --ink-faint
  accent: string; // --accent
  accentDim: string; // --accent-dim
  editorial: string; // --editorial (clay)
  good: string; // --good
  rule: string; // --rule
}

export interface SimKind<S = unknown> {
  /** default logical height (px) the framework reserves before device-pixel scaling. */
  defaultHeight: number;
  /** one-line description surfaced in the SSR / no-JS fallback panel. */
  describe: string;
  /** build the initial state from params + a seeded PRNG. */
  init(params: Params, rng: Rng): S;
  /** advance the state one tick. Pure: returns the next state (may mutate + return). */
  step(state: S, params: Params, rng: Rng): S;
  /** paint the current state. w/h are the logical (pre-DPR) canvas size. */
  draw(ctx: Ctx2D, state: S, w: number, h: number, params: Params, pal: Palette): void;
}

// ── kind: "walk" — random walk (many amber walkers diffusing) ────────────────
// A cloud of walkers each take a ±step on x and y every tick; the spread grows
// like √t — the canonical "diffusion / drunkard's walk" primer. `walkers` and
// `step` (jump size) are the tunables. Trails are the whole point, so we don't
// clear the canvas each frame in the live loop (framework fades instead).
interface WalkState {
  xs: number[];
  ys: number[];
  t: number;
}

const walk: SimKind<WalkState> = {
  defaultHeight: 300,
  describe:
    "A cloud of random walkers spreading out from the centre — the spread grows with the square root of time (diffusion).",
  init(params, rng) {
    const n = Math.max(1, Math.round(param(params, "walkers", 60)));
    const xs = new Array<number>(n);
    const ys = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      // start clustered at the centre (0.5, 0.5) in unit space
      xs[i] = 0.5 + (rng() - 0.5) * 0.02;
      ys[i] = 0.5 + (rng() - 0.5) * 0.02;
    }
    return { xs, ys, t: 0 };
  },
  step(state, params, rng) {
    const jump = param(params, "step", 0.01);
    const { xs, ys } = state;
    for (let i = 0; i < xs.length; i++) {
      xs[i] = clampUnit((xs[i] ?? 0.5) + (rng() - 0.5) * 2 * jump);
      ys[i] = clampUnit((ys[i] ?? 0.5) + (rng() - 0.5) * 2 * jump);
    }
    state.t += 1;
    return state;
  },
  draw(ctx, state, w, h, _params, pal) {
    ctx.fillStyle = pal.accent;
    for (let i = 0; i < state.xs.length; i++) {
      ctx.beginPath();
      ctx.arc((state.xs[i] ?? 0) * w, (state.ys[i] ?? 0) * h, 1.6, 0, TAU);
      ctx.fill();
    }
  },
};

// ── kind: "sir" — SIR epidemic (S→I→R compartments) ──────────────────────────
// The textbook epidemic model on a discrete step. β = infection rate, γ =
// recovery rate; the tunables. State is the three fractions; draw stacks them as
// a filling area chart over time so the reader watches the wave crest and pass.
interface SirState {
  s: number;
  i: number;
  r: number;
  history: { s: number; i: number; r: number }[];
}

const sir: SimKind<SirState> = {
  defaultHeight: 260,
  describe:
    "The SIR epidemic model: a susceptible population becomes infected then recovers. Higher infection rate (β) versus recovery rate (γ) decides whether the outbreak grows.",
  init(params) {
    const i0 = clampUnit(param(params, "i0", 0.02));
    const s0 = clampUnit(1 - i0);
    const start = { s: s0, i: i0, r: 0 };
    return { ...start, history: [{ ...start }] };
  },
  step(state, params) {
    const beta = param(params, "beta", 0.35);
    const gamma = param(params, "gamma", 0.08);
    const { s, i, r } = state;
    const newInf = beta * s * i;
    const newRec = gamma * i;
    const ns = clampUnit(s - newInf);
    const ni = clampUnit(i + newInf - newRec);
    const nr = clampUnit(r + newRec);
    state.s = ns;
    state.i = ni;
    state.r = nr;
    state.history.push({ s: ns, i: ni, r: nr });
    // keep the window bounded so long runs don't grow without limit
    if (state.history.length > 600) state.history.shift();
    return state;
  },
  draw(ctx, state, w, h, _params, pal) {
    ctx.clearRect(0, 0, w, h);
    const hist = state.history;
    const n = Math.max(hist.length, 2);
    const dx = w / (n - 1);
    // stacked bands: R (bottom), I (middle, the star), S (top)
    const band = (
      pick: (p: { s: number; i: number; r: number }) => number,
      base: (p: { s: number; i: number; r: number }) => number,
      color: string,
    ) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let k = 0; k < hist.length; k++) {
        const p = hist[k];
        if (!p) continue;
        ctx.lineTo(k * dx, h - base(p) * h);
      }
      for (let k = hist.length - 1; k >= 0; k--) {
        const p = hist[k];
        if (!p) continue;
        ctx.lineTo(k * dx, h - (base(p) + pick(p)) * h);
      }
      ctx.fill();
    };
    band(
      (p) => p.r,
      () => 0,
      pal.good,
    );
    band(
      (p) => p.i,
      (p) => p.r,
      pal.editorial,
    );
    band(
      (p) => p.s,
      (p) => p.r + p.i,
      pal.accentDim,
    );
  },
};

// ── kind: "wave" — two-source interference ───────────────────────────────────
// Two point sources emit circular waves; the field is the sum of their phases.
// `sep` (source separation) and `freq` (wavelength) are the tunables; the
// reader watches constructive/destructive fringes form. Rendered on a coarse
// grid of cells so it stays cheap on mobile.
interface WaveState {
  t: number;
}

const GRID = 40; // wave field resolution (coarse = cheap, still legible)

const wave: SimKind<WaveState> = {
  defaultHeight: 300,
  describe:
    "Two point sources emit circular waves that overlap; where crests meet you get bright constructive fringes, where a crest meets a trough they cancel.",
  init() {
    return { t: 0 };
  },
  step(state) {
    state.t += 1;
    return state;
  },
  draw(ctx, state, w, h, params, pal) {
    const sep = param(params, "sep", 0.4); // separation in unit space
    const freq = param(params, "freq", 12); // spatial frequency
    const phase = state.t * 0.15;
    const cw = w / GRID;
    const ch = h / GRID;
    const s1x = (0.5 - sep / 2) * GRID;
    const s2x = (0.5 + sep / 2) * GRID;
    const sy = 0.5 * GRID;
    ctx.fillStyle = pal.bgInset;
    ctx.fillRect(0, 0, w, h);
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const d1 = Math.hypot(gx - s1x, gy - sy) / GRID;
        const d2 = Math.hypot(gx - s2x, gy - sy) / GRID;
        const v =
          Math.sin(d1 * freq * Math.PI - phase) +
          Math.sin(d2 * freq * Math.PI - phase);
        // v ∈ [-2,2] → amber intensity ∈ [0,1]
        const a = Math.max(0, v) / 2;
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = pal.accent;
        ctx.fillRect(gx * cw, gy * ch, cw + 0.5, ch + 0.5);
      }
    }
    ctx.globalAlpha = 1;
  },
};

// ── kind: "life" — Conway's Game of Life ─────────────────────────────────────
// The classic cellular automaton on a toroidal grid. `density` seeds the RANDOM
// initial fill (via the seeded PRNG, so it's reproducible); the reader watches
// gliders, still lifes and oscillators emerge. Grid size is fixed for a stable
// aspect; wrap-around edges keep it self-contained.
interface LifeState {
  cells: Uint8Array;
  cols: number;
  rows: number;
  gen: number;
}

const LIFE_COLS = 48;
const LIFE_ROWS = 32;

const life: SimKind<LifeState> = {
  defaultHeight: 320,
  describe:
    "Conway's Game of Life: cells live, die, or are born from four simple neighbour rules. Order and motion emerge from noise.",
  init(params, rng) {
    const density = clampUnit(param(params, "density", 0.3));
    const cells = new Uint8Array(LIFE_COLS * LIFE_ROWS);
    for (let k = 0; k < cells.length; k++) cells[k] = rng() < density ? 1 : 0;
    return { cells, cols: LIFE_COLS, rows: LIFE_ROWS, gen: 0 };
  },
  step(state) {
    const { cells, cols, rows } = state;
    const next = new Uint8Array(cells.length);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = (x + dx + cols) % cols;
            const ny = (y + dy + rows) % rows;
            n += cells[ny * cols + nx] ?? 0;
          }
        }
        const alive = cells[y * cols + x] === 1;
        next[y * cols + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
      }
    }
    state.cells = next;
    state.gen += 1;
    return state;
  },
  draw(ctx, state, w, h, _params, pal) {
    ctx.fillStyle = pal.bgInset;
    ctx.fillRect(0, 0, w, h);
    const cw = w / state.cols;
    const ch = h / state.rows;
    ctx.fillStyle = pal.accent;
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        if (state.cells[y * state.cols + x] === 1) {
          ctx.fillRect(x * cw + 0.5, y * ch + 0.5, cw - 1, ch - 1);
        }
      }
    }
  },
};

// ── the registry ─────────────────────────────────────────────────────────────
// The ONE place a writer's `kind` string is resolved to physics. Add a kind here
// and it is immediately available to every Simulation island — no React, no
// skill, no barrel edit.
export const SIM_KINDS = {
  walk,
  sir,
  wave,
  life,
} satisfies Record<string, SimKind<any>>;

export type SimKindName = keyof typeof SIM_KINDS;

export function getSimKind(name: string): SimKind<any> | undefined {
  return (SIM_KINDS as Record<string, SimKind<any>>)[name];
}

export const SIM_KIND_NAMES = Object.keys(SIM_KINDS) as SimKindName[];

// ── helpers ──────────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;

/** clamp to the unit interval [0,1]; NaN → 0. */
export function clampUnit(v: number): number {
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
