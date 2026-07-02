// apps/site/src/components/mdx/lib/battle-map.test.ts
// Unit tests for the pure <BattleMap> logic: side→token color, phase indexing,
// coordinate→SVG mapping, unit glyphs, arrow geometry, and front paths.
import { describe, expect, test } from "vitest";
import {
  toneColor,
  resolveSides,
  sideById,
  clampPhase,
  canGoPrev,
  canGoNext,
  stepPhase,
  clamp01,
  toSvg,
  popoverSide,
  normalizeUnitType,
  unitGlyph,
  normalizeMovementKind,
  arrowGeometry,
  dashParams,
  frontGeometry,
  phaseList,
  phaseSummary,
} from "./battle-map.js";

describe("toneColor → design tokens (never hardcoded hex)", () => {
  test("friendly is amber accent", () => {
    expect(toneColor("friendly")).toEqual({ color: "var(--accent)", colorDim: "var(--accent-dim)" });
  });
  test("enemy is clay editorial", () => {
    expect(toneColor("enemy")).toEqual({ color: "var(--editorial)", colorDim: "var(--editorial-dim)" });
  });
  test("neutral is faint ink", () => {
    expect(toneColor("neutral")).toEqual({ color: "var(--ink-faint)", colorDim: "var(--ink-label)" });
  });
  test("undefined tone falls back to neutral", () => {
    expect(toneColor(undefined).color).toBe("var(--ink-faint)");
  });
  test("no token is a literal hex", () => {
    for (const t of ["friendly", "enemy", "neutral", undefined] as const) {
      const { color, colorDim } = toneColor(t);
      expect(color).toMatch(/^var\(--/);
      expect(colorDim).toMatch(/^var\(--/);
    }
  });
});

describe("resolveSides / sideById", () => {
  const { list, byId } = resolveSides([
    { id: "us", label: "US", tone: "friendly" },
    { id: "de", label: "Germany", tone: "enemy" },
    { id: "civ", label: "Civilians" }, // default neutral
  ]);
  test("attaches resolved tone + color", () => {
    expect(list[0]).toMatchObject({ tone: "friendly", color: "var(--accent)" });
    expect(list[2]).toMatchObject({ tone: "neutral", color: "var(--ink-faint)" });
  });
  test("byId lookup", () => {
    expect(sideById(byId, "de").label).toBe("Germany");
  });
  test("unknown id → neutral placeholder, never throws", () => {
    const s = sideById(byId, "ghost");
    expect(s.tone).toBe("neutral");
    expect(s.color).toBe("var(--ink-faint)");
  });
  test("undefined sides → empty list", () => {
    expect(resolveSides(undefined).list).toEqual([]);
  });
});

describe("phase indexing", () => {
  test("clampPhase bounds + floors", () => {
    expect(clampPhase(-3, 4)).toBe(0);
    expect(clampPhase(9, 4)).toBe(3);
    expect(clampPhase(2.9, 4)).toBe(2);
    expect(clampPhase(0, 0)).toBe(0);
  });
  test("canGoPrev / canGoNext", () => {
    expect(canGoPrev(0)).toBe(false);
    expect(canGoPrev(1)).toBe(true);
    expect(canGoNext(0, 3)).toBe(true);
    expect(canGoNext(2, 3)).toBe(false);
  });
  test("stepPhase does NOT wrap (battles have a start/end)", () => {
    expect(stepPhase("ArrowRight", 0, 3)).toBe(1);
    expect(stepPhase("ArrowRight", 2, 3)).toBe(2); // clamped, no wrap
    expect(stepPhase("ArrowLeft", 0, 3)).toBe(0); // clamped, no wrap
    expect(stepPhase("PageDown", 1, 3)).toBe(2);
    expect(stepPhase("PageUp", 1, 3)).toBe(0);
    expect(stepPhase("Home", 2, 3)).toBe(0);
    expect(stepPhase("End", 0, 3)).toBe(2);
    expect(stepPhase("x", 1, 3)).toBeNull();
    expect(stepPhase("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("coordinate → SVG mapping", () => {
  test("clamp01", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
  });
  test("toSvg maps 0..1 into the image pixel box", () => {
    expect(toSvg([0, 0], 800, 600)).toEqual([0, 0]);
    expect(toSvg([1, 1], 800, 600)).toEqual([800, 600]);
    expect(toSvg([0.5, 0.5], 800, 600)).toEqual([400, 300]);
  });
  test("toSvg clamps stray coords onto the map", () => {
    expect(toSvg([2, -1], 800, 600)).toEqual([800, 0]);
  });
  test("toSvg tolerates zero/negative dims (fallback box)", () => {
    expect(toSvg([1, 1], 0, 0)).toEqual([1000, 1000]);
  });
  test("popoverSide flips near the right edge", () => {
    expect(popoverSide(0.2)).toBe("right");
    expect(popoverSide(0.9)).toBe("left");
  });
});

describe("unit glyphs", () => {
  test("normalizeUnitType defaults unknown → infantry", () => {
    expect(normalizeUnitType("armor")).toBe("armor");
    expect(normalizeUnitType("dragon")).toBe("infantry");
    expect(normalizeUnitType(undefined)).toBe("infantry");
  });
  test("boxed types carry the NATO box; naval/air/hq do not", () => {
    for (const t of ["infantry", "armor", "cavalry", "artillery"] as const) {
      expect(unitGlyph(t).box).toBe(true);
    }
    for (const t of ["naval", "air", "hq"] as const) {
      expect(unitGlyph(t).box).toBe(false);
    }
  });
  test("box is 3:2 (h = w*2/3)", () => {
    const g = unitGlyph("infantry", 15);
    expect(g.h).toBeCloseTo(10, 5);
  });
  test("each type produces at least one drawn part", () => {
    for (const t of ["infantry", "armor", "cavalry", "artillery", "naval", "air", "hq"] as const) {
      expect(unitGlyph(t).parts.length).toBeGreaterThan(0);
    }
  });
  test("infantry has two crossing lines (the X)", () => {
    const lines = unitGlyph("infantry").parts.filter((p) => p.kind === "line");
    expect(lines).toHaveLength(2);
  });
  test("armor uses an ellipse; artillery a filled dot", () => {
    expect(unitGlyph("armor").parts.some((p) => p.kind === "ellipse")).toBe(true);
    expect(unitGlyph("artillery").parts.some((p) => p.kind === "circle" && p.fill)).toBe(true);
  });
});

describe("movement arrows", () => {
  test("normalizeMovementKind default → advance", () => {
    expect(normalizeMovementKind("attack")).toBe("attack");
    expect(normalizeMovementKind("teleport")).toBe("advance");
    expect(normalizeMovementKind(undefined)).toBe("advance");
  });
  test("arrowGeometry builds a curved shaft + a filled head + a mid + length", () => {
    const g = arrowGeometry([0, 0], [1, 0], 1000, 500);
    expect(g.d).toMatch(/^M .* Q .* /);
    expect(g.head).toMatch(/Z$/);
    expect(g.length).toBeGreaterThan(0);
    // horizontal arrow → mid roughly at x=500
    expect(g.mid[0]).toBeGreaterThan(400);
    expect(g.mid[0]).toBeLessThan(600);
  });
  test("degenerate (from == to) does not throw / NaN", () => {
    const g = arrowGeometry([0.5, 0.5], [0.5, 0.5], 800, 600);
    expect(g.d).not.toMatch(/NaN/);
    expect(g.head).not.toMatch(/NaN/);
    expect(Number.isFinite(g.length)).toBe(true);
  });
  test("dashParams: offset equals array (undrawn start)", () => {
    const { array, offset } = dashParams(240);
    expect(array).toBe(240);
    expect(offset).toBe(240);
  });
  test("dashParams floors at 1 for degenerate length", () => {
    expect(dashParams(0).array).toBe(1);
  });
});

describe("front lines / control areas", () => {
  test("line → open polyline path", () => {
    const g = frontGeometry({ kind: "line", points: [[0, 0], [0.5, 0.5], [1, 0]] }, 1000, 1000);
    expect(g.kind).toBe("line");
    expect(g.d).toBe("M 0 0 L 500 500 L 1000 0");
    expect(g.d).not.toMatch(/Z$/);
  });
  test("area → closed polygon path", () => {
    const g = frontGeometry({ kind: "area", points: [[0, 0], [1, 0], [1, 1]] }, 1000, 1000);
    expect(g.kind).toBe("area");
    expect(g.d).toMatch(/Z$/);
  });
  test("fewer than 2 points → empty d, skipped safely", () => {
    expect(frontGeometry({ points: [[0, 0]] }, 100, 100).d).toBe("");
    expect(frontGeometry({ points: [] }, 100, 100).d).toBe("");
  });
  test("carries the side id for color lookup", () => {
    expect(frontGeometry({ side: "de", points: [[0, 0], [1, 1]] }, 10, 10).side).toBe("de");
  });
});

describe("phase model helpers", () => {
  test("phaseList tolerates undefined", () => {
    expect(phaseList(undefined)).toEqual([]);
  });
  test("phaseSummary counts forces", () => {
    expect(
      phaseSummary({
        title: "x",
        units: [{ side: "a", type: "infantry", at: [0, 0] }, { side: "a", type: "armor", at: [0, 0] }],
        movements: [{ side: "a", from: [0, 0], to: [1, 1] }],
        fronts: [{ points: [[0, 0], [1, 1]] }],
      }),
    ).toBe("2 units · 1 move · 1 front");
  });
  test("empty phase summary is an empty string", () => {
    expect(phaseSummary({ title: "quiet" })).toBe("");
  });
});
