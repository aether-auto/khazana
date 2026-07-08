// apps/site/src/components/FirstLightScene.tsx
// The LIVE OGL point-field behind the Feed masthead. Lazy-imported by
// FirstLight.tsx (React.lazy) — the ~5–8KB gzipped `ogl` module never touches
// the bundle until `allowGL` is true, so first paint is never blocked by
// WebGL (Model3D.tsx's discipline, mirrored exactly; see its header comment
// and docs/superpowers/specs/2026-07-07-atlas-globe-design.md §7 for the
// shared perf contract this and the future Atlas globe both obey: DPR cap,
// caller-owned rAF, pause on visibilitychange + IntersectionObserver, first
// paint never blocked).
//
// Renderer choice: OGL, not three.js/cobe — per art-direction.md §6 and the
// Atlas globe spec's §3.2 explicit division of labor ("OGL is reserved for
// the Feed's arbitrary-position constellation... cobe is reserved for the
// Atlas geographic globe"). This is points + a custom shader with arbitrary
// 2.5D positions (channel → lane, count → density), not real-world geometry,
// so OGL's full shader control at three.js's fraction of the bundle is the
// right tool, exactly as that spec reasons through for its own renderer pick.
//
// Choreography: ENTRANCE ONLY. Points resolve out of a dark scatter into
// their channel-lane positions once (~2.2s, expo.out — "arriving with
// purpose," art-direction.md §7's dramatic-gear signature), then settle to a
// near-static field — a whisper-slow drift plus cheap cursor parallax, never
// a looping distraction. This is Signature Moment A ("First Light") scoped to
// the Feed masthead: a data-driven point field, not a decorative gradient.
import { useEffect, useRef } from "react";
import type { ChannelCount } from "./FirstLight";

export interface FirstLightSceneProps {
  channelCounts: ChannelCount[];
  perLane: number[];
  freshCount: number;
}

const VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec3 aScatter;
  attribute float aBrightness;
  attribute float aSize;
  attribute float aSeed;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uProgress;
  uniform float uTime;
  uniform vec2 uParallax;
  uniform float uPixelRatio;

  varying float vBrightness;

  void main() {
    vec3 start = position + aScatter;
    // expo-ish ease already applied on the JS side (uProgress), so this mix is linear
    vec3 p = mix(start, position, uProgress);

    // whisper-slow settle drift — amplitude only present once the entrance has landed
    float drift = 0.05 * uProgress;
    p.x += sin(uTime * 0.12 + aSeed * 6.2831853) * drift;
    p.y += cos(uTime * 0.10 + aSeed * 6.2831853) * drift * 0.7;

    // cheap cursor parallax — nearer points (larger z) shift a touch more
    p.xy += uParallax * (0.5 + 0.5 * (position.z + 1.0) * 0.5) * uProgress;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float twinkle = 1.0 + 0.12 * sin(uTime * (0.5 + aSeed * 0.8) + aSeed * 12.0) * uProgress;
    // Calibrated against the camera's z=6 distance so aSize (2–4.6 world units,
    // see buildAttributes) lands as small, distinct star points (~4–11 CSS px)
    // rather than oversized glowing blobs — verified by screenshot, not guessed.
    gl_PointSize = aSize * uPixelRatio * twinkle * (14.0 / -mvPosition.z);
    vBrightness = aBrightness * uProgress;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vBrightness;
  uniform vec3 uColorDim;
  uniform vec3 uColorHot;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;
    float alpha = 1.0 - smoothstep(0.0, 1.0, d);
    alpha *= alpha;
    vec3 color = mix(uColorDim, uColorHot, clamp(vBrightness, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha * clamp(vBrightness, 0.1, 1.0));
  }
`;

// --accent (#ffb627) and --accent-dim (#b8851d) from tokens.css, normalized.
const COLOR_HOT: [number, number, number] = [1.0, 0.714, 0.153];
const COLOR_DIM: [number, number, number] = [0.451, 0.322, 0.086];

function buildAttributes(
  channelCounts: ChannelCount[],
  perLane: number[],
  freshCount: number,
  halfWidth: number,
  halfHeight: number,
) {
  const n = perLane.reduce((a, b) => a + b, 0);
  const position = new Float32Array(n * 3);
  const scatter = new Float32Array(n * 3);
  const brightness = new Float32Array(n);
  const size = new Float32Array(n);
  const seed = new Float32Array(n);

  const laneCount = channelCounts.length || 1;
  const grand = channelCounts.reduce((s, c) => s + c.count, 0) || 1;
  let ptr = 0;
  channelCounts.forEach((_c, laneIdx) => {
    const count = perLane[laneIdx] ?? 0;
    const laneX = ((laneIdx + 0.5) / laneCount) * 2 - 1;
    for (let k = 0; k < count; k++) {
      const i = ptr++;
      const jx = (Math.random() - 0.5) * ((2 / laneCount) * 1.6);
      const jy = (Math.random() * 2 - 1) * 0.72;
      const jz = (Math.random() * 2 - 1) * 1.0;
      position[i * 3 + 0] = (laneX + jx) * halfWidth * 0.86;
      position[i * 3 + 1] = jy * halfHeight;
      position[i * 3 + 2] = jz;

      const ang = Math.random() * Math.PI * 2;
      const dist = halfWidth * (0.55 + Math.random() * 0.85);
      scatter[i * 3 + 0] = Math.cos(ang) * dist;
      scatter[i * 3 + 1] = Math.sin(ang) * dist * 0.5;
      scatter[i * 3 + 2] = (Math.random() - 0.5) * 2;

      brightness[i] = 0.22 + Math.random() * 0.32;
      size[i] = 2.0 + Math.random() * 2.0;
      seed[i] = Math.random();
    }
  });

  // Fresh signal gets the "hot" treatment (brighter, bigger) — real freshCount
  // data, spread evenly across the field rather than clumped in one lane.
  const hotCount = Math.round((freshCount / grand) * n);
  if (hotCount > 0 && n > 0) {
    const step = n / hotCount;
    for (let h = 0; h < hotCount; h++) {
      const i = Math.min(n - 1, Math.floor(h * step));
      brightness[i] = 0.82 + Math.random() * 0.18;
      size[i] = 3.2 + Math.random() * 1.4;
    }
  }

  return { position, scatter, brightness, size, seed, n };
}

export default function FirstLightScene({ channelCounts, perLane, freshCount }: FirstLightSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let disposed = false;
    let raf = 0;
    let visible = true;

    // Dynamic import keeps `ogl` entirely out of every chunk except this one,
    // which itself only loads once allowGL is true (FirstLight.tsx).
    let cleanupInner: (() => void) | undefined;

    import("ogl").then(({ Renderer, Camera, Transform, Geometry, Program, Mesh }) => {
      if (disposed) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const renderer = new Renderer({ canvas, alpha: true, antialias: true, dpr, powerPreference: "low-power" });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);

      const camera = new Camera(gl, { fov: 42, near: 0.1, far: 20 });
      camera.position.set(0, 0, 6);

      const fovRad = (42 * Math.PI) / 180;
      const halfHeightWorld = Math.tan(fovRad / 2) * 6;

      const setSize = () => {
        const rect = host.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        renderer.setSize(w, h);
        camera.perspective({ aspect: w / h });
      };
      setSize();
      const halfWidthWorld = halfHeightWorld * (host.getBoundingClientRect().width / Math.max(1, host.getBoundingClientRect().height));

      const scene = new Transform();
      const attrs = buildAttributes(channelCounts, perLane, freshCount, halfWidthWorld, halfHeightWorld);

      if (attrs.n === 0) return; // nothing to draw (empty pipeline) — fallback carries it

      const geometry = new Geometry(gl, {
        position: { size: 3, data: attrs.position },
        aScatter: { size: 3, data: attrs.scatter },
        aBrightness: { size: 1, data: attrs.brightness },
        aSize: { size: 1, data: attrs.size },
        aSeed: { size: 1, data: attrs.seed },
      });

      const program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uProgress: { value: 0 },
          uTime: { value: 0 },
          uParallax: { value: [0, 0] },
          uPixelRatio: { value: dpr },
          uColorDim: { value: COLOR_DIM },
          uColorHot: { value: COLOR_HOT },
        },
      });
      // glow-ish additive blend — soft circles accumulate light without full
      // ONE/ONE wash-out (art-direction §9's "glow + a hint of halation").
      program.setBlendFunc(gl.SRC_ALPHA, gl.ONE);

      const points = new Mesh(gl, { geometry, program, mode: gl.POINTS });
      points.setParent(scene);

      // ── entrance (once) ──────────────────────────────────────────────
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const entranceMs = 2200;
      const start = performance.now();
      let entranceDone = reduced; // reduced-motion path never actually mounts this
      // component (FirstLight.tsx gates it) but keep this honest regardless.
      if (reduced) program.uniforms.uProgress.value = 1;

      // ── cursor parallax (cheap, capped) ──────────────────────────────
      const pointer = { x: 0, y: 0 };
      const parallaxTarget = { x: 0, y: 0 };
      const onPointerMove = (e: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        parallaxTarget.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        parallaxTarget.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });

      // ── pause off-screen / hidden tab (perf contract) ────────────────
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) visible = entry.isIntersecting;
        },
        { threshold: 0 },
      );
      io.observe(host);
      const onVisibility = () => {
        visible = visible && document.visibilityState === "visible";
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("resize", setSize);

      const MAX_PARALLAX = 0.35;
      const loop = (t: number) => {
        raf = requestAnimationFrame(loop);
        if (disposed) return;
        // Only draw while on-screen and tab visible — cheap, correct, and
        // matches Model3D/Atlas-globe's shared pause contract.
        if (!visible || document.visibilityState !== "visible") return;

        if (!entranceDone) {
          const elapsed = t - start;
          const raw = Math.min(1, elapsed / entranceMs);
          // expo.out, matching the site's hero-entrance easing signature
          const eased = raw >= 1 ? 1 : 1 - Math.pow(2, -10 * raw);
          program.uniforms.uProgress.value = eased;
          if (raw >= 1) entranceDone = true;
        }
        program.uniforms.uTime.value = t * 0.001;

        pointer.x += (parallaxTarget.x - pointer.x) * 0.04;
        pointer.y += (parallaxTarget.y - pointer.y) * 0.04;
        (program.uniforms.uParallax.value as [number, number])[0] = pointer.x * MAX_PARALLAX * 0.3;
        (program.uniforms.uParallax.value as [number, number])[1] = -pointer.y * MAX_PARALLAX * 0.3;

        renderer.render({ scene, camera });
      };
      raf = requestAnimationFrame(loop);

      cleanupInner = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("resize", setSize);
        document.removeEventListener("visibilitychange", onVisibility);
        io.disconnect();
        const ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      };
    });

    return () => {
      disposed = true;
      cleanupInner?.();
    };
    // channelCounts/perLane/freshCount are the build-time seed for this single
    // mount — the scene never re-seeds mid-session (entrance fires once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="fl-canvas" aria-hidden="true" />;
}
