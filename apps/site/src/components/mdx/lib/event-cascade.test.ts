// apps/site/src/components/mdx/lib/event-cascade.test.ts
import { describe, expect, test } from "vitest";
import {
  connectorLabel,
  clampRevealCount,
  isNodeRevealed,
  isLinkRevealed,
  revealedFromScroll,
  REVEAL_TRIGGER_OFFSET,
} from "./event-cascade.js";

describe("connectorLabel", () => {
  test("effect / undefined → 'therefore' (the default causal operator)", () => {
    expect(connectorLabel("effect")).toBe("therefore");
    expect(connectorLabel(undefined)).toBe("therefore");
  });
  test("cause → 'which drives'; turning-point → 'and so'", () => {
    expect(connectorLabel("cause")).toBe("which drives");
    expect(connectorLabel("turning-point")).toBe("and so");
  });
});

describe("clampRevealCount", () => {
  test("clamps into [0, count]", () => {
    expect(clampRevealCount(-3, 5)).toBe(0);
    expect(clampRevealCount(2, 5)).toBe(2);
    expect(clampRevealCount(9, 5)).toBe(5);
  });
  test("empty chain → 0 regardless of input", () => {
    expect(clampRevealCount(4, 0)).toBe(0);
    expect(clampRevealCount(-1, 0)).toBe(0);
  });
  test("NaN → fully revealed (safest, never blank)", () => {
    expect(clampRevealCount(Number.NaN, 5)).toBe(5);
  });
  test("truncates fractional input", () => {
    expect(clampRevealCount(2.9, 5)).toBe(2);
  });
});

describe("isNodeRevealed", () => {
  test("node i is revealed iff i < revealed", () => {
    expect(isNodeRevealed(0, 2)).toBe(true);
    expect(isNodeRevealed(1, 2)).toBe(true);
    expect(isNodeRevealed(2, 2)).toBe(false);
  });
  test("nothing revealed → no node shown", () => {
    expect(isNodeRevealed(0, 0)).toBe(false);
  });
});

describe("isLinkRevealed", () => {
  // 4 nodes → links below indices 0,1,2 (3 links); none below the last node.
  test("link below i drawn once node i+1 is revealed", () => {
    expect(isLinkRevealed(0, 2, 4)).toBe(true); // nodes 0,1 shown → link 0 drawn
    expect(isLinkRevealed(1, 2, 4)).toBe(false); // node 2 not yet shown
    expect(isLinkRevealed(1, 3, 4)).toBe(true); // node 2 now shown → link 1 drawn
  });
  test("no link below the last node", () => {
    expect(isLinkRevealed(3, 4, 4)).toBe(false);
    expect(isLinkRevealed(3, 99, 4)).toBe(false);
  });
  test("negative / out-of-range index → false", () => {
    expect(isLinkRevealed(-1, 4, 4)).toBe(false);
    expect(isLinkRevealed(5, 4, 4)).toBe(false);
  });
});

describe("revealedFromScroll", () => {
  const H = 1000;
  const line = REVEAL_TRIGGER_OFFSET * H; // 850

  test("empty tops → 0", () => {
    expect(revealedFromScroll([], H, REVEAL_TRIGGER_OFFSET)).toBe(0);
  });
  test("nothing has reached the trigger line yet → 0 revealed", () => {
    expect(revealedFromScroll([900, 1000, 1100], H, REVEAL_TRIGGER_OFFSET)).toBe(0);
  });
  test("counts nodes whose top has reached/passed the line (prefix, in order)", () => {
    // tops sorted top-to-bottom; first two are above the 850 line.
    expect(revealedFromScroll([100, 400, 900, 1200], H, REVEAL_TRIGGER_OFFSET)).toBe(2);
  });
  test("all above the line → fully revealed", () => {
    expect(revealedFromScroll([10, 20, 30], H, REVEAL_TRIGGER_OFFSET)).toBe(3);
  });
  test("exactly on the line counts as revealed (<=)", () => {
    expect(revealedFromScroll([line], H, REVEAL_TRIGGER_OFFSET)).toBe(1);
  });
  test("monotonic: revealing more never un-reveals an earlier node", () => {
    // Simulate scrolling down: every node's top decreases, reveal count only grows.
    const nodes = [200, 500, 800, 1100];
    let prev = 0;
    for (let scroll = 0; scroll <= 800; scroll += 100) {
      const tops = nodes.map((t) => t - scroll);
      const r = revealedFromScroll(tops, H, REVEAL_TRIGGER_OFFSET);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(prev).toBe(4);
  });
});
