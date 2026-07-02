import { describe, it, expect } from "vitest";
import {
  mulberry32,
  clampUnit,
  param,
  getSimKind,
  SIM_KINDS,
  SIM_KIND_NAMES,
  type Ctx2D,
  type Palette,
  type SimKind,
} from "./simulation-kinds.js";

// A recording 2D-context stub — lets us exercise every kind's `draw` without a
// DOM/canvas, and assert it actually paints (non-trivial output).
function makeCtx(width = 200, height = 120) {
  const ops: string[] = [];
  let fills = 0;
  let strokes = 0;
  const ctx: Ctx2D = {
    canvas: { width, height },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    fillRect: () => { ops.push("fillRect"); fills++; },
    clearRect: () => ops.push("clearRect"),
    beginPath: () => ops.push("beginPath"),
    moveTo: () => ops.push("moveTo"),
    lineTo: () => ops.push("lineTo"),
    arc: () => ops.push("arc"),
    fill: () => { ops.push("fill"); fills++; },
    stroke: () => { ops.push("stroke"); strokes++; },
  };
  return {
    ctx,
    get ops() { return ops; },
    get fills() { return fills; },
    get strokes() { return strokes; },
  };
}

const PAL: Palette = {
  bg: "#0a0a08",
  bgInset: "#070705",
  ink: "#ece6d8",
  inkDim: "#8a8070",
  accent: "#ffb627",
  accentDim: "#b8851d",
  editorial: "#c1554a",
  good: "#7faa6e",
  rule: "#272620",
};

describe("mulberry32 (seeded PRNG)", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });
  it("returns floats in [0,1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("different seeds give different streams", () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)());
  });
});

describe("clampUnit", () => {
  it("bounds to [0,1] and maps NaN→0", () => {
    expect(clampUnit(0.5)).toBe(0.5);
    expect(clampUnit(-3)).toBe(0);
    expect(clampUnit(9)).toBe(1);
    expect(clampUnit(Number.NaN)).toBe(0);
  });
});

describe("param", () => {
  it("reads a finite key, else the fallback", () => {
    expect(param({ a: 3 }, "a", 9)).toBe(3);
    expect(param({}, "a", 9)).toBe(9);
    expect(param({ a: Number.NaN }, "a", 9)).toBe(9);
  });
});

describe("registry", () => {
  it("exposes the four wave-1 kinds", () => {
    expect(SIM_KIND_NAMES.sort()).toEqual(["life", "sir", "walk", "wave"]);
  });
  it("resolves a kind by name and misses gracefully", () => {
    expect(getSimKind("walk")).toBeDefined();
    expect(getSimKind("nope")).toBeUndefined();
  });
  it("every kind has a describe string + positive default height", () => {
    for (const name of SIM_KIND_NAMES) {
      const k = SIM_KINDS[name] as SimKind;
      expect(k.describe.length).toBeGreaterThan(10);
      expect(k.defaultHeight).toBeGreaterThan(0);
    }
  });
});

// Generic contract every kind must honour: seeded init is reproducible, step
// returns a state, and draw actually paints something.
describe("every kind honours the kernel contract", () => {
  for (const name of SIM_KIND_NAMES) {
    describe(name, () => {
      const kind = SIM_KINDS[name] as SimKind;
      it("init is deterministic given the same seed", () => {
        const s1 = kind.init({}, mulberry32(7));
        const s2 = kind.init({}, mulberry32(7));
        expect(s1).toEqual(s2);
      });
      it("step advances without throwing and returns a state", () => {
        let state = kind.init({}, mulberry32(3));
        for (let i = 0; i < 30; i++) state = kind.step(state, {}, mulberry32(100 + i));
        expect(state).toBeDefined();
      });
      it("draw paints (non-empty op list)", () => {
        const rec = makeCtx();
        const state = kind.init({}, mulberry32(1));
        kind.draw(rec.ctx, state, 200, 120, {}, PAL);
        expect(rec.ops.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("walk kind", () => {
  const walk = SIM_KINDS.walk;
  it("honours the `walkers` param count", () => {
    const st = walk.init({ walkers: 25 }, mulberry32(1)) as { xs: number[] };
    expect(st.xs).toHaveLength(25);
  });
  it("keeps every walker inside the unit square as it spreads", () => {
    let st = walk.init({ walkers: 40, step: 0.05 }, mulberry32(9));
    for (let i = 0; i < 100; i++) st = walk.step(st, { step: 0.05 }, mulberry32(200 + i));
    const s = st as { xs: number[]; ys: number[]; t: number };
    expect(s.t).toBe(100);
    for (const x of s.xs) expect(x >= 0 && x <= 1).toBe(true);
    for (const y of s.ys) expect(y >= 0 && y <= 1).toBe(true);
  });
  it("actually diffuses — spread grows from the tight start", () => {
    const rng = mulberry32(5);
    let st = walk.init({ walkers: 80, step: 0.03 }, rng);
    const spread = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const start = spread((st as { xs: number[] }).xs);
    for (let i = 0; i < 60; i++) st = walk.step(st, { step: 0.03 }, rng);
    expect(spread((st as { xs: number[] }).xs)).toBeGreaterThan(start);
  });
});

describe("sir kind", () => {
  const sir = SIM_KINDS.sir;
  it("conserves the population (S+I+R ≈ 1)", () => {
    let st = sir.init({ i0: 0.02 }, mulberry32(1));
    for (let i = 0; i < 80; i++) st = sir.step(st, { beta: 0.4, gamma: 0.1 }, mulberry32(1));
    const s = st as { s: number; i: number; r: number };
    expect(s.s + s.i + s.r).toBeCloseTo(1, 6);
  });
  it("an outbreak (β≫γ) drives infecteds up then down and recovers people", () => {
    let st = sir.init({ i0: 0.02 }, mulberry32(1));
    const iSeries: number[] = [];
    for (let i = 0; i < 120; i++) {
      st = sir.step(st, { beta: 0.5, gamma: 0.06 }, mulberry32(1));
      iSeries.push((st as { i: number }).i);
    }
    const peak = Math.max(...iSeries);
    expect(peak).toBeGreaterThan(0.02); // it grew past the seed
    expect(iSeries[iSeries.length - 1]).toBeLessThan(peak); // and passed
    expect((st as { r: number }).r).toBeGreaterThan(0.3); // people recovered
  });
  it("with no transmission (β=0) infecteds only decay", () => {
    let st = sir.init({ i0: 0.1 }, mulberry32(1));
    const first = (st as { i: number }).i;
    for (let i = 0; i < 10; i++) st = sir.step(st, { beta: 0, gamma: 0.1 }, mulberry32(1));
    expect((st as { i: number }).i).toBeLessThan(first);
  });
});

describe("wave kind", () => {
  const wave = SIM_KINDS.wave;
  it("advances its clock each step", () => {
    let st = wave.init({}, mulberry32(1)) as { t: number };
    st = wave.step(st, {}, mulberry32(1)) as typeof st;
    st = wave.step(st, {}, mulberry32(1)) as typeof st;
    expect(st.t).toBe(2);
  });
  it("paints the interference field (many cells filled)", () => {
    const rec = makeCtx(200, 120);
    const st = wave.init({}, mulberry32(1));
    wave.draw(rec.ctx, st, 200, 120, { sep: 0.4, freq: 12 }, PAL);
    expect(rec.fills).toBeGreaterThan(10);
  });
});

describe("life kind", () => {
  const life = SIM_KINDS.life;
  it("seeds reproducibly at the given density", () => {
    const a = life.init({ density: 0.5 }, mulberry32(11)) as { cells: Uint8Array };
    const b = life.init({ density: 0.5 }, mulberry32(11)) as { cells: Uint8Array };
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
  });
  it("a blinker oscillates with period 2", () => {
    // hand-place a vertical blinker on an empty board, then step twice.
    let st = life.init({ density: 0 }, mulberry32(1)) as {
      cells: Uint8Array; cols: number; rows: number; gen: number;
    };
    const { cols } = st;
    const set = (x: number, y: number) => { st.cells[y * cols + x] = 1; };
    set(5, 4); set(5, 5); set(5, 6); // vertical bar
    const snap0 = Array.from(st.cells);
    st = life.step(st, {}, mulberry32(1)) as typeof st; // → horizontal
    const snap1 = Array.from(st.cells);
    st = life.step(st, {}, mulberry32(1)) as typeof st; // → vertical again
    const snap2 = Array.from(st.cells);
    expect(snap1).not.toEqual(snap0); // it changed
    expect(snap2).toEqual(snap0); // period-2 oscillation
    expect(st.gen).toBe(2);
  });
  it("an empty board stays empty", () => {
    let st = life.init({ density: 0 }, mulberry32(1));
    for (let i = 0; i < 5; i++) st = life.step(st, {}, mulberry32(1));
    expect((st as { cells: Uint8Array }).cells.some((c) => c === 1)).toBe(false);
  });
});
