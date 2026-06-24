import { useEffect, useRef } from "react";
import { initMesh, type MeshHandle } from "./mesh-shader";

/**
 * Living mesh-gradient background island.
 *
 * Mounted with `client:only="react"` (WebGL is browser-only) so it never SSRs.
 * Under reduced-motion / no-WebGL it renders nothing and the CSS fallback
 * gradient on <body> is what shows — graceful by construction.
 *
 * Perf discipline:
 *  • DPR capped at 1.5 (in the shader module)
 *  • single fullscreen draw call per frame, transform/opacity only on the DOM
 *  • paused while the tab is hidden (visibilitychange)
 *  • paused while the canvas is scrolled fully offscreen (IntersectionObserver) —
 *    it's `position:fixed` full-bleed so this mainly catches print/zoom edge cases,
 *    but it's cheap insurance
 *  • resize is debounced to a rAF tick
 */
export default function MeshBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mesh: MeshHandle | null = initMesh(canvas);
    if (!mesh) return; // no WebGL → CSS fallback stays

    // fade the canvas in over the CSS gradient once GL is ready
    canvas.classList.add("is-live");

    // Reduced motion: paint ONE static frame and stop. Still nicer than the flat
    // CSS gradient, but with zero ongoing animation.
    if (reduce) {
      mesh.render(0);
      const onResize = () => {
        mesh.resize();
        mesh.render(0);
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        mesh.dispose();
      };
    }

    let raf = 0;
    let running = true;
    let visible = true; // tab + viewport visibility combined

    const loop = (t: number) => {
      mesh.render(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (raf) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => {
      if (running && visible) start();
      else stop();
    };

    const onVisibility = () => {
      running = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        mesh.resize();
      });
    };
    window.addEventListener("resize", onResize);

    // Pause when fully scrolled out of view (insurance; canvas is fixed).
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              sync();
            },
            { threshold: 0 },
          )
        : null;
    io?.observe(canvas);

    start();

    return () => {
      stop();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      io?.disconnect();
      mesh.dispose();
    };
  }, []);

  return <canvas ref={ref} className="mesh-bg" aria-hidden="true" />;
}
