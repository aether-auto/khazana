// apps/site/src/components/mdx/LayerStack.tsx
//
// An exploded / stacked layer view — a network stack, the OSI model, filesystem
// layers, a render pipeline — where each layer is a hairline slab and clicking
// or hovering it expands its `note` (and optional `detail`) to show that layer's
// role. Stacked slabs on --bg-raised, an amber active edge.
//
// ── Why a React island (not a pure Astro <details>) ──────────────────────────
// The spec calls for single-selection expand on click/hover with an amber active
// edge and a reduced-motion "all expanded" end state. Hover-to-expand + one-open-
// at-a-time needs client state, so this is a `client:visible` island. But the
// SSR / no-JS / reduced-motion render is exactly the end state — EVERY layer
// expanded with its note+detail visible — so the figure is never blank and needs
// no JS to be fully informative. (A <details> per layer was considered but can't
// express single-selection + hover + the shared amber active rail.)
//
// ── Invariants honored ───────────────────────────────────────────────────────
//  • SSR / no-JS: all layers rendered with label + note (+ detail) as a semantic
//    list — never blank.
//  • reduced-motion / no-JS: every layer expanded (end state), zero animation.
//  • Slabs stack full-width and wrap; no horizontal overflow at 360px.
//  • `caption` wraps in .mdx-figure; all props serializable (note/detail strings).
import { useEffect, useState } from "react";
import {
  type Layer,
  type LayerOrientation,
  toggleActive,
  clampActive,
  isExpanded,
  stepActive,
} from "./lib/layer-stack.js";
import "./mdx.css";
import "./LayerStack.css";

export interface LayerStackProps {
  /** The layers, top-to-bottom as authored. Each carries a role `note`. */
  layers: Layer[];
  /** Only "vertical" is supported in v1 (kept for forward-compat). */
  orientation?: LayerOrientation;
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR → all expanded
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function LayerStack({ layers, caption }: LayerStackProps) {
  const safeLayers = Array.isArray(layers) ? layers : [];
  const count = safeLayers.length;

  // SSR-safe defaults: reduced (no animation) → EVERY layer expanded. This is
  // exactly the no-JS / reduced-motion end state, so the static markup is never
  // blank and never mid-collapse. Only after mount do we (for motion users) opt
  // into single-selection collapse.
  const [reduced, setReduced] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const r = prefersReducedMotion();
    setReduced(r);
    setMounted(true);
    // Motion path starts collapsed (single-selection); reduced stays all-open.
    if (!r) setActive(null);
  }, []);

  // Empty stack → caption-only figure or nothing; never throws.
  if (count === 0) {
    return caption ? (
      <figure className="mdx-figure ls">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  const effReduced = !mounted || reduced;
  const activeIdx = clampActive(active, count);

  const onToggle = (i: number) => setActive((cur) => toggleActive(cur, i));
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const next = stepActive(e.key, active ?? i, count);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  };

  return (
    <figure className={mounted ? "mdx-figure ls ls--js" : "mdx-figure ls"}>
      <div className="mdx-panel ls-panel">
        {/*
          An ordered list IS the render (a layer stack is inherently ordered):
          correct for SSR, no-JS, reduced-motion AND the interactive path. JS only
          toggles the `--expanded` class; without it every layer's note+detail is
          visible (the .ls (no --js) CSS keeps all slabs open).
        */}
        <ol className="ls-stack" aria-label={caption ? `Layer stack: ${caption}` : "Layer stack"}>
          {safeLayers.map((layer, i) => {
            const expanded = isExpanded(i, activeIdx, effReduced);
            const bodyId = `ls-body-${i}`;
            return (
              <li
                key={i}
                className={"ls-layer" + (expanded ? " ls-layer--expanded" : "")}
              >
                <button
                  type="button"
                  className="ls-slab"
                  aria-expanded={expanded}
                  aria-controls={bodyId}
                  onClick={() => onToggle(i)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <span className="ls-index" aria-hidden="true">
                    {count - i}
                  </span>
                  <span className="ls-label">{layer.label}</span>
                  <span className="ls-chevron" aria-hidden="true" />
                </button>
                <div id={bodyId} className="ls-body" role="region" aria-label={layer.label}>
                  <p className="ls-note">{layer.note}</p>
                  {layer.detail ? <p className="ls-detail">{layer.detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}

export type { Layer };
