// INTERESTS · co-occurrence chord — the centerpiece of the Observatory.
// A d3 chord diagram: one arc per channel around the ring (arc length ∝ how many
// items carry that channel), ribbons connecting channels that are tagged together
// on the same item. Arcs + ribbons are colored by GROUP (not 18 rainbow hues).
// Hover an arc to trace a channel's partners; hover a ribbon for the shared count.
//
// SSR-safe React 19 island: the server renders a sized, empty container so layout
// is stable and there is no hydration mismatch; all d3/DOM work runs in useEffect
// after mount. Animates transform/opacity only; honors prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { channelGroup, GROUP_COLORS, type CoocData } from "./lib/build-analytics";
import styles from "./ChordCooc.module.css";

interface Tip {
  x: number;
  y: number;
  lines: { text: string; dim?: boolean; color?: string }[];
}

export default function ChordCooc({ data }: { data: CoocData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);

  // Measure container width responsively.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Draw / redraw whenever data or width changes.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0) return;

    const channels = data.channels;
    const n = channels.length;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    if (n === 0) return;

    // Square viewport sized to the container; cap so it stays legible.
    const size = Math.max(280, Math.min(width, 560));
    const labelPad = 96; // room for radial labels outside the ring
    const inner = size / 2 - labelPad / 2;
    const outer = inner + 12;
    const cx = size / 2;
    const cy = size / 2;

    svg
      .attr("viewBox", `0 0 ${size} ${size}`)
      .attr("width", "100%")
      .attr("height", size)
      .attr("role", "img")
      .attr("aria-label", `Channel co-occurrence chord diagram, ${n} channels`);

    // d3.chord works on a square matrix. Our matrix carries solo-channel items on
    // the diagonal, but a chord's "self" ribbon would be a meaningless lobe — zero
    // the diagonal so arc length comes only from co-occurrence + solo via groupSum
    // below. We instead size each arc by counts[channel] (total volume) directly,
    // which reads more honestly than the chord's own subgroup sum.
    const matrix = data.matrix.map((row, i) =>
      row.map((v, j) => (i === j ? 0 : v)),
    );

    const chord = d3
      .chord()
      .padAngle(Math.max(0.018, 0.06 - n * 0.0015))
      .sortSubgroups(d3.descending)
      .sortChords(d3.descending);
    const chords = chord(matrix);

    // Re-scale the ring so arc ANGULAR length ∝ counts[channel] (total volume),
    // not the co-occurrence row sum. We rebuild group angles proportionally and
    // remap each chord's source/target start/end into the new frame.
    const totals = channels.map((c) => Math.max(0, data.counts[c] ?? 0));
    const grandTotal = d3.sum(totals) || 1;
    const pad = chord.padAngle();
    const usable = 2 * Math.PI - pad * n;
    const groupAngle: { startAngle: number; endAngle: number }[] = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const span = (totals[i]! / grandTotal) * usable;
      const start = acc + pad * i;
      groupAngle.push({ startAngle: start, endAngle: start + span });
      acc += span;
    }
    // Within each group, sub-divide proportionally to that row's outgoing weights
    // so ribbon endpoints fan out across the arc instead of stacking at the edge.
    const sub = groupAngle.map((g, i) => {
      const row = matrix[i]!;
      const rowSum = d3.sum(row) || 1;
      const span = g.endAngle - g.startAngle;
      const edges: number[] = [g.startAngle];
      let s = g.startAngle;
      for (let j = 0; j < n; j++) {
        s += (row[j]! / rowSum) * span;
        edges.push(s);
      }
      edges[n] = g.endAngle; // guard float drift
      return edges;
    });

    const colorOf = (i: number) => GROUP_COLORS[channelGroup(channels[i]!)] ?? GROUP_COLORS.science!;

    const arc = d3.arc<{ startAngle: number; endAngle: number }>().innerRadius(inner).outerRadius(outer);
    const ribbon = d3.ribbon<unknown, { startAngle: number; endAngle: number }>().radius(inner - 1);

    // helper: a chord's two ends remapped into our proportional frame
    const remap = (c: d3.Chord) => {
      const si = c.source.index;
      const ti = c.target.index;
      const ss = sub[si]!;
      const ts = sub[ti]!;
      // use sub-arc slot [ti] within source group, [si] within target group
      return {
        source: { startAngle: ss[ti]!, endAngle: ss[ti + 1]! },
        target: { startAngle: ts[si]!, endAngle: ts[si + 1]! },
      };
    };

    const root = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    // ── ribbons (drawn first, beneath arcs) ────────────────────────────────
    const ribGroup = root.append("g").attr("class", "ribbons");
    const ribbons = ribGroup
      .selectAll("path")
      .data(chords)
      .join("path")
      .attr("d", (c) => ribbon(remap(c) as never) as unknown as string)
      .attr("fill", (c) => colorOf(c.source.index))
      .attr("fill-opacity", 0.16)
      .attr("stroke", (c) => colorOf(c.source.index))
      .attr("stroke-opacity", 0.22)
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer");

    // ── arcs (the ring) ────────────────────────────────────────────────────
    const arcGroup = root.append("g").attr("class", "arcs");
    const arcs = arcGroup
      .selectAll("path")
      .data(groupAngle.map((g, i) => ({ ...g, index: i })))
      .join("path")
      .attr("d", (d) => arc(d) as string)
      .attr("fill", (d) => colorOf(d.index))
      .attr("fill-opacity", 0.92)
      .style("cursor", "pointer");

    // ── radial labels (hide for tiny arcs to avoid overlap) ────────────────
    const labelGroup = root.append("g").attr("class", "labels");
    const minLabelSpan = 0.05; // radians — below this the arc is too small to label
    labelGroup
      .selectAll("text")
      .data(groupAngle.map((g, i) => ({ ...g, index: i })))
      .join("text")
      .filter((d) => d.endAngle - d.startAngle >= minLabelSpan)
      .attr("class", styles.label)
      .attr("dy", "0.32em")
      .attr("transform", (d) => {
        const mid = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
        const r = outer + 8;
        const x = Math.cos(mid) * r;
        const y = Math.sin(mid) * r;
        const flip = mid > Math.PI / 2 || mid < -Math.PI / 2;
        return `translate(${x},${y}) rotate(${(mid * 180) / Math.PI + (flip ? 180 : 0)})`;
      })
      .attr("text-anchor", (d) => {
        const mid = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
        return mid > Math.PI / 2 || mid < -Math.PI / 2 ? "end" : "start";
      })
      .text((d) => channels[d.index]!);

    // ── interactivity ──────────────────────────────────────────────────────
    const focusChannel = (idx: number | null) => {
      if (idx === null) {
        ribbons.attr("fill-opacity", 0.16).attr("stroke-opacity", 0.22);
        arcs.attr("fill-opacity", 0.92);
        labelGroup.selectAll("text").attr("fill-opacity", 1);
        return;
      }
      ribbons
        .attr("fill-opacity", (c) =>
          c.source.index === idx || c.target.index === idx ? 0.62 : 0.03,
        )
        .attr("stroke-opacity", (c) =>
          c.source.index === idx || c.target.index === idx ? 0.7 : 0.04,
        );
      arcs.attr("fill-opacity", (d) => (d.index === idx ? 1 : 0.22));
      labelGroup.selectAll<SVGTextElement, { index: number }>("text").attr("fill-opacity", (d) =>
        d.index === idx ? 1 : 0.28,
      );
    };

    const pointerXY = (event: PointerEvent | MouseEvent) => {
      const rect = (wrapRef.current as HTMLDivElement).getBoundingClientRect();
      return { x: event.clientX - rect.left + 14, y: event.clientY - rect.top + 14 };
    };

    arcs
      .on("mouseenter", function (_e, d) {
        focusChannel(d.index);
      })
      .on("mousemove", function (event, d) {
        const i = d.index;
        // top co-occurring partners
        const partners = matrix[i]!
          .map((v, j) => ({ j, v }))
          .filter((p) => p.v > 0 && p.j !== i)
          .sort((a, b) => b.v - a.v)
          .slice(0, 3);
        const { x, y } = pointerXY(event);
        setTip({
          x,
          y,
          lines: [
            { text: channels[i]!, color: colorOf(i) },
            { text: `${data.counts[channels[i]!] ?? 0} items`, dim: true },
            ...(partners.length
              ? [{ text: "shares with", dim: true }]
              : [{ text: "no shared items", dim: true }]),
            ...partners.map((p) => ({ text: `  ${channels[p.j]!} · ${p.v}`, dim: true })),
          ],
        });
      })
      .on("mouseleave", function () {
        focusChannel(null);
        setTip(null);
      });

    ribbons
      .on("mouseenter", function (_e, c) {
        d3.select(this).attr("fill-opacity", 0.72).attr("stroke-opacity", 0.85);
        ribbons.filter((d) => d !== c).attr("fill-opacity", 0.04).attr("stroke-opacity", 0.05);
        arcs.attr("fill-opacity", (d) =>
          d.index === c.source.index || d.index === c.target.index ? 1 : 0.22,
        );
      })
      .on("mousemove", function (event, c) {
        const { x, y } = pointerXY(event);
        const a = channels[c.source.index]!;
        const b = channels[c.target.index]!;
        const shared = data.matrix[c.source.index]![c.target.index]!;
        setTip({
          x,
          y,
          lines: [
            { text: `${a} ↔ ${b}`, color: colorOf(c.source.index) },
            { text: `${shared} shared item${shared === 1 ? "" : "s"}`, dim: true },
          ],
        });
      })
      .on("mouseleave", function () {
        focusChannel(null);
        setTip(null);
      });

    // ── entrance (transform/opacity only; skipped under reduced motion) ─────
    if (!reduce) {
      root.attr("transform", `translate(${cx},${cy}) scale(0.96)`).attr("opacity", 0);
      root
        .transition()
        .duration(520)
        .ease(d3.easeCubicOut)
        .attr("transform", `translate(${cx},${cy}) scale(1)`)
        .attr("opacity", 1);
    }
  }, [data, width]);

  if (data.channels.length === 0) {
    return (
      <div ref={wrapRef} className={styles.wrap} aria-label="Channel co-occurrence">
        <div className={styles.empty}>no channels to chart yet</div>
      </div>
    );
  }

  // The tooltip is ALWAYS mounted (toggled via opacity/visibility) — never
  // conditionally inserted as a sibling of the d3-owned <svg>, which would make
  // React reconcile around DOM it doesn't track (an insertBefore crash).
  return (
    <div ref={wrapRef} className={styles.wrap} aria-label="Channel co-occurrence chord diagram">
      <svg ref={svgRef} className={styles.svg} />
      <div
        className={styles.tip}
        style={{
          left: tip?.x ?? 0,
          top: tip?.y ?? 0,
          opacity: tip ? 1 : 0,
          visibility: tip ? "visible" : "hidden",
        }}
        role="status"
        aria-hidden={tip ? undefined : true}
      >
        {tip?.lines.map((l, i) => (
          <span
            key={i}
            className={l.dim ? styles.tipDim : styles.tipHead}
            style={l.color ? { color: l.color } : undefined}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}
