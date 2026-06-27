// CLUSTERS · circle-packing bubbles — every converged story as a circle, sized by
// how many items landed in it, colored by GROUP, brightened by taste. Hover for the
// title / size / taste. Clusters carry no item id, so there is no click-through
// (the `base` prop is accepted for signature stability but intentionally unused).
//
// SSR-safe React 19 island: the server renders a sized container; all d3/DOM work
// runs in useEffect after mount. Animates transform/opacity only; honors
// prefers-reduced-motion. Responsive via ResizeObserver.
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { channelGroup, GROUP_COLORS, type ClusterDatum } from "./lib/build-analytics";
import styles from "./ClusterBubbles.module.css";

interface Tip {
  x: number;
  y: number;
  title: string;
  channel: string;
  size: number;
  taste: number;
  color: string;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export default function ClusterBubbles({
  data,
  base,
}: {
  data: ClusterDatum[];
  base: string;
}) {
  void base; // clusters have no item id → no click-through; kept for signature
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);

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

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0 || data.length === 0) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const W = Math.max(280, width);
    const H = Math.max(360, Math.min(560, Math.round(W * 0.62)));

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("width", "100%")
      .attr("height", H)
      .attr("role", "img")
      .attr("aria-label", `Cluster bubble chart, ${data.length} clusters`);

    // Most clusters are singletons; size barely varies, so sqrt-scale the radius
    // and add a small floor so even size-1 bubbles are tappable, while the rare
    // multi-item clusters still read distinctly larger.
    const maxTaste = d3.max(data, (d) => d.taste) ?? 1;

    type Node = ClusterDatum & { value: number };
    const root = d3
      .hierarchy<{ children: Node[] }>({
        children: data.map((d) => ({ ...d, value: d.size })),
      })
      .sum((d) => (d as unknown as Node).value ?? 0);

    d3.pack<{ children: Node[] }>().size([W, H]).padding(3)(root);

    const leaves = root.leaves() as unknown as d3.HierarchyCircularNode<Node>[];

    const colorOf = (d: Node) => GROUP_COLORS[channelGroup(d.channel)] ?? GROUP_COLORS.science!;
    const opacityOf = (d: Node) => 0.42 + 0.5 * (maxTaste > 0 ? d.taste / maxTaste : 0);

    const g = svg.append("g");
    const node = g
      .selectAll("g")
      .data(leaves)
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    node
      .append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => colorOf(d.data))
      .attr("fill-opacity", (d) => opacityOf(d.data))
      .attr("stroke", (d) => colorOf(d.data))
      .attr("stroke-opacity", 0.55)
      .attr("stroke-width", 1)
      .style("cursor", "default");

    // Labels only inside bubbles large enough to hold them; wrap to ~2 lines.
    node
      .filter((d) => d.r >= 26)
      .each(function (d) {
        const sel = d3.select(this);
        const maxChars = Math.max(4, Math.floor(d.r / 3.2));
        const words = truncate(d.data.title, maxChars * 2).split(/\s+/);
        const lines: string[] = [];
        let cur = "";
        for (const w of words) {
          if ((cur + " " + w).trim().length > maxChars && cur) {
            lines.push(cur);
            cur = w;
          } else {
            cur = (cur + " " + w).trim();
          }
          if (lines.length >= 2) break;
        }
        if (cur && lines.length < 2) lines.push(cur);
        const shown = lines.slice(0, 2);
        const lh = 11;
        const y0 = -((shown.length - 1) * lh) / 2;
        sel
          .selectAll("text")
          .data(shown)
          .join("text")
          .attr("class", styles.label)
          .attr("text-anchor", "middle")
          .attr("y", (_t, i) => y0 + i * lh)
          .attr("dy", "0.32em")
          .text((t, i) => (i === 1 && shown.length === 2 ? truncate(t, maxChars) : t));
      });

    // ── interactivity (hover only) ─────────────────────────────────────────
    const pointerXY = (event: MouseEvent) => {
      const rect = (wrapRef.current as HTMLDivElement).getBoundingClientRect();
      return { x: event.clientX - rect.left + 14, y: event.clientY - rect.top + 14 };
    };

    node
      .on("mouseenter", function (_e, d) {
        d3.select(this).select("circle").attr("fill-opacity", Math.min(1, opacityOf(d.data) + 0.25)).attr("stroke-opacity", 1);
        node
          .filter((o) => o !== d)
          .select("circle")
          .attr("fill-opacity", (o) => opacityOf((o as d3.HierarchyCircularNode<Node>).data) * 0.4);
      })
      .on("mousemove", function (event, d) {
        const { x, y } = pointerXY(event);
        setTip({
          x,
          y,
          title: d.data.title,
          channel: d.data.channel,
          size: d.data.size,
          taste: d.data.taste,
          color: colorOf(d.data),
        });
      })
      .on("mouseleave", function () {
        node.select("circle").attr("fill-opacity", (o) => opacityOf((o as d3.HierarchyCircularNode<Node>).data)).attr("stroke-opacity", 0.55);
        setTip(null);
      });

    // ── entrance — staggered scale-in (transform only), skipped if reduced ──
    if (!reduce) {
      node
        .attr("transform", (d) => `translate(${d.x},${d.y}) scale(0)`)
        .transition()
        .delay((_d, i) => Math.min(600, i * 6))
        .duration(420)
        .ease(d3.easeBackOut.overshoot(1.4))
        .attr("transform", (d) => `translate(${d.x},${d.y}) scale(1)`);
    }
  }, [data, width]);

  if (data.length === 0) {
    return (
      <div ref={wrapRef} className={styles.wrap} aria-label="Story clusters">
        <div className={styles.empty}>
          no converged stories yet — clusters form when several sources land on the
          same thread
        </div>
      </div>
    );
  }

  // Tooltip ALWAYS mounted (toggled via opacity/visibility) so React never has to
  // reconcile a sibling around the d3-owned <svg> (avoids an insertBefore crash).
  return (
    <div ref={wrapRef} className={styles.wrap} aria-label="Story clusters bubble chart">
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
        <span className={styles.tipHead}>{tip?.title ?? ""}</span>
        <span className={styles.tipMeta}>
          <span style={{ color: tip?.color }}>{tip?.channel ?? ""}</span>
          {tip ? ` · ${tip.size} item${tip.size === 1 ? "" : "s"} · taste ${tip.taste.toFixed(1)}` : ""}
        </span>
      </div>
    </div>
  );
}
