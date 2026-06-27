// THE OBSERVATORY — TEMPORAL streamgraph (section 7).
// Weekly item-counts per GROUP over time, drawn as a wiggle-offset stacked area
// so the curated signal reads as flowing bands of light. d3 (not Plot) for fine
// control over the warm-dark instrument look: hairline mono axis, themed hover
// guide + tooltip, restrained motion.
//
// SSR-safe: server renders a sized, empty container; ALL d3/DOM work happens in
// useEffect after mount. Responsive via ResizeObserver. Reduced-motion → final
// state, no entrance grow. Colors/type from tokens.css + imported GROUP_COLORS.
import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { GROUP_COLORS, type TimeSeriesData } from "./lib/build-analytics";

// Stable, legible order for the legend + stack (densest signal first), filtered
// to the groups actually present in the data.
const GROUP_ORDER = ["ai", "world", "science", "data", "make"] as const;
const GROUP_LABEL: Record<string, string> = {
  ai: "ai",
  world: "world",
  science: "science·tech",
  data: "data",
  make: "make",
};

export default function TemporalStream({ data }: { data: TimeSeriesData }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const tip = tipRef.current;
    if (!host || !tip) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

    const groups = GROUP_ORDER.filter((g) => data.groups.includes(g));
    // any group present in data but not in our known order (forward-compat) —
    // sort the residuals so stack/legend order stays deterministic regardless
    // of build-time item ordering.
    data.groups
      .filter((g) => !groups.includes(g as never))
      .sort()
      .forEach((g) => groups.push(g as never));

    const bins = data.bins;

    const draw = () => {
      host.replaceChildren();
      const width = host.clientWidth || 720;

      if (bins.length === 0 || groups.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ts-empty";
        empty.textContent = "no temporal signal yet — the stream fills as items are curated";
        host.appendChild(empty);
        return;
      }

      const height = Math.max(300, Math.min(420, Math.round(width * 0.46)));
      const margin = { top: 16, right: 14, bottom: 30, left: 14 };
      const innerW = Math.max(10, width - margin.left - margin.right);
      const innerH = Math.max(10, height - margin.top - margin.bottom);

      const parse = (s: string) => new Date(`${s}T00:00:00Z`);
      const rows = bins.map((b) => {
        const r: Record<string, number | Date> = { date: parse(b.date as string) };
        for (const g of groups) r[g] = Number(b[g] ?? 0);
        return r;
      });

      const stack = d3
        .stack<Record<string, number | Date>>()
        .keys(groups)
        .offset(d3.stackOffsetWiggle)
        .order(d3.stackOrderInsideOut)
        .value((d, key) => (d[key] as number) ?? 0);
      const series = stack(rows);

      const x = d3
        .scaleTime()
        .domain(d3.extent(rows, (d) => d.date as Date) as [Date, Date])
        .range([0, innerW]);

      const yMin = d3.min(series, (s) => d3.min(s, (d) => d[0])) ?? 0;
      const yMax = d3.max(series, (s) => d3.max(s, (d) => d[1])) ?? 1;
      const y = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]).nice();

      const svg = d3
        .select(host)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Weekly curated-item counts by topic group over time");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const area = d3
        .area<d3.SeriesPoint<Record<string, number | Date>>>()
        .x((d) => x(d.data.date as Date))
        .y0((d) => y(d[0]))
        .y1((d) => y(d[1]))
        .curve(d3.curveBasis);

      // bands
      const bands = g
        .append("g")
        .selectAll("path")
        .data(series)
        .join("path")
        .attr("d", area)
        .attr("fill", (s) => GROUP_COLORS[s.key] ?? "var(--ink-faint)")
        .attr("fill-opacity", 0.82)
        .attr("stroke", "var(--bg)")
        .attr("stroke-width", 0.6)
        .style("cursor", "crosshair")
        .style("transition", "fill-opacity var(--dur) var(--ease-out)");

      // x axis — month ticks, mono labels, hairline rule
      const tickCount = Math.max(2, Math.min(7, Math.floor(innerW / 110)));
      const axis = d3
        .axisBottom(x)
        .ticks(tickCount)
        .tickSize(0)
        .tickPadding(8)
        .tickFormat((d) => {
          const dt = d as Date;
          return dt.getUTCMonth() === 0
            ? d3.utcFormat("%b %Y")(dt)
            : d3.utcFormat("%b")(dt);
        });
      const gx = g
        .append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(axis);
      gx.select(".domain").remove();
      gx.selectAll("text")
        .attr("fill", "var(--ink-faint)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", "10px")
        .attr("letter-spacing", "0.04em");

      // hover guide + interaction overlay
      const guide = g
        .append("line")
        .attr("y1", 0)
        .attr("y2", innerH)
        .attr("stroke", "var(--rule-bright)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2 3")
        .style("opacity", 0)
        .style("pointer-events", "none");

      const fmtWeek = d3.utcFormat("%b %d, %Y");
      const dates = rows.map((r) => r.date as Date);

      const move = (ev: PointerEvent) => {
        const [mx] = d3.pointer(ev, g.node());
        const t = x.invert(Math.max(0, Math.min(innerW, mx)));
        // nearest week
        let idx = d3.bisectCenter(dates, t);
        idx = Math.max(0, Math.min(dates.length - 1, idx));
        const row = rows[idx]!;
        const gx2 = x(dates[idx]!);
        guide.attr("x1", gx2).attr("x2", gx2).style("opacity", 1);

        let total = 0;
        const lines = groups
          .map((grp) => {
            const v = Number(row[grp] ?? 0);
            total += v;
            return { grp, v };
          })
          .filter((d) => d.v > 0)
          .sort((a, b) => b.v - a.v)
          .map(
            (d) =>
              `<span class="ts-tip-row"><span class="ts-sw" style="background:${
                GROUP_COLORS[d.grp] ?? "var(--ink-faint)"
              }"></span>${GROUP_LABEL[d.grp] ?? d.grp}<b>${d.v}</b></span>`,
          )
          .join("");

        tip.innerHTML =
          `<div class="ts-tip-head">week of ${fmtWeek(dates[idx]!)}</div>` +
          lines +
          `<div class="ts-tip-total">total<b>${total}</b></div>`;
        tip.style.opacity = "1";

        // position tip within host, flipping near the right edge
        const hostRect = host.getBoundingClientRect();
        const px = margin.left + gx2;
        const tw = tip.offsetWidth;
        const left =
          px + tw + 18 > hostRect.width ? px - tw - 12 : px + 12;
        tip.style.left = `${Math.max(4, left)}px`;
        tip.style.top = `${margin.top + 4}px`;
      };

      const leave = () => {
        guide.style("opacity", 0);
        tip.style.opacity = "0";
      };

      svg
        .append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", innerW)
        .attr("height", innerH)
        .attr("fill", "transparent")
        .style("cursor", "crosshair")
        .on("pointermove", move as never)
        .on("pointerleave", leave);

      // entrance — clip-reveal left→right (transform/opacity-equiv via width).
      if (!reduceMotion) {
        const clipId = "ts-clip";
        const clip = svg
          .append("clipPath")
          .attr("id", clipId)
          .append("rect")
          .attr("x", 0)
          .attr("y", -8)
          .attr("width", 0)
          .attr("height", height + 16);
        bands.attr("clip-path", `url(#${clipId})`);
        clip
          .transition()
          .duration(820)
          .ease(d3.easeCubicOut)
          .attr("width", width)
          .on("end", () => bands.attr("clip-path", null));
      }
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(host);
    return () => {
      ro.disconnect();
      host.replaceChildren();
    };
  }, [data]);

  return (
    <div className="ts-root" aria-label="Temporal streamgraph of curated signal by group">
      <div className="ts-legend">
        {GROUP_ORDER.filter((g) => data.groups.includes(g)).map((g) => (
          <span className="ts-leg-item" key={g}>
            <span className="ts-sw" style={{ background: GROUP_COLORS[g] }} />
            {GROUP_LABEL[g] ?? g}
          </span>
        ))}
      </div>
      <div className="ts-host" ref={hostRef} />
      <div className="ts-tip" ref={tipRef} aria-hidden="true" />

      <style>{`
        .ts-root { position: relative; width: 100%; }
        .ts-legend {
          display: flex; flex-wrap: wrap; gap: var(--s-4);
          margin-bottom: var(--s-3);
          font-family: var(--font-mono); font-size: var(--t-xs);
          color: var(--ink-dim); letter-spacing: 0.03em;
        }
        .ts-leg-item { display: inline-flex; align-items: center; gap: 6px; }
        .ts-sw {
          display: inline-block; width: 9px; height: 9px; border-radius: 2px;
          flex: none;
        }
        .ts-host { position: relative; width: 100%; min-height: 300px; }
        .ts-empty {
          display: flex; align-items: center; justify-content: center;
          min-height: 300px; padding: var(--s-6);
          border: var(--hair) dashed var(--rule); border-radius: var(--r-md);
          color: var(--ink-faint); font-family: var(--font-mono);
          font-size: var(--t-xs); letter-spacing: 0.04em; text-align: center;
        }
        .ts-tip {
          position: absolute; top: 0; left: 0; pointer-events: none;
          opacity: 0; transition: opacity var(--dur) var(--ease-out);
          min-width: 150px; max-width: 230px;
          padding: var(--s-3);
          border: var(--hair) solid var(--rule-bright);
          border-radius: var(--r-md);
          background: var(--bg-raised);
          color: var(--ink); font-family: var(--font-mono);
          font-size: var(--t-xs); line-height: 1.5;
          box-shadow: 0 8px 24px rgba(0,0,0,0.45);
          z-index: 5;
        }
        .ts-tip-head {
          color: var(--accent); text-transform: uppercase;
          letter-spacing: 0.08em; font-size: 10px;
          margin-bottom: var(--s-2); padding-bottom: var(--s-2);
          border-bottom: var(--hair) solid var(--rule);
        }
        .ts-tip-row {
          display: flex; align-items: center; gap: 6px;
          color: var(--ink-dim); margin: 2px 0;
        }
        .ts-tip-row b { margin-left: auto; color: var(--ink); font-weight: 500; }
        .ts-tip-total {
          display: flex; margin-top: var(--s-2); padding-top: var(--s-2);
          border-top: var(--hair) solid var(--rule);
          color: var(--ink-faint); text-transform: uppercase;
          letter-spacing: 0.06em; font-size: 10px;
        }
        .ts-tip-total b { margin-left: auto; color: var(--accent); font-weight: 500; }
        @media (prefers-reduced-motion: reduce) {
          .ts-tip { transition: none; }
        }
      `}</style>
    </div>
  );
}
