// apps/site/src/components/mdx/BattleMap.tsx
//
// BattleMap — RELIVE a battle/operation phase by phase. A committed, already-
// optimized map/terrain image is the BASE (like <AnnotatedFigure>: the read
// passes an optimized `src`+`width`+`height` from getImage(), the island does
// NOT import assets). Over it, a single SVG overlay — sharing the image's own
// `width × height` viewBox so it registers EXACTLY over the terrain at any size —
// draws the current phase's UNITS (NATO-style glyphs), MOVEMENT ARROWS
// (advance/attack/retreat/supply, draw-on animated), and FRONT LINES / control
// areas. A phase scrubber (modeled on <ScrollyTimeline>'s slider + <Stepper>'s
// prev/next) steps through the battle; the overlay + the phase note update per
// phase.
//
// Why data-driven / serializable props (not MDX children): Astro hands MDX
// children to a React island as opaque Astro-JSX it can't introspect. So every
// phase carries its `note` as an HTML string, and units/movements/fronts are
// plain arrays of coordinates — the island renders inside its own React tree so
// it hydrates intact (the Scrolly/Stepper contract).
//
// Fallbacks (NEVER blank, all mandatory):
//   • SSR / no-JS → the base image + the FIRST phase's overlay render statically,
//     PLUS a semantic phase-by-phase <ol> (each phase's title/time/note and its
//     units/movements as text) PLUS the legend. Fully informative unstyled.
//   • prefers-reduced-motion → phase changes + arrows are INSTANT (no draw
//     animation); the current phase's END STATE is shown.
//   • No 360px overflow: the <img> is width:100% and the SVG shares its viewBox
//     (percent coords), controls + legend wrap, hover popovers stay on-screen.
//
// All pure geometry (phase indexing, glyph shapes, coord→SVG, arrow paths,
// side→token color) lives in ./lib/battle-map.ts and is unit-tested there.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveSides,
  sideById,
  clampPhase,
  canGoPrev,
  canGoNext,
  stepPhase,
  toSvg,
  popoverSide,
  unitGlyph,
  normalizeUnitType,
  normalizeMovementKind,
  arrowGeometry,
  dashParams,
  frontGeometry,
  phaseList,
  phaseSummary,
  type SideSpec,
  type PhaseSpec,
  type UnitSpec,
  type Glyph,
  type GlyphPart,
} from "./lib/battle-map.js";
import "./mdx.css";
import "./BattleMap.css";

export interface BattleMapProps {
  /** Optimized base-map URL (from getImage()) — NOT an import. */
  src: string;
  /** Intrinsic pixel width — reserves the aspect ratio (prevents CLS) + is the SVG viewBox width. */
  width: number;
  /** Intrinsic pixel height — the SVG viewBox height. */
  height: number;
  /** Required alt text for the base map. */
  alt: string;
  /** Editorial caption (shared .mdx-caption). */
  caption?: string;
  /** The belligerents; `tone` picks the token color (friendly=amber, enemy=clay, neutral=faint). */
  sides: SideSpec[];
  /** The ordered battle phases; the scrubber advances through them. */
  phases: PhaseSpec[];
}

function prefersReducedMotion(): boolean {
  // SSR / no-matchMedia → treat as reduced so the static render is the end-state
  // (never blank, no draw animation). Hydration re-checks the real preference.
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Render one unit glyph's inner primitives (the box is drawn by the caller). */
function GlyphParts({ glyph }: { glyph: Glyph }) {
  return (
    <>
      {glyph.box ? (
        <rect
          className="bm-unit-box"
          x={-glyph.w}
          y={-glyph.h}
          width={glyph.w * 2}
          height={glyph.h * 2}
        />
      ) : null}
      {glyph.parts.map((p: GlyphPart, i) => {
        const cls = p.fill ? "bm-unit-mark bm-unit-mark--fill" : "bm-unit-mark";
        switch (p.kind) {
          case "line":
            return <line key={i} className={cls} x1={p.a} y1={p.b} x2={p.c} y2={p.d} />;
          case "ellipse":
            return <ellipse key={i} className={cls} cx={0} cy={0} rx={p.rx} ry={p.ry} />;
          case "circle":
            return <circle key={i} className={cls} cx={0} cy={0} r={p.r} />;
          case "path":
            return <path key={i} className={cls} d={p.points} />;
          case "polyline":
            return <polyline key={i} className={cls} points={p.points} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export default function BattleMap({
  src,
  width,
  height,
  alt,
  caption,
  sides,
  phases,
}: BattleMapProps) {
  const safePhases = useMemo(() => phaseList(phases), [phases]);
  const { list: sideList, byId } = useMemo(() => resolveSides(sides), [sides]);

  const [phase, setPhase] = useState(0);
  const [reduced, setReduced] = useState(true); // SSR-safe default = end-state, no animation
  const [drawn, setDrawn] = useState(true); // fail-safe: arrows start fully drawn
  const [armed, setArmed] = useState(false); // becomes true only when the client arms the undraw
  const [activeUnit, setActiveUnit] = useState<number | null>(null);
  const [activeMove, setActiveMove] = useState<number | null>(null);
  const railRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  const active = clampPhase(phase, safePhases.length);
  const current = safePhases[active];

  // Draw-on: when the phase changes (and motion is allowed), re-arm the undraw
  // then release it on the next frame so the arrows sweep in. Reduced-motion /
  // no-JS never arms → arrows are simply present (end state). Mirrors RouteMap's
  // stroke-dashoffset reveal, but re-triggered per phase rather than once.
  useEffect(() => {
    if (reduced) {
      setArmed(false);
      setDrawn(true);
      return;
    }
    setArmed(true);
    setDrawn(false);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setDrawn(true)),
    );
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduced]);

  // Close any open popover when the phase changes.
  useEffect(() => {
    setActiveUnit(null);
    setActiveMove(null);
  }, [active]);

  const go = useCallback(
    (next: number) => setPhase(clampPhase(next, safePhases.length)),
    [safePhases.length],
  );

  const onRailKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const next = stepPhase(e.key, active, safePhases.length);
      if (next !== null) {
        e.preventDefault();
        setPhase(next);
      }
    },
    [active, safePhases.length],
  );

  // ── empty guard: never blank, never throw ──────────────────────────────────
  if (safePhases.length === 0) {
    return caption ? (
      <figure className="mdx-figure mdx-figure--wide bm">
        <figcaption className="mdx-caption">{caption}</figcaption>
      </figure>
    ) : null;
  }

  const aspect = `${width} / ${height}`;
  const vb = `0 0 ${width > 0 ? width : 1000} ${height > 0 ? height : 1000}`;

  // The overlay for a given phase (units + movements + fronts). Shared by the
  // interactive render (current phase) — the fallback list renders text, not SVG.
  const renderOverlay = (p: PhaseSpec) => (
    <>
      {/* fronts first (under everything) */}
      <g className="bm-fronts" aria-hidden="true">
        {(p.fronts ?? []).map((f, i) => {
          const g = frontGeometry(f, width, height);
          if (!g.d) return null;
          const side = sideById(byId, g.side);
          return (
            <path
              key={i}
              className={`bm-front bm-front--${g.kind}`}
              d={g.d}
              style={
                {
                  ["--bm-side" as string]: side.color,
                  ["--bm-side-dim" as string]: side.colorDim,
                } as React.CSSProperties
              }
            />
          );
        })}
      </g>

      {/* movement arrows */}
      <g className="bm-moves">
        {(p.movements ?? []).map((m, i) => {
          const kind = normalizeMovementKind(m.kind);
          const geo = arrowGeometry(m.from, m.to, width, height);
          const { array } = dashParams(geo.length);
          // Solid kinds (advance/attack) get the length-based WIPE reveal via a
          // single-segment dasharray whose offset animates length→0. Patterned
          // kinds (retreat dashed / supply dotted) can't wipe without losing
          // their pattern, so they carry their static dash pattern and simply
          // appear (still reduced-motion-safe: end-state either way).
          const patterned = kind === "retreat" || kind === "supply";
          const dashArray = patterned ? MOVE_DASH[kind] : array;
          const dashOffset = !patterned && armed && !drawn ? array : 0;
          const side = sideById(byId, m.side);
          const on = activeMove === i;
          return (
            <g
              key={i}
              className={`bm-move bm-move--${kind}${on ? " bm-move--on" : ""}`}
              style={
                {
                  ["--bm-side" as string]: side.color,
                  ["--bm-side-dim" as string]: side.colorDim,
                } as React.CSSProperties
              }
              onMouseEnter={() => setActiveMove(i)}
              onMouseLeave={() => setActiveMove((c) => (c === i ? null : c))}
            >
              {/* fat invisible hit-path so a pointer along the thin arc triggers the label */}
              <path className="bm-move-hit" d={geo.d} onMouseEnter={() => setActiveMove(i)} />
              <path
                className={drawn ? "bm-move-shaft is-drawn" : "bm-move-shaft"}
                d={geo.d}
                style={{ strokeDasharray: dashArray, strokeDashoffset: dashOffset }}
              />
              <path className="bm-move-head" d={geo.head} />
              {on && m.label ? (
                <text className="bm-move-label" x={geo.mid[0]} y={geo.mid[1] - 8} textAnchor="middle">
                  {m.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* unit markers */}
      <g className="bm-units">
        {(p.units ?? []).map((u: UnitSpec, i) => {
          const [x, y] = toSvg(u.at, width, height);
          const glyph = unitGlyph(normalizeUnitType(u.type));
          const side = sideById(byId, u.side);
          const on = activeUnit === i;
          const openLeft = popoverSide(u.at?.[0] ?? 0) === "left";
          const desc = [u.label, u.strength].filter(Boolean).join(" · ");
          return (
            <g
              key={i}
              className={`bm-unit bm-unit--${normalizeUnitType(u.type)}${on ? " bm-unit--on" : ""}`}
              transform={`translate(${x} ${y})`}
              style={
                {
                  ["--bm-side" as string]: side.color,
                  ["--bm-side-dim" as string]: side.colorDim,
                } as React.CSSProperties
              }
              tabIndex={0}
              role="img"
              aria-label={`${side.label} ${u.type}${desc ? `: ${desc}` : ""}`}
              onMouseEnter={() => setActiveUnit(i)}
              onMouseLeave={() => setActiveUnit((c) => (c === i ? null : c))}
              onFocus={() => setActiveUnit(i)}
              onBlur={() => setActiveUnit((c) => (c === i ? null : c))}
            >
              <GlyphParts glyph={glyph} />
              {on && (u.label || u.strength) ? (
                <g
                  className={`bm-unit-pop ${openLeft ? "bm-unit-pop--left" : "bm-unit-pop--right"}`}
                >
                  <foreignObject
                    x={openLeft ? -158 - glyph.w : glyph.w}
                    y={-24}
                    width={158}
                    height={72}
                  >
                    <div className="bm-pop">
                      {u.label ? <span className="bm-pop-label">{u.label}</span> : null}
                      {u.strength ? <span className="bm-pop-strength">{u.strength}</span> : null}
                    </div>
                  </foreignObject>
                </g>
              ) : null}
            </g>
          );
        })}
      </g>
    </>
  );

  // ── stacked / no-JS fallback: rendered ALWAYS in normal flow so it is present
  // in the static HTML; CSS hides it once hydrated + motion is fine. Under
  // reduced-motion it stays visible (the accessible equivalent of the scrubber).
  const fallbackList = (
    <ol className="bm-phase-list" aria-label="Battle phases">
      {safePhases.map((p, i) => (
        <li className="bm-phase-item" key={i}>
          <div className="bm-phase-head">
            <span className="bm-phase-n" aria-hidden="true">
              {i + 1}
            </span>
            <span className="bm-phase-title">{p.title}</span>
            {p.time ? <span className="bm-phase-time">{p.time}</span> : null}
          </div>
          {p.note ? (
            <div className="bm-phase-note" dangerouslySetInnerHTML={{ __html: p.note }} />
          ) : null}
          {phaseSummary(p) ? <p className="bm-phase-summary">{phaseSummary(p)}</p> : null}
          {(p.units?.length ?? 0) + (p.movements?.length ?? 0) > 0 ? (
            <ul className="bm-phase-forces">
              {(p.units ?? []).map((u, j) => (
                <li key={`u${j}`}>
                  <span className="bm-force-kind">{sideById(byId, u.side).label} {u.type}</span>
                  {u.label ? ` — ${u.label}` : ""}
                  {u.strength ? ` (${u.strength})` : ""}
                </li>
              ))}
              {(p.movements ?? []).map((m, j) => (
                <li key={`m${j}`}>
                  <span className="bm-force-kind">
                    {sideById(byId, m.side).label} {normalizeMovementKind(m.kind)}
                  </span>
                  {m.label ? ` — ${m.label}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );

  // The legend (sides + unit types) — always present (fallback + interactive).
  const legend = (
    <div className="bm-legend">
      <div className="bm-legend-group">
        <span className="mdx-label">sides</span>
        <ul className="bm-legend-sides">
          {sideList.map((s) => (
            <li
              key={s.id}
              className="bm-legend-side"
              style={{ ["--bm-side" as string]: s.color } as React.CSSProperties}
            >
              <span className="bm-legend-swatch" aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="bm-legend-group">
        <span className="mdx-label">units</span>
        <ul className="bm-legend-units">
          {UNIT_LEGEND.map((t) => (
            <li key={t} className="bm-legend-unit">
              <svg className="bm-legend-glyph" viewBox="-16 -12 32 24" aria-hidden="true">
                <GlyphParts glyph={unitGlyph(t)} />
              </svg>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <figure
      className={
        reduced
          ? "mdx-figure mdx-figure--wide bm bm--stacked"
          : "mdx-figure mdx-figure--wide bm bm--live"
      }
    >
      {/* ── the map + overlay (SSR shows phase 0; live shows the active phase) ── */}
      <div className="bm-stage" style={{ aspectRatio: aspect }}>
        <img
          className="bm-img"
          src={src}
          width={width}
          height={height}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <svg
          className="bm-overlay"
          viewBox={vb}
          preserveAspectRatio="none"
          role="presentation"
        >
          {renderOverlay(reduced ? current : current)}
        </svg>
      </div>

      {/* ── phase readout ─────────────────────────────────────────────────── */}
      <div className="bm-readout">
        <span className="bm-readout-index" aria-hidden="true">
          {active + 1} / {safePhases.length}
        </span>
        <span className="bm-readout-title">{current?.title}</span>
        {current?.time ? <span className="bm-readout-time">{current.time}</span> : null}
      </div>
      {current?.note ? (
        <div
          className="bm-note"
          dangerouslySetInnerHTML={{ __html: current.note }}
        />
      ) : null}

      {/* ── the phase scrubber (prev · rail of ticks · next) ──────────────── */}
      <div className="bm-scrubber">
        <button
          type="button"
          className="bm-nav bm-nav--prev"
          onClick={() => go(active - 1)}
          disabled={!canGoPrev(active)}
          aria-label="Previous phase"
        >
          ‹
        </button>

        <div
          className="bm-rail"
          ref={railRef as unknown as React.Ref<HTMLDivElement>}
          role="slider"
          tabIndex={0}
          aria-label={caption ? `Battle phase scrubber: ${caption}` : "Battle phase scrubber"}
          aria-valuemin={1}
          aria-valuemax={safePhases.length}
          aria-valuenow={active + 1}
          aria-valuetext={`Phase ${active + 1} of ${safePhases.length}: ${current?.title ?? ""}`}
          onKeyDown={onRailKeyDown}
        >
          {safePhases.map((p, i) => (
            <button
              type="button"
              key={i}
              className={
                i === active
                  ? "bm-tick bm-tick--active"
                  : i < active
                    ? "bm-tick bm-tick--past"
                    : "bm-tick"
              }
              onClick={() => go(i)}
              aria-label={`Phase ${i + 1}: ${p.title}`}
              title={p.title}
            >
              <span className="bm-tick-dot" aria-hidden="true" />
            </button>
          ))}
        </div>

        <button
          type="button"
          className="bm-nav bm-nav--next"
          onClick={() => go(active + 1)}
          disabled={!canGoNext(active, safePhases.length)}
          aria-label="Next phase"
        >
          ›
        </button>
      </div>

      <p className="bm-hint" aria-hidden="true">
        step through the battle · ← → to advance · click a unit for strength
      </p>

      {/* live region: announce the active phase to AT */}
      <p className="bm-sr-live" aria-live="polite">
        {`Phase ${active + 1} of ${safePhases.length}: ${current?.title ?? ""}`}
      </p>

      {legend}

      {/* SSR / no-JS + reduced-motion reachable: the full phase-by-phase list.
          Kept in normal flow so it is ALWAYS in the document; .bm--live hides it
          once hydrated with motion allowed. */}
      {fallbackList}

      {caption ? <figcaption className="mdx-caption bm-cap">{caption}</figcaption> : null}
    </figure>
  );
}

// Static SVG dash patterns for the patterned movement kinds (retreat / supply).
const MOVE_DASH: Record<string, string> = {
  retreat: "7 5",
  supply: "2 5",
};

// Unit types shown in the legend, in a stable reading order.
const UNIT_LEGEND = [
  "infantry",
  "armor",
  "cavalry",
  "artillery",
  "hq",
  "naval",
  "air",
] as const;
