// TASTE — the signature chart. Every curated item plotted as trust (x) against
// taste (y), colored by GROUP, sized by read-time. Median guide lines split the
// plane into four quadrants ("trusted · loved" is the catch). Hover enlarges a
// dot and dims the rest; click opens the in-app reader. Pudding/Distill-grade,
// tokens-only, SSR-safe (all DOM work in useEffect after mount).
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GROUP_COLORS, type ScatterPoint } from "./lib/build-analytics";

const MARGIN = { top: 18, right: 18, bottom: 44, left: 52 };
const MIN_H = 460;

// Quadrant copy — read against the median guides, not the absolute origin.
const QUADRANTS = [
  { x: "left", y: "top", label: "loved · less proven" },
  { x: "right", y: "top", label: "trusted · loved" },
  { x: "left", y: "bottom", label: "fringe" },
  { x: "right", y: "bottom", label: "trusted · quieter" },
] as const;

function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? GROUP_COLORS.science!;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export default function TrustTasteScatter({ data }: { data: ScatterPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Track container width (responsive re-render).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    const tipEl = tipRef.current;
    if (!svgEl || !tipEl || width === 0 || data.length === 0) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const height = Math.max(MIN_H, Math.min(560, width * 0.62));
    const iw = width - MARGIN.left - MARGIN.right;
    const ih = height - MARGIN.top - MARGIN.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

    const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // ── scales ────────────────────────────────────────────────────────────
    // trust is 0..1 by contract; taste varies, so derive its domain (padded).
    const tasteExtent = d3.extent(data, (d) => d.taste) as [number, number];
    const tLo = Math.min(0, tasteExtent[0] ?? 0);
    const tHi = tasteExtent[1] ?? 1;
    const tPad = (tHi - tLo) * 0.06 || 1;

    const x = d3.scaleLinear().domain([0, 1]).range([0, iw]);
    const y = d3.scaleLinear().domain([tLo - tPad, tHi + tPad]).range([ih, 0]).nice();

    const rExtent = d3.extent(data, (d) => d.readMin) as [number, number];
    const r = d3
      .scaleSqrt()
      .domain([Math.max(1, rExtent[0] ?? 1), Math.max(2, rExtent[1] ?? 2)])
      .range([3, Math.max(9, Math.min(15, iw / 42))]);

    const medX = median(data.map((d) => d.trust));
    const medY = median(data.map((d) => d.taste));

    // ── grid (faint) ──────────────────────────────────────────────────────
    const grid = root.append("g").attr("class", "tts-grid");
    grid
      .selectAll("line.gx")
      .data(x.ticks(5))
      .join("line")
      .attr("class", "gx")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", 0)
      .attr("y2", ih)
      .attr("stroke", "var(--rule)")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.4);
    grid
      .selectAll("line.gy")
      .data(y.ticks(5))
      .join("line")
      .attr("class", "gy")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "var(--rule)")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.4);

    // ── median guide lines (dashed) + quadrant labels ──────────────────────
    const guides = root.append("g").attr("class", "tts-guides");
    guides
      .append("line")
      .attr("x1", x(medX))
      .attr("x2", x(medX))
      .attr("y1", 0)
      .attr("y2", ih)
      .attr("stroke", "var(--rule-bright)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 4");
    guides
      .append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", y(medY))
      .attr("y2", y(medY))
      .attr("stroke", "var(--rule-bright)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 4");

    // Pin each quadrant label to its OUTER plane corner (not relative to the
    // median lines) so the four labels never collide however the medians fall.
    // On narrow charts the two top labels would still overlap toward center, so
    // there we keep only the amber "catch" label (the one that matters).
    const pad = 8;
    const narrow = iw < 420;
    for (const q of QUADRANTS) {
      const isCatch = q.label === "trusted · loved";
      if (narrow && !isCatch) continue;
      const qx = q.x === "right" ? iw - pad : pad;
      const anchor = q.x === "right" ? "end" : "start";
      const qy = q.y === "top" ? pad + 4 : ih - pad;
      const baseline = q.y === "top" ? "hanging" : "auto";
      guides
        .append("text")
        .attr("x", qx)
        .attr("y", qy)
        .attr("text-anchor", anchor)
        .attr("dominant-baseline", baseline)
        .attr("class", "tts-quad")
        .attr("fill", isCatch ? "var(--accent)" : "var(--ink-faint)")
        .attr("fill-opacity", isCatch ? 0.92 : 0.5)
        .text(q.label);
    }

    // ── axes ──────────────────────────────────────────────────────────────
    const axX = root
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".1f")).tickSize(0).tickPadding(8));
    const axY = root
      .append("g")
      .call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat(d3.format("~s")));
    for (const ax of [axX, axY]) {
      ax.select(".domain").attr("stroke", "var(--rule)");
      ax.selectAll("text").attr("class", "tts-tick").attr("fill", "var(--ink-faint)");
    }

    // axis titles
    root
      .append("text")
      .attr("x", iw)
      .attr("y", ih + 36)
      .attr("text-anchor", "end")
      .attr("class", "tts-axis-title")
      .attr("fill", "var(--ink-dim)")
      .text("trust →");
    root
      .append("text")
      .attr("transform", `translate(${-40},0) rotate(-90)`)
      .attr("x", 0)
      .attr("y", 0)
      .attr("text-anchor", "end")
      .attr("class", "tts-axis-title")
      .attr("fill", "var(--ink-dim)")
      .text("taste →");

    // ── dots ──────────────────────────────────────────────────────────────
    // draw smaller dots last so big ones don't bury them
    const ordered = [...data].sort((a, b) => b.readMin - a.readMin);
    const dots = root
      .append("g")
      .attr("class", "tts-dots")
      .selectAll("circle")
      .data(ordered)
      .join("circle")
      .attr("cx", (d) => x(d.trust))
      .attr("cy", (d) => y(d.taste))
      .attr("r", (d) => r(Math.max(1, d.readMin)))
      .attr("fill", (d) => groupColor(d.group))
      .attr("fill-opacity", 0.62)
      .attr("stroke", "var(--bg)")
      .attr("stroke-width", 1)
      .style("cursor", "pointer");

    // entrance (gated on motion preference). Opacity-only: an .attr("transform")
    // scale would animate each circle about the parent (0,0) — dots would leap
    // from the corner, not pop in place — and CSS transform-box/origin don't
    // govern SVG presentation attributes. A staggered fade matches the other islands.
    if (!reduce) {
      dots
        .style("opacity", 0)
        .transition()
        .delay((_d, i) => Math.min(600, i * 1.4))
        .duration(420)
        .ease(d3.easeCubicOut)
        .style("opacity", 1);
    }

    // ── interactivity ──────────────────────────────────────────────────────
    const tip = d3.select(tipEl);
    const showTip = (event: MouseEvent, d: ScatterPoint) => {
      const [mx, my] = d3.pointer(event, wrapRef.current);
      tip
        .style("opacity", "1")
        .style("left", `${mx + 14}px`)
        .style("top", `${my + 14}px`)
        .html(
          `<span class="tts-tip-title">${escapeHtml(d.title)}</span>` +
            `<span class="tts-tip-row"><span class="tts-tip-dot" style="background:${groupColor(
              d.group,
            )}"></span>${escapeHtml(d.channel)}</span>` +
            `<span class="tts-tip-stats">trust ${d.trust.toFixed(2)} · taste ${d.taste.toFixed(
              1,
            )} · ${d.readMin} min</span>`,
        );
    };

    dots
      .on("mouseenter", function (event: MouseEvent, d) {
        dots.attr("fill-opacity", 0.14).attr("stroke-opacity", 0.2);
        d3.select(this)
          .raise()
          .attr("fill-opacity", 0.95)
          .attr("stroke", "var(--ink)")
          .attr("stroke-opacity", 1)
          .attr("r", r(Math.max(1, d.readMin)) * 1.6);
        showTip(event, d);
      })
      .on("mousemove", (event: MouseEvent, d) => showTip(event, d))
      .on("mouseleave", function (_event, d) {
        dots.attr("fill-opacity", 0.62).attr("stroke", "var(--bg)").attr("stroke-opacity", 1);
        d3.select(this).attr("r", r(Math.max(1, d.readMin)));
        tip.style("opacity", "0");
      })
      .on("click", (_event, d) => {
        window.location.href = d.href;
      });
  }, [data, width]);

  if (data.length === 0) {
    return (
      <div className="tts-empty" aria-label="Trust versus taste scatter (no data)">
        no items to plot yet
      </div>
    );
  }

  return (
    <div className="tts-wrap" ref={wrapRef} aria-label="Trust versus taste scatter plot">
      <div className="tts-legend" aria-hidden="true">
        {Object.entries(GROUP_COLORS).map(([g, c]) => (
          <span className="tts-legend-item" key={g}>
            <span className="tts-legend-dot" style={{ background: c }} />
            {g}
          </span>
        ))}
        <span className="tts-legend-note">● size = read-time</span>
      </div>
      <svg ref={svgRef} role="img" aria-label="Trust versus taste, colored by group, sized by read-time" />
      <div className="tts-tip" ref={tipRef} role="status" aria-live="polite" />
      <style>{`
        .tts-wrap { position: relative; width: 100%; min-height: ${MIN_H}px; }
        .tts-wrap svg { display: block; width: 100%; height: auto; overflow: visible; }
        .tts-legend {
          display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-4);
          font-family: var(--font-mono); font-size: var(--t-xs); color: var(--ink-dim);
          margin: 0 0 var(--s-4); letter-spacing: 0.02em;
        }
        .tts-legend-item { display: inline-flex; align-items: center; gap: var(--s-2); }
        .tts-legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .tts-legend-note { color: var(--ink-faint); margin-left: auto; }
        :global(.tts-tick) { font-family: var(--font-mono); font-size: 11px; }
        :global(.tts-axis-title) {
          font-family: var(--font-mono); font-size: 11px;
          letter-spacing: 0.06em; text-transform: lowercase;
        }
        :global(.tts-quad) { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; }
        .tts-tip {
          position: absolute; top: 0; left: 0; pointer-events: none; opacity: 0;
          z-index: 5; max-width: 260px; transition: opacity var(--dur-fast) var(--ease-out);
          display: flex; flex-direction: column; gap: 3px;
          padding: var(--s-2) var(--s-3);
          border: var(--hair) solid var(--rule); border-radius: var(--r-md);
          background: var(--bg-raised); color: var(--ink);
          font-family: var(--font-mono); font-size: var(--t-xs); line-height: 1.4;
          box-shadow: 0 6px 24px rgba(0,0,0,0.4);
        }
        .tts-tip :global(.tts-tip-title) {
          color: var(--ink); font-size: var(--t-sm); line-height: 1.3;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .tts-tip :global(.tts-tip-row) { display: inline-flex; align-items: center; gap: var(--s-2); color: var(--ink-dim); }
        .tts-tip :global(.tts-tip-dot) { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
        .tts-tip :global(.tts-tip-stats) { color: var(--ink-faint); }
        .tts-empty {
          display: flex; align-items: center; justify-content: center; min-height: ${MIN_H}px;
          border: var(--hair) dashed var(--rule); border-radius: var(--r-md);
          color: var(--ink-faint); font-family: var(--font-mono); font-size: var(--t-xs);
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
