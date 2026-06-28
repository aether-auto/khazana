// Pure, framework-free logic for the site navigation aids (back / scroll-top /
// section tick-rail). Kept side-effect-free so every decision is unit-testable
// and the island stays a thin DOM shell around these functions.
//
// The three affordances each need exactly one small decision that is pure:
//   • scroll-top visibility  → a scroll-position threshold
//   • back-target            → where "back" goes when there's no usable history
//   • active section         → which detected section the reader is currently in
// Everything DOM/animation lives in the island; this file is just the math.

/** A detected, navigable section of the page. */
export interface NavSection {
  /** The element to scroll to (a heading or a section block). */
  el: HTMLElement;
  /** The short, human label shown in the rail tooltip ("the read-time sweet spot"). */
  label: string;
  /** Stable id used for the anchor / aria wiring. */
  id: string;
}

/**
 * Should the floating "scroll to top" control be visible?
 * Appears once the reader is meaningfully into the page — past a multiple of the
 * viewport height (default 1.5 viewports, per the brief). Pure so the threshold
 * is testable without a scroll harness.
 *
 * @param scrollY     current vertical scroll offset (window.scrollY)
 * @param viewportH   viewport height (window.innerHeight)
 * @param multiplier  how many viewports down before it appears (default 1.5)
 */
export function shouldShowScrollTop(
  scrollY: number,
  viewportH: number,
  multiplier = 1.5,
): boolean {
  if (viewportH <= 0) return false;
  return scrollY > viewportH * multiplier;
}

/**
 * Resolve where the "back" affordance should navigate when there is no usable
 * same-origin history entry to pop. A Read falls back to its index (/reads),
 * everything else to the feed root. The caller prefers history.back() when
 * `hasUsableHistory` is true; this is only the fallback target.
 *
 * @param pathname  the current location.pathname (already includes the base)
 * @param base      the site base path (import.meta.env.BASE_URL), e.g. "/" or "/khazana/"
 */
export function backFallbackHref(pathname: string, base: string): string {
  const b = base.endsWith("/") ? base : `${base}/`;
  // A read lives under <base>reads/<slug>; its parent is the reads index.
  // Match "/reads/" anywhere after the base so trailing-slash modes both work.
  if (/\/reads\/[^/]+/.test(pathname)) return `${b}reads`;
  // Item pages (/item/<id>) also belong under the feed.
  // Default parent for any deeper surface is the feed root.
  return b;
}

/**
 * Given the set of currently-intersecting section indices (from an
 * IntersectionObserver), pick the single "active" one to highlight. We choose
 * the FIRST intersecting section in document order — the one nearest the top of
 * the viewport — which matches how a reader perceives "where am I". When nothing
 * intersects (between sections, or all scrolled past), we hold the last active
 * index so the rail never flickers to "nothing".
 *
 * @param intersecting  indices currently intersecting, in any order
 * @param previous      the previously-active index (held when nothing intersects)
 */
export function activeSectionIndex(
  intersecting: readonly number[],
  previous: number,
): number {
  if (intersecting.length === 0) return previous;
  let min = intersecting[0]!;
  for (const i of intersecting) if (i < min) min = i;
  return min;
}

/**
 * Whether the section rail should render at all. Per the brief, a page with
 * fewer than two navigable sections shows only back + scroll-top — a single
 * tick is not a navigator.
 */
export function shouldRenderSectionRail(count: number): boolean {
  return count >= 2;
}

/**
 * Derive a short, clean label from a heading/section's text. Section headings on
 * the instrument pages can be a full sentence ("the read-time sweet spot, in
 * your hands"); the rail tooltip wants something compact. We take the text up to
 * the first sentence break and cap length, preserving the lowercase house voice.
 */
export function sectionLabel(raw: string, max = 42): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  // Cut at the first natural break (em dash, comma, colon) if there is one early.
  const broken = cleaned.split(/\s+[—–]\s+|[,:]\s+/)[0] ?? cleaned;
  const base = broken.length >= 8 ? broken : cleaned;
  if (base.length <= max) return base;
  return `${base.slice(0, max - 1).trimEnd()}…`;
}
