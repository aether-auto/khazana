// The signal constellation — the live WebGL field behind "First Light".
//
// Built on OGL (~50KB), NOT three.js (580KB) / drei (989KB): this is points +
// one custom shader, not a scene graph (art-direction §6). It carries the
// product's DATA — every star is a curated FeedItem positioned by channel/
// recency/rank (see lib/constellation.ts) — so it is not the banned decorative
// mesh; it *is* the feed, seen from inside the instrument before it resolves.
//
// PERFORMANCE CONTRACT (art-direction §6, mirrors the old mesh-shader discipline
// the brief explicitly says to redirect here):
//   • single draw call: one Mesh of gl.POINTS, all positions/brightness in
//     static buffers, animated entirely on the GPU from a handful of uniforms
//   • DPR capped at 1.5 (a soft star field never needs retina)
//   • the CALLER owns the rAF loop → pause on tab-hide / scrolled offscreen
//   • never on the layout/paint path; never blocks first paint (it's a lazy
//     island that plays over already-present SSR feed HTML)
// The module exports a tiny handle: resize / render(t) / setPointer / dispose.

import { Renderer, Geometry, Program, Mesh } from "ogl";
import type { Star } from "./lib/constellation.js";

const DPR_CAP = 1.5;

const VERT = /* glsl */ `
attribute vec2 polar;      // x = angle (rad), y = radius [0,1]
attribute float bright;    // brightness (0,1], 1 = lead/brightest catch
attribute float depth;     // z-parallax depth [-1,1]
attribute float seed;      // per-star [0,1) for drift phase

uniform vec2  uRes;        // drawing-buffer size (px)
uniform float uTime;       // seconds
uniform float uDpr;        // capped device pixel ratio
uniform float uIgnite;     // First Light progress 0→1 (stars resolve out of dark)
uniform float uSettle;     // 0 = floating field, 1 = settled/flattened into feed
uniform vec2  uPointer;    // cursor, normalized [-1,1], smoothed by the caller
uniform float uParallax;   // parallax amplitude (0 under reduced-motion)

varying float vBright;
varying float vTwinkle;

void main() {
  float a = polar.x;
  float r = polar.y;

  // base position on the unit disc (centered)
  vec2 pos = vec2(cos(a), sin(a)) * r;

  // slow per-star orbital drift — the room breathes; amplitude eased out as the
  // field SETTLES forward into the feed (art-direction §1: the morph).
  float drift = (1.0 - uSettle) * 0.012;
  pos += vec2(
    sin(uTime * 0.18 + seed * 6.2831),
    cos(uTime * 0.15 + seed * 6.2831 + 1.7)
  ) * drift;

  // cursor parallax: nearer stars (|depth| large) shift more — the room has real
  // depth and you are inside it looking out. Settling damps it toward the feed.
  pos += uPointer * uParallax * depth * (1.0 - 0.6 * uSettle);

  // aspect-correct so the disc is round on wide screens, then map to clip space.
  float aspect = uRes.x / uRes.y;
  vec2 clip = pos;
  clip.x /= max(aspect, 1.0);
  clip.y *= min(aspect, 1.0);
  // settle nudges the whole field slightly down+back so it reads as flattening
  // forward into the cards below it.
  clip.y += uSettle * 0.06;

  gl_Position = vec4(clip, 0.0, 1.0);

  // FIRST LIGHT: stars ignite from the center outward — the freshest (smallest
  // radius) wake first, the rim resolves last. A star's reveal is gated by how
  // far uIgnite has travelled past its radius.
  float reveal = smoothstep(r - 0.18, r + 0.05, uIgnite * 1.25);

  // brightness → point size (DPR-aware). A soft floor so dim tail stars still
  // register as faint pinpoints. Settling shrinks the field a touch (recedes).
  float size = (1.6 + bright * 9.0) * uDpr * (1.0 - 0.18 * uSettle);
  gl_PointSize = max(1.0, size * reveal);

  // subtle per-star twinkle, phase from seed; never a frantic blink.
  vTwinkle = 0.82 + 0.18 * sin(uTime * 1.2 + seed * 40.0);
  vBright = bright * reveal;
}
`;

const FRAG = /* glsl */ `
precision mediump float;

uniform float uSettle;
varying float vBright;
varying float vTwinkle;

void main() {
  // round soft point: radial falloff from center of the gl_Point sprite
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = dot(uv, uv);
  if (d > 1.0) discard;

  // a bright core + a softer halo — incandescent amber light (the instrument's
  // signal). Core tightens, halo blooms with brightness.
  float core = smoothstep(0.55, 0.0, d);
  float halo = smoothstep(1.0, 0.0, d);
  float glow = (core * 0.9 + halo * 0.45) * vTwinkle;

  // amber signal light. Brighter (leading) stars push toward white-hot at the
  // very core; the long tail stays amber. A whisper of chromatic aberration on
  // the halo edge (warmer R, cooler B) = light through a lens (art-direction §9).
  vec3 amber = vec3(1.0, 0.71, 0.15);
  vec3 hot   = vec3(1.0, 0.93, 0.78);
  vec3 col = mix(amber, hot, core * vBright);
  col.r += halo * 0.04;
  col.b += halo * 0.02 * (1.0 - vBright);

  float alpha = glow * (0.35 + 0.65 * vBright);
  // settled field dims so the cards in front read clearly (depth, not glare)
  alpha *= (1.0 - 0.45 * uSettle);
  gl_FragColor = vec4(col * glow, alpha);
}
`;

export interface ConstellationHandle {
  resize: () => void;
  render: (timeMs: number) => void;
  /** Pointer in normalized [-1,1] (caller may pre-smooth). */
  setPointer: (x: number, y: number) => void;
  /** First Light reveal progress 0→1. */
  setIgnite: (v: number) => void;
  /** Settle 0 (floating) → 1 (flattened into the feed). */
  setSettle: (v: number) => void;
  dispose: () => void;
}

/** Initialise the constellation on a canvas from a star list. Returns null if
 *  WebGL is unavailable (caller keeps the baked static fallback). */
export function initConstellation(
  canvas: HTMLCanvasElement,
  stars: Star[],
  opts: { reducedMotion?: boolean } = {},
): ConstellationHandle | null {
  if (!stars.length) return null;

  let renderer: Renderer;
  try {
    renderer = new Renderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      dpr: Math.min(window.devicePixelRatio || 1, DPR_CAP),
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  const gl = renderer.gl;
  if (!gl) return null;

  // additive blending so overlapping star glows accumulate into light, never
  // punch dark holes — light out of dark.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  // pack the field into static attribute buffers — one upload, GPU-animated.
  const n = stars.length;
  const polar = new Float32Array(n * 2);
  const bright = new Float32Array(n);
  const depth = new Float32Array(n);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    polar[i * 2] = stars[i].angle;
    polar[i * 2 + 1] = stars[i].radius;
    bright[i] = stars[i].brightness;
    depth[i] = stars[i].depth;
    seed[i] = (i * 0.6180339887) % 1; // golden-ratio phase spread
  }

  const geometry = new Geometry(gl, {
    polar: { size: 2, data: polar },
    bright: { size: 1, data: bright },
    depth: { size: 1, data: depth },
    seed: { size: 1, data: seed },
  });

  const program = new Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: [canvas.width, canvas.height] },
      uTime: { value: 0 },
      uDpr: { value: Math.min(window.devicePixelRatio || 1, DPR_CAP) },
      uIgnite: { value: opts.reducedMotion ? 1 : 0 },
      uSettle: { value: 0 },
      uPointer: { value: [0, 0] },
      uParallax: { value: opts.reducedMotion ? 0 : 0.06 },
    },
  });

  const mesh = new Mesh(gl, { geometry, program, mode: gl.POINTS });

  function resize() {
    const w = window.innerWidth;
    const h = canvas.parentElement?.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    program.uniforms.uRes.value = [renderer.gl.drawingBufferWidth, renderer.gl.drawingBufferHeight];
  }

  function render(timeMs: number) {
    program.uniforms.uTime.value = timeMs / 1000;
    renderer.render({ scene: mesh });
  }

  function setPointer(x: number, y: number) {
    program.uniforms.uPointer.value = [x, y];
  }
  function setIgnite(v: number) {
    program.uniforms.uIgnite.value = v;
  }
  function setSettle(v: number) {
    program.uniforms.uSettle.value = v;
  }

  function dispose() {
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  resize();
  return { resize, render, setPointer, setIgnite, setSettle, dispose };
}
