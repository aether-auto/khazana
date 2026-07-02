// apps/site/src/components/mdx/lib/annotated-figure.test.ts
import { expect, test } from "vitest";
import { placePins, cyclePin, type Pin } from "./annotated-figure.js";

const P = (x: number, y: number, label = "p", note = "n"): Pin => ({ x, y, label, note });

test("placePins clamps x/y into 0..1 and numbers 1-based", () => {
  const out = placePins([P(-0.5, 2), P(0.3, 0.4)]);
  expect(out[0].cx).toBe(0);
  expect(out[0].cy).toBe(1);
  expect(out[0].n).toBe(1);
  expect(out[1].n).toBe(2);
});

test("placePins opens right-half pins to the left (edge safety)", () => {
  const out = placePins([P(0.2, 0.2), P(0.8, 0.2)]);
  expect(out[0].side).toBe("right");
  expect(out[1].side).toBe("left");
});

test("placePins de-collides near-coincident pins by nudging down", () => {
  const out = placePins([P(0.5, 0.5), P(0.51, 0.51)], 0.05, 0.06);
  // second pin was within closeX & minGap → pushed to >= first.cy + minGap
  expect(out[1].cy).toBeGreaterThanOrEqual(out[0].cy + 0.05 - 1e-9);
});

test("placePins leaves far-apart pins untouched", () => {
  const out = placePins([P(0.1, 0.1), P(0.9, 0.9)]);
  expect(out[1].cy).toBeCloseTo(0.9);
});

test("cyclePin wraps forward and backward", () => {
  expect(cyclePin("ArrowRight", -1, 3)).toBe(0);
  expect(cyclePin("ArrowRight", 2, 3)).toBe(0); // wrap
  expect(cyclePin("ArrowDown", 0, 3)).toBe(1);
  expect(cyclePin("ArrowLeft", 0, 3)).toBe(2); // wrap back
  expect(cyclePin("ArrowUp", 2, 3)).toBe(1);
});

test("cyclePin Home/End/Escape", () => {
  expect(cyclePin("Home", 2, 3)).toBe(0);
  expect(cyclePin("End", 0, 3)).toBe(2);
  expect(cyclePin("Escape", 1, 3)).toBe(-1);
});

test("cyclePin ignores unrelated keys and empty pin sets", () => {
  expect(cyclePin("a", 0, 3)).toBeNull();
  expect(cyclePin("ArrowRight", 0, 0)).toBeNull();
});
