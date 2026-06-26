// scripts/study-set.ts — Signature Moment B, "Setting the Type".
//
// On arrival into a read, the article title SETS itself letter-by-letter from
// light into solid Fraunces, and the study assembles around it. The View
// Transition (Astro ClientRouter) already morphs the shared title element
// forward from the ReadCard (transition:name="read-title-<slug>"); THIS script
// owns the second half — the letterpress "setting" of the glyphs and the calm
// assembly of the header frame.
//
// Hard rules honoured:
//  • The drama is in the FRAME only. We touch the title + header chrome, never
//    the prose column ([data-prose] is never selected here).
//  • prefers-reduced-motion → no animation; the title is solid instantly.
//  • No-JS / no-SplitText → the title renders fully set (the gating class is
//    only added when we are actually going to animate).
//  • transform/opacity/colour only; one dramatic beat per page (§7).
//  • Re-runs across View Transition navigations; cleans up its SplitText.
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

const reduce =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let split: SplitText | null = null;
// Guards against double-init: astro:page-load AND the first-paint fallback can
// both fire on a hard load. We only set a given title element once.
let setEl: HTMLElement | null = null;

function cleanup() {
  if (split) {
    split.revert();
    split = null;
  }
  setEl = null;
  document.documentElement.classList.remove("set-ready");
}

function setTheType() {
  const title = document.querySelector<HTMLElement>("[data-set-type]");
  if (!title) return;
  if (title === setEl) return; // already set this exact element

  cleanup();
  setEl = title;

  // No animation under reduced motion — leave the title solid and bail.
  if (reduce) return;

  // FAIL-SAFE backstop: once we gate the faint start-state on, the title glyphs
  // are at opacity:0.001 until the animation resolves them. If SplitText or the
  // GSAP timeline ever throws (plugin missing, bundle error), the glyphs must
  // NOT stay invisible. Always remove `set-ready` on any failure, and a timeout
  // unconditionally un-hides the title if the animation never completed.
  document.documentElement.classList.add("set-ready");
  const unhideTitle = () => document.documentElement.classList.remove("set-ready");
  const backstop = window.setTimeout(unhideTitle, 2000);

  let chars: Element[];
  try {
    // Split into words + chars. GSAP wraps each word's chars inside a word
    // span (.set-word), which we set to display:inline-block so the browser
    // cannot break between individual character spans mid-word. Without the
    // word wrapper the browser treats adjacent char-spans as splittable inline
    // boxes and happily breaks "Ruin" as "R|uin". The word wrapper is the only
    // correct fix — overflow-wrap/word-break on the h1 have no effect once the
    // text is decomposed into inline spans.
    split = SplitText.create(title, {
      type: "words,chars",
      charsClass: "set-char",
      wordsClass: "set-word",
    });
    chars = split.chars;
  } catch {
    window.clearTimeout(backstop);
    unhideTitle();
    if (split) {
      split.revert();
      split = null;
    }
    return;
  }
  // Each glyph arrives from faint amber light, rises a hair, and settles into
  // solid ink — the letterpress "set". Directional left→right stagger so the
  // line reads as being composed, not flickering on.
  const tl = gsap.timeline();
  tl.fromTo(
    chars,
    {
      opacity: 0,
      yPercent: 18,
      color: "var(--accent)",
      textShadow: "0 0 24px rgba(255,182,39,0.55)",
    },
    {
      opacity: 1,
      yPercent: 0,
      color: getComputedStyle(title).getPropertyValue("color") || "var(--ink)",
      textShadow: "0 0 0px rgba(255,182,39,0)",
      duration: 0.7,
      ease: "power3.out",
      stagger: { each: 0.026, from: "start" },
      onComplete: () => {
        window.clearTimeout(backstop);
        // hand the glyphs back to CSS so nothing lingers in inline styles
        gsap.set(chars, { clearProps: "color,textShadow,transform,opacity" });
        document.documentElement.classList.remove("set-ready");
        if (split) {
          split.revert();
          split = null;
        }
      },
    },
  );

  // The study assembles AROUND the setting title — the kicker, standfirst, foot
  // and rule arrive on a calm directional stagger (frame drama, not prose).
  const frame = [
    ".article-kicker",
    ".article-standfirst",
    ".article-foot",
    ".article-rule",
  ]
    .map((s) => document.querySelector<HTMLElement>(s))
    .filter((el): el is HTMLElement => el != null);

  if (frame.length) {
    gsap.fromTo(
      frame,
      { opacity: 0, y: 10 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.08,
        delay: 0.12,
      },
    );
  }
}

// Initial load + every View Transition navigation into a read.
function run() {
  // Only act on read pages (the title carries [data-set-type]).
  if (document.querySelector("[data-set-type]")) setTheType();
}

document.addEventListener("astro:page-load", run);
document.addEventListener("astro:before-swap", cleanup);
window.addEventListener("beforeunload", cleanup);
// Belt-and-braces for the very first paint (page-load fires after VT swaps; on a
// hard load it also fires, but guard against double-init via cleanup()).
if (document.readyState !== "loading") run();
else document.addEventListener("DOMContentLoaded", run);
