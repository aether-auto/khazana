// apps/site/src/components/lib/gl-gates.ts
// Shared low-power / reduced-motion gating for every live-WebGL island on the
// site. Originally a private pair of functions inside Model3D.tsx; extracted
// here the moment a SECOND component (FirstLight, the Feed masthead's OGL
// point-field — see FirstLight.tsx) needed the identical checks, exactly as
// docs/superpowers/specs/2026-07-07-atlas-globe-design.md §7 anticipates for
// the future Atlas globe too ("extract isLowPower()/prefersReducedMotion()
// into a small shared module... once Globe.tsx needs the identical pair,
// rather than pasting a third copy"). Every live-GL component on khazana
// should import from here rather than redefining these checks locally.
export function isLowPower(): boolean {
  if (typeof navigator === "undefined") return true;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const mobile = /Mobi|Android/i.test(navigator.userAgent);
  return mobile || (mem !== undefined && mem < 4);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True only when this browser can actually stand up a WebGL context — the
 * final gate alongside isLowPower()/prefersReducedMotion() before any
 * component mounts a live canvas. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}
