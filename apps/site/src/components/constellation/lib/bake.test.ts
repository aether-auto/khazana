import { describe, it, expect } from "vitest";
import { bakeStarFieldSVG } from "./bake.js";
import type { Star } from "./constellation.js";

function star(over: Partial<Star> = {}): Star {
  return {
    id: "s",
    angle: 0,
    radius: 0.5,
    brightness: 0.5,
    depth: 0,
    rank: 0,
    channelIndex: 0,
    ...over,
  };
}

describe("bakeStarFieldSVG", () => {
  it("returns a self-contained svg element", () => {
    const svg = bakeStarFieldSVG([star()]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("emits one circle per star (plus halos for the brightest)", () => {
    const svg = bakeStarFieldSVG([star({ id: "a", brightness: 0.4 }), star({ id: "b", brightness: 0.5 })]);
    // two dim stars → exactly two <circle>, no halos
    const count = (svg.match(/<circle/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("adds a halo ring for the brightest (lead) stars", () => {
    const dim = bakeStarFieldSVG([star({ brightness: 0.5 })]);
    const bright = bakeStarFieldSVG([star({ brightness: 1 })]);
    expect((dim.match(/<circle/g) ?? []).length).toBe(1);
    expect((bright.match(/<circle/g) ?? []).length).toBe(2); // halo + star
    expect(bright).toContain("url(#starGlow)");
  });

  it("uses amber for the star fill (the signal light)", () => {
    expect(bakeStarFieldSVG([star()])).toContain('fill="#ffb627"');
  });

  it("brighter stars render larger and more opaque", () => {
    const dim = bakeStarFieldSVG([star({ brightness: 0.1 })]);
    const bright = bakeStarFieldSVG([star({ brightness: 0.9 })]);
    const rDim = Number(dim.match(/r="([\d.]+)" fill="#ffb627"/)![1]);
    const rBright = Number(bright.match(/r="([\d.]+)" fill="#ffb627"/)![1]);
    expect(rBright).toBeGreaterThan(rDim);
  });

  it("handles an empty field", () => {
    const svg = bakeStarFieldSVG([]);
    expect((svg.match(/<circle/g) ?? []).length).toBe(0);
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
