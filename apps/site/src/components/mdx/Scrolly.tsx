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
import scrollama from "scrollama";
import Chart from "./Chart.js";
import { resolveActiveStep } from "./lib/scrolly-state.js";
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

  useEffect(() => {
    if (reduced || !rootRef.current || safeSteps.length === 0) return;
    const scroller = scrollama();
    scroller
      .setup({
        step: rootRef.current.querySelectorAll<HTMLElement>(".scrolly-step"),
        offset: 0.6,
      })
      .onStepEnter((res: { index: number }) =>
        setActive((current) =>
          resolveActiveStep({ entered: res.index, count: safeSteps.length, current }),
        ),
      );
    const onResize = () => scroller.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      scroller.destroy();
    };
  }, [reduced, safeSteps.length]);

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

  return (
    <figure className="mdx-figure mdx-figure--wide scrolly" ref={rootRef}>
      <div className="scrolly-grid">
        <div className="scrolly-sticky">
          <div className="scrolly-graphic">
            <Chart {...(safeSteps[active] ?? safeSteps[0]).chart} />
          </div>
        </div>
        <div className="scrolly-steps">
          {safeSteps.map((s, i) => (
            <div
              className={i === active ? "scrolly-step scrolly-step--active" : "scrolly-step"}
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
