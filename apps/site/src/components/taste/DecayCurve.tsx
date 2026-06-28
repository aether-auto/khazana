// §5 ENGAGEMENT DECAY — the recency/affinity decay curve as a tunable instrument.
// A half-life knob (the §2 BenchFader, reused) drags the falloff; the decaySeries()
// line redraws; the eventWeightLadder() rungs (open=1, read=3, dwell≤5) label the
// y-axis. Honest about scope: the knob reshapes the CURVE and writes the shared
// store's halfLifeDays (which the bench rerank DOES honor live), but the taste
// MODEL recompute is "applied at next build" — labeled as such. d3 line; redraws
// without transition under reduced motion.
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { decaySeries, eventWeightLadder } from "./lib/taste-derive.js";
import { useBenchStore } from "./lib/use-bench-store.js";
import BenchFader from "./BenchFader.jsx";
import styles from "./DecayCurve.module.css";

const MARGIN = { top: 20, right: 20, bottom: 40, left: 40 };
const MIN_H = 260;

export default function DecayCurve() {
  const { state, store } = useBenchStore();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);

  const halfLife = state.halfLifeDays;
  const series = useMemo(() => decaySeries(halfLife), [halfLife]);
  const ladder = useMemo(() => eventWeightLadder(), []);

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
    if (!svgEl || width === 0 || series.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const height = Math.max(MIN_H, Math.min(320, width * 0.5));
    const iw = width - MARGIN.left - MARGIN.right;
    const ih = height - MARGIN.top - MARGIN.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const maxDay = series[series.length - 1]!.day;
    const x = d3.scaleLinear().domain([0, maxDay]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, 1.05]).range([ih, 0]);

    // y grid
    root
      .selectAll("line.g")
      .data(y.ticks(4))
      .join("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "var(--rule)")
      .attr("stroke-opacity", 0.3);

    // half-life guide (vertical dashed at day === halfLife, weight 0.5)
    if (halfLife <= maxDay) {
      root
        .append("line")
        .attr("x1", x(halfLife))
        .attr("x2", x(halfLife))
        .attr("y1", y(0.5))
        .attr("y2", ih)
        .attr("stroke", "var(--accent)")
        .attr("stroke-opacity", 0.5)
        .attr("stroke-dasharray", "3 3");
      root
        .append("text")
        .attr("x", x(halfLife) + 6)
        .attr("y", y(0.5) - 4)
        .attr("class", "dc-hl")
        .attr("fill", "var(--accent)")
        .text(`half-life ${Math.round(halfLife)}d`);
    }

    // area + line
    const area = d3
      .area<{ day: number; weight: number }>()
      .x((d) => x(d.day))
      .y0(ih)
      .y1((d) => y(d.weight))
      .curve(d3.curveMonotoneX);
    root.append("path").datum(series).attr("fill", "var(--accent)").attr("fill-opacity", 0.05).attr("d", area);

    const line = d3
      .line<{ day: number; weight: number }>()
      .x((d) => x(d.day))
      .y((d) => y(d.weight))
      .curve(d3.curveMonotoneX);
    const path = root
      .append("path")
      .datum(series)
      .attr("fill", "none")
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("d", line);

    if (!reduce) {
      const len = (path.node() as SVGPathElement).getTotalLength();
      path
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", len)
        .transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .attr("stroke-dashoffset", 0);
    }

    // axes
    const axX = root
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(0).tickPadding(8).tickFormat((d) => `${d}`));
    const axY = root
      .append("g")
      .call(d3.axisLeft(y).ticks(3).tickSize(0).tickPadding(8).tickFormat(d3.format("~%")));
    for (const ax of [axX, axY]) {
      ax.select(".domain").attr("stroke", "var(--rule)");
      ax.selectAll("text").attr("class", "dc-tick").attr("fill", "var(--ink-faint)");
    }
    root
      .append("text")
      .attr("x", iw)
      .attr("y", ih + 32)
      .attr("text-anchor", "end")
      .attr("class", "dc-axis-title")
      .attr("fill", "var(--ink-dim)")
      .text("days ago →");
  }, [width, series, halfLife]);

  return (
    <div className={styles.decay}>
      <div className={styles.chartCol} ref={wrapRef}>
        <svg ref={svgRef} role="img" aria-label={`Engagement decay curve, ${Math.round(halfLife)}-day half-life`} />
      </div>
      <div className={styles.controls}>
        <BenchFader
          label="half-life"
          constantName="HALF_LIFE_DAYS"
          value={halfLife}
          min={1}
          max={30}
          defaultValue={7}
          step={1}
          decimals={0}
          unit="d"
          onChange={(v) => store.setHalfLife(Math.round(v))}
        />
        <p className={styles.note}>reshapes the curve live; the taste model recompute is applied at next build.</p>
        <div className={styles.ladder}>
          <span className={styles.ladderHead}>event weights</span>
          {ladder.map((rung) => (
            <span key={rung.label} className={styles.rung}>
              <span className={styles.rungLabel}>{rung.label}</span>
              <span className={styles.rungWeight}>{rung.weight}</span>
              {rung.note && <span className={styles.rungNote}>{rung.note}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
