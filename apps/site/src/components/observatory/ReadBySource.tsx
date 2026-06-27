// THE OBSERVATORY — RHYTHM: read-time by source-type (section 5).
// One horizontal box-plot per source type: whisker min→max, box q1→q3, median
// line, plus jittered strip dots from the raw values (sampled when dense). Calm,
// comparative, neutral ink with a single amber accent on the median. x-axis =
// read minutes; mono row labels (sourceType · n).
//
// SSR-safe: server renders a sized empty container; all d3/DOM in useEffect after
// mount. Responsive via ResizeObserver. Reduced-motion → final state, no grow.
// Colors/type from tokens.css only.
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { ReadBySourceDatum } from "./lib/build-analytics";

const MAX_DOTS = 60; // sample cap per row so dense types stay legible

export default function ReadBySource({ data }: { data: ReadBySourceDatum[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const tip = tipRef.current;
    if (!host || !tip) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

    const draw = () => {
      host.replaceChildren();
      const width = host.clientWidth || 720;

      if (data.length === 0) {
        const empty = document.createElement("div");
        empty.className = "rbs-empty";
        empty.textContent = "no read-time signal yet — boxes appear once sources are curated";
        host.appendChild(empty);
        return;
      }

      const rowH = 54;
      const margin = { top: 10, right: 22, bottom: 30, left: 116 };
      const innerW = Math.max(10, width - margin.left - margin.right);
      const innerH = data.length * rowH;
      const height = innerH + margin.top + margin.bottom;

      const maxVal = d3.max(data, (d) => d.max) ?? 1;
      const x = d3
        .scaleLinear()
        .domain([0, maxVal])
        .range([0, innerW])
        .nice();

      const yBand = d3
        .scaleBand<string>()
        .domain(data.map((d) => d.sourceType))
        .range([0, innerH])
        .paddingInner(0.35);
      const boxH = Math.min(20, yBand.bandwidth());

      const svg = d3
        .select(host)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Read-time distribution per source type, box plots");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      // x gridlines (faint, behind everything)
      const ticks = x.ticks(Math.max(3, Math.min(8, Math.floor(innerW / 90))));
      g.append("g")
        .selectAll("line")
        .data(ticks)
        .join("line")
        .attr("x1", (d) => x(d))
        .attr("x2", (d) => x(d))
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", "var(--rule)")
        .attr("stroke-width", 0.5);

      // x axis (minutes)
      const gx = g
        .append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).tickValues(ticks).tickSize(0).tickPadding(8).tickFormat((d) => `${d}`));
      gx.select(".domain").remove();
      gx.selectAll("text")
        .attr("fill", "var(--ink-faint)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", "10px");
      gx.append("text")
        .attr("x", innerW)
        .attr("y", 26)
        .attr("text-anchor", "end")
        .attr("fill", "var(--ink-faint)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", "9px")
        .attr("letter-spacing", "0.08em")
        .text("READ MINUTES →");

      const rows = g
        .selectAll("g.rbs-row")
        .data(data)
        .join("g")
        .attr("class", "rbs-row")
        .attr("transform", (d) => `translate(0,${(yBand(d.sourceType) ?? 0) + yBand.bandwidth() / 2})`);

      // row label (mono) — sourceType + n
      rows
        .append("text")
        .attr("x", -margin.left + 4)
        .attr("dy", "0.32em")
        .attr("fill", "var(--ink-dim)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", "11px")
        .attr("letter-spacing", "0.02em")
        .each(function (d) {
          const t = d3.select(this);
          t.append("tspan").attr("fill", "var(--ink)").text(d.sourceType);
          t.append("tspan").attr("fill", "var(--ink-faint)").text(`  n=${d.values.length}`);
        });

      // whiskers min→max
      rows
        .append("line")
        .attr("x1", (d) => x(d.min))
        .attr("x2", (d) => x(d.max))
        .attr("y1", 0)
        .attr("y2", 0)
        .attr("stroke", "var(--rule-bright)")
        .attr("stroke-width", 1);
      // whisker caps
      for (const side of ["min", "max"] as const) {
        rows
          .append("line")
          .attr("x1", (d) => x(d[side]))
          .attr("x2", (d) => x(d[side]))
          .attr("y1", -5)
          .attr("y2", 5)
          .attr("stroke", "var(--rule-bright)")
          .attr("stroke-width", 1);
      }

      // jittered strip dots (sampled) — behind the box for texture, not noise
      rows.each(function (d) {
        const vals = d.values;
        const step = vals.length > MAX_DOTS ? Math.ceil(vals.length / MAX_DOTS) : 1;
        const sample: number[] = [];
        for (let i = 0; i < vals.length; i += step) sample.push(vals[i]!);
        const jitter = d3.randomLcg(0.42); // deterministic jitter
        d3.select(this)
          .append("g")
          .selectAll("circle")
          .data(sample)
          .join("circle")
          .attr("cx", (v) => x(v))
          .attr("cy", () => (jitter() - 0.5) * (boxH + 6))
          .attr("r", 1.6)
          .attr("fill", "var(--ink-faint)")
          .attr("fill-opacity", 0.4);
      });

      // box q1→q3
      const boxes = rows
        .append("rect")
        .attr("x", (d) => x(d.q1))
        .attr("y", -boxH / 2)
        .attr("width", (d) => Math.max(1, x(d.q3) - x(d.q1)))
        .attr("height", boxH)
        .attr("rx", 2)
        .attr("fill", "var(--bg-raised)")
        .attr("fill-opacity", 0.92)
        .attr("stroke", "var(--ink-dim)")
        .attr("stroke-width", 1)
        .style("transition", "stroke var(--dur) var(--ease-out)");

      // median line (amber accent)
      rows
        .append("line")
        .attr("x1", (d) => x(d.median))
        .attr("x2", (d) => x(d.median))
        .attr("y1", -boxH / 2 - 2)
        .attr("y2", boxH / 2 + 2)
        .attr("stroke", "var(--accent)")
        .attr("stroke-width", 2);

      // hover targets (full-row hitboxes) + tooltip
      const hostRect = () => host.getBoundingClientRect();
      rows
        .append("rect")
        .attr("x", -margin.left)
        .attr("y", -yBand.bandwidth() / 2)
        .attr("width", margin.left + innerW)
        .attr("height", yBand.bandwidth())
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("pointerenter", function (_ev, d) {
          boxes.filter((b) => b === d).attr("stroke", "var(--accent)");
        })
        .on("pointermove", function (ev: PointerEvent, d) {
          tip.innerHTML =
            `<div class="rbs-tip-head">${d.sourceType}</div>` +
            `<div class="rbs-tip-row">median<b>${fmt(d.median)} min</b></div>` +
            `<div class="rbs-tip-row">q1 – q3<b>${fmt(d.q1)} – ${fmt(d.q3)}</b></div>` +
            `<div class="rbs-tip-row">range<b>${fmt(d.min)} – ${fmt(d.max)}</b></div>` +
            `<div class="rbs-tip-row">items<b>n=${d.values.length}</b></div>`;
          tip.style.opacity = "1";
          const r = hostRect();
          const lx = ev.clientX - r.left;
          const ly = ev.clientY - r.top;
          const tw = tip.offsetWidth;
          const left = lx + tw + 20 > r.width ? lx - tw - 14 : lx + 14;
          tip.style.left = `${Math.max(4, left)}px`;
          tip.style.top = `${Math.max(4, ly - tip.offsetHeight - 8)}px`;
        })
        .on("pointerleave", function (_ev, d) {
          boxes.filter((b) => b === d).attr("stroke", "var(--ink-dim)");
          tip.style.opacity = "0";
        });

      // entrance — boxes grow from median; reduced-motion skips it
      if (!reduceMotion) {
        boxes
          .attr("width", 0)
          .attr("x", (d) => x(d.median))
          .transition()
          .delay((_d, i) => i * 60)
          .duration(520)
          .ease(d3.easeCubicOut)
          .attr("x", (d) => x(d.q1))
          .attr("width", (d) => Math.max(1, x(d.q3) - x(d.q1)));
      }
    };

    const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(host);
    return () => {
      ro.disconnect();
      host.replaceChildren();
    };
  }, [data]);

  return (
    <div className="rbs-root" aria-label="Read-time distribution by source type">
      <div className="rbs-host" ref={hostRef} />
      <div className="rbs-tip" ref={tipRef} aria-hidden="true" />

      <style>{`
        .rbs-root { position: relative; width: 100%; }
        .rbs-host { position: relative; width: 100%; min-height: 200px; }
        .rbs-empty {
          display: flex; align-items: center; justify-content: center;
          min-height: 200px; padding: var(--s-6);
          border: var(--hair) dashed var(--rule); border-radius: var(--r-md);
          color: var(--ink-faint); font-family: var(--font-mono);
          font-size: var(--t-xs); letter-spacing: 0.04em; text-align: center;
        }
        .rbs-tip {
          position: absolute; top: 0; left: 0; pointer-events: none;
          opacity: 0; transition: opacity var(--dur) var(--ease-out);
          min-width: 150px;
          padding: var(--s-3);
          border: var(--hair) solid var(--rule-bright);
          border-radius: var(--r-md);
          background: var(--bg-raised);
          color: var(--ink); font-family: var(--font-mono);
          font-size: var(--t-xs); line-height: 1.5;
          box-shadow: 0 8px 24px rgba(0,0,0,0.45);
          z-index: 5;
        }
        .rbs-tip-head {
          color: var(--accent); text-transform: uppercase;
          letter-spacing: 0.08em; font-size: 10px;
          margin-bottom: var(--s-2); padding-bottom: var(--s-2);
          border-bottom: var(--hair) solid var(--rule);
        }
        .rbs-tip-row {
          display: flex; align-items: center; gap: var(--s-4);
          color: var(--ink-dim); margin: 2px 0;
        }
        .rbs-tip-row b { margin-left: auto; color: var(--ink); font-weight: 500; }
        @media (prefers-reduced-motion: reduce) {
          .rbs-tip { transition: none; }
        }
      `}</style>
    </div>
  );
}
