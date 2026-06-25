import { useEffect, useRef } from "react";
import { initConstellation, type ConstellationHandle } from "./constellation-gl";
import type { Star } from "./lib/constellation";

/**
 * First Light — the constellation island.
 *
 * Mounted `client:only="react"` (WebGL is browser-only) so it NEVER SSRs and
 * never blocks first paint: the baked static fallback (a server-rendered SVG
 * star-field, see Hero.astro) is already on screen underneath, and this canvas
 * fades in over it once GL is ready. If WebGL fails, the fallback simply stays.
 *
 * The intro is a single continuous gesture (art-direction §1):
 *   near-dark → one amber point ignites at center → the day's signal resolves
 *   out of the dark as a 3D constellation → it settles FORWARD into the feed.
 *
 * Perf contract (§6): caller-owned rAF, paused on tab-hide + when scrolled
 * offscreen; capped DPR (in the GL module); reduced-motion shows the resolved
 * field with zero animation/parallax.
 */
export default function Constellation({ stars }: { stars: Star[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stars.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const handle: ConstellationHandle | null = initConstellation(canvas, stars, {
      reducedMotion: reduce,
    });
    if (!handle) return; // no WebGL → baked SVG fallback stays visible

    // reveal the live canvas over the baked fallback
    canvas.classList.add("is-live");
    canvas.parentElement?.classList.add("constellation--live");

    // ── reduced motion: paint the resolved field once, no loop, no parallax ──
    if (reduce) {
      handle.setIgnite(1);
      handle.setSettle(0.25); // a touch settled, but fully present & still
      handle.render(0);
      const onResize = () => {
        handle.resize();
        handle.render(0);
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        handle.dispose();
      };
    }

    // ── pointer parallax (smoothed) ──────────────────────────────────────
    let pxTarget = 0;
    let pyTarget = 0;
    let px = 0;
    let py = 0;
    const onPointer = (e: PointerEvent) => {
      pxTarget = (e.clientX / window.innerWidth) * 2 - 1;
      pyTarget = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // ── First Light timeline (time-based, not frame-based) ───────────────
    // t0..IGNITE_MS: the single center point ignites and the field resolves
    // outward; then it eases toward a gentle settle as the feed reads below it.
    const IGNITE_MS = 1700;
    const SETTLE_START = 1200;
    const SETTLE_MS = 1400;
    let start = 0;
    const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    let raf = 0;
    let running = true; // tab visible
    let onscreen = true; // canvas in viewport

    const loop = (t: number) => {
      if (!start) start = t;
      const elapsed = t - start;

      // ignite → resolve
      handle.setIgnite(easeOutExpo(Math.min(elapsed / IGNITE_MS, 1)));
      // settle forward into the feed (to a low resting value, never fully flat —
      // the field lives on behind the cards as felt depth, art-direction §4)
      const sp = Math.min(Math.max((elapsed - SETTLE_START) / SETTLE_MS, 0), 1);
      handle.setSettle(easeOutCubic(sp) * 0.6);

      // smooth the pointer toward target (critically-damped-ish)
      px += (pxTarget - px) * 0.05;
      py += (pyTarget - py) * 0.05;
      handle.setPointer(px, py);

      handle.render(t);
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => {
      if (running && onscreen) startLoop();
      else stopLoop();
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
        handle.resize();
      });
    };
    window.addEventListener("resize", onResize);

    // pause when scrolled fully past (the hero is at the top; once you're reading
    // the feed the GPU is idle).
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              onscreen = entry.isIntersecting;
              sync();
            },
            { threshold: 0 },
          )
        : null;
    io?.observe(canvas);

    startLoop();

    return () => {
      stopLoop();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      handle.dispose();
    };
  }, [stars]);

  return <canvas ref={canvasRef} className="constellation-canvas" aria-hidden="true" />;
}
