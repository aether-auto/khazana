// face-cross.ts — pure resolver for INLINE cross-face moments (the `<CrossFaceLink>`
// tell dropped into a Study Read or an Atlas stub page), sibling to face-switch.ts
// (the bezel's own crossing). Reuses `isAtlasPath` from face-switch.ts — no
// duplicated path logic — but resolves to a DISTINCT, "quiet" transition type so
// the CSS ladder (styles/face-switch.css) can choreograph the inline crossing as a
// short atmosphere-cross-fade + wordmark-morph, never the bezel's full
// ambient-drain/edge-wash ceremony (spec: faces-cross-face-moments plan).
import { isAtlasPath } from "./face-switch.ts";

/** The two quiet cross-document view-transition types an inline `<CrossFaceLink>`
 * can fire — distinct from the bezel's `to-atlas` / `to-study` full types. */
export type CrossFaceType = "to-atlas-quiet" | "to-study-quiet";

/** The two destination faces a `<CrossFaceLink>` can point at. Anything else is a
 * type error at the call site — this union is the exhaustive contract. */
export type CrossFaceDestination = "atlas" | "study";

/**
 * Resolve the quiet crossing type for a `<CrossFaceLink>` given its destination
 * face. Pure and total over `CrossFaceDestination` — there is no third face, so
 * this never throws; TypeScript's exhaustiveness check is the real guard (any
 * value outside `"atlas" | "study"` is a compile-time error, not a runtime one).
 */
export function resolveCrossFaceType(destination: CrossFaceDestination): CrossFaceType {
  return destination === "atlas" ? "to-atlas-quiet" : "to-study-quiet";
}

/**
 * Resolve the quiet crossing type from a `href` path instead of an explicit
 * destination label — useful when `<CrossFaceLink>` is only given a raw `href`.
 * Delegates to `isAtlasPath` (face-switch.ts) so both the bezel and the inline
 * tell agree on exactly what counts as "Atlas".
 */
export function resolveCrossFaceTypeFromPath(href: string): CrossFaceType {
  return resolveCrossFaceType(isAtlasPath(href) ? "atlas" : "study");
}

/**
 * The destination-colored accent ROLE a `<CrossFaceLink>` tell renders in: the
 * tell is always colored for where it's TAKING you, not where you already are
 * (spec step 7: Study→Atlas tell reads cool slate inside the Study's warm chrome;
 * Atlas→Study tell reads warm amber inside Atlas's cold chrome). Maps 1:1 onto the
 * semantic tokens.css roles (`--accent` = amber/Study, `--info` = cool slate/Atlas).
 */
export function crossFaceAccentRole(destination: CrossFaceDestination): "accent" | "info" {
  return destination === "atlas" ? "info" : "accent";
}
