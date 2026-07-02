// apps/site/src/components/mdx/EventCascade.tsx
//
// A vertical cascade of causally-linked events — X → because → Y → therefore →
// Z. This is distinct from <Timeline>, which is time-SCALED: EventCascade is a
// CAUSAL CHAIN, not a clock. The connective tissue between nodes is a literal
// drawn amber rule — the "spine" of the story — and each link carries a causal
// connector word ("therefore", "which drives"). Scroll reveals each node and
// draws the spine down to it; hover/focus surfaces that node's `detail`.
//
// ── Why this is DATA-DRIVEN (not children-introspecting) ─────────────────────
// Astro hands MDX children to a React `client:*` island as opaque Astro-JSX
// virtual nodes, NOT React elements — a wrapper island can neither introspect
// nor render them. So the chain arrives as a SERIALIZABLE `nodes` prop (plain
// {label, detail, kind} objects); `detail` is a STRING, never MDX children.
//
// ── Why reveal is POSITION-BASED (not crossing-event based) ───────────────────
// EventCascade is `client:visible`, so it hydrates LATE (well down the page). A
// crossing-observer set up at that moment only fires on SUBSEQUENT crossings, so
// the reveal count would freeze wherever it landed at hydration. Instead we
// recompute how many nodes are revealed from each node's CURRENT viewport top on
// every scroll/resize (rAF-throttled, passive) via the pure `revealedFromScroll`
// — correct at ANY scroll position, including right after late hydration.
//
// Invariants honored: SSR / no-JS fallback is a non-blank semantic <ol> carrying
// every node + every detail; reduced-motion renders the fully-revealed end state
// with zero animation; the figure never invades the prose column; long labels
// and details wrap (no horizontal overflow at 360px); `caption` wraps in
// .mdx-figure. All reveal/link math lives in ./lib/event-cascade.ts (unit-tested).
import { useEffect, useRef, useState } from "react";
import {
  type CascadeNode,
  connectorLabel,
  clampRevealCount,
  isNodeRevealed,
  isLinkRevealed,
  revealedFromScroll,
  REVEAL_TRIGGER_OFFSET,
} from "./lib/event-cascade.js";
import "./mdx.css";
import "./EventCascade.css";

export interface EventCascadeProps {
  /** The ordered causal chain. `detail` is a plain string (serializable). */
  nodes: CascadeNode[];
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR → fully revealed
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function EventCascade({ nodes, caption }: EventCascadeProps) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const count = safeNodes.length;

  // SSR-safe defaults: reduced (no animation) + everything revealed. This is
  // exactly the no-JS / reduced-motion end state, so the static HTML is never
  // blank and never mid-reveal. Effects below opt into scroll-driven reveal only
  // once we know the client prefers motion.
  const [reduced, setReduced] = useState(true);
  const [revealed, setRevealed] = useState(count);
  // Which node's detail popover is open (hover/focus). null = none.
  const [active, setActive] = useState<number | null>(null);
  // `mounted` gates the "start hidden" reveal styling on JS being live. The
  // static SSR / no-JS render lacks the `.ec--js` class, so the CSS keeps every
  // node visible — the fallback is never blank. Only after hydration do we opt
  // into the hidden-until-revealed scroll animation.
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const r = prefersReducedMotion();
    setReduced(r);
    setMounted(true);
    // Motion path starts fully hidden and reveals on scroll; reduced stays full.
    if (!r) setRevealed(0);
  }, []);

  // Position-based reveal: recompute how many nodes are revealed from each
  // node's current viewport top on every scroll/resize. Seeded once on mount so
  // the first frame after (late) hydration is already correct for the current
  // scroll position — no freeze, no jump.
  useEffect(() => {
    if (reduced || !rootRef.current || count === 0) return;
    const root = rootRef.current;
    let frame = 0;
    const recompute = () => {
      frame = 0;
      const items = root.querySelectorAll<HTMLElement>(".ec-node");
      const tops = Array.from(items, (n) => n.getBoundingClientRect().top);
      const next = revealedFromScroll(tops, window.innerHeight, REVEAL_TRIGGER_OFFSET);
      setRevealed((cur) => (cur === next ? cur : next));
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
  }, [reduced, count]);

  // Empty chain → caption-only figure or nothing; never throws, never blank-box.
  if (count === 0) {
    return caption ? (
      <figure className="mdx-figure ec">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  const shown = reduced ? count : clampRevealCount(revealed, count);

  return (
    <figure
      className={mounted ? "mdx-figure ec ec--js" : "mdx-figure ec"}
      ref={rootRef}
    >
      {/*
        Semantic ordered list IS the render (not a hidden fallback): the causal
        chain is inherently ordered, so <ol>/<li> is correct for SSR, no-JS,
        reduced-motion AND the interactive path. JS only toggles the `--revealed`
        / `--open` classes; without it every node + detail is fully visible.
      */}
      <ol className="ec-chain" aria-label={caption ? `Causal chain: ${caption}` : "Causal chain"}>
        {safeNodes.map((node, i) => {
          const kind = node.kind ?? "effect";
          const nodeShown = reduced || isNodeRevealed(i, shown);
          const linkShown = reduced || isLinkRevealed(i, shown, count);
          const isFirst = i === 0;
          const isOpen = active === i;
          const detailId = `ec-detail-${i}`;
          return (
            <li
              key={i}
              className={
                "ec-node" +
                ` ec-node--${kind}` +
                (nodeShown ? " ec-node--revealed" : "") +
                (isOpen ? " ec-node--open" : "")
              }
            >
              {/*
                The spine: a drawn amber rule down the left rail, plus the causal
                connector word on the link INTO this node. The connector is the
                thing that makes this a causal chain and not a clock. First node
                has no incoming link; last node has no outgoing link.
              */}
              {!isFirst ? (
                <span
                  className={"ec-connector" + (linkShown ? " ec-connector--revealed" : "")}
                  aria-hidden="true"
                >
                  {connectorLabel(kind)}
                </span>
              ) : null}
              <span className="ec-rail" aria-hidden="true">
                <span className="ec-rail-line" />
                <span className="ec-marker" />
              </span>
              <div className="ec-body">
                {/*
                  The node reveals its detail on hover/focus/tap — same accessible
                  pattern as <Annotation>: aria-expanded on the trigger,
                  aria-describedby to the note so the detail is exposed to AT even
                  in the static DOM. The detail is ALWAYS in the markup (no-JS
                  reads it via .ec-detail below); JS only toggles its visibility.
                */}
                <button
                  type="button"
                  className="ec-label"
                  aria-describedby={detailId}
                  aria-expanded={isOpen}
                  onClick={() => setActive((c) => (c === i ? null : i))}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((c) => (c === i ? null : c))}
                >
                  <span className="ec-kind">{kind === "turning-point" ? "turning point" : kind}</span>
                  <span className="ec-label-text">{node.label}</span>
                </button>
                <p id={detailId} role="note" className="ec-detail">
                  {node.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
