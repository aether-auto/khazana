// face-switch.ts — the ONLY JavaScript in the signature face-switch transition
// (two-faces design spec §4/§7). Loaded on every page via both shells, but
// wholly inert unless a genuine face crossing fires: it sets the cross-document
// view-transition `type` (`to-atlas` / `to-study`) so the direction-branched CSS
// in styles/face-switch.css can choreograph each direction differently, wires the
// no-VT `data-just-crossed` whisper-fade fallback, and listens for the
// `pagereveal` `TimeoutError` so a silent 4-second renderable-timeout degrade is
// observable rather than shipped blind.
//
// The DOM-event wiring is browser-verified (spec §8); the PURE pieces below —
// URL → transition-type resolution, TimeoutError detection, cross-document VT
// capability detection — are unit-tested in face-switch.test.ts.

export type FaceTransitionType = "to-atlas" | "to-study";

/**
 * Is this pathname an Atlas surface? `/atlas` and `/atlas/*` are Atlas; every
 * other path is the Study. Written to tolerate a deployment BASE_URL prefix
 * (e.g. `/khazana/atlas`) by matching the `atlas` path SEGMENT, never a bare
 * substring (so `/atlas-notes` in the Study would NOT be mistaken for Atlas).
 */
export function isAtlasPath(pathname: string): boolean {
  return /(^|\/)atlas(\/|$)/.test(pathname.replace(/\/+$/, "") || "/");
}

/**
 * Resolve the view-transition type for a crossing from `fromPath` to `toPath`.
 * Returns `"to-atlas"` / `"to-study"` for a genuine face crossing, or `null`
 * when both paths are the same face (same-face navigation fires NO ceremony —
 * the beat-budget rule, decision #6). A null result means "don't add any type".
 */
export function resolveFaceTransition(fromPath: string, toPath: string): FaceTransitionType | null {
  const fromAtlas = isAtlasPath(fromPath);
  const toAtlas = isAtlasPath(toPath);
  if (fromAtlas === toAtlas) return null;
  return toAtlas ? "to-atlas" : "to-study";
}

/**
 * True when `err` is a `TimeoutError` — the rejection a cross-document view
 * transition raises if the destination isn't renderable within ~4s (spec §4.4).
 * Detecting it lets us log an observable degrade instead of a blind jump-cut.
 * Matches a real `DOMException` (`.name === "TimeoutError"`) as well as any
 * throwable carrying that name, and is null/undefined-safe.
 */
export function isTimeoutError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "TimeoutError";
}

/**
 * True when the environment supports cross-document view transitions — the
 * capability gate that decides between the full choreographed ceremony and the
 * `data-just-crossed` whisper-fade fallback (~17% of traffic, spec §4.3). The
 * `pagereveal`/`pageswap` event pair is the tightest signal for cross-document
 * VT: `onpagereveal` exists on `window` exactly in the engines that ship it.
 */
export function supportsCrossDocumentVT(win: unknown): boolean {
  return typeof win === "object" && win !== null && "onpagereveal" in (win as object);
}

// ─── DOM wiring (browser-only; browser-verified per spec §8) ──────────────────
// Everything below runs solely in a real document. Guarded so importing this
// module in a Node/Vitest context (the unit tests) is a pure no-op.

interface ViewTransitionLike {
  types: { add(t: string): void };
  ready?: Promise<unknown>;
  skipTransition?: () => void;
}
interface PageSwapLikeEvent extends Event {
  viewTransition?: ViewTransitionLike | null;
  activation?: { entry?: { url?: string } | null } | null;
}
interface PageRevealLikeEvent extends Event {
  viewTransition?: { ready?: Promise<unknown> } | null;
}

/**
 * Resolve the transition type for a crossing that ARRIVED at this document from
 * `referrer` (the no-VT fade + the a11y focus-landing both key off it). Returns
 * null when there is no referrer, it is unparseable, or it is the same face.
 */
function crossedFrom(referrer: string): FaceTransitionType | null {
  if (!referrer) return null;
  let refUrl: URL;
  try {
    refUrl = new URL(referrer);
  } catch {
    return null;
  }
  // A cold open / deep-link from ANOTHER origin is not an in-session crossing
  // (spec §5.2: cross-origin arrivals get no transition beat) — its pathname is
  // usually just "/" and would spuriously resolve as a to-atlas crossing,
  // stealing focus + firing the fade. Only same-origin referrers can be a real
  // internal face crossing.
  if (refUrl.origin !== location.origin) return null;
  return resolveFaceTransition(refUrl.pathname, location.pathname);
}

/** Either quiet type an inline `<CrossFaceLink>` (face-cross.ts) can stamp via its
 * `data-face-cross-type` attribute — kept as a literal union here (not imported
 * from face-cross.ts) to avoid a circular import, since face-cross.ts itself
 * imports `isAtlasPath` from this module. */
type QuietFaceCrossType = "to-atlas-quiet" | "to-study-quiet";

function isQuietFaceCrossType(value: string | null): value is QuietFaceCrossType {
  return value === "to-atlas-quiet" || value === "to-study-quiet";
}

// Captured by `captureCrossFaceLinkClick` (click-capture, fires before the
// browser starts the navigation) and consumed by `onPageSwap` on the SAME
// outgoing document — a genuine inline `<CrossFaceLink>` click should fire its
// QUIET ladder (short atmosphere cross-fade + wordmark morph), never the
// bezel's full ambient-drain/edge-wash ceremony, even though both share the
// same underlying `resolveFaceTransition` direction. Always cleared as soon as
// it is read (or superseded by a new click) so a stale value can never leak
// into an unrelated later navigation (e.g. Back/Forward, a different link).
let pendingQuietType: QuietFaceCrossType | null = null;

/**
 * Click-capture listener (registered on `window`, capture phase, so it fires
 * BEFORE the anchor's default navigation begins): if the click originated
 * inside a `<CrossFaceLink>` (any element carrying `data-face-cross-type`),
 * stash its quiet type so the very next `pageswap` on this document can use it
 * instead of the bezel's default `to-atlas`/`to-study`.
 */
function captureCrossFaceLinkClick(event: Event): void {
  const target = event.target as Element | null;
  const anchor = target?.closest?.("a[data-face-cross-type]") ?? null;
  const attr = anchor?.getAttribute("data-face-cross-type") ?? null;
  pendingQuietType = isQuietFaceCrossType(attr) ? attr : null;
}

/**
 * Observe the renderable-timeout degrade (spec §4.4): if the transition's `ready`
 * promise rejects with a TimeoutError, the destination silently jump-cut past the
 * 4s gate — log it so the degrade is observable, never shipped blind.
 */
function observeTimeout(vt: { ready?: Promise<unknown> } | null | undefined): void {
  vt?.ready?.catch((err: unknown) => {
    if (isTimeoutError(err)) {
      console.warn("[face-switch] cross-document view transition timed out; degraded to a jump-cut.");
    }
  });
}

/**
 * On the OUTGOING document: read the destination URL and, when the crossing is a
 * genuine face change, tag the outgoing view transition with its direction type.
 * The TimeoutError observer is attached HERE (not on the incoming `pagereveal`)
 * because this module — a deferred module script — is already loaded on the
 * outgoing document, whereas on the incoming document `pagereveal` fires at first
 * paint BEFORE any deferred module runs. `pageswap` is the reliable hook.
 */
function onPageSwap(event: PageSwapLikeEvent): void {
  const vt = event.viewTransition;
  if (!vt) return; // no VT for this navigation (unsupported, or same-doc)
  const destUrl = event.activation?.entry?.url;
  if (!destUrl) return;
  let destPath: string;
  try {
    destPath = new URL(destUrl, location.href).pathname;
  } catch {
    return;
  }
  const baseType = resolveFaceTransition(location.pathname, destPath);
  // A pending quiet type only ever applies to a GENUINE crossing (baseType
  // non-null) — this guards against a same-face CrossFaceLink misuse ever
  // producing ceremony where the beat-budget rule (§7) says there should be
  // none. Always clear the pending value here so it can never leak into a
  // later, unrelated navigation on this same document.
  const type: FaceTransitionType | QuietFaceCrossType | null =
    pendingQuietType && baseType ? pendingQuietType : baseType;
  pendingQuietType = null;
  if (!type) {
    // A same-face FULL-document navigation (e.g. a ⌘K jump that assigns
    // window.location, or any same-face data-astro-reload link) would otherwise
    // get the browser's DEFAULT native root cross-fade from `@view-transition`.
    // Suppress it so non-crossing nav stays zero-ceremony (§7 beat budget).
    vt.skipTransition?.();
    return;
  }
  vt.types.add(type);
  observeTimeout(vt);
}

/**
 * Belt-and-suspenders `pagereveal` handler for the rare engines/timings where a
 * deferred module IS live before the incoming reveal (and to echo the timeout
 * observation). The load-bearing focus landing is done in `landFocusIfCrossed`
 * on module load, which is reliable regardless of pagereveal timing.
 */
function onPageReveal(event: PageRevealLikeEvent): void {
  observeTimeout(event.viewTransition);
}

/**
 * a11y focus landing (spec §8): after a genuine crossing, move focus to the
 * destination's `main` landmark (the standard accessible route-change pattern —
 * a `tabindex="-1"` programmatic target, focused without scrolling), so keyboard
 * and AT users resume at the content, never trapped, never lost. Gated to real
 * crossings (referrer = the other face) so a cold load never steals focus, and
 * only fired when focus fell back to `<body>`/nothing so we never fight a
 * screen reader that already parked focus somewhere deliberate.
 */
function landFocusIfCrossed(): void {
  if (!crossedFrom(document.referrer)) return;
  const active = document.activeElement;
  if (active && active !== document.body) return; // focus already placed — leave it
  const target =
    document.querySelector<HTMLElement>("main") ??
    document.querySelector<HTMLElement>("a.face-switch");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/**
 * No-VT fallback (spec §4.3): in engines WITHOUT cross-document VT, mark this
 * document `data-just-crossed` for ~200ms when we arrived from the other face,
 * driving the pure-CSS background-color whisper-fade. Cleared shortly after so it
 * never persists or re-fires. Skipped entirely when cross-document VT is present
 * (the ceremony already carries the crossing) — so we never double-pay.
 */
function markJustCrossed(): void {
  if (supportsCrossDocumentVT(window)) return;
  if (!crossedFrom(document.referrer)) return;
  const html = document.documentElement;
  html.setAttribute("data-just-crossed", "");
  window.setTimeout(() => html.removeAttribute("data-just-crossed"), 260);
}

/** Install every browser-side listener. Browser-only (guarded at module tail). */
export function installFaceSwitch(): void {
  window.addEventListener("click", captureCrossFaceLinkClick, true); // capture phase, before nav
  window.addEventListener("pageswap", onPageSwap as EventListener);
  window.addEventListener("pagereveal", onPageReveal as EventListener);
  markJustCrossed(); // no-VT whisper fade
  landFocusIfCrossed(); // a11y focus landing — reliable on the incoming module load
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  installFaceSwitch();
}
