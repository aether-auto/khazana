// RHYTHM — read-time distribution. Bars are reality (count per 2-min bin); the
// smooth amber curve is the curation target (a Gaussian crest at ~15 min). A
// faded "< 5 min rejected" zone on the left and a "≈15 min sweet spot" marker
// at the peak make it read as an editorial graphic, not a default chart. Median
// and mean drawn as vertical guides with mono labels. SSR-safe, tokens-only.
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import type { ReadTimeDistData } from "./lib/build-analytics";

const MARGIN = { top: 28, right: 20, bottom: 44, left: 44 };
const MIN_H = 360;
const REJECT_MAX = 5; // < 5-min rendered reads are auto-rejected upstream
const SWEET_SPOT = 15;

export default function ReadTimeDist({ data }: { data: ReadTimeDistData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

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
    if (!svgEl || !tipEl || width === 0 || data.bins.length === 0) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const height = Math.max(MIN_H, Math.min(440, width * 0.66));
    const iw = width - MARGIN.left - MARGIN.right;
    const ih = height - MARGIN.top - MARGIN.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
    // Explicit z-layers (draw order = paint order): zone/grid/area UNDER the bars,
    // curve + markers + axes OVER. Avoids fragile relative .insert() calls.
    const lZone = root.append("g");
    const lGrid = root.append("g");
    const lArea = root.append("g");
    const lBars = root.append("g");
    const lOver = root.append("g");

    const xMax = Math.max(data.bins[data.bins.length - 1]!.x1, ...data.peak.map((p) => p.x));
    const yMax = Math.max(d3.max(data.bins, (b) => b.count) ?? 0, d3.max(data.peak, (p) => p.y) ?? 0, 1);

    const x = d3.scaleLinear().domain([0, xMax]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, yMax * 1.08]).range([ih, 0]);

    // ── reject zone (< 5 min) ──────────────────────────────────────────────
    if (REJECT_MAX < xMax) {
      lZone
        .append("rect")
        .attr("x", x(0))
        .attr("y", 0)
        .attr("width", x(REJECT_MAX) - x(0))
        .attr("height", ih)
        .attr("fill", "var(--editorial)")
        .attr("fill-opacity", 0.06);
      lZone
        .append("line")
        .attr("x1", x(REJECT_MAX))
        .attr("x2", x(REJECT_MAX))
        .attr("y1", 0)
        .attr("y2", ih)
        .attr("stroke", "var(--editorial)")
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.4)
        .attr("stroke-dasharray", "2 3");
      // The zone is a narrow strip — set the label VERTICAL so it reads up the
      // strip instead of spilling over the y-axis title.
      const zx = (x(0) + x(REJECT_MAX)) / 2;
      lZone
        .append("text")
        .attr("transform", `translate(${zx},${ih - 10}) rotate(-90)`)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle")
        .attr("class", "rtd-zone")
        .attr("fill", "var(--editorial)")
        .attr("fill-opacity", 0.85)
        .text("< 5 min rejected");
    }

    // ── y grid ──────────────────────────────────────────────────────────────
    lGrid
      .selectAll("line")
      .data(y.ticks(4))
      .join("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "var(--rule)")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.35);

    // ── bars (reality) ──────────────────────────────────────────────────────
    const barGap = data.bins.length > 24 ? 0.5 : 1.5;
    const bars = lBars
      .selectAll("rect.rtd-bar")
      .data(data.bins)
      .join("rect")
      .attr("class", "rtd-bar")
      .attr("x", (b) => x(b.x0) + barGap)
      .attr("width", (b) => Math.max(0, x(b.x1) - x(b.x0) - barGap * 2))
      .attr("y", (b) => y(b.count))
      .attr("height", (b) => ih - y(b.count))
      .attr("fill", "var(--rule-bright)")
      .attr("fill-opacity", 0.85)
      .style("cursor", "default");

    if (!reduce) {
      bars
        .attr("y", ih)
        .attr("height", 0)
        .transition()
        .delay((_b, i) => i * 14)
        .duration(420)
        .ease(d3.easeCubicOut)
        .attr("y", (b) => y(b.count))
        .attr("height", (b) => ih - y(b.count));
    }

    // ── target curve (the scoring goal: peak @ 15 min) ──────────────────────
    const line = d3
      .line<{ x: number; y: number }>()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveBasis);
    const curvePath = lOver
      .append("path")
      .datum(data.peak)
      .attr("fill", "none")
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("d", line);
    // soft amber fill under the curve for "the target band" (below the bars)
    const area = d3
      .area<{ x: number; y: number }>()
      .x((d) => x(d.x))
      .y0(ih)
      .y1((d) => y(d.y))
      .curve(d3.curveBasis);
    lArea
      .append("path")
      .datum(data.peak)
      .attr("fill", "var(--accent)")
      .attr("fill-opacity", 0.05)
      .attr("d", area);

    if (!reduce) {
      const len = (curvePath.node() as SVGPathElement).getTotalLength();
      curvePath
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", len)
        .transition()
        .delay(220)
        .duration(900)
        .ease(d3.easeCubicInOut)
        .attr("stroke-dashoffset", 0);
    }

    // ── sweet-spot marker (peak) ────────────────────────────────────────────
    if (SWEET_SPOT <= xMax) {
      const peakY = data.peak.reduce((m, p) => (p.y > m.y ? p : m), data.peak[0]!);
      lOver
        .append("circle")
        .attr("cx", x(SWEET_SPOT))
        .attr("cy", y(peakY.y))
        .attr("r", 3.5)
        .attr("fill", "var(--accent)")
        .attr("stroke", "var(--bg)")
        .attr("stroke-width", 1.5);
      // sweet-spot label sits up and to the RIGHT of the dot so it clears the
      // crest of the curve and the stat-line labels clustered near the peak.
      // On narrow charts the full label would collide with the top-right legend,
      // so it shortens to "≈15 min" there (the dot still marks the crest).
      lOver
        .append("text")
        .attr("x", x(SWEET_SPOT) + 8)
        .attr("y", y(peakY.y) - 6)
        .attr("text-anchor", "start")
        .attr("class", "rtd-sweet")
        .attr("fill", "var(--accent)")
        .text(iw < 460 ? "≈15 min" : "≈15 min sweet spot");
    }

    // ── median + mean guides ────────────────────────────────────────────────
    // The lines live in the dense left region; their VALUES read off a small
    // legend pinned to the empty top-right corner so nothing collides.
    const guideLine = (val: number, color: string) => {
      if (val <= 0 || val > xMax) return;
      lOver
        .append("line")
        .attr("x1", x(val))
        .attr("x2", x(val))
        .attr("y1", 0)
        .attr("y2", ih)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.6)
        .attr("stroke-dasharray", "4 3");
    };
    guideLine(data.median, "var(--good)");
    guideLine(data.mean, "var(--ink-dim)");

    const legend = lOver.append("g").attr("transform", `translate(${iw - 4},6)`);
    const legendRow = (i: number, color: string, text: string) => {
      const g = legend.append("g").attr("transform", `translate(0,${i * 16})`);
      g.append("line")
        .attr("x1", -22)
        .attr("x2", -8)
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", color)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4 3");
      g.append("text")
        .attr("x", -28)
        .attr("y", 0)
        .attr("dominant-baseline", "middle")
        .attr("text-anchor", "end")
        .attr("class", "rtd-stat")
        .attr("fill", color)
        .text(text);
    };
    legendRow(0, "var(--good)", `median ${Math.round(data.median)}m`);
    legendRow(1, "var(--ink-dim)", `mean ${Math.round(data.mean)}m`);

    // ── axes ──────────────────────────────────────────────────────────────
    const axX = lOver
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(Math.min(8, Math.round(iw / 60))).tickSize(0).tickPadding(8).tickFormat((d) => `${d}`));
    const axY = lOver
      .append("g")
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(8).tickFormat(d3.format("~s")));
    for (const ax of [axX, axY]) {
      ax.select(".domain").attr("stroke", "var(--rule)");
      ax.selectAll("text").attr("class", "rtd-tick").attr("fill", "var(--ink-faint)");
    }
    lOver
      .append("text")
      .attr("x", iw)
      .attr("y", ih + 36)
      .attr("text-anchor", "end")
      .attr("class", "rtd-axis-title")
      .attr("fill", "var(--ink-dim)")
      .text("minutes →");
    lOver
      .append("text")
      .attr("transform", `translate(${-32},0) rotate(-90)`)
      .attr("text-anchor", "end")
      .attr("class", "rtd-axis-title")
      .attr("fill", "var(--ink-dim)")
      .text("items →");

    // ── hover tooltip on bars ───────────────────────────────────────────────
    const tip = d3.select(tipEl);
    bars
      .on("mouseenter", function (event: MouseEvent, b) {
        bars.attr("fill-opacity", 0.4);
        d3.select(this).attr("fill-opacity", 1).attr("fill", "var(--accent)");
        const [mx, my] = d3.pointer(event, wrapRef.current);
        tip
          .style("opacity", "1")
          .style("left", `${mx + 14}px`)
          .style("top", `${my + 14}px`)
          .html(
            `<span class="rtd-tip-stat">${b.x0}–${b.x1} min</span>` +
              `<span class="rtd-tip-sub">${b.count} item${b.count === 1 ? "" : "s"}</span>`,
          );
      })
      .on("mousemove", function (event: MouseEvent) {
        const [mx, my] = d3.pointer(event, wrapRef.current);
        tip.style("left", `${mx + 14}px`).style("top", `${my + 14}px`);
      })
      .on("mouseleave", function () {
        bars.attr("fill-opacity", 0.85).attr("fill", "var(--rule-bright)");
        tip.style("opacity", "0");
      });
  }, [data, width]);

  if (data.bins.length === 0) {
    return (
      <div className="rtd-empty" aria-label="Read-time distribution (no data)">
        no read-time data yet
      </div>
    );
  }

  return (
    <div className="rtd-wrap" ref={wrapRef} aria-label="Read-time distribution histogram with target curve">
      <svg ref={svgRef} role="img" aria-label="Histogram of read-time with the 15-minute curation target overlaid" />
      <div className="rtd-tip" ref={tipRef} role="status" aria-live="polite" />
      <style>{`
        .rtd-wrap { position: relative; width: 100%; min-height: ${MIN_H}px; }
        .rtd-wrap svg { display: block; width: 100%; height: auto; overflow: visible; }
        :global(.rtd-tick) { font-family: var(--font-mono); font-size: 11px; }
        :global(.rtd-axis-title) { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: lowercase; }
        :global(.rtd-stat) { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.02em; }
        :global(.rtd-zone) { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; }
        :global(.rtd-sweet) { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.03em; }
        .rtd-tip {
          position: absolute; top: 0; left: 0; pointer-events: none; opacity: 0;
          z-index: 5; transition: opacity var(--dur-fast) var(--ease-out);
          display: flex; flex-direction: column; gap: 2px;
          padding: var(--s-2) var(--s-3);
          border: var(--hair) solid var(--rule); border-radius: var(--r-md);
          background: var(--bg-raised); color: var(--ink);
          font-family: var(--font-mono); font-size: var(--t-xs); line-height: 1.4;
          box-shadow: 0 6px 24px rgba(0,0,0,0.4);
        }
        .rtd-tip :global(.rtd-tip-stat) { color: var(--ink); }
        .rtd-tip :global(.rtd-tip-sub) { color: var(--ink-faint); }
        .rtd-empty {
          display: flex; align-items: center; justify-content: center; min-height: ${MIN_H}px;
          border: var(--hair) dashed var(--rule); border-radius: var(--r-md);
          color: var(--ink-faint); font-family: var(--font-mono); font-size: var(--t-xs);
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
}
