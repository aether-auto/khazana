// apps/site/src/components/mdx/DrawChart.tsx
// DRAW-ON-SCROLL line chart (art-direction §5): the stroke draws itself as the
// figure enters the viewport. Built on the pure `draw-path` helpers (tested) so
// the geometry is verifiable and the island stays a thin shell.
//
// The reveal uses an IntersectionObserver to flip a class once — no per-frame JS,
// no scroll listener; the actual draw is a single composited stroke-dashoffset
// CSS transition. Under reduced-motion / no-JS the path renders fully drawn
// immediately (the figure is the data, never gated behind motion).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  makeScales,
  linePath,
  areaPath,
  pathLength,
  type Box,
} from "./lib/draw-path.js";
import type { Point } from "./lib/model-curve.js";
import "./mdx.css";
import "./DrawChart.css";

export interface DrawChartProps {
  data: Point[];
  caption?: string;
  /** y-axis unit for the screen-reader label. */
  unit?: string;
  /** draw duration in ms (skipped under reduced-motion). */
  duration?: number;
}

const BOX: Box = { width: 640, height: 300, padX: 16, padY: 18 };

export default function DrawChart({ data, caption, unit = "", duration = 1400 }: DrawChartProps) {
  const ref = useRef<HTMLElement | null>(null);
  // FAIL-SAFE default: the chart renders FULLY DRAWN. The draw-on-scroll is a
  // pure progressive enhancement — only an effect that actually runs may arm the
  // "undrawn" start state and animate it in. If JS never hydrates (or throws),
  // `drawn` stays true and the figure is fully visible — never a blank chart.
  const [drawn, setDrawn] = useState(true);
  // Has the client effect taken control? Until it has, we never emit the
  // hidden (offset = len) state, so SSR / failed-hydration shows the full line.
  const [armed, setArmed] = useState(false);

  const { d, area, len } = useMemo(() => {
    const scales = makeScales(data, BOX);
    return {
      d: linePath(data, scales),
      area: areaPath(data, scales, BOX.height - BOX.padY),
      len: pathLength(data, scales),
    };
  }, [data]);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window) || !ref.current) {
      setDrawn(true); // show fully drawn immediately (no animation)
      return;
    }
    const el = ref.current;
    // Arm the animation: start from undrawn, then draw in when scrolled into view.
    setDrawn(false);
    setArmed(true);
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setDrawn(true);
            obs.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Only honour the undrawn start once the client has armed it; otherwise full.
  const offset = armed && !drawn ? len : 0;

  return (
    <figure className="mdx-figure mdx-figure--wide dchart" ref={ref}>
      <div className="mdx-panel dchart-panel paper">
        <svg
          className="dchart-svg"
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          role="img"
          aria-label={`Line chart of ${data.length} points${unit ? ` (${unit})` : ""}.`}
        >
          {/* faint fill underlays the stroke (no draw animation on the fill) */}
          <path className={drawn ? "dchart-area is-drawn" : "dchart-area"} d={area} />
          <path
            className={drawn ? "dchart-line is-drawn" : "dchart-line"}
            d={d}
            style={{
              strokeDasharray: len,
              strokeDashoffset: offset,
              transition: `stroke-dashoffset ${duration}ms cubic-bezier(0.2,0.7,0.2,1)`,
            }}
          />
        </svg>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
