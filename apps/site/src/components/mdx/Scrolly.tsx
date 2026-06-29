// apps/site/src/components/mdx/Scrolly.tsx
//
// Scrollytelling figure: a sticky graphic pane on the left, prose steps on the
// right; the graphic swaps as each step scrolls into view. Under reduced motion
// / no-JS it degrades to a calm stacked layout (graphic above its prose).
//
// ── Why this is DATA-DRIVEN (not children-introspecting) ─────────────────────
// Astro hands MDX children to a React `client:*` island as opaque Astro-JSX
// virtual nodes, NOT React elements — so a wrapper island can neither introspect
// its children's types/props nor render them (React throws on Astro-JSX objects).
// The previous version filtered `children` for <ScrollyStep> and always got an
// EMPTY list, so the entire figure rendered blank (only its caption survived).
//
// The fix: pass the steps as a SERIALIZABLE `steps` prop (plain chart specs +
// prose strings). Astro serializes that as JSON, and Scrolly renders the <Chart>
// graphics inside its OWN React tree (no nested Astro island boundary), so they
// hydrate together with the island. Authoring stays declarative in MDX.
import { useEffect, useRef, useState } from "react";
import Chart from "./Chart.js";
import {
  safeActiveStep,
  isActiveStep,
  STEP_TRIGGER_OFFSET,
  activeStepFromScroll,
} from "./lib/scrolly-state.js";
import type { ChartProps } from "./lib/chart-spec.js";
import "./mdx.css";
import "./Scrolly.css";

export interface ScrollyStepData {
  /** the chart spec for this step's graphic (fully serializable). */
  chart: ChartProps;
  /** the step's prose, as an HTML string (rendered into the steps column). */
  prose: string;
}

export interface ScrollyStepProps {
  chart: ChartProps;
  prose: string;
}

/**
 * Declarative step authoring shim. <Scrolly> reads the `steps` prop directly;
 * this exists so MDX can keep a <ScrollyStep> tag if desired. It never renders.
 */
export function ScrollyStep(_props: ScrollyStepProps): null {
  return null;
}

export interface ScrollyProps {
  /** the ordered steps; each pairs a serializable chart spec with prose HTML. */
  steps: ScrollyStepData[];
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR -> stacked fallback
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Scrolly({ steps, caption }: ScrollyProps) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(true); // SSR-safe default = stacked
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  // POSITION-BASED active-step tracking (not crossing-event based).
  //
  // <Scrolly> is `client:visible`, so the island hydrates LATE (the figure is
  // ~2500px down the page). A crossing-event library (scrollama) set up at that
  // moment only fires on SUBSEQUENT threshold crossings, so the active index
  // freezes wherever it landed at hydration — the round-1/round-2 sync FAIL.
  //
  // Instead we recompute the active step from each step's CURRENT
  // viewport-relative top on every scroll/resize (rAF-throttled, passive). This
  // is correct at ANY scroll position — including right after late hydration —
  // so the chart and the active prose (both keyed off this one `active`) advance
  // together and can never get stuck. We seed it once on mount so the initial
  // render is already correct for the current scroll position.
  useEffect(() => {
    if (reduced || !rootRef.current || safeSteps.length === 0) return;
    const root = rootRef.current;
    let frame = 0;
    const recompute = () => {
      frame = 0;
      const nodes = root.querySelectorAll<HTMLElement>(".scrolly-step");
      const tops = Array.from(nodes, (n) => n.getBoundingClientRect().top);
      const next = activeStepFromScroll(tops, window.innerHeight, STEP_TRIGGER_OFFSET);
      setActive((current) => (current === next ? current : next));
    };
    const onScroll = () => {
      if (frame) return; // throttle to one recompute per animation frame
      frame = requestAnimationFrame(recompute);
    };
    recompute(); // seed for the current scroll position at (late) hydration
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced, safeSteps.length]);

  // Guard: empty steps → render a minimal placeholder so the figure is never
  // blank AND never throws (safeSteps[0] would be undefined otherwise).
  if (safeSteps.length === 0) {
    return caption ? (
      <figure className="mdx-figure mdx-figure--wide scrolly scrolly--stacked">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  // Stacked fallback (SSR, no-JS, reduced motion): graphic above its prose.
  // This is what renders into the static HTML, so the figure is NEVER blank.
  if (reduced) {
    return (
      <figure className="mdx-figure mdx-figure--wide scrolly scrolly--stacked">
        {safeSteps.map((s, i) => (
          <div className="scrolly-stacked-step" key={i}>
            <div className="scrolly-graphic">
              <Chart {...s.chart} />
            </div>
            <div className="scrolly-prose" dangerouslySetInnerHTML={{ __html: s.prose }} />
          </div>
        ))}
        {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  // Clamp active to a valid index; safeActiveStep returns null for empty arrays
  // (already handled above) and a clamped number otherwise. This ONE resolved
  // index feeds BOTH the sticky chart and the prose highlight (via isActiveStep),
  // so the prose can never lag the chart — they read the same value.
  const activeIdx = safeActiveStep(active, safeSteps.length) ?? 0;

  return (
    <figure className="mdx-figure mdx-figure--wide scrolly" ref={rootRef}>
      <div className="scrolly-grid">
        <div className="scrolly-sticky">
          <div className="scrolly-graphic">
            <Chart {...safeSteps[activeIdx].chart} />
          </div>
        </div>
        <div className="scrolly-steps">
          {safeSteps.map((s, i) => (
            <div
              className={
                isActiveStep(i, activeIdx) ? "scrolly-step scrolly-step--active" : "scrolly-step"
              }
              key={i}
              dangerouslySetInnerHTML={{ __html: s.prose }}
            />
          ))}
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
