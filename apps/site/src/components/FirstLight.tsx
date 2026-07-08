// apps/site/src/components/FirstLight.tsx
// "First Light" — art-direction.md §1 Signature Moment A, scoped to the Feed
// masthead: a data-driven OGL point-field that resolves out of the dark ONCE
// on load, then settles to near-stillness. Never a permanent distraction —
// the full "settled constellation lives on behind the whole feed" vision
// (art-direction §4) is intentionally NOT built here; this is the entrance
// moment only, behind the masthead band.
//
// Structure mirrors components/mdx/Model3D.tsx point for point (see its
// header comment): a thin, SSR-safe shell that decides `allowGL` exactly
// once on mount via the shared components/lib/gl-gates.ts checks (extracted
// from Model3D specifically because this component needed the identical
// pair — see that module's header), with a baked static fallback ALWAYS
// rendered underneath, and the live scene behind a lazy `React.lazy` import
// so `ogl` never touches the bundle for reduced-motion / low-power / no-JS
// readers. Same species of component as the future Atlas globe (spec:
// docs/superpowers/specs/2026-07-07-atlas-globe-design.md §0 "Shared DNA
// with the Feed's First Light hero") — different renderer (OGL here, cobe
// there) for a deliberate, documented reason (that spec's §3.2).
//
// DATA-DRIVEN, not decorative: point count and per-channel density come from
// the real curated feed (channelCounts / totalCount, computed in index.astro
// from the same `all` array every other Feed surface reads), and the
// "fresh" highlight comes from the real freshCount. An empty pipeline
// (totalCount === 0) renders the honest "one cold star" empty state instead
// of fabricating a field from nothing (art-direction §2 guardrail #7).
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import "./FirstLight.css";
import { isLowPower, prefersReducedMotion, hasWebGL } from "./lib/gl-gates";

const Scene = lazy(() => import("./FirstLightScene.js"));

export interface ChannelCount {
  channel: string;
  count: number;
}

export interface FirstLightProps {
  /** Real per-channel item counts from the Feed's own `all` array, in
   *  canonical CHANNELS order — the point-field's lane layout + density. */
  channelCounts: ChannelCount[];
  /** Total signal count (`all.length`) — drives how many points render,
   *  capped at POINT_CAP for perf. */
  totalCount: number;
  /** Items published in the last 24h — drives how many points get the
   *  brighter "fresh signal" treatment, spread evenly across the field. */
  freshCount: number;
}

const POINT_CAP = 220;

// Deterministic PRNG (mulberry32) so the SERVER-rendered static fallback and
// the CLIENT's first render (before the allowGL effect fires, same render
// pass by React hydration rules) produce byte-identical markup. Math.random()
// here would mismatch between SSR and hydration and trigger a React warning.
function mulberry32(seed: number) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Largest-remainder proportional allocation of `renderTotal` points across
 * channel lanes, weighted by each channel's real share of the feed. */
function allocateLanes(channelCounts: ChannelCount[], renderTotal: number): number[] {
  const grand = channelCounts.reduce((s, c) => s + c.count, 0);
  if (grand <= 0 || renderTotal <= 0) return channelCounts.map(() => 0);
  const raw = channelCounts.map((c) => (c.count / grand) * renderTotal);
  const base = raw.map(Math.floor);
  let allocated = base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r - base[i]! }))
    .sort((a, b) => b.rem - a.rem);
  let k = 0;
  while (allocated < renderTotal && k < order.length) {
    const idx = order[k]!.i;
    base[idx]! += 1;
    allocated++;
    k++;
  }
  return base;
}

export default function FirstLight({ channelCounts, totalCount, freshCount }: FirstLightProps) {
  const [allowGL, setAllowGL] = useState(false);

  useEffect(() => {
    setAllowGL(!isLowPower() && !prefersReducedMotion() && hasWebGL());
  }, []);

  const grand = channelCounts.reduce((s, c) => s + c.count, 0);
  const renderTotal = Math.min(POINT_CAP, Math.max(0, totalCount));
  const perLane = useMemo(() => allocateLanes(channelCounts, renderTotal), [channelCounts, renderTotal]);

  // Honest empty state: "an empty night sky with one cold star"
  // (art-direction.md §2 guardrail #7) — no signal, no fabricated field.
  if (grand <= 0 || renderTotal <= 0) {
    return (
      <div className="fl-host fl-host--empty" aria-hidden="true">
        <span className="fl-lone-star" />
      </div>
    );
  }

  return (
    <div className="fl-host" aria-hidden="true">
      {/* Baked static fallback — ALWAYS present beneath the canvas (Model3D's
          discipline). Deterministic layout, so this is exactly what a no-JS /
          reduced-motion / low-power reader sees, and exactly what the
          canvas-bearing reader sees for one frame before hydration. */}
      <svg
        className="fl-fallback"
        viewBox="0 0 400 130"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden={allowGL ? "true" : "false"}
      >
        {renderFallbackDots(channelCounts, perLane, freshCount, grand)}
      </svg>
      {allowGL && (
        <Suspense fallback={null}>
          <Scene channelCounts={channelCounts} perLane={perLane} freshCount={freshCount} />
        </Suspense>
      )}
    </div>
  );
}

function renderFallbackDots(
  channelCounts: ChannelCount[],
  perLane: number[],
  freshCount: number,
  grand: number,
) {
  const laneCount = channelCounts.length || 1;
  const totalPts = perLane.reduce((a, b) => a + b, 0);
  const hotTotal = totalPts > 0 ? Math.round((freshCount / grand) * totalPts) : 0;

  // Evenly-spaced "hot" indices across the whole field (real freshCount share
  // of the field, spread rather than clumped in one lane) — same scheme
  // FirstLightScene.tsx uses for the live points, so the fallback and the
  // live field agree on which points are "fresh."
  const hotIndices = new Set<number>();
  if (hotTotal > 0) {
    const step = totalPts / hotTotal;
    for (let h = 0; h < hotTotal; h++) hotIndices.add(Math.min(totalPts - 1, Math.floor(h * step)));
  }

  const dots: Array<{ key: string; cx: number; cy: number; r: number; hot: boolean }> = [];
  let ptr = 0;
  channelCounts.forEach((_c, laneIdx) => {
    const rand = mulberry32(laneIdx * 7919 + 13);
    const laneX = ((laneIdx + 0.5) / laneCount) * 400;
    const count = perLane[laneIdx] ?? 0;
    for (let k = 0; k < count; k++) {
      const jx = (rand() - 0.5) * ((400 / laneCount) * 1.5);
      const jy = 8 + rand() * 112;
      const isHot = hotIndices.has(ptr);
      dots.push({
        key: `${laneIdx}-${k}`,
        cx: Math.max(2, Math.min(398, laneX + jx)),
        cy: jy,
        r: isHot ? 1.7 : 0.8 + rand() * 0.55,
        hot: isHot,
      });
      ptr++;
    }
  });

  return dots.map((d) => (
    <circle key={d.key} cx={d.cx} cy={d.cy} r={d.r} className={d.hot ? "fl-dot fl-dot--hot" : "fl-dot"} />
  ));
}
