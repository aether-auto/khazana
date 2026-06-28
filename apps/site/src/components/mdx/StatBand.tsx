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
import { useEffect, useRef, useState } from "react";
import { format, frameValue, type FormatOptions } from "./lib/stat-format.js";
import "./mdx.css";
import "./StatBand.css";

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
  // progress 0..1 of the shared count-up clock; SSR-safe default = 1 (final).
  const [progress, setProgress] = useState(1);

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
          const figure = (
            <span className="statband-figure" aria-hidden="true">
              {text}
            </span>
          );
          const accessibleValue = format(s.value, fmt);
          return (
            <div className="statband-item" role="listitem" key={i}>
              {s.href ? (
                <a className="statband-cite" href={s.href} rel="noopener noreferrer">
                  {figure}
                  <span className="statband-srvalue">{accessibleValue}</span>
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
