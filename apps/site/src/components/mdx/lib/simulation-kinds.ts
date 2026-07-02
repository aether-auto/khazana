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

// ── kind: "trilateration" — GPS-style position fix & dilution of precision ────
// N satellites/beacons ring a receiver at the origin. Each tick, every satellite
// yields a NOISY range measurement (true distance + gaussian noise, σ = `noise`
// metres, drawn from the seeded PRNG). We solve the over-determined system for an
// estimated receiver position by iterative least-squares (Gauss–Newton on the
// range residuals), then push that estimate into a bounded scatter cloud of the
// recent fixes. The SHAPE of that cloud IS the reader's takeaway: with the
// satellites spread WIDE around the sky the geometry is strong → the same range
// noise collapses into a tight, round cloud (low DOP); cluster them into a narrow
// arc (`spread` small) and the identical noise smears into a large, elongated
// cloud (high DOP). Tunables: `satellites`, `spread` (angular deg), `noise` (σ m).
//
// Everything lives in a metres-scaled world centred on the true receiver; `draw`
// maps world→canvas with a fixed scale so the cloud's absolute growth is visible.
interface TriEstimate {
  x: number; // estimate offset from true receiver, metres
  y: number;
}
interface TriState {
  sats: { x: number; y: number }[]; // satellite positions, metres, world-centred on receiver
  ranges: number[]; // last frame's noisy measured ranges (for the faint circles)
  est: TriEstimate; // latest position estimate (metres from truth)
  cloud: TriEstimate[]; // bounded ring buffer of recent estimates
  t: number;
}

// The true receiver sits at world origin; the demo world spans ±TRI_WORLD metres
// mapped across the canvas. Satellites orbit at TRI_RADIUS metres.
const TRI_WORLD = 120; // half-extent of the drawn world, metres (canvas edge)
const TRI_RADIUS = 90; // satellite orbit radius, metres
const TRI_CLOUD_MAX = 160; // recent-estimate ring-buffer length
const TRI_GN_ITERS = 8; // Gauss–Newton iterations per solve (plenty at this scale)

/** Box–Muller: one standard normal sample from two uniforms of the seeded PRNG. */
function gaussian(rng: Rng): number {
  let u = rng();
  if (u < 1e-12) u = 1e-12; // avoid log(0)
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

// Place the satellites in an arc of angular width `spreadDeg`, centred overhead.
// Narrow spread ⇒ they bunch into a sliver of sky ⇒ bad geometry (high DOP).
function triPlaceSats(n: number, spreadDeg: number): { x: number; y: number }[] {
  const spread = (Math.max(0, spreadDeg) * Math.PI) / 180;
  const centre = -Math.PI / 2; // point the arc "up" (screen-up), purely cosmetic
  const sats: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    // spread the n satellites evenly across the arc; single sat sits at centre
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const ang = centre + (frac - 0.5) * spread;
    sats.push({ x: TRI_RADIUS * Math.cos(ang), y: TRI_RADIUS * Math.sin(ang) });
  }
  return sats;
}

// Iterative least-squares position solve. `measured[i]` are the noisy ranges to
// `sats[i]`; returns the best-fit receiver position (metres, world-centred). Pure
// linear algebra — no randomness — so the estimate is a deterministic function of
// the measurements handed in.
function triSolve(
  sats: { x: number; y: number }[],
  measured: number[],
): TriEstimate {
  // start the guess at the origin (our world centre) and refine
  let px = 0;
  let py = 0;
  for (let iter = 0; iter < TRI_GN_ITERS; iter++) {
    // Normal-equations accumulators for the 2×2 system JᵀJ · δ = Jᵀr
    let a = 0; // Σ (∂/∂x)²
    let b = 0; // Σ (∂/∂x)(∂/∂y)
    let d = 0; // Σ (∂/∂y)²
    let g1 = 0; // Σ (∂/∂x)·residual
    let g2 = 0; // Σ (∂/∂y)·residual
    for (let i = 0; i < sats.length; i++) {
      const s = sats[i];
      if (!s) continue;
      const dx = px - s.x;
      const dy = py - s.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const jx = dx / dist; // ∂dist/∂px
      const jy = dy / dist; // ∂dist/∂py
      const r = (measured[i] ?? dist) - dist; // residual: measured − predicted
      a += jx * jx;
      b += jx * jy;
      d += jy * jy;
      g1 += jx * r;
      g2 += jy * r;
    }
    // solve the 2×2 (with a whisper of Levenberg damping for degenerate geometry)
    const lm = 1e-9;
    const det = (a + lm) * (d + lm) - b * b;
    if (Math.abs(det) < 1e-12) break; // singular → keep current guess
    const dxp = ((d + lm) * g1 - b * g2) / det;
    const dyp = ((a + lm) * g2 - b * g1) / det;
    px += dxp;
    py += dyp;
    if (Math.hypot(dxp, dyp) < 1e-6) break; // converged
  }
  // guard against any pathological blow-up so the cloud stays finite & on-screen
  if (!Number.isFinite(px)) px = 0;
  if (!Number.isFinite(py)) py = 0;
  const CAP = TRI_WORLD * 4;
  px = Math.max(-CAP, Math.min(CAP, px));
  py = Math.max(-CAP, Math.min(CAP, py));
  return { x: px, y: py };
}

// One measurement→solve tick. Adds gaussian range noise (σ = `noise`) from the
// seeded PRNG, solves, and appends the estimate to the bounded cloud.
function triMeasureAndSolve(state: TriState, noise: number, rng: Rng): void {
  const measured = new Array<number>(state.sats.length);
  for (let i = 0; i < state.sats.length; i++) {
    const s = state.sats[i];
    if (!s) {
      measured[i] = 0;
      continue;
    }
    const trueRange = Math.hypot(s.x, s.y); // receiver is at origin
    measured[i] = trueRange + gaussian(rng) * noise;
  }
  state.ranges = measured;
  const est = triSolve(state.sats, measured);
  state.est = est;
  state.cloud.push(est);
  if (state.cloud.length > TRI_CLOUD_MAX) state.cloud.shift();
}

const trilateration: SimKind<TriState> = {
  defaultHeight: 340,
  describe:
    "GPS-style trilateration: satellites ring a receiver and each reports a noisy distance. Spread the satellites wide and the same noise gives a tight, round position fix (low DOP); bunch them into a narrow arc and the fix smears into a large, elongated cloud (high dilution of precision).",
  init(params, rng) {
    const n = Math.max(3, Math.round(param(params, "satellites", 5)));
    const spread = param(params, "spread", 220);
    const noise = Math.max(0, param(params, "noise", 6));
    const state: TriState = {
      sats: triPlaceSats(n, spread),
      ranges: [],
      est: { x: 0, y: 0 },
      cloud: [],
      t: 0,
    };
    // seed the cloud with a few fixes so a single static frame is already
    // meaningful (reduced-motion paints exactly this shape, no live loop).
    for (let k = 0; k < 24; k++) triMeasureAndSolve(state, noise, rng);
    return state;
  },
  step(state, params, rng) {
    const n = Math.max(3, Math.round(param(params, "satellites", 5)));
    const spread = param(params, "spread", 220);
    const noise = Math.max(0, param(params, "noise", 6));
    // re-place satellites if the geometry sliders moved (cheap, keeps demo live)
    if (state.sats.length !== n) {
      state.sats = triPlaceSats(n, spread);
      state.cloud = []; // geometry changed → old cloud no longer comparable
    } else {
      state.sats = triPlaceSats(n, spread);
    }
    triMeasureAndSolve(state, noise, rng);
    state.t += 1;
    return state;
  },
  draw(ctx, state, w, h, _params, pal) {
    ctx.fillStyle = pal.bgInset;
    ctx.fillRect(0, 0, w, h);
    // world→canvas: origin (true receiver) at canvas centre, TRI_WORLD → half-min
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) / 2 / TRI_WORLD;
    const px = (mx: number) => cx + mx * scale;
    const py = (my: number) => cy + my * scale;

    // faint range circles from each satellite (the "somewhere on this ring" idea)
    ctx.strokeStyle = pal.rule;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < state.sats.length; i++) {
      const s = state.sats[i];
      if (!s) continue;
      const r = (state.ranges[i] ?? Math.hypot(s.x, s.y)) * scale;
      ctx.beginPath();
      ctx.arc(px(s.x), py(s.y), Math.max(0, r), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the estimate scatter cloud — amber, faint, its SHAPE is the whole point
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < state.cloud.length; i++) {
      const e = state.cloud[i];
      if (!e) continue;
      ctx.beginPath();
      ctx.arc(px(e.x), py(e.y), 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 1σ error ellipse over the cloud (axis-aligned covariance approximation) so
    // the reader can literally see the DOP: round & small vs. long & large.
    if (state.cloud.length >= 3) {
      let mx = 0;
      let my = 0;
      for (const e of state.cloud) {
        mx += e.x;
        my += e.y;
      }
      mx /= state.cloud.length;
      my /= state.cloud.length;
      let vxx = 0;
      let vyy = 0;
      let vxy = 0;
      for (const e of state.cloud) {
        vxx += (e.x - mx) ** 2;
        vyy += (e.y - my) ** 2;
        vxy += (e.x - mx) * (e.y - my);
      }
      const nInv = 1 / state.cloud.length;
      vxx *= nInv;
      vyy *= nInv;
      vxy *= nInv;
      // eigen-decomposition of the 2×2 symmetric covariance → ellipse axes/angle
      const tr = vxx + vyy;
      const det = vxx * vyy - vxy * vxy;
      const disc = Math.max(0, (tr / 2) ** 2 - det);
      const l1 = tr / 2 + Math.sqrt(disc);
      const l2 = tr / 2 - Math.sqrt(disc);
      const ax = Math.sqrt(Math.max(0, l1));
      const bx = Math.sqrt(Math.max(0, l2));
      const ang = Math.abs(vxy) < 1e-12 && vxx >= vyy ? 0 : 0.5 * Math.atan2(2 * vxy, vxx - vyy);
      // draw as a polyline approximation of the rotated ellipse (Ctx2D has no
      // ellipse/rotate — trace it with lineTo, mapping metres→canvas per point).
      ctx.strokeStyle = pal.accent;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const STEPS = 48;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let k = 0; k <= STEPS; k++) {
        const th = (k / STEPS) * TAU;
        // 1σ ellipse point in metres, rotated into world frame, centred on mean
        const ex = ax * Math.cos(th);
        const ey = bx * Math.sin(th);
        const wx = mx + ex * ca - ey * sa;
        const wy = my + ex * sa + ey * ca;
        if (k === 0) ctx.moveTo(px(wx), py(wy));
        else ctx.lineTo(px(wx), py(wy));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // the satellites (amber dots on the sky ring)
    ctx.fillStyle = pal.accentDim;
    for (const s of state.sats) {
      ctx.beginPath();
      ctx.arc(px(s.x), py(s.y), 3.2, 0, TAU);
      ctx.fill();
    }

    // the TRUE receiver at world origin (ink cross-dot), for the reader's anchor
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.arc(px(0), py(0), 2.6, 0, TAU);
    ctx.fill();
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
  trilateration,
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
