// apps/site/src/components/mdx/StatBand.tsx
//
// A band of big, dramatic NUMBERS that count up when scrolled into view —
// "20–40 MILLION people · $0.6–2.6 TRILLION · 1–2 YEARS". The figures are the
// argument; the band is "lines, not boxes" (hairline separators, no chrome).
//
// Motion: one IntersectionObserver fires once; a single rAF loop tweens every
// figure 0 → value with a shared eased clock (the visible text changes — cheap,
// no layout thrash). Under prefers-reduced-motion / SSR / no-JS the final value
// renders immediately, so the band is never blank and never animates.
//
// Like the other islands, the data is a SERIALIZABLE `stats` prop (plain JSON)
// so Astro can hand it to the React island intact.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, frameValue, fitScale, type FormatOptions } from "./lib/stat-format.js";
import "./mdx.css";
import "./StatBand.css";

// useLayoutEffect warns during SSR; alias to useEffect on the server so the
// fit-to-cell measurement is a no-op until hydration (where layout exists).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface Stat extends FormatOptions {
  /** the target number the figure counts up to. */
  value: number;
  /** the mono label beneath the figure (e.g. "people", "in 2024 dollars"). */
  label: string;
  /** optional smaller sub-label under the label (a range note, a qualifier). */
  sub?: string;
  /** when set, the figure cites a source (the whole stat becomes a link). */
  href?: string;
}

export interface StatBandProps {
  /** the ordered figures; fully serializable. */
  stats: Stat[];
  /** count-up duration in ms (default 1400). */
  duration?: number;
  caption?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true; // SSR -> final value
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function StatBand({ stats, duration = 1400, caption }: StatBandProps) {
  const safeStats = Array.isArray(stats) ? stats : [];
  const rootRef = useRef<HTMLElement | null>(null);
  // per-item DOM refs used to fit each figure to its (possibly narrow) cell.
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  // progress 0..1 of the shared count-up clock; SSR-safe default = 1 (final).
  const [progress, setProgress] = useState(1);

  // ── Fit-to-cell ───────────────────────────────────────────────────────────
  // CSS char-count guesses cannot know the real cell pixel width, so in a 4-up
  // row the widest value ("20,229") clipped. Instead we MEASURE: each figure
  // carries an out-of-flow probe holding the FINAL value at the unscaled base
  // size; we compare its width to the cell's available inner width and set a
  // per-item `--statband-fit` (≤ 1) so the FINAL value always fits exactly — at
  // any column count and down to mobile. Re-runs on resize AND after web fonts
  // load (Fraunces changes the measured width). SSR renders at fit=1 (never
  // painted clipped on the server); hydration applies the real fit.
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || safeStats.length === 0) return;

    const measure = () => {
      for (const item of itemRefs.current) {
        if (!item) continue;
        const probe = item.querySelector<HTMLElement>(".statband-probe");
        const figure = item.querySelector<HTMLElement>(".statband-figure");
        if (!probe || !figure) continue;
        // Available width = the cell's CONTENT box. clientWidth includes the
        // item's own padding, so subtract it; also subtract the figure's trailing
        // pad so the value never sits flush to the dividing hairline.
        const itemCs = getComputedStyle(item);
        const itemPadL = parseFloat(itemCs.paddingLeft) || 0;
        const itemPadR = parseFloat(itemCs.paddingRight) || 0;
        const figR = parseFloat(getComputedStyle(figure).paddingRight) || 0;
        const avail = item.clientWidth - itemPadL - itemPadR - figR;
        // Intrinsic width of the FINAL value at the unscaled base size.
        const content = probe.scrollWidth;
        const scale = fitScale(content, avail);
        item.style.setProperty("--statband-fit", String(scale));
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    for (const item of itemRefs.current) if (item) ro.observe(item);
    // Re-measure once the display font is ready — a fallback-metrics measurement
    // would mis-size the fit.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [safeStats.length]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || safeStats.length === 0) return;
    if (prefersReducedMotion() || duration <= 0) {
      setProgress(1);
      return;
    }

    let raf = 0;
    let start = 0;
    let observed = true;

    const tick = (now: number) => {
      if (start === 0) start = now;
      const elapsed = now - start;
      // frameValue lands exactly on 1 at the end; map elapsed→progress[0,1].
      const p = frameValue(1, elapsed, duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    // Begin from 0 only when the band actually scrolls into view, then run once.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && observed) {
            observed = false;
            io.disconnect();
            setProgress(0);
            start = 0;
            raf = requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [safeStats.length, duration]);

  if (safeStats.length === 0) return null;

  return (
    <figure className="mdx-figure mdx-figure--wide statband" ref={rootRef}>
      <div className="statband-row" role="list">
        {safeStats.map((s, i) => {
          const fmt = { prefix: s.prefix, suffix: s.suffix, decimals: s.decimals, group: s.group };
          const shown = frameValue(s.value, progress * duration, duration);
          const text = format(shown, fmt);
          // The FINAL formatted value is the widest the figure can ever be (the
          // count-up is clamped ≤ target with identical formatting), so the
          // in-flow measure twin (below) holds it to keep the box width stable.
          const accessibleValue = format(s.value, fmt);
          // The figure stacks three layers (all the FINAL value or the live one):
          //  • .statband-measure — in-flow twin holding the FINAL value at the
          //    FITTED size, so the box width is stable (count-up never reflows);
          //  • .statband-shown — the live count-up value, overlaid on the twin;
          //  • .statband-probe — out-of-flow, always at the UNSCALED base size,
          //    measured by the fit pass to derive --statband-fit.
          // All aria-hidden; the accessible value is exposed separately.
          const figure = (
            <span className="statband-figure" aria-hidden="true">
              <span className="statband-measure" aria-hidden="true">
                {accessibleValue}
              </span>
              <span className="statband-shown">{text}</span>
              <span className="statband-probe" aria-hidden="true">
                {accessibleValue}
              </span>
            </span>
          );
          return (
            <div
              className="statband-item"
              role="listitem"
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
            >
              {s.href ? (
                // ONE accessible name on the link (value + label), so the figure
                // value is not announced twice. The figure stays aria-hidden and
                // we drop the visually-hidden srvalue inside the link.
                <a
                  className="statband-cite"
                  href={s.href}
                  rel="noopener noreferrer"
                  aria-label={`${accessibleValue}, ${s.label}`}
                >
                  {figure}
                </a>
              ) : (
                <>
                  {figure}
                  <span className="statband-srvalue">{accessibleValue}</span>
                </>
              )}
              <span className="statband-label">{s.label}</span>
              {s.sub ? <span className="statband-sub">{s.sub}</span> : null}
            </div>
          );
        })}
      </div>
      {caption ? <figcaption className="mdx-caption">{caption}</figcaption> : null}
    </figure>
  );
}
