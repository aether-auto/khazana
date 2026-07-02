// apps/site/src/components/mdx/Simulation.tsx
// The interactive canvas SANDBOX — the highest-leverage primer knowledge-carrier
// (component-expansion-design §4.4). A 2D-canvas + requestAnimationFrame loop
// driven by reader-tunable sliders and play/pause/reset. This island is a THIN
// shell: it owns the sliders, transport controls, rAF loop and canvas sizing,
// and knows NO physics. Every simulation is a self-contained kernel in
// `lib/simulation-kinds.ts`, resolved by the writer's `kind` string via the
// registry — so a new sim ships WITHOUT touching this file or any writer skill.
//
// Contracts honoured:
//   - SSR / no-JS: a meaningful static panel (kind description + the full param
//     list) renders server-side; the canvas + controls are progressive
//     enhancement layered on hydration. Never blank.
//   - prefers-reduced-motion: NO rAF loop. We render one representative static
//     frame (a few kernel steps in, deterministic via a fixed seed) and let the
//     reader still tune params — each change recomputes a single frame. Zero
//     auto-animation.
//   - Reading comfort: motion lives only inside the figure; the prose column is
//     untouched. The figure may bleed wider but the controls collapse to one
//     column at 360px (no horizontal overflow).
import { useEffect, useId, useRef, useState } from "react";
import {
  getSimKind,
  mulberry32,
  type Palette,
  type Params,
  type SimKind,
} from "./lib/simulation-kinds.js";
import "./mdx.css";
import "./ControlledChart.css"; // reuse the .cc slider / control instrument styles
import "./Simulation.css";

export interface SimParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
}

export interface SimulationProps {
  /** which registered sim to run: "walk" | "sir" | "wave" | "life" | … */
  kind: string;
  /** reader-tunable parameters (sliders). Serializable — arrives from MDX. */
  params?: SimParamSpec[];
  caption?: string;
  /** logical canvas height in px; defaults to the kind's own default. */
  height?: number;
}

// Fixed seed so the "representative frame" (reduced-motion / SSR intent) is
// stable and reproducible across renders and machines.
const SEED = 0x9e3779b9;
// How many kernel steps to advance before painting the static representative
// frame (enough for the system to look alive, not just its initial state).
const STATIC_STEPS = 60;

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--bg", "#0a0a08"),
    bgInset: v("--bg-inset", "#070705"),
    ink: v("--ink", "#ece6d8"),
    inkDim: v("--ink-faint", "#8a8070"),
    accent: v("--accent", "#ffb627"),
    accentDim: v("--accent-dim", "#b8851d"),
    editorial: v("--editorial", "#c1554a"),
    good: v("--good", "#7faa6e"),
    rule: v("--rule", "#272620"),
  };
}

function initialValues(specs: SimParamSpec[]): Params {
  const out: Params = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}

export default function Simulation({
  kind,
  params = [],
  caption,
  height,
}: SimulationProps) {
  const sim: SimKind<unknown> | undefined = getSimKind(kind);
  const baseId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const figureRef = useRef<HTMLDivElement | null>(null);

  const [values, setValues] = useState<Params>(() => initialValues(params));
  const [playing, setPlaying] = useState(false);
  // set from the media query on mount so SSR stays neutral (static panel only)
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  // live refs the rAF loop reads without re-subscribing every value change
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const stateRef = useRef<unknown>(null);
  const rafRef = useRef<number | null>(null);
  const palRef = useRef<Palette | null>(null);

  const logicalHeight = height ?? sim?.defaultHeight ?? 300;

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // ── canvas sizing: back the store with devicePixelRatio, CSS width:100% ──
  const sizeCanvas = (): { ctx: CanvasRenderingContext2D; w: number; h: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
    const w = cssW;
    const h = logicalHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };

  const seedState = () => {
    if (!sim) return;
    stateRef.current = sim.init(valuesRef.current, mulberry32(SEED));
  };

  const paintOnce = () => {
    if (!sim) return;
    const sized = sizeCanvas();
    if (!sized) return;
    const { ctx, w, h } = sized;
    if (!palRef.current && figureRef.current) palRef.current = readPalette(figureRef.current);
    const pal = palRef.current!;
    // faint fade of the previous frame → amber trails on the near-black bg
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, w, h);
    sim.draw(ctx, stateRef.current, w, h, valuesRef.current, pal);
  };

  // Advance N steps from a fresh seed, then paint — the deterministic
  // "representative frame" used for reduced-motion + the initial mounted view.
  const renderStaticFrame = () => {
    if (!sim) return;
    let state = sim.init(valuesRef.current, mulberry32(SEED));
    const rng = mulberry32(SEED ^ 0x51ed270b);
    for (let i = 0; i < STATIC_STEPS; i++) state = sim.step(state, valuesRef.current, rng);
    stateRef.current = state;
    paintOnce();
  };

  // ── the rAF loop (only when playing AND motion is allowed) ──
  useEffect(() => {
    if (!sim || !mounted) return;
    if (reduced || !playing) return;
    if (stateRef.current == null) seedState();
    const rng = mulberry32((SEED ^ 0x27d4eb2f) >>> 0);
    let last = 0;
    const FRAME_MS = 1000 / 30; // 30fps is plenty for these kernels; kinder to mobile
    const tick = (now: number) => {
      if (now - last >= FRAME_MS) {
        last = now;
        stateRef.current = sim.step(stateRef.current, valuesRef.current, rng);
        paintOnce();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, mounted, reduced, playing]);

  // When paused / reduced-motion / a param changes: recompute a single frame so
  // the canvas always reflects the current sliders without auto-running.
  useEffect(() => {
    if (!sim || !mounted) return;
    if (playing && !reduced) return; // the loop owns the canvas while playing
    renderStaticFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, mounted, reduced, playing, values, logicalHeight]);

  const setParam = (key: string, val: number) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const reset = () => {
    if (reduced) {
      renderStaticFrame();
      return;
    }
    seedState();
    paintOnce();
  };

  // ── unknown kind → honest, non-blank panel (never a silent blank canvas) ──
  if (!sim) {
    return (
      <figure className="mdx-figure mdx-figure--wide sim">
        <div className="mdx-panel sim-panel paper">
          <p className="sim-fallback-desc">
            Unknown simulation kind <code>{kind}</code>. Available kinds: walk, sir, wave, life.
          </p>
        </div>
        {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  const playLabel = playing ? "Pause" : "Play";

  return (
    <figure className="mdx-figure mdx-figure--wide sim">
      <div className="mdx-panel sim-panel paper" ref={figureRef}>
        {/* SSR / no-JS fallback: a meaningful description + the param list. Once
            JS hydrates, the canvas replaces this via CSS (`.sim-fallback` is
            hidden when `.sim-live` is present). Kept in the DOM so screen
            readers and no-JS both get the full story. */}
        <div className="sim-fallback" hidden={mounted}>
          <p className="sim-fallback-desc">{sim.describe}</p>
          {params.length > 0 ? (
            <>
              <p className="sim-fallback-label">Tunable parameters</p>
              <ul className="sim-fallback-params">
                {params.map((p) => (
                  <li key={p.key}>
                    <span className="sim-fallback-pname">{p.label}</span>
                    <span className="sim-fallback-pval tnum">
                      {p.default} (range {p.min}–{p.max})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <noscript>
            <p className="sim-fallback-desc">
              This interactive simulation requires JavaScript. The description and its
              parameters are listed above.
            </p>
          </noscript>
        </div>

        {mounted ? (
          <div className="sim-live">
            <canvas
              ref={canvasRef}
              className="sim-canvas"
              style={{ height: logicalHeight }}
              role="img"
              aria-label={sim.describe}
            />

            <div className="sim-transport">
              {!reduced ? (
                <button
                  type="button"
                  className="sim-btn sim-btn--play"
                  aria-pressed={playing}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playLabel}
                </button>
              ) : (
                <span className="sim-static-note" aria-hidden="true">
                  static frame (reduced motion)
                </span>
              )}
              <button type="button" className="sim-btn" onClick={reset}>
                Reset
              </button>
            </div>

            {params.length > 0 ? (
              <div className="sim-controls">
                {params.map((p) => {
                  const id = `${baseId}-${p.key}`;
                  const val = values[p.key] ?? p.default;
                  return (
                    <div className="cc-control sim-control" key={p.key}>
                      <label htmlFor={id} className="cc-control-label">
                        {p.label} — <span className="tnum">{val}</span>
                      </label>
                      <input
                        id={id}
                        className="cc-slider"
                        type="range"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={val}
                        onChange={(e) => setParam(p.key, Number(e.target.value))}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
