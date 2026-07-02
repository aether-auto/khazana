// apps/site/src/components/mdx/lib/annotated-figure.ts
// Pure logic for AnnotatedFigure — pin normalization, overlap de-collision, and
// keyboard cycling. Kept DOM-free so it's unit-tested independently of React.

export interface Pin {
  /** Horizontal position, 0..1 (fraction of image width). */
  x: number;
  /** Vertical position, 0..1 (fraction of image height). */
  y: number;
  /** Short label (usually the pin number is shown; label used for a11y). */
  label: string;
  /** The revealed note. */
  note: string;
}

export interface PlacedPin extends Pin {
  /** 1-based display index. */
  n: number;
  /** Clamped x in 0..1. */
  cx: number;
  /** Clamped y in 0..1, nudged to de-collide from earlier pins. */
  cy: number;
  /** Side the popover should open toward, so it never runs off the image edge. */
  side: "left" | "right";
}

/**
 * Place pins: clamp to the image box, de-collide near-coincident pins by nudging
 * later ones downward, and choose a popover side that keeps the note on-image.
 *
 *  - `minGap` is the minimum vertical separation (in 0..1 units) enforced when two
 *    pins are also horizontally close; overlapping markers become individually
 *    hoverable (the Timeline de-collision idea, applied to 2-D pins).
 *  - a pin past the horizontal midpoint opens its note to the LEFT so a
 *    right-edge pin's popover doesn't overflow (mirrors Annotation's edge care).
 */
export function placePins(pins: Pin[], minGap = 0.05, closeX = 0.06): PlacedPin[] {
  const placed: PlacedPin[] = [];
  pins.forEach((pin, i) => {
    const cx = clamp01(pin.x);
    let cy = clamp01(pin.y);
    // Nudge down until clear of every already-placed pin that is horizontally near.
    for (const p of placed) {
      if (Math.abs(p.cx - cx) < closeX && Math.abs(p.cy - cy) < minGap) {
        cy = clamp01(p.cy + minGap);
      }
    }
    placed.push({
      ...pin,
      n: i + 1,
      cx,
      cy,
      side: cx > 0.5 ? "left" : "right",
    });
  });
  return placed;
}

/**
 * Cycle the active pin index with the keyboard.
 *  - ArrowRight / ArrowDown → next (wraps to first after last)
 *  - ArrowLeft  / ArrowUp   → prev (wraps to last before first)
 *  - Home → first, End → last, Escape → -1 (close)
 * Returns the next active index, or null if the key is unhandled.
 */
export function cyclePin(
  key: string,
  current: number,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return current <= 0 ? count - 1 : current - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "Escape":
      return -1;
    default:
      return null;
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
