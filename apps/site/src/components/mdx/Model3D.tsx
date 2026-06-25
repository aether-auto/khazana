// apps/site/src/components/mdx/Model3D.tsx
// The RARE inline 3D viewer (art-direction §5/§6): "a Teardown of a 3D-printed
// part or a physical mechanism gets a small, lazy, drag-to-rotate r3f viewer
// inline — ONE per article, max, and only when the subject is genuinely
// spatial." Here: a gyroid lattice cell (the infill geometry a slicer generates)
// — procedurally built, zero external assets, $0/offline, no Draco fetch.
//
// This file is the THIN, SSR-safe shell. It is mounted client:visible and lazy-
// imports the heavy r3f scene only when the figure scrolls near the viewport, so
// three.js NEVER touches first paint. Until then (and on no-JS / mobile /
// reduced-motion) a baked static fallback carries the figure.
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import "./mdx.css";
import "./Model3D.css";

const Scene = lazy(() => import("./Model3DScene.js"));

export interface Model3DProps {
  caption?: string;
  /** lattice resolution; higher = denser infill (kept modest for the budget). */
  detail?: number;
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

export default function Model3D({ caption, detail = 16 }: Model3DProps) {
  // Decide once on mount whether live GL is allowed. SSR-safe defaults to the
  // static fallback so the server never reaches for WebGL.
  const [allowGL, setAllowGL] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Honour the perf contract: skip live GL on low-power / mobile / reduced
    // motion — those readers keep the baked fallback, which is fully legible.
    setAllowGL(!isLowPower() && !prefersReducedMotion());
  }, []);

  return (
    <figure className="mdx-figure mdx-figure--wide m3d">
      <div className="mdx-panel m3d-panel metal" ref={hostRef}>
        {/* baked static fallback — ALWAYS present beneath the canvas. A pure-CSS
            isometric lattice motif so no-JS / mobile / reduced-motion readers
            see a real, on-brand object, not an empty box. */}
        <div className="m3d-fallback" aria-hidden={allowGL ? "true" : "false"}>
          <div className="m3d-lattice" aria-hidden="true" />
          <p className="m3d-fallback-note">
            gyroid lattice — the infill a slicer generates inside a printed part
          </p>
        </div>

        {allowGL && (
          <Suspense fallback={null}>
            <Scene detail={detail} />
          </Suspense>
        )}

        <span className="m3d-hint" aria-hidden="true">
          {allowGL ? "drag to rotate · scroll-locked" : "static preview"}
        </span>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
