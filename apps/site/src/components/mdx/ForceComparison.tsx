// apps/site/src/components/mdx/ForceComparison.tsx
import { useState } from "react";
import {
  layoutForceComparison,
  type ForceComparisonProps,
  type Tone,
} from "./lib/force-comparison.js";
import "./mdx.css";
import "./ForceComparison.css";

export type { ForceComparisonProps };

const toneClass = (t: Tone) => `fc-tone--${t}`;

/**
 * Head-to-head forces & casualties — a diverging paired-bar comparison. Each
 * metric (Troops, Tanks, Artillery, Casualties …) is one row: side A's bar
 * grows LEFT from a shared center baseline, side B's grows RIGHT, both scaled to
 * the metric's larger magnitude. The ratio (e.g. 3.2:1) sits on the baseline.
 * Amber = friendly, clay = enemy, faint = neutral.
 *
 * All geometry / ratio math is the pure, unit-tested `layoutForceComparison`;
 * the island is a thin renderer that adds ONE thing JS-only: hover/focus a bar
 * to surface the exact value + ratio in a stable readout. The no-JS / SSR
 * fallback is a full labeled comparison TABLE (never blank). Reduced-motion
 * renders the end state with zero animation. Bars are width:100% so there is no
 * overflow at 360px; the paired bars stack per side on narrow screens.
 */
export default function ForceComparison(props: ForceComparisonProps) {
  const { caption } = props;
  const layout = layoutForceComparison(props);
  const [active, setActive] = useState<{ row: number; side: number } | null>(null);

  const sideA = layout.sides[0];
  const sideB = layout.sides[1];

  return (
    <figure className="mdx-figure mdx-figure--wide fc">
      <div className="mdx-panel fc-panel">
        {/* ── header: the two sides, amber vs clay ─────────────────────────── */}
        <div className="fc-head" aria-hidden="true">
          <span className={`fc-side fc-side--a ${toneClass(sideA?.tone ?? "neutral")}`}>
            {sideA?.label}
          </span>
          <span className="fc-vs">vs</span>
          <span className={`fc-side fc-side--b ${toneClass(sideB?.tone ?? "neutral")}`}>
            {sideB?.label}
          </span>
        </div>

        {/* ── the diverging paired bars (interactive) ──────────────────────── */}
        <ul className="fc-rows" role="list">
          {layout.rows.map((row, ri) => {
            const a = row.cells[0];
            const b = row.cells[1];
            const isActive = active?.row === ri;
            const activeCell = isActive ? row.cells[active!.side] : null;
            return (
              <li className={isActive ? "fc-row fc-row--active" : "fc-row"} key={`${row.label}-${ri}`}>
                <div className="fc-metric mdx-label">{row.label}</div>
                <div className="fc-track">
                  {/* LEFT side (A) — bar grows leftward toward the center. The
                     bar is a positioned track anchored at the ratio (right); the
                     value label is absolutely placed just OUTSIDE the bar's left
                     end but clamped to the row edge, so it never clips. */}
                  <div className="fc-half fc-half--left">
                    <button
                      type="button"
                      className={`fc-bar fc-bar--a ${toneClass(a?.tone ?? "neutral")}${a?.isAdvantaged ? " fc-bar--adv" : ""}`}
                      style={{ width: a?.pct }}
                      onMouseEnter={() => setActive({ row: ri, side: 0 })}
                      onMouseLeave={() => setActive((c) => (c?.row === ri && c.side === 0 ? null : c))}
                      onFocus={() => setActive({ row: ri, side: 0 })}
                      onBlur={() => setActive((c) => (c?.row === ri && c.side === 0 ? null : c))}
                      aria-label={`${sideA?.label} ${row.label}: ${a?.display}${row.advantageSide === 0 ? " (advantage)" : ""}`}
                    >
                      <span className="fc-val fc-val--a">{a?.display}</span>
                    </button>
                  </div>
                  {/* center baseline carries the ratio */}
                  <span
                    className="fc-ratio"
                    aria-label={row.ratio != null ? `ratio ${row.ratioLabel}` : "no ratio"}
                  >
                    {row.ratioLabel}
                  </span>
                  {/* RIGHT side (B) — bar grows rightward; label clamps inside. */}
                  <div className="fc-half fc-half--right">
                    <button
                      type="button"
                      className={`fc-bar fc-bar--b ${toneClass(b?.tone ?? "neutral")}${b?.isAdvantaged ? " fc-bar--adv" : ""}`}
                      style={{ width: b?.pct }}
                      onMouseEnter={() => setActive({ row: ri, side: 1 })}
                      onMouseLeave={() => setActive((c) => (c?.row === ri && c.side === 1 ? null : c))}
                      onFocus={() => setActive({ row: ri, side: 1 })}
                      onBlur={() => setActive((c) => (c?.row === ri && c.side === 1 ? null : c))}
                      aria-label={`${sideB?.label} ${row.label}: ${b?.display}${row.advantageSide === 1 ? " (advantage)" : ""}`}
                    >
                      <span className="fc-val fc-val--b">{b?.display}</span>
                    </button>
                  </div>
                </div>
                {/* per-row readout (JS-only enhancement; stable slot, no shift) */}
                <div className="fc-readout" aria-live="polite">
                  {activeCell ? (
                    <>
                      <span className="fc-readout-side">{activeCell.label}</span>
                      <span className="fc-readout-sep"> · </span>
                      <span className="fc-readout-val">{activeCell.display}</span>
                      <span className="fc-readout-sep"> · </span>
                      <span className="fc-readout-ratio">{row.ratioLabel}</span>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {/* ── SSR / no-JS fallback: a clean labeled comparison table ──────────
           Wrapped in a horizontal-scroll box (mirrors DataTable's .dt-scroll)
           so the Ratio column is always reachable at ≤400px without the panel's
           overflow:clip silently cutting it off, and without page overflow. */}
        <div className="fc-scroll">
        <table className="fc-fallback">
          <caption className="visually-hidden">
            Force comparison: {layout.sides.map((s) => s.label).join(" vs ")}
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {layout.sides.map((s, i) => (
                <th scope="col" className={toneClass(s.tone)} key={`h-${i}`}>
                  {s.label}
                </th>
              ))}
              <th scope="col">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {layout.rows.map((row, ri) => (
              <tr key={`fr-${ri}`}>
                <th scope="row">{row.label}</th>
                {row.cells.map((c, ci) => (
                  <td
                    className={c.isAdvantaged ? "fc-fallback-adv" : undefined}
                    key={`fc-${ri}-${ci}`}
                  >
                    {c.display}
                  </td>
                ))}
                <td className="fc-fallback-ratio">{row.ratioLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
