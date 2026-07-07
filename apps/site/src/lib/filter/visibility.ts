// ── Shared DOM show/hide binding for facet filters ───────────────────────────
// The common loop behind Feed's applyBentoFilter/applyWatchFilter/applyListenFilter
// and Workshop's apply(): read each element's facet value(s), toggle `.hidden`,
// count how many survived. Deliberately DOM-agnostic (only requires `.hidden`,
// not `HTMLElement`) so it's trivially unit-testable without jsdom, while still
// being a drop-in for real `HTMLElement`s in Astro's inline scripts.
//
// Surfaces with genuinely different show/hide behavior (the /reads FLIP-animated,
// hero-dimming filter; Sources' array-rebuild-and-render explorer) do NOT use
// this helper — they share only the `matchesFacet` predicate from ./facets.js.
import { type ActiveFacets, matchesFacet } from "./facets.js";

export interface FacetVisibilityTarget {
  hidden: boolean;
}

/**
 * Show/hide each item per `matchesFacet`, in place. Returns the number shown so
 * callers can drive their own empty-state / section-hiding affordances (those
 * differ per surface and are intentionally left to the caller).
 */
export function applyFacetVisibility<T extends FacetVisibilityTarget>(
  items: Iterable<T>,
  getValue: (item: T) => string | readonly string[],
  active: ActiveFacets,
): number {
  let shown = 0;
  for (const item of items) {
    const match = matchesFacet(getValue(item), active);
    item.hidden = !match;
    if (match) shown++;
  }
  return shown;
}
