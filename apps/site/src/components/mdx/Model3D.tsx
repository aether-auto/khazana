// apps/site/src/components/mdx/Model3D.tsx
// The RARE inline 3D viewer (art-direction §5/§6): "a Teardown of a 3D-printed
// part or a physical mechanism gets a small, lazy, drag-to-rotate r3f viewer
// inline — ONE per article, max, and only when the subject is genuinely
// spatial."
//
// Two modes (design §4.8 "Model3D v2"):
//   • DEFAULT (no `src`): a procedurally-built gyroid lattice cell (the infill
//     geometry a slicer generates) — zero external assets, $0/offline.
//   • `src` set: load a COMMITTED local `.glb`/`.gltf` (a real teardown /
//     build-log part) with drei's useGLTF, same drag-to-rotate viewer.
//
// This file is the THIN, SSR-safe shell. It is mounted client:visible and lazy-
// imports the heavy r3f scene only when the figure scrolls near the viewport, so
// three.js NEVER touches first paint. Until then (and on no-JS / mobile /
// reduced-motion) a baked static fallback carries the figure.
//
// Asset-size discipline (the founder's concern): when you pass `src`, keep the
// committed model SMALL — recommended budget < ~1–2 MB (ideally far less),
// low-poly, single-material, no Draco/meshopt runtime deps. The shipped demo
// gear (_assets/_demo/model-demo.glb) is ~17 KB. The component just loads what
// it is given; the budget is the author's responsibility.
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import "./mdx.css";
import "./Model3D.css";

const Scene = lazy(() => import("./Model3DScene.js"));
const GlbScene = lazy(() => import("./Model3DGlbScene.js"));

export interface Model3DProps {
  caption?: string;
  /** lattice resolution; higher = denser infill (kept modest for the budget). */
  detail?: number;
  /**
   * Optional committed local `.glb`/`.gltf` URL. When set, the viewer loads and
   * renders this model instead of the procedural gyroid lattice. Keep the asset
   * small (< ~1–2 MB; the demo is ~17 KB) — see the asset-size note above.
   */
  src?: string;
  /** Accessible description of the model (used for a11y + the no-JS fallback). */
  alt?: string;
  /** Short instrument label shown under the fallback motif when `src` is set. */
  label?: string;
}

function isLowPower(): boolean {
  if (typeof navigator === "undefined") return true;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const mobile = /Mobi|Android/i.test(navigator.userAgent);
  return mobile || (mem !== undefined && mem < 4);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Model3D({ caption, detail = 16, src, alt, label }: Model3DProps) {
  // Decide once on mount whether live GL is allowed. SSR-safe defaults to the
  // static fallback so the server never reaches for WebGL.
  const [allowGL, setAllowGL] = useState(false);
  // Auto-rotate is opt-in and never runs under reduced-motion; drag still works.
  const [autoRotate, setAutoRotate] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Honour the perf contract: skip live GL on low-power / mobile / reduced
    // motion — those readers keep the baked fallback, which is fully legible.
    const reduced = prefersReducedMotion();
    setAllowGL(!isLowPower() && !reduced);
    setAutoRotate(!reduced);
  }, []);

  // No-JS / mobile / reduced-motion fallback copy. For a loaded model we
  // describe it from alt/label; for the gyroid we keep the original note.
  const isModel = Boolean(src);
  const fallbackNote = isModel
    ? (alt ?? label ?? "3D model — drag to rotate on a supported device")
    : "gyroid lattice — the infill a slicer generates inside a printed part";
  const modelLabel = label ?? (isModel ? "3D model" : undefined);

  return (
    <figure className="mdx-figure mdx-figure--wide m3d">
      <div
        className="mdx-panel m3d-panel metal"
        ref={hostRef}
        role="img"
        aria-label={alt ?? label ?? caption ?? fallbackNote}
      >
        {/* baked static fallback — ALWAYS present beneath the canvas. A pure-CSS
            isometric lattice motif so no-JS / mobile / reduced-motion readers
            see a real, on-brand object, not an empty box. */}
        <div className="m3d-fallback" aria-hidden={allowGL ? "true" : "false"}>
          <div className="m3d-lattice" aria-hidden="true" />
          {modelLabel ? <p className="m3d-fallback-label">{modelLabel}</p> : null}
          <p className="m3d-fallback-note">{fallbackNote}</p>
        </div>

        {allowGL &&
          (isModel ? (
            <Suspense fallback={<div className="m3d-loading">loading model…</div>}>
              <GlbScene src={src as string} autoRotate={autoRotate} />
            </Suspense>
          ) : (
            <Suspense fallback={<div className="m3d-loading">building lattice…</div>}>
              <Scene detail={detail} />
            </Suspense>
          ))}

        <span className="m3d-hint" aria-hidden="true">
          {allowGL ? "drag to rotate · scroll-locked" : "static preview"}
        </span>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
