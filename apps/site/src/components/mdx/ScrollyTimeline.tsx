// apps/site/src/components/mdx/ScrollyTimeline.tsx
//
// A BIG, interactive, scroll- AND scrub-driven narrative timeline. The spine (a
// horizontal rail with event ticks, date labels, and an amber playhead) stays
// PINNED (sticky) while the reader scrolls a tall stack of per-event prose
// panels. As they scroll, the playhead glides along the rail and the active
// event's prose lights up — in LOCKSTEP, because both read one position-based
// `active` recomputed from live geometry every frame (rAF-throttled). The rail
// is also a real SCRUBBER: drag the playhead or click a tick to jump the page
// to that event's prose. Two-way.
//
// Authoring is data-driven (a serializable `events` prop), for the same reason
// <Scrolly> is: Astro hands MDX children to a React island as opaque Astro-JSX,
// so a wrapper can't introspect/render them. Each event carries its own prose
// HTML string.
//
// Under reduced-motion / no-JS / SSR it degrades to a clean, accessible STACKED
// layout: a semantic ordered list of dated events, each followed by its full
// prose. Never blank, never janky, everything visible.

import { useCallback, useEffect, useRef, useState } from "react";
import { layoutTimeline, type TimelineEvent } from "./lib/timeline-scale.js";
import {
  activeIndexFromScroll,
  sectionProgress,
  playheadFraction,
  nearestIndexByX,
  indexToScrollY,
  clampIndex,
  reachedScrollTarget,
} from "./lib/scrolly-timeline.js";
import "./mdx.css";
import "./ScrollyTimeline.css";

export interface ScrollyTimelineEvent extends TimelineEvent {
  /** the event's narrative prose, as an HTML string (several sentences ok). */
  prose: string;
}

export interface ScrollyTimelineProps {
  events: ScrollyTimelineEvent[];
  caption?: string;
}

// Rail is laid out in this fixed SVG coordinate space, then scaled to the panel
// width via viewBox so all geometry stays resolution-independent.
const RAIL_W = 1000;
const RAIL_Y = 64; // y of the rail within the spine SVG
const SPINE_H = 132; // spine SVG height (rail + ticks + date labels)
// One centered trigger line drives BOTH the playhead snap and the active prose,
// so they can never desync.
const TRIGGER_OFFSET = 0.5;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR → stacked
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ScrollyTimeline({ events, caption }: ScrollyTimelineProps) {
  const safeEvents = Array.isArray(events) ? events : [];
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(true); // SSR-safe default = stacked
  const [progress, setProgress] = useState(0); // continuous 0..1 for the glide
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<SVGSVGElement | null>(null);
  // Live drag flag read by the pointer-move handler — a `dragging` state closure
  // would be stale for the moves that arrive in the same tick as pointerdown.
  const draggingRef = useRef(false);
  // While a SMOOTH programmatic jump (tick click / keyboard) is in flight, this
  // holds { idx, y } — the target index and the (clamped) target scrollY. The
  // scroll handler suppresses its position-based setActive until scrollY reaches
  // y, so the in-transit position can't overwrite `active` one event short
  // (bug #2). Cleared on arrival or on `scrollend`.
  const jumpRef = useRef<{ idx: number; y: number } | null>(null);

  const [headerOffset, setHeaderOffset] = useState(0);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  // The page has a sticky global header (`.topbar`, z-index above us). Pin the
  // spine just BELOW it so it never hides behind the header. The header height
  // varies (and differs desktop vs mobile), so we measure it live rather than
  // hardcode — the only robust option without touching shared chrome.
  useEffect(() => {
    if (reduced) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(".topbar");
      setHeaderOffset(bar ? Math.round(bar.getBoundingClientRect().height) : 0);
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, [reduced]);

  // Pure spine geometry (proportional + compressed placement, adaptive ticks,
  // de-collided date labels) — shared with the at-a-glance <Timeline> so the
  // rail reads identically. We only need node x/date here.
  const layout =
    safeEvents.length > 0 ? layoutTimeline(safeEvents, { width: RAIL_W }) : null;
  const nodes = layout?.nodes ?? [];
  const tickXs = nodes.map((n) => n.x);
  const tickFractions = tickXs.map((x) => x / RAIL_W);

  // ── position-based active + continuous progress (rAF-throttled) ─────────────
  useEffect(() => {
    if (reduced || !rootRef.current || safeEvents.length === 0) return;
    const root = rootRef.current;
    let frame = 0;
    const recompute = () => {
      frame = 0;
      // Always glide the playhead from the live scroll position…
      const stack = root.querySelector<HTMLElement>(".sctl-stack");
      if (stack) {
        const r = stack.getBoundingClientRect();
        const p = sectionProgress(r.top, r.height, window.innerHeight);
        setProgress((cur) => (Math.abs(cur - p) < 0.0005 ? cur : p));
      }
      // …but while a smooth jump is in flight, DON'T let the in-transit scroll
      // position drag `active` one event short (bug #2). Hold the target until
      // the scroll arrives, then resume position-based tracking.
      const jump = jumpRef.current;
      if (jump) {
        if (reachedScrollTarget(window.scrollY, jump.y)) {
          jumpRef.current = null;
        } else {
          return;
        }
      }
      const panels = root.querySelectorAll<HTMLElement>(".sctl-panel");
      const tops = Array.from(panels, (n) => n.getBoundingClientRect().top);
      const next = activeIndexFromScroll(tops, window.innerHeight, TRIGGER_OFFSET);
      setActive((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (frame) return; // one recompute per frame
      frame = requestAnimationFrame(recompute);
    };
    // `scrollend` (where supported) is the authoritative "jump finished" signal;
    // clear any in-flight jump and reconcile immediately.
    const onScrollEnd = () => {
      jumpRef.current = null;
      if (!frame) frame = requestAnimationFrame(recompute);
    };
    recompute(); // seed for the current scroll position at (late) hydration
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", onScrollEnd, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced, safeEvents.length]);

  // ── scrub → scroll: jump the page so a target event becomes active ──────────
  // `instant` (during a live drag) scrolls without smooth-animation so the
  // playhead tracks the finger 1:1; a click/keyboard jump scrolls smoothly.
  const jumpTo = useCallback(
    (index: number, instant: boolean) => {
      const root = rootRef.current;
      if (!root) return;
      const i = clampIndex(index, safeEvents.length);
      const panels = root.querySelectorAll<HTMLElement>(".sctl-panel");
      const panel = panels[i];
      if (!panel) return;
      const top = panel.getBoundingClientRect().top;
      // +8px overshoot so the target panel lands just PAST the trigger line
      // rather than exactly on it — otherwise sub-pixel rounding can leave it a
      // hair short and the active resolver (top <= line) won't promote it.
      const wanted = indexToScrollY(top, window.scrollY, window.innerHeight, TRIGGER_OFFSET) + 8;
      // Clamp to the real scrollable range so the "arrived" check can resolve
      // even when the last event's target is beyond document max.
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      const targetY = Math.max(0, Math.min(wanted, maxY));
      if (instant || reachedScrollTarget(window.scrollY, targetY)) {
        // Drag (synchronous), or a jump that needs no real scroll: no suppression
        // — and clear any stale guard so tracking can't freeze (a no-op scrollTo
        // fires neither `scroll` nor `scrollend`).
        jumpRef.current = null;
      } else {
        // Smooth jump: suppress position-based setActive until we ARRIVE, so the
        // in-transit scroll position can't pin `active` one event short (bug #2).
        jumpRef.current = { idx: i, y: targetY };
      }
      window.scrollTo({ top: targetY, behavior: instant ? "auto" : "smooth" });
      setActive(i); // optimistic; the scroll handler reconciles on arrival
    },
    [safeEvents.length],
  );

  // Map a client x to an SVG x coordinate [0, RAIL_W] EXACTLY, via the SVG's own
  // screen transform — correct regardless of `preserveAspectRatio` letterboxing
  // (a plain rect-fraction would be wrong when the viewBox is letterboxed).
  const clientXToSvgX = useCallback((clientX: number): number => {
    const svg = railRef.current;
    if (!svg) return 0;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      const rect = svg.getBoundingClientRect();
      return rect.width > 0 ? ((clientX - rect.left) / rect.width) * RAIL_W : 0;
    }
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    return pt.matrixTransform(ctm.inverse()).x;
  }, []);

  // Slider drag. On pointerdown we set pointer capture on the rail so EVERY
  // subsequent pointermove/up is delivered to the rail element (the browser
  // routes captured pointer events there regardless of what's under the cursor),
  // then handle them via the rail's own React pointer props. `draggingRef`
  // (not the `dragging` state) gates moves so the first moves in the same tick
  // as pointerdown aren't dropped by a stale state closure.
  const onRailPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (reduced || tickXs.length === 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      draggingRef.current = true;
      setDragging(true);
      jumpTo(nearestIndexByX(clientXToSvgX(e.clientX), tickXs), true);
    },
    [reduced, tickXs, clientXToSvgX, jumpTo],
  );

  const onRailPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!draggingRef.current || tickXs.length === 0) return;
      jumpTo(nearestIndexByX(clientXToSvgX(e.clientX), tickXs), true);
    },
    [tickXs, clientXToSvgX, jumpTo],
  );

  const onRailPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  // Keyboard stepping on the slider (← / → / Home / End).
  const onSliderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (tickXs.length === 0) return;
      let next: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") next = active + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = active - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = safeEvents.length - 1;
      if (next != null) {
        e.preventDefault();
        jumpTo(next, false);
      }
    },
    [active, tickXs.length, safeEvents.length, jumpTo],
  );

  // ── empty guard: never blank, never throw ──────────────────────────────────
  if (safeEvents.length === 0) {
    return caption ? (
      <figure className="mdx-figure mdx-figure--wide sctl sctl--stacked">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  // ── stacked fallback (SSR / no-JS / reduced motion): everything visible ─────
  if (reduced) {
    return (
      <figure className="mdx-figure mdx-figure--wide sctl sctl--stacked">
        <ol className="sctl-stacked-list">
          {safeEvents.map((ev, i) => (
            <li className="sctl-stacked-item" key={i}>
              <div className="sctl-stacked-head">
                <span className="sctl-stacked-date">{nodes[i]?.dateLabel ?? ev.date}</span>
                <span className="sctl-stacked-label">{ev.label}</span>
              </div>
              <div
                className="sctl-stacked-prose"
                dangerouslySetInnerHTML={{ __html: ev.prose }}
              />
            </li>
          ))}
        </ol>
        {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  const activeIdx = clampIndex(active, safeEvents.length);
  const headFrac = playheadFraction(progress, tickFractions);
  const headX = headFrac * RAIL_W;
  const activeNode = nodes[activeIdx];

  return (
    <figure
      className="mdx-figure mdx-figure--wide sctl"
      ref={rootRef}
      style={{ ["--sctl-top" as string]: `${headerOffset}px` }}
    >
      {/* ── the pinned spine ────────────────────────────────────────────── */}
      <div className="sctl-spine">
        <div className="sctl-spine-inner">
          <div className="sctl-readout" aria-hidden="true">
            <span className="sctl-readout-date">{activeNode?.dateLabel}</span>
            <span className="sctl-readout-label">{activeNode?.label}</span>
          </div>
          <svg
            className="sctl-rail"
            ref={railRef}
            viewBox={`0 0 ${RAIL_W} ${SPINE_H}`}
            preserveAspectRatio="xMidYMid meet"
            role="slider"
            tabIndex={0}
            aria-label={caption ? `Timeline scrubber: ${caption}` : "Timeline scrubber"}
            aria-valuemin={0}
            aria-valuemax={safeEvents.length - 1}
            aria-valuenow={activeIdx}
            aria-valuetext={`${activeNode?.dateLabel ?? ""}: ${activeNode?.label ?? ""}`}
            onKeyDown={onSliderKeyDown}
            onPointerDown={onRailPointerDown}
            onPointerMove={onRailPointerMove}
            onPointerUp={onRailPointerUp}
            onPointerCancel={onRailPointerUp}
          >
            <defs>
              <linearGradient id="sctl-rail-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="var(--sctl-rail-fade)" />
                <stop offset="0.04" stopColor="var(--sctl-rail)" />
                <stop offset="0.96" stopColor="var(--sctl-rail)" />
                <stop offset="1" stopColor="var(--sctl-rail-fade)" />
              </linearGradient>
            </defs>

            {/* the rail */}
            <line className="sctl-rail-line" x1={0} y1={RAIL_Y} x2={RAIL_W} y2={RAIL_Y} />
            {/* the filled-so-far portion (from first tick to the playhead) */}
            <line
              className="sctl-rail-fill"
              x1={tickXs[0] ?? 0}
              y1={RAIL_Y}
              x2={headX}
              y2={RAIL_Y}
            />

            {/* event ticks + date labels */}
            {nodes.map((node, i) => {
              const on = i <= activeIdx;
              return (
                <g
                  key={`${node.t}-${i}`}
                  className={i === activeIdx ? "sctl-tick sctl-tick--active" : on ? "sctl-tick sctl-tick--on" : "sctl-tick"}
                  onClick={() => jumpTo(i, false)}
                >
                  <line x1={node.x} y1={RAIL_Y - 9} x2={node.x} y2={RAIL_Y + 9} className="sctl-tick-line" />
                  <circle cx={node.x} cy={RAIL_Y} r={i === activeIdx ? 5 : 3.5} className="sctl-tick-dot" />
                  <text
                    x={node.x}
                    y={RAIL_Y + 26}
                    textAnchor={node.anchor}
                    className="sctl-tick-date"
                  >
                    {node.dateLabel}
                  </text>
                </g>
              );
            })}

            {/* the amber playhead */}
            <g className={dragging ? "sctl-playhead sctl-playhead--drag" : "sctl-playhead"}>
              <line x1={headX} y1={RAIL_Y - 22} x2={headX} y2={RAIL_Y + 14} className="sctl-playhead-stem" />
              <circle cx={headX} cy={RAIL_Y} r={9} className="sctl-playhead-halo" />
              <circle cx={headX} cy={RAIL_Y} r={6} className="sctl-playhead-dot" />
              <path d={`M ${headX} ${RAIL_Y - 30} l 7 -10 l -14 0 z`} className="sctl-playhead-flag" />
            </g>
          </svg>

          <p className="sctl-hint" aria-hidden="true">scroll to advance · drag or click the rail to jump</p>
        </div>
      </div>

      {/* live region: announce the active event to AT */}
      <p className="sctl-sr-live" aria-live="polite">
        {`Event ${activeIdx + 1} of ${safeEvents.length}: ${activeNode?.dateLabel ?? ""}, ${activeNode?.label ?? ""}`}
      </p>

      {/* ── the scrollable prose stack (one viewport-ish per event) ───────── */}
      <div className="sctl-stack">
        {safeEvents.map((ev, i) => (
          <section
            className={i === activeIdx ? "sctl-panel sctl-panel--active" : "sctl-panel"}
            key={i}
            aria-hidden={i === activeIdx ? undefined : true}
          >
            <div className="sctl-panel-inner">
              <div className="sctl-panel-head">
                <span className="sctl-panel-date">{nodes[i]?.dateLabel ?? ev.date}</span>
                <h3 className="sctl-panel-label">{ev.label}</h3>
              </div>
              <div className="sctl-panel-prose" dangerouslySetInnerHTML={{ __html: ev.prose }} />
            </div>
          </section>
        ))}
        {/* Scroll runway so the LAST event's panel can still scroll up to the
            centered trigger line (otherwise the final event is never reachable
            by scroll/click/drag — it sits below the line at max scroll). */}
        <div className="sctl-tail" aria-hidden="true" />
      </div>

      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
