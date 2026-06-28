// §3 THE GAUSSIAN — the read-time quality curve as a DRAGGABLE instrument. A
// near-restatement of the Observatory's ReadTimeDist (same reject-zone strip,
// amber target curve + soft area, mono axes) so the two pages rhyme — but with
// three direct-manipulation handles: PEAK (peakMin), σ (sigmaMin), and the
// MIN_READ divider (minReadMinutes). Each drag writes the shared store, which
// re-ranks §2's feed. Touch (pointer:coarse) degrades the handles to steppers; the
// curve is the feedback either way. d3 redraws without transition under reduced
// motion (mirrors ReadTimeDist's guard). The math is core's readTimeScore.
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { readTimeScore } from "@khazana/core";
import { useBenchStore } from "./lib/use-bench-store.js";
import styles from "./ReadTimeBench.module.css";

const MARGIN = { top: 28, right: 24, bottom: 44, left: 44 };
const MIN_H = 320;
const X_MAX = 60; // minutes shown
const PEAK_RANGE: [number, number] = [3, 45];
const SIGMA_RANGE: [number, number] = [3, 22];
const MINREAD_RANGE: [number, number] = [0, 20];

type HandleId = "peak" | "sigma" | "minread";

export default function ReadTimeBench() {
  const { state, store } = useBenchStore();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [coarse, setCoarse] = useState(false);
  const drag = useRef<HandleId | null>(null);

  const { peakMin, sigmaMin } = state.gaussian;
  const minRead = state.gates.minReadMinutes;

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sample the Gaussian under the current knobs (core math, so it equals scoring).
  const curve = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let x = 0; x <= X_MAX; x += 0.5) pts.push({ x, y: readTimeScore(x, peakMin, sigmaMin) });
    return pts;
  }, [peakMin, sigmaMin]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const height = Math.max(MIN_H, Math.min(400, width * 0.5));
    const iw = width - MARGIN.left - MARGIN.right;
    const ih = height - MARGIN.top - MARGIN.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const x = d3.scaleLinear().domain([0, X_MAX]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, 1.06]).range([ih, 0]);

    // ── reject zone (< minRead) — clay strip, mirrors ReadTimeDist ──
    if (minRead > 0) {
      root
        .append("rect")
        .attr("x", x(0))
        .attr("y", 0)
        .attr("width", x(minRead) - x(0))
        .attr("height", ih)
        .attr("fill", "var(--editorial)")
        .attr("fill-opacity", 0.06);
      const zx = (x(0) + x(minRead)) / 2;
      root
        .append("text")
        .attr("transform", `translate(${zx},${ih - 10}) rotate(-90)`)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle")
        .attr("class", "rtb-zone")
        .attr("fill", "var(--editorial)")
        .attr("fill-opacity", 0.85)
        .text(`< ${minRead}m rejected`);
    }

    // ── y grid ──
    root
      .selectAll("line.g")
      .data(y.ticks(4))
      .join("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "var(--rule)")
      .attr("stroke-opacity", 0.35);

    // ── area + target curve (amber) ──
    const area = d3
      .area<{ x: number; y: number }>()
      .x((d) => x(d.x))
      .y0(ih)
      .y1((d) => y(d.y))
      .curve(d3.curveBasis);
    root.append("path").datum(curve).attr("fill", "var(--accent)").attr("fill-opacity", 0.05).attr("d", area);

    const line = d3
      .line<{ x: number; y: number }>()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveBasis);
    const path = root
      .append("path")
      .datum(curve)
      .attr("fill", "none")
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("d", line);
    // no draw-in animation here (the curve must track drags live); under
    // no-reduce we add a subtle one-shot on first mount only. Keeping it static is
    // honest for a draggable instrument.
    void path;
    void reduce;

    // ── PEAK handle (crest) ──
    root
      .append("circle")
      .attr("cx", x(peakMin))
      .attr("cy", y(1))
      .attr("r", 5)
      .attr("fill", "var(--accent)")
      .attr("stroke", "var(--bg)")
      .attr("stroke-width", 1.5)
      .attr("class", "rtb-handle")
      .attr("data-handle", "peak");
    root
      .append("text")
      .attr("x", x(peakMin) + 9)
      .attr("y", y(1) - 6)
      .attr("class", "rtb-peak-label")
      .attr("fill", "var(--accent)")
      .text(`≈${Math.round(peakMin)} min sweet spot`);

    // ── σ handles (inflection points at peak ± σ) ──
    for (const sx of [peakMin - sigmaMin, peakMin + sigmaMin]) {
      if (sx < 0 || sx > X_MAX) continue;
      const sy = readTimeScore(sx, peakMin, sigmaMin);
      root
        .append("circle")
        .attr("cx", x(sx))
        .attr("cy", y(sy))
        .attr("r", 4)
        .attr("fill", "var(--bg-raised)")
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 1.5)
        .attr("fill-opacity", 0.9)
        .attr("class", "rtb-handle")
        .attr("data-handle", "sigma");
    }
    root
      .append("text")
      .attr("x", x(Math.min(peakMin + sigmaMin, X_MAX)) + 6)
      .attr("y", y(readTimeScore(peakMin + sigmaMin, peakMin, sigmaMin)))
      .attr("dominant-baseline", "middle")
      .attr("class", "rtb-sigma-label")
      .attr("fill", "var(--ink-dim)")
      .text(`σ ${Math.round(sigmaMin)}m`);

    // ── MIN_READ divider (draggable right edge of the reject zone) ──
    root
      .append("line")
      .attr("x1", x(minRead))
      .attr("x2", x(minRead))
      .attr("y1", 0)
      .attr("y2", ih)
      .attr("stroke", "var(--editorial)")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.55)
      .attr("class", "rtb-handle rtb-minread")
      .attr("data-handle", "minread");

    // ── axes ──
    const axX = root
      .append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(8).tickSize(0).tickPadding(8).tickFormat((d) => `${d}`));
    const axY = root
      .append("g")
      .call(d3.axisLeft(y).ticks(3).tickSize(0).tickPadding(8).tickFormat(d3.format("~%")));
    for (const ax of [axX, axY]) {
      ax.select(".domain").attr("stroke", "var(--rule)");
      ax.selectAll("text").attr("class", "rtb-tick").attr("fill", "var(--ink-faint)");
    }
    root
      .append("text")
      .attr("x", iw)
      .attr("y", ih + 36)
      .attr("text-anchor", "end")
      .attr("class", "rtb-axis-title")
      .attr("fill", "var(--ink-dim)")
      .text("minutes →");

    // ── pointer drag (fine pointers only; coarse uses steppers below) ──
    if (coarse) return;
    const pickHandle = (mx: number): HandleId => {
      const mins = x.invert(mx);
      const dPeak = Math.abs(mins - peakMin);
      const dMin = Math.abs(mins - minRead);
      const dSig = Math.min(Math.abs(mins - (peakMin - sigmaMin)), Math.abs(mins - (peakMin + sigmaMin)));
      const m = Math.min(dPeak, dMin, dSig);
      if (m === dMin) return "minread";
      if (m === dPeak) return "peak";
      return "sigma";
    };
    const overlay = root
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", iw)
      .attr("height", ih)
      .attr("fill", "transparent")
      .style("cursor", "ew-resize");

    overlay.on("pointerdown", function (event: PointerEvent) {
      const [mx] = d3.pointer(event, this);
      drag.current = pickHandle(mx);
      (this as SVGRectElement).setPointerCapture?.(event.pointerId);
    });
    overlay.on("pointermove", function (event: PointerEvent) {
      if (!drag.current) return;
      const [mx] = d3.pointer(event, this);
      const mins = x.invert(mx);
      if (drag.current === "peak") {
        store.setGaussian({ peakMin: clamp(Math.round(mins), PEAK_RANGE[0], PEAK_RANGE[1]) });
      } else if (drag.current === "sigma") {
        store.setGaussian({ sigmaMin: clamp(Math.round(Math.abs(mins - peakMin)), SIGMA_RANGE[0], SIGMA_RANGE[1]) });
      } else {
        store.setGates({ minReadMinutes: clamp(Math.round(mins), MINREAD_RANGE[0], MINREAD_RANGE[1]) });
      }
    });
    const release = function (this: SVGRectElement, event: PointerEvent) {
      drag.current = null;
      this.releasePointerCapture?.(event.pointerId);
    };
    overlay.on("pointerup", release);
    overlay.on("pointercancel", release);
  }, [width, coarse, curve, peakMin, sigmaMin, minRead, store]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.formula}>
        <span className={styles.formulaText}>read-time quality = exp(−(m − PEAK)² / 2σ²)</span>
        <button
          type="button"
          className={styles.reset}
          onClick={() => {
            store.setGaussian({ peakMin: 15, sigmaMin: 10 });
            store.setGates({ minReadMinutes: 5 });
          }}
        >
          ⌫ default curve
        </button>
      </div>
      <svg ref={svgRef} role="img" aria-label={`Read-time quality Gaussian, peak ${Math.round(peakMin)} minutes, sigma ${Math.round(sigmaMin)}, reject under ${minRead} minutes`} />

      {coarse ? (
        <div className={styles.steppers}>
          <Stepper label="PEAK" value={peakMin} unit="m" onDec={() => store.setGaussian({ peakMin: clamp(peakMin - 1, PEAK_RANGE[0], PEAK_RANGE[1]) })} onInc={() => store.setGaussian({ peakMin: clamp(peakMin + 1, PEAK_RANGE[0], PEAK_RANGE[1]) })} />
          <Stepper label="σ" value={sigmaMin} unit="m" onDec={() => store.setGaussian({ sigmaMin: clamp(sigmaMin - 1, SIGMA_RANGE[0], SIGMA_RANGE[1]) })} onInc={() => store.setGaussian({ sigmaMin: clamp(sigmaMin + 1, SIGMA_RANGE[0], SIGMA_RANGE[1]) })} />
          <Stepper label="floor" value={minRead} unit="m" onDec={() => store.setGates({ minReadMinutes: clamp(minRead - 1, MINREAD_RANGE[0], MINREAD_RANGE[1]) })} onInc={() => store.setGates({ minReadMinutes: clamp(minRead + 1, MINREAD_RANGE[0], MINREAD_RANGE[1]) })} />
        </div>
      ) : (
        <p className={styles.caption}>drag the crest, the σ shoulders, or the reject edge — the bench feed re-ranks as you drag.</p>
      )}
    </div>
  );
}

function Stepper({ label, value, unit, onDec, onInc }: { label: string; value: number; unit: string; onDec: () => void; onInc: () => void }) {
  return (
    <div className={styles.stepper}>
      <span className={styles.stepperLabel}>{label}</span>
      <button type="button" className={styles.stepBtn} aria-label={`decrease ${label}`} onClick={onDec}>
        −
      </button>
      <span className={styles.stepperVal}>
        {Math.round(value)}
        {unit}
      </span>
      <button type="button" className={styles.stepBtn} aria-label={`increase ${label}`} onClick={onInc}>
        +
      </button>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
