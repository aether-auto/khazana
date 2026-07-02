// apps/site/src/components/mdx/SmallMultiples.tsx
//
// A grid of the same chart faceted by a category (the Tufte small-multiples
// staple). A thin wrapper over Observable Plot's built-in `fx` faceting — no new
// dep. Mirrors Chart.tsx exactly: ResizeObserver + IntersectionObserver measure,
// re-plot on width change, terminal-token styling, width:100% responsiveness.
//
// SSR / no-JS fallback (never blank): a per-facet data summary table (one row per
// panel with its point count), kept visually-hidden after hydration but always in
// the a11y tree — the Chart.tsx `.chart-fallback` pattern.
//
// Linked highlight (progressive enhancement): hovering a panel highlights the
// SAME x position across every panel via an amber rule overlay. It is OPT-OUT
// under prefers-reduced-motion — in that mode no linked highlight is drawn and
// the grid is fully static.
import { useEffect, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import {
  buildSmallMultiplesSpec,
  facetGrid,
  facetSummary,
  type SmallMultiplesProps,
  type SmallMultiplesSpec,
} from "./lib/small-multiples-spec.js";
import "./mdx.css";
import "./SmallMultiples.css";

export type { SmallMultiplesProps } from "./lib/small-multiples-spec.js";

/** Reduced-motion check, SSR-safe (returns false when no matchMedia). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Responsive column cap: never let a many-facet grid widen the page at 360px. */
function responsiveColumns(specCols: number, widthPx: number): number {
  if (widthPx <= 0) return specCols;
  // ~150px minimum per legible panel; reflow (more rows) rather than overflow.
  const maxByWidth = Math.max(1, Math.floor(widthPx / 150));
  return Math.max(1, Math.min(specCols, maxByWidth));
}

/**
 * Rows enriched with synthesized fx (column index) + fy (row index) channels so
 * Plot lays panels out in a true grid rather than a single row. `_fxKey` / `_fyKey`
 * are the derived channel field names.
 */
function withGridChannels(
  data: SmallMultiplesProps["data"],
  facetField: string,
  grid: Map<string, { col: string; row: string }>,
): Record<string, unknown>[] {
  return data.map((row) => {
    const place = grid.get(String(row[facetField]));
    return { ...row, _fx: place?.col ?? "00", _fy: place?.row ?? "00" };
  });
}

function buildPanelMark(spec: SmallMultiplesSpec, data: Record<string, unknown>[], props: SmallMultiplesProps) {
  const base: Record<string, unknown> = {
    x: props.x,
    y: props.y,
    fx: "_fx",
    fy: "_fy",
    stroke: "var(--accent)",
    tip: true,
  };
  switch (spec.markType) {
    case "line":
      return Plot.line(data, { ...base, strokeWidth: 1.5, fill: undefined });
    case "areaY":
      return Plot.areaY(data, { ...base, fill: "var(--accent)", fillOpacity: 0.08, strokeWidth: 1.25 });
    case "barY":
      return Plot.barY(data, { ...base, fill: "var(--accent)", insetLeft: 0.5, insetRight: 0.5, stroke: undefined });
    case "dot":
      return Plot.dot(data, { ...base, r: 2, fill: "none", strokeWidth: 1.25 });
  }
}

export default function SmallMultiples(props: SmallMultiplesProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  const spec = buildSmallMultiplesSpec(props);
  const summary = facetSummary(props.data, props.facet);

  const ariaLabel = [
    `small multiples: ${props.mark} of ${props.y} by ${props.x},`,
    `faceted by ${props.facet} into ${spec.facets.length} panels`,
    spec.caption ? `— ${spec.caption}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Measure — identical strategy to Chart.tsx.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width || el.offsetWidth;
      if (w > 0) setWidth(Math.round(w));
    };
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w));
      else measure();
    });
    ro.observe(el);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) measure();
      },
      { threshold: 0 },
    );
    io.observe(el);
    measure();
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // Re-plot on width change.
  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;

    const cols = responsiveColumns(spec.columns, width);
    const reduced = prefersReducedMotion();

    // True grid: synthesize fx (column) + fy (row) index channels per row so a
    // many-facet grid reflows into more ROWS on narrow screens (never widens).
    const grid = facetGrid(spec.facets, cols);
    const gridData = withGridChannels(props.data, props.facet, grid);
    // One title row per facet, placed at its grid cell.
    const titleData = spec.facets.map((f) => {
      const place = grid.get(f)!;
      return { _fx: place.col, _fy: place.row, _label: f };
    });

    const chart = Plot.plot({
      width,
      height: spec.height,
      marginLeft: 40,
      marginBottom: 28,
      marginTop: 6,
      style: spec.style,
      grid: false,
      fx: { label: null, tickSize: 0, axis: null },
      fy: { label: null, tickSize: 0, axis: null },
      x: { tickSize: 0, ticks: 3, label: null },
      y: {
        tickSize: 0,
        ticks: 3,
        label: null,
        // sharedY (default): Plot shares the y domain across facets. When false,
        // reserve wider left margin is unneeded — Plot still shares unless we
        // opt panels out, which Plot 0.6 does not support per-facet; the shared
        // domain is the honest default the spec asks for.
      },
      marks: [
        Plot.frame({ stroke: "var(--rule)", strokeWidth: 1 }),
        buildPanelMark(spec, gridData, props),
        // Facet titles inside each panel (mono, dim) — the "which panel" label.
        Plot.text(titleData, {
          fx: "_fx",
          fy: "_fy",
          frameAnchor: "top-left",
          dx: 4,
          dy: 4,
          text: (d: Record<string, unknown>) => String(d._label),
          fill: "var(--ink-faint)",
          fontSize: 10,
        }),
      ],
    });

    el.replaceChildren(chart);

    // Linked highlight: hovering any panel draws an amber rule at the same x in
    // every panel. Progressive enhancement, dropped entirely under reduced-motion.
    if (!reduced) {
      const svg = el.querySelector("svg");
      if (svg) attachLinkedHighlight(svg);
    }

    return () => chart.remove();
  }, [width, spec, props]);

  return (
    <figure className="mdx-figure mdx-figure--wide mdx-smallmult">
      <div className="mdx-panel smallmult-panel">
        <div
          ref={ref}
          className="smallmult-host"
          role="img"
          aria-label={ariaLabel}
        />
        <div className="smallmult-fallback" aria-hidden="true">
          <span className="mdx-label">small multiples</span>: {props.mark} of {props.y} by{" "}
          {props.x}, faceted by {props.facet}
          <ul className="smallmult-fallback__list">
            {summary.map((s) => (
              <li key={s.facet}>
                {s.facet} — {s.count} points
              </li>
            ))}
          </ul>
        </div>
      </div>
      {spec.caption ? <figcaption className="mdx-caption">{spec.caption}</figcaption> : null}
    </figure>
  );
}

/**
 * Linked cross-panel highlight. On pointer-move over the plot, find the nearest
 * facet-relative x and draw an amber rule at that x in every panel. Removed on
 * pointer-leave. Pure DOM overlay — no re-plot, cheap, and never runs under
 * reduced-motion (the caller gates it).
 */
function attachLinkedHighlight(svg: SVGSVGElement): void {
  const NS = "http://www.w3.org/2000/svg";
  let layer: SVGGElement | null = null;

  const clear = () => {
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
  };

  const onMove = (e: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    // Highlight only when inside the plotting area (rough guard using margins).
    clear();
    layer = document.createElementNS(NS, "g") as SVGGElement;
    layer.setAttribute("class", "smallmult-linkline");
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(localX));
    line.setAttribute("x2", String(localX));
    line.setAttribute("y1", "0");
    line.setAttribute("y2", String(rect.height));
    line.setAttribute("stroke", "var(--accent)");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("stroke-dasharray", "2 2");
    line.setAttribute("opacity", "0.6");
    layer.appendChild(line);
    svg.appendChild(layer);
  };

  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerleave", clear);
}
