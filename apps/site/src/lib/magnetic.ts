// Pure math for the magnetic-hover micro-interaction. Kept framework-free and
// side-effect-free so it can be unit-tested and reused by header + feature card.
//
// Given the pointer position, an element's bounding box, a pull strength and a
// max travel, returns the transform offset (px) the element should ease toward.
// The element translates a fraction of the cursor's distance from its centre,
// clamped so it never wanders too far — that clamp is what makes it feel
// "magnetic" rather than "draggy".

export interface Rectish {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MagneticOptions {
  /** Fraction of cursor distance to follow (0 = none, 1 = stick to cursor). */
  strength?: number;
  /** Maximum travel from rest, in px, on each axis. */
  max?: number;
}

export interface Offset {
  x: number;
  y: number;
}

function clamp(v: number, limit: number): number {
  if (v > limit) return limit;
  if (v < -limit) return -limit;
  return v;
}

/**
 * Compute the magnetic offset for an element.
 * @param pointerX clientX of the pointer
 * @param pointerY clientY of the pointer
 * @param rect     element bounding box (getBoundingClientRect-shaped)
 */
export function magneticOffset(
  pointerX: number,
  pointerY: number,
  rect: Rectish,
  opts: MagneticOptions = {},
): Offset {
  const strength = opts.strength ?? 0.3;
  const max = opts.max ?? 14;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return {
    x: clamp((pointerX - cx) * strength, max),
    y: clamp((pointerY - cy) * strength, max),
  };
}
