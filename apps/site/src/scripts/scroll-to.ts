// Shared smooth-scroll bridge. motion-core owns the single Lenis instance for the
// whole document; this module lets any island (e.g. the site nav) reuse that same
// smooth scroll without importing Lenis again or reaching into motion-core's
// internals. motion-core calls registerLenis()/unregisterLenis() as it builds and
// tears the instance down across View Transition navigations.
//
// Reduced-motion: motion-core never creates Lenis under reduced-motion, so the
// registry is empty and scrollToY()/scrollToTop() fall back to an INSTANT native
// jump (`behavior: "auto"`). Callers therefore get the right behaviour in both
// modes without special-casing it themselves.

// A minimal structural type for just the bits we use — avoids importing Lenis's
// types into the browser bundle of consumers that don't otherwise need them.
interface LenisLike {
  scrollTo: (
    target: number | string | HTMLElement,
    opts?: { offset?: number; immediate?: boolean; duration?: number },
  ) => void;
}

let active: LenisLike | null = null;

export function registerLenis(instance: LenisLike): void {
  active = instance;
}

export function unregisterLenis(instance: LenisLike): void {
  // Only clear if the instance being torn down is the one we hold — guards
  // against an out-of-order teardown clobbering a freshly-registered instance.
  if (active === instance) active = null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Smooth-scroll to an absolute Y offset, reusing the site's Lenis when present.
 * Falls back to native scrolling (smooth when allowed, instant under
 * reduced-motion) when Lenis isn't active.
 */
export function scrollToY(y: number, offset = 0): void {
  const reduce = prefersReducedMotion();
  if (active && !reduce) {
    active.scrollTo(y + offset, { duration: 0.9 });
    return;
  }
  window.scrollTo({ top: y + offset, behavior: reduce ? "auto" : "smooth" });
}

/** Smooth-scroll a specific element into view (top-aligned, with a header offset). */
export function scrollToElement(el: HTMLElement, offset = 0): void {
  const reduce = prefersReducedMotion();
  if (active && !reduce) {
    active.scrollTo(el, { offset, duration: 0.9 });
    return;
  }
  const y = el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
}

/** Smooth-scroll back to the very top of the page. */
export function scrollToTop(): void {
  scrollToY(0);
}
