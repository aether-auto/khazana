// apps/site/src/components/mdx/lib/layer-stack.ts
//
// Pure logic for <LayerStack> — the exploded/stacked layer view (a network
// stack, the OSI model, filesystem layers, a render pipeline) where each layer
// expands to show its role. No DOM, no React: just the small amount of index +
// selection arithmetic that decides which layer is active/expanded, extracted so
// the island stays a thin renderer and the logic is unit-tested.
//
// A LayerStack is a vertical stack of hairline slabs. Clicking/hovering a layer
// expands its `note` (and optional `detail`); reduced-motion and no-JS render
// ALL layers expanded (the never-blank / end-state invariant). The interaction
// is single-selection: at most one layer is "active" (expanded beyond the
// always-visible label) at a time in the JS path.

/** Optional layer orientation. Only "vertical" is supported in v1. */
export type LayerOrientation = "vertical";

/** One author-facing layer in the stack. */
export interface Layer {
  /** The always-visible layer name (e.g. "Transport", "L4"). */
  label: string;
  /** The role of this layer, revealed on expand. Plain string (serializable). */
  note: string;
  /** Optional deeper detail, shown alongside the note when expanded. */
  detail?: string;
}

/**
 * Toggle single-selection: clicking the currently-active layer collapses it
 * (returns null); clicking any other layer makes it active. Returns the next
 * active index (or null for "none expanded"). Pure.
 */
export function toggleActive(current: number | null, clicked: number): number | null {
  return current === clicked ? null : clicked;
}

/**
 * Clamp an active index into the valid range for `count` layers. Out-of-range or
 * non-finite → null (nothing active). Pure — guards against stale indices after
 * a layers-array change.
 */
export function clampActive(active: number | null, count: number): number | null {
  if (active == null || !Number.isFinite(active)) return null;
  const n = Math.trunc(active);
  if (n < 0 || n >= count) return null;
  return n;
}

/**
 * Whether layer `i` should render EXPANDED. When `reduced` (reduced-motion / no-JS
 * end state) every layer is expanded. Otherwise only the single active layer is.
 * Pure — this is the one predicate the renderer needs per layer.
 */
export function isExpanded(i: number, active: number | null, reduced: boolean): boolean {
  if (reduced) return true;
  return active === i;
}

/**
 * Keyboard navigation within the stack: Up/Down (or Left/Right) move the active
 * layer by one slab and clamp at the ends; Home/End jump to the first/last;
 * Enter/Space are handled natively by the slab <button>. Returns the next active
 * index, or null when the key is unhandled (caller ignores). Pure.
 */
export function stepActive(
  key: string,
  current: number | null,
  count: number,
): number | null {
  if (count <= 0) return null;
  const cur = current == null ? -1 : current;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(count - 1, cur + 1);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(0, cur < 0 ? 0 : cur - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
