// Wire magnetic-hover to any [data-magnetic] element (e.g. the ⌘K trigger).
// Uses the pure, unit-tested magneticOffset(); transform-only; reduced-motion
// disables it entirely. Re-binds across View Transition navigations.
import { magneticOffset } from "../lib/magnetic";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Bound {
  el: HTMLElement;
  move: (e: MouseEvent) => void;
  leave: () => void;
}
let bound: Bound[] = [];

function unbind() {
  for (const b of bound) {
    b.el.removeEventListener("mousemove", b.move);
    b.el.removeEventListener("mouseleave", b.leave);
    b.el.style.transform = "";
  }
  bound = [];
}

function bind() {
  if (reduce) return;
  for (const el of document.querySelectorAll<HTMLElement>("[data-magnetic]")) {
    const strength = Number(el.dataset.magneticStrength ?? "0.3");
    const max = Number(el.dataset.magneticMax ?? "8");
    const move = (e: MouseEvent) => {
      const off = magneticOffset(e.clientX, e.clientY, el.getBoundingClientRect(), {
        strength,
        max,
      });
      el.style.transform = `translate(${off.x}px, ${off.y}px)`;
    };
    const leave = () => {
      el.style.transform = "";
    };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    bound.push({ el, move, leave });
  }
}

bind();
document.addEventListener("astro:before-swap", unbind);
document.addEventListener("astro:after-swap", bind);
