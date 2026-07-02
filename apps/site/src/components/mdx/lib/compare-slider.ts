// apps/site/src/components/mdx/lib/compare-slider.ts
// Pure logic for CompareSlider — split clamping, keyboard stepping, and the
// clip-path string for the "after" pane. Kept DOM-free so it's unit-tested
// independently of React (the island only wires these to pointer/keyboard).

/** Orientation of the wipe: "h" = vertical split moving horizontally (default),
 *  "v" = horizontal split moving vertically. */
export type Orientation = "h" | "v";

/** Clamp a split percentage into the usable 0..100 range. NaN → 50 (safe middle). */
export function clampSplit(pct: number): number {
  if (Number.isNaN(pct)) return 50;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Next split for a keyboard event, or null if the key is unhandled.
 *  - ArrowRight / ArrowUp   → +step
 *  - ArrowLeft  / ArrowDown → −step
 *  - Home → 0, End → 100, PageUp → +10·step-ish, PageDown → −…
 * The result is clamped to 0..100.
 */
export function stepSplit(
  key: string,
  current: number,
  step = 2,
): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clampSplit(current + step);
    case "ArrowLeft":
    case "ArrowDown":
      return clampSplit(current - step);
    case "PageUp":
      return clampSplit(current + step * 5);
    case "PageDown":
      return clampSplit(current - step * 5);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

/**
 * Convert a pointer position within the frame to a split percentage.
 *  - `pos` and `size` are in the same unit (px); for "h" pass clientX−left / width,
 *    for "v" pass clientY−top / height. Guards a zero-size frame.
 */
export function splitFromPointer(pos: number, size: number): number {
  if (!size || size <= 0) return 50;
  return clampSplit((pos / size) * 100);
}

/**
 * clip-path inset() that reveals the "after" image up to `split`%.
 *  - "h": clip from the right so the after-pane shows on the LEFT up to split.
 *  - "v": clip from the bottom so the after-pane shows on TOP up to split.
 * (The before image sits underneath, fully painted, so there is never a gap.)
 */
export function afterClip(split: number, orientation: Orientation): string {
  const s = clampSplit(split);
  return orientation === "v"
    ? `inset(0 0 ${100 - s}% 0)`
    : `inset(0 ${100 - s}% 0 0)`;
}
