// ── Shared channel/format facet filter ───────────────────────────────────────
// The ONE predicate behind every "filter by channel/format chip" surface on the
// site: Feed (bento/browse/watch/listen + the register tail), Workshop's maker
// filter, the Sources explorer's facet chips, and the /reads two-facet filter.
// Extracted so the show/hide-by-facet logic — and its edge cases (empty/"all"
// selection, OR-within a facet, an item with no value for the facet) — is
// defined once and tested once, instead of copy-pasted per surface.

/**
 * The active filter selection for one facet. An empty selection ("all" / no
 * filter) always matches everything — every surface on the site treats an
 * empty array/Set as "show everything", never "show nothing".
 */
export type ActiveFacets = ReadonlySet<string> | readonly string[];

// A plain `Array.isArray(active)` check doesn't narrow the `else` branch here
// (a `readonly string[]` isn't assignable to the `any[]` the built-in guard
// narrows to, so TS can't exclude it from the union) — an explicit predicate
// sidesteps that and narrows both branches correctly.
function isArrayActive(active: ActiveFacets): active is readonly string[] {
  return Array.isArray(active);
}

function activeSize(active: ActiveFacets): number {
  return isArrayActive(active) ? active.length : active.size;
}

function activeHas(active: ActiveFacets, value: string): boolean {
  return isArrayActive(active) ? active.includes(value) : active.has(value);
}

/**
 * Does an item match the active facet selection?
 *
 * - Empty `active` → always `true` ("all" / no filter is applied for this facet).
 * - Otherwise this is an OR-within-facet match: `itemValue` matches if ANY of its
 *   value(s) is present in `active`. Pass a single string for a single-value facet
 *   (a read's `format`, a source's `type`/`status`/`addedBy`) or an array for a
 *   multi-value facet (a feed item's `topics`, a source's `channels`).
 * - An item with no value at all for the facet (`""` or `[]`) can only ever
 *   satisfy the empty/"all" selection — it never leaks under a specific filter.
 *
 * To AND across multiple independent facets (e.g. /reads' format AND channel,
 * or Sources' type/channel/status/provenance), call this once per facet and
 * combine the booleans with `&&` — see ReadsFilter.astro and SourcesExplorer.tsx.
 */
export function matchesFacet(itemValue: string | readonly string[], active: ActiveFacets): boolean {
  if (activeSize(active) === 0) return true;
  const values = typeof itemValue === "string" ? [itemValue] : itemValue;
  return values.some((v) => activeHas(active, v));
}

/**
 * Filter a plain array of items by a single facet — the non-DOM analogue of
 * `applyFacetVisibility` (see ./visibility.ts), used by the Feed register's
 * client-side pagination, which filters `RegisterItem[]` before walking pages
 * rather than hiding rendered DOM nodes.
 */
export function filterItems<T>(
  items: readonly T[],
  getFacetValue: (item: T) => string | readonly string[],
  active: ActiveFacets,
): T[] {
  if (activeSize(active) === 0) return items.slice();
  return items.filter((item) => matchesFacet(getFacetValue(item), active));
}
