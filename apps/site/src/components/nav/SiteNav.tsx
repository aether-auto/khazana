// SITE NAV — the three quiet navigation affordances, mounted once globally in
// Shell.astro as a `client:idle` island.
//
//   1. BACK        — a small tab below the topbar. history.back() when there's
//                    usable same-origin history, else a sensible parent
//                    (/reads for a Read, / for everything else).
//   2. SCROLL-TOP  — a floating control that appears past ~1.5 viewports and
//                    smooth-scrolls to the top (reusing the site's Lenis).
//   3. SECTION RAIL— a near-invisible right-edge tick-rail, one tick per section,
//                    that highlights the active section (IntersectionObserver),
//                    reveals labels on hover/focus, and jumps on click. Only
//                    renders when the page has ≥ 2 navigable sections.
//
// All section detection is at RUNTIME from the DOM, so no page needs per-page
// wiring. Re-detects across View Transition navigations. Pure decisions live in
// ./lib/nav-helpers (unit-tested); this file is the DOM/effect shell.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  activeSectionIndex,
  backFallbackHref,
  sectionLabel,
  shouldRenderSectionRail,
  shouldShowScrollTop,
  type NavSection,
} from "./lib/nav-helpers.js";
import { scrollToElement, scrollToTop } from "../../scripts/scroll-to.js";
import styles from "./SiteNav.module.css";

interface Props {
  /** import.meta.env.BASE_URL — used for the back fallback target. */
  base: string;
}

// Header offset so a jumped-to section clears the sticky topbar.
const HEADER_OFFSET = -96;

// A subtle rail maps a page's major sections, not its entire outline. If a page
// somehow exposes more navigable regions than this, we keep the first N so the
// rail can never flood the edge — a safety belt, rarely hit in practice.
const MAX_SECTIONS = 12;

/**
 * Detect navigable sections in the current document, in order. Generic across
 * surfaces:
 *   • Reads  → h2 headings inside the article prose (`.prose h2`)
 *   • taste / graph → `section.obs-section` blocks (labelled by their `.obs-h2`)
 *   • generic → `[data-section]` or `section[aria-labelledby]`
 * Each section gets a stable id (existing, or minted) for anchoring + aria.
 */
function detectSections(): NavSection[] {
  const out: NavSection[] = [];
  const seen = new Set<HTMLElement>();

  const push = (el: HTMLElement, rawLabel: string) => {
    if (seen.has(el)) return;
    const label = sectionLabel(rawLabel);
    if (!label) return;
    seen.add(el);
    if (!el.id) el.id = `khz-sec-${out.length}-${slugify(label)}`;
    out.push({ el, label, id: el.id });
  };

  // 1. Reading prose — the h2 section heads inside an article.
  const proseHeads = document.querySelectorAll<HTMLElement>(
    ".prose h2, article .prose h2, [data-prose] h2",
  );
  if (proseHeads.length) {
    proseHeads.forEach((h) => push(h, h.textContent ?? ""));
    return dedupe(out);
  }

  // 2. Instrument-page section blocks (taste / graph). Each obs-section that
  //    carries a heading is navigable; mastheads / stat-bands without an h2 are
  //    skipped (they're not destinations).
  const obsSections = document.querySelectorAll<HTMLElement>("section.obs-section");
  if (obsSections.length) {
    obsSections.forEach((sec) => {
      const h = sec.querySelector<HTMLElement>(".obs-h2, h2");
      if (h && h.textContent?.trim()) push(sec, h.textContent);
    });
    if (out.length >= 2) return dedupe(out);
  }

  // 3. Generic fallback — TOP-LEVEL page regions only.
  //    We deliberately keep this narrow: only labelled regions that sit at the
  //    top level of <main> (not nested inside another region). This avoids
  //    turning every internal layout hook or nested sub-rail (e.g. a feed's
  //    per-channel "Browse: X" blocks) into a tick — the rail should map the
  //    page's MAJOR sections, not its DOM. Explicit `[data-section]` is treated
  //    as a behavioural hook, NOT a nav marker, so it is intentionally excluded.
  const main = document.querySelector("main") ?? document.body;
  const candidates = Array.from(
    main.querySelectorAll<HTMLElement>("section[aria-labelledby], section[aria-label]"),
  );
  // Keep only the outermost labelled regions:
  //   • not nested inside another labelled candidate, AND
  //   • not nested inside a [data-section] block. `data-section` marks a
  //     self-contained behavioural region (e.g. a feed's "browse" block that
  //     itself contains many per-channel sub-rails) — its internals are NOT
  //     individual nav destinations, so we treat the whole block as opaque and
  //     never tick its children. This keeps the rail to a page's MAJOR regions.
  const topLevel = candidates.filter((sec) => {
    if (candidates.some((other) => other !== sec && other.contains(sec))) return false;
    if (sec.closest("[data-section]") && sec.closest("[data-section]") !== sec) return false;
    return true;
  });
  topLevel.forEach((sec) => {
    const labelledBy = sec.getAttribute("aria-labelledby");
    const ariaLabel = sec.getAttribute("aria-label");
    let text = "";
    if (labelledBy) text = document.getElementById(labelledBy)?.textContent ?? "";
    if (!text && ariaLabel) text = ariaLabel;
    if (!text) {
      const h = sec.querySelector<HTMLElement>("h2, h3");
      text = h?.textContent ?? "";
    }
    if (text.trim()) push(sec, text);
  });

  return dedupeByLabel(out);
}

function dedupe(list: NavSection[]): NavSection[] {
  const ids = new Set<string>();
  return list.filter((s) => (ids.has(s.id) ? false : (ids.add(s.id), true)));
}

// Generic regions can repeat a label (e.g. two "listen" hooks); collapse to the
// first occurrence so the rail never shows a duplicate tick.
function dedupeByLabel(list: NavSection[]): NavSection[] {
  const labels = new Set<string>();
  const ids = new Set<string>();
  return list.filter((s) => {
    const key = s.label.toLowerCase();
    if (labels.has(key) || ids.has(s.id)) return false;
    labels.add(key);
    ids.add(s.id);
    return true;
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export default function SiteNav({ base }: Props) {
  const [sections, setSections] = useState<NavSection[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [progress, setProgress] = useState(0);
  // Mounted-in flag drives the entrance fade; set true on next frame after mount
  // so the affordances ease in rather than pop.
  const [mounted, setMounted] = useState(false);
  const activeRef = useRef(0);

  // ── (re)detect sections — on mount and after each VT navigation ───────────
  useEffect(() => {
    const redetect = () => {
      // Defer one frame so the swapped DOM is laid out before we query it.
      requestAnimationFrame(() => setSections(detectSections().slice(0, MAX_SECTIONS)));
    };
    redetect();
    document.addEventListener("astro:page-load", redetect);
    return () => document.removeEventListener("astro:page-load", redetect);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // ── scroll position → to-top visibility + progress ring ───────────────────
  // One passive listener (rAF-throttled). The site routes scroll through Lenis
  // when present, but window.scrollY is correct in both modes, so this is the
  // single source for the to-top control regardless of smooth-scroll.
  useEffect(() => {
    let ticking = false;
    const read = () => {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      setShowTop(shouldShowScrollTop(y, vh));
      const max = document.documentElement.scrollHeight - vh;
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // ── active section via IntersectionObserver (no scroll handler) ───────────
  useEffect(() => {
    if (!shouldRenderSectionRail(sections.length)) return;
    const intersecting = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.khzNavIdx);
          if (Number.isNaN(idx)) continue;
          if (entry.isIntersecting) intersecting.add(idx);
          else intersecting.delete(idx);
        }
        const next = activeSectionIndex([...intersecting], activeRef.current);
        if (next !== activeRef.current) {
          activeRef.current = next;
          setActiveIdx(next);
        }
      },
      // A generous band across the upper half of the viewport: a section is
      // "active" once its top crosses ~10% down and stays active until the next
      // section's top reaches that line. The wide bottom margin keeps exactly
      // one section lit through most of its scroll travel (no dead zones).
      { rootMargin: "-10% 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s, i) => {
      s.el.dataset.khzNavIdx = String(i);
      io.observe(s.el);
    });
    return () => io.disconnect();
  }, [sections]);

  // ── back ──────────────────────────────────────────────────────────────────
  const onBack = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Use real history when we have a same-origin referrer to return to.
      const ref = document.referrer;
      const sameOrigin = ref && ref.startsWith(window.location.origin);
      if (window.history.length > 1 && sameOrigin) {
        window.history.back();
        return;
      }
      window.location.href = backFallbackHref(window.location.pathname, base);
    },
    [base],
  );

  const onJump = useCallback((section: NavSection) => {
    scrollToElement(section.el, HEADER_OFFSET);
    // Move focus to the target for keyboard users without forcing a second jump.
    const el = section.el;
    const hadTabIndex = el.hasAttribute("tabindex");
    if (!hadTabIndex) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    if (!hadTabIndex) {
      // Clean up the temporary tabindex once focus has moved on.
      el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
    }
  }, []);

  const railVisible = shouldRenderSectionRail(sections.length);

  return (
    <div className={styles.layer} aria-hidden={false}>
      {/* BACK */}
      <button
        type="button"
        className={`${styles.back} ${mounted ? styles.in : ""}`}
        onClick={onBack}
        aria-label="Go back"
      >
        <span className={styles.backArrow} aria-hidden="true">←</span>
        <span className={styles.backLabel}>back</span>
      </button>

      {/* SECTION RAIL — only when there are ≥ 2 navigable sections */}
      {railVisible && (
        <nav
          className={`${styles.rail} ${mounted ? styles.in : ""}`}
          aria-label="On this page"
        >
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.tick} ${i === activeIdx ? styles.active : ""}`}
              onClick={() => onJump(s)}
              aria-label={`Jump to section: ${s.label}`}
              aria-current={i === activeIdx ? "true" : undefined}
            >
              <span className={styles.tickLabel}>{s.label}</span>
              <span className={styles.tickMark} aria-hidden="true" />
            </button>
          ))}
        </nav>
      )}

      {/* SCROLL TO TOP */}
      <button
        type="button"
        className={`${styles.toTop} ${showTop ? styles.shown : ""}`}
        onClick={() => scrollToTop()}
        aria-label="Scroll to top"
        tabIndex={showTop ? 0 : -1}
        style={{ "--p": progress } as React.CSSProperties}
      >
        <span className={styles.toTopRing} aria-hidden="true" />
        <span className={styles.toTopArrow} aria-hidden="true">↑</span>
      </button>
    </div>
  );
}
