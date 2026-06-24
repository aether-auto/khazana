// v2 motion foundation — Lenis smooth scroll + GSAP/ScrollTrigger, wired to
// Astro's View Transitions lifecycle. Loaded once from Shell.astro as a module
// <script>. Vanilla (no island) so it covers the whole document.
//
// Hard rules honoured here:
//  • reduced-motion → NO smooth scroll, NO ScrollTrigger animation (native scroll)
//  • Lenis restarts cleanly across VT navigations (astro:before-swap/after-swap)
//  • ScrollTrigger instances are killed before each swap and re-created after
//  • scroll work goes through ScrollTrigger/Lenis — never a raw scroll handler
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let lenis: Lenis | null = null;

function startLenis() {
  if (reduce || lenis) return;
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    touchMultiplier: 1.8,
  });

  // Drive Lenis from GSAP's ticker so Lenis + ScrollTrigger share one clock.
  lenis.on("scroll", ScrollTrigger.update);
  const onTick = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(onTick);
  gsap.ticker.lagSmoothing(0);
  (lenis as unknown as { _onTick?: typeof onTick })._onTick = onTick;
}

function stopLenis() {
  if (!lenis) return;
  const onTick = (lenis as unknown as { _onTick?: (t: number) => void })._onTick;
  if (onTick) gsap.ticker.remove(onTick);
  lenis.destroy();
  lenis = null;
}

// ── Scroll-responsive header condense ─────────────────────────────────────
// A single ScrollTrigger toggles `.is-scrolled` on <html> past a small
// threshold. The header reads that class for its glass/condense treatment —
// CSS does the transform/opacity work, JS only flips the class (no layout reads
// per frame, no raw scroll listener).
function initScrollState() {
  const root = document.documentElement;
  // Page reading-progress (0..1), written to a CSS custom prop the header's
  // top hairline reads as scaleX. ScrollTrigger drives it — no scroll handler.
  const progress = ScrollTrigger.create({
    start: 0,
    end: "max",
    onUpdate: (self) => {
      root.style.setProperty("--read-progress", self.progress.toFixed(4));
    },
  });
  // Condense state: toggled once we've moved past a small threshold.
  const condense = ScrollTrigger.create({
    start: "top -8",
    end: "max",
    onToggle: (self) => root.classList.toggle("is-scrolled", self.isActive),
    onRefresh: (self) => root.classList.toggle("is-scrolled", self.isActive),
  });
  root.classList.toggle("is-scrolled", window.scrollY > 8);
  return [progress, condense];
}

function killScrollTriggers() {
  for (const t of ScrollTrigger.getAll()) t.kill();
}

function init() {
  // Lenis is a no-op under reduced-motion (native scroll). ScrollTrigger works
  // on either smooth (Lenis-driven) or native scroll, so the header condense /
  // reading-progress state is wired the same way in both modes.
  startLenis();
  initScrollState();
  ScrollTrigger.refresh();
}

function teardown() {
  killScrollTriggers();
  stopLenis();
}

// Initial load.
init();

// View Transitions: tear down before the DOM swaps, rebuild after.
document.addEventListener("astro:before-swap", teardown);
document.addEventListener("astro:after-swap", () => {
  // next frame so the swapped DOM is laid out before ScrollTrigger measures.
  requestAnimationFrame(() => {
    init();
    ScrollTrigger.refresh();
  });
});

// Belt-and-braces: full unload.
window.addEventListener("beforeunload", teardown);
