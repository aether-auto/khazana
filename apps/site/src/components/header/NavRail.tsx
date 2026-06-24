import { useEffect, useRef, useState } from "react";
import { magneticOffset } from "../../lib/magnetic";
import "./NavRail.css";

export interface NavItem {
  id: string;
  label: string;
  href: string;
}

interface Props {
  items: NavItem[];
  active?: string;
}

/**
 * Header nav with a single sliding active indicator + magnetic hover.
 *
 * The indicator is one absolutely-positioned bar that glides (transform only)
 * to sit under whichever tab is hovered/focused, and rests under the active
 * (current-page) tab otherwise. Built with plain refs + measured geometry
 * rather than a layout library so it stays tiny and SSRs as real <a> links —
 * keyboard, aria-current, and no-JS navigation all work unchanged.
 *
 * Accessibility / reduced-motion:
 *  • every tab is a real anchor; aria-current="page" marks the active one
 *  • the indicator is aria-hidden decoration
 *  • reduced-motion → the indicator snaps (no glide) and magnetic pull is off
 */
export default function NavRail({ items, active }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  const activeIndex = Math.max(
    0,
    items.findIndex((it) => it.id === active),
  );

  // Move the sliding indicator under a given tab index (transform only).
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;

    const target = hovered ?? activeIndex;
    const link = linkRefs.current[target];
    if (!link) return;

    const lrect = list.getBoundingClientRect();
    const trect = link.getBoundingClientRect();
    const x = trect.left - lrect.left;
    const w = trect.width;

    indicator.style.opacity = "1";
    indicator.style.width = `${w}px`;
    indicator.style.transform = `translateX(${x}px)`;
    indicator.style.transitionDuration = reduce ? "0ms" : "";
  }, [hovered, activeIndex, items.length]);

  // Re-measure on resize / font load so the indicator stays aligned.
  useEffect(() => {
    const onResize = () => setHovered((h) => h); // trigger the measure effect
    window.addEventListener("resize", onResize);
    // fonts may shift tab widths after first paint
    if ("fonts" in document) {
      document.fonts.ready.then(onResize).catch(() => {});
    }
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Magnetic hover — translate the tab label a fraction toward the cursor.
  const reduceRef = useRef(false);
  useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function onMove(e: React.MouseEvent<HTMLAnchorElement>, i: number) {
    if (reduceRef.current) return;
    const el = linkRefs.current[i];
    if (!el) return;
    const off = magneticOffset(e.clientX, e.clientY, el.getBoundingClientRect(), {
      strength: 0.25,
      max: 6,
    });
    el.style.transform = `translate(${off.x}px, ${off.y}px)`;
  }
  function onLeaveLink(i: number) {
    const el = linkRefs.current[i];
    if (el) el.style.transform = "";
  }

  return (
    <ul className="navrail" ref={listRef} aria-label="Surfaces">
      <span className="navrail-indicator" ref={indicatorRef} aria-hidden="true" />
      {items.map((it, i) => (
        <li key={it.id} className="navrail-item">
          <a
            ref={(el) => {
              linkRefs.current[i] = el;
            }}
            className={`navrail-link${it.id === active ? " is-current" : ""}`}
            href={it.href}
            aria-current={it.id === active ? "page" : undefined}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => {
              setHovered(null);
              onLeaveLink(i);
            }}
            onMouseMove={(e) => onMove(e, i)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
          >
            {it.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
