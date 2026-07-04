// apps/site/src/components/mdx/Timeline.tsx
//
// THE CHRONOMETER — a big, vertical, scroll-driven narrative timeline.
//
// Left: a tall STICKY instrument spine — a vertical rail with dated nodes, an
// amber progress column that descends as you scroll, and a large Fraunces
// readout of the active date. Right: a stack of per-event "beats", one roughly
// per viewport, each carrying its date + label + FULL detail prose (never
// hover-gated) plus a graphic — the author's `image` if supplied, otherwise a
// synthesised numeric "plate" (ordinal + elapsed-gap) so it's beautiful and
// text-forward with no media. As you scroll, the active beat lights, the spine's
// node highlights, and the progress column glides down to it — all off ONE
// position-based `active` recomputed from live geometry every frame (the proven
// <Scrolly>/<ScrollyTimeline> pattern: correct at any scroll position, immune to
// the late-hydration freeze a crossing-observer suffers).
//
// Degradation is first-class. Without the `.tl2--live` class (SSR, no-JS,
// reduced motion, or narrow viewports) the SAME markup collapses to a single
// column with a continuous left rail and every beat at full opacity — a clean,
// fully-readable vertical list. The scroll animation is pure enhancement; the
// chronology reads completely without it.
//
// Data-contract: unchanged `{ date, label, detail? }` plus OPTIONAL
// `{ image?, alt?, imageCaption? }`. Existing reads render identically.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  layoutTimeline,
  formatGap,
  type TimelineEvent,
  type TimelineNode,
} from "./lib/timeline-scale.js";
import { activeIndexFromScroll, sectionProgress, playheadFraction, clampIndex } from "./lib/scrolly-timeline.js";
import "./mdx.css";
import "./Timeline.css";

export interface TimelineProps {
  events: TimelineEvent[];
  caption?: string;
}

// One centered trigger line drives BOTH the active beat and the progress column,
// so the spine and the prose can never desync.
const TRIGGER_OFFSET = 0.5;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR → static
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The year token from a formatted date label ("22 Dec 218" → "218"). */
function yearOf(dateLabel: string): string {
  const parts = dateLabel.split(" ");
  return parts[parts.length - 1] ?? dateLabel;
}

export default function Timeline({ events, caption }: TimelineProps) {
  const safeEvents = Array.isArray(events) ? events : [];
  const [active, setActive] = useState(0);
  const [live, setLive] = useState(false); // SSR-safe default = static, fully-readable
  const [headerOffset, setHeaderOffset] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const beatsRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setLive(!prefersReducedMotion()), []);

  // Pin the spine just below the page's sticky global header (`.topbar`, above us
  // in z-order) so it never hides behind it. Header height varies by breakpoint,
  // so measure it live rather than hardcode.
  useEffect(() => {
    if (!live) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(".topbar");
      setHeaderOffset(bar ? Math.round(bar.getBoundingClientRect().height) : 0);
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [live]);

  // Pure, unit-tested layout: sorts by date and hands back each node's compact
  // date label (dateLabel) and epoch ms (t). We drive the SPINE with even
  // vertical fractions (one beat ≈ one equal scroll interval), so the axis reads
  // as an evenly-legible chronology rather than piling near-simultaneous events.
  const layout = safeEvents.length > 0 ? layoutTimeline(safeEvents, { width: 1000 }) : null;
  const nodes: TimelineNode[] = layout?.nodes ?? [];
  const n = nodes.length;
  const fracOf = (i: number): number => (n <= 1 ? 0 : i / (n - 1));

  // ── position-based active + progress column (rAF-throttled, passive) ─────────
  // The progress fraction is written DIRECTLY to the rail node (a CSS var) so the
  // column glides at 60fps without a React re-render per frame; `active` (which
  // changes rarely) drives the discrete highlights via state.
  useEffect(() => {
    if (!live || !rootRef.current || !beatsRef.current || n === 0) return;
    const beats = beatsRef.current;
    let frame = 0;
    const fractions = Array.from({ length: n }, (_, i) => fracOf(i));
    const recompute = () => {
      frame = 0;
      const r = beats.getBoundingClientRect();
      const p = sectionProgress(r.top, r.height, window.innerHeight);
      const fill = playheadFraction(p, fractions);
      railRef.current?.style.setProperty("--tl-progress", String(fill));
      const tops = Array.from(
        beats.querySelectorAll<HTMLElement>(".tl2-beat"),
        (el) => el.getBoundingClientRect().top,
      );
      const next = activeIndexFromScroll(tops, window.innerHeight, TRIGGER_OFFSET);
      setActive((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (frame) return; // one recompute per animation frame
      frame = requestAnimationFrame(recompute);
    };
    recompute(); // seed for the current scroll position at (late) hydration
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [live, n]);

  // Spine node → scroll its beat to the trigger line (progressive enhancement).
  const jumpTo = useCallback(
    (index: number) => {
      const beats = beatsRef.current;
      if (!beats) return;
      const i = clampIndex(index, n);
      const panel = beats.querySelectorAll<HTMLElement>(".tl2-beat")[i];
      if (!panel) return;
      panel.scrollIntoView({ behavior: live ? "smooth" : "auto", block: "center" });
      setActive(i);
    },
    [n, live],
  );

  // ── empty guard: never blank, never throw ──────────────────────────────────
  if (n === 0) {
    return caption ? (
      <figure className="mdx-figure mdx-figure--wide tl2">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  const activeIdx = clampIndex(active, n);
  const activeNode = nodes[activeIdx];
  const pad = (v: number): string => String(v).padStart(2, "0");

  return (
    <figure
      className={live ? "mdx-figure mdx-figure--wide tl2 tl2--live" : "mdx-figure mdx-figure--wide tl2"}
      ref={rootRef}
      style={{ ["--tl2-top" as string]: `${headerOffset}px` }}
    >
      <div className="tl2-grid">
        {/* ── LEFT: the sticky instrument spine ──────────────────────────── */}
        <aside className="tl2-spine">
          <div className="tl2-spine-sticky">
            <div className="tl2-readout" aria-hidden="true">
              <span className="tl2-readout-seq">
                {pad(activeIdx + 1)} <span className="tl2-readout-total">/ {pad(n)}</span>
              </span>
              <span className="tl2-readout-date">{activeNode?.dateLabel}</span>
              <span className="tl2-readout-label">{activeNode?.label}</span>
            </div>

            <div className="tl2-rail" ref={railRef}>
              <span className="tl2-rail-track" aria-hidden="true" />
              <span className="tl2-rail-fill" aria-hidden="true" />
              {nodes.map((node, i) => {
                const cls =
                  i === activeIdx
                    ? "tl2-node tl2-node--active"
                    : i < activeIdx
                      ? "tl2-node tl2-node--on"
                      : "tl2-node";
                return (
                  <button
                    key={`${node.t}-${i}`}
                    type="button"
                    className={cls}
                    style={{ top: `${8 + fracOf(i) * 84}%` }}
                    onClick={() => jumpTo(i)}
                    aria-label={`Jump to ${node.dateLabel}: ${node.label}`}
                  >
                    <span className="tl2-node-dot" aria-hidden="true" />
                    <span className="tl2-node-date">{node.dateLabel}</span>
                  </button>
                );
              })}
            </div>

            <p className="tl2-hint" aria-hidden="true">
              scroll to advance
            </p>
          </div>
        </aside>

        {/* live region: announce the active event to assistive tech */}
        <p className="tl2-sr-live" aria-live="polite">
          {`Event ${activeIdx + 1} of ${n}: ${activeNode?.dateLabel ?? ""}, ${activeNode?.label ?? ""}`}
        </p>

        {/* ── RIGHT: the scrolling beats (every one always fully readable) ── */}
        <div className="tl2-beats" ref={beatsRef}>
          {nodes.map((node, i) => {
            const prevGap = i > 0 ? formatGap(node.t - nodes[i - 1].t) : "";
            const cls = i === activeIdx ? "tl2-beat tl2-beat--active" : "tl2-beat";
            return (
              <section className={cls} key={`${node.t}-${i}`}>
                <span className="tl2-beat-node" aria-hidden="true" />
                <div className="tl2-beat-body">
                  <div className="tl2-beat-graphic">
                    {node.image ? (
                      <div className="tl2-plate tl2-plate--image">
                        <img src={node.image} alt={node.alt ?? node.label} loading="lazy" />
                        {node.imageCaption ? (
                          <span className="tl2-plate-credit">{node.imageCaption}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="tl2-plate" aria-hidden="true">
                        <span className="tl2-plate-index">{pad(i + 1)}</span>
                        <span className="tl2-plate-meta">
                          <span className="tl2-plate-year">{yearOf(node.dateLabel)}</span>
                          <span className="tl2-plate-gap">
                            {i === 0 ? "opening" : prevGap || "—"}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="tl2-beat-text">
                    <div className="tl2-beat-head">
                      <span className="tl2-beat-date">{node.dateLabel}</span>
                    </div>
                    <h3 className="tl2-beat-label">{node.label}</h3>
                    {node.detail ? <p className="tl2-beat-detail">{node.detail}</p> : null}
                  </div>
                </div>
              </section>
            );
          })}
          {/* Runway so the LAST beat can still scroll up to the centered trigger
              line (otherwise the final event never becomes active at max scroll).
              Inert in the static layout (collapsed by CSS when not live). */}
          <div className="tl2-tail" aria-hidden="true" />
        </div>
      </div>

      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
