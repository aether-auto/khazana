// Baked static star-field — the ALWAYS-PRESENT fallback for First Light.
//
// Rendered server-side into the hero so the constellation exists for: no-JS,
// no-WebGL, mobile/low-memory devices, and `prefers-reduced-motion` (art-
// direction §6 perf contract). The live OGL canvas fades in OVER this; if WebGL
// never initialises, this is what the visitor sees — and it's the same data,
// the same coordinates (lib/constellation.ts), so the two never disagree.
//
// Pure string builder (no DOM) → unit-testable and zero-runtime.

import type { Star } from "./constellation.js";
import { projectXY } from "./constellation.js";

export interface BakeOptions {
  /** SVG viewBox is [-vb, -vb, 2vb, 2vb] centered on the ignition point. */
  vb?: number;
}

/** Build an inline SVG string of the resolved constellation (centered unit disc
 *  mapped into the viewBox). Brightest stars get larger radii + a soft glow. */
export function bakeStarFieldSVG(stars: Star[], opts: BakeOptions = {}): string {
  const vb = opts.vb ?? 100;
  const size = vb * 2;
  const circles: string[] = [];

  for (const s of stars) {
    const { x, y } = projectXY(s);
    const cx = round(x * vb * 0.92);
    const cy = round(y * vb * 0.92);
    // brightness → radius (px in viewBox units) + opacity
    const r = round(0.5 + s.brightness * 2.4);
    const op = round(0.28 + s.brightness * 0.72);
    // the brightest few stars (the lead cards) get a faint halo ring
    const halo =
      s.brightness > 0.85
        ? `<circle cx="${cx}" cy="${cy}" r="${round(r * 2.6)}" fill="url(#starGlow)" opacity="${round(op * 0.5)}"/>`
        : "";
    circles.push(
      `${halo}<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffb627" opacity="${op}"/>`,
    );
  }

  return [
    `<svg class="constellation-baked" viewBox="${-vb} ${-vb} ${size} ${size}" `,
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">`,
    `<defs><radialGradient id="starGlow" cx="50%" cy="50%" r="50%">`,
    `<stop offset="0%" stop-color="#ffb627" stop-opacity="0.5"/>`,
    `<stop offset="100%" stop-color="#ffb627" stop-opacity="0"/>`,
    `</radialGradient></defs>`,
    circles.join(""),
    `</svg>`,
  ].join("");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
