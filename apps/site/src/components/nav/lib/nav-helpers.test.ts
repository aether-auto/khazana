import { describe, expect, test } from "vitest";
import {
  activeSectionIndex,
  backFallbackHref,
  sectionLabel,
  shouldRenderSectionRail,
  shouldShowScrollTop,
} from "./nav-helpers.js";

describe("shouldShowScrollTop", () => {
  test("hidden near the top", () => {
    expect(shouldShowScrollTop(0, 800)).toBe(false);
    expect(shouldShowScrollTop(500, 800)).toBe(false);
  });

  test("appears past 1.5 viewports by default", () => {
    // 1.5 * 800 = 1200 → strictly greater
    expect(shouldShowScrollTop(1200, 800)).toBe(false);
    expect(shouldShowScrollTop(1201, 800)).toBe(true);
  });

  test("honours a custom multiplier", () => {
    expect(shouldShowScrollTop(801, 800, 1)).toBe(true);
    expect(shouldShowScrollTop(799, 800, 1)).toBe(false);
  });

  test("never shows with a zero/negative viewport", () => {
    expect(shouldShowScrollTop(9999, 0)).toBe(false);
    expect(shouldShowScrollTop(9999, -10)).toBe(false);
  });
});

describe("backFallbackHref", () => {
  test("a read falls back to the reads index (root base)", () => {
    expect(backFallbackHref("/reads/the-arithmetic-of-ruin", "/")).toBe("/reads");
    expect(backFallbackHref("/reads/the-arithmetic-of-ruin/", "/")).toBe("/reads");
  });

  test("a read falls back to the reads index (project base)", () => {
    expect(backFallbackHref("/khazana/reads/x", "/khazana/")).toBe("/khazana/reads");
  });

  test("the reads INDEX itself falls back to the feed, not itself", () => {
    expect(backFallbackHref("/reads", "/")).toBe("/");
  });

  test("any other surface falls back to the feed root", () => {
    expect(backFallbackHref("/taste", "/")).toBe("/");
    expect(backFallbackHref("/item/abc123", "/")).toBe("/");
    expect(backFallbackHref("/khazana/sources", "/khazana/")).toBe("/khazana/");
  });
});

describe("activeSectionIndex", () => {
  test("picks the topmost (smallest index) intersecting section", () => {
    expect(activeSectionIndex([3, 1, 2], 0)).toBe(1);
    expect(activeSectionIndex([4], 0)).toBe(4);
  });

  test("holds the previous index when nothing intersects (no flicker)", () => {
    expect(activeSectionIndex([], 2)).toBe(2);
  });
});

describe("shouldRenderSectionRail", () => {
  test("needs at least two sections to be a navigator", () => {
    expect(shouldRenderSectionRail(0)).toBe(false);
    expect(shouldRenderSectionRail(1)).toBe(false);
    expect(shouldRenderSectionRail(2)).toBe(true);
    expect(shouldRenderSectionRail(7)).toBe(true);
  });
});

describe("sectionLabel", () => {
  test("trims whitespace and keeps a short heading whole", () => {
    expect(sectionLabel("  where your attention lives ")).toBe("where your attention lives");
  });

  test("cuts a long sentence at the first natural break", () => {
    expect(sectionLabel("the read-time sweet spot, in your hands")).toBe(
      "the read-time sweet spot",
    );
  });

  test("cuts at an em dash", () => {
    expect(sectionLabel("the ranking — explained term by term")).toBe("the ranking");
  });

  test("falls back to the full text when the first segment is too short", () => {
    // "x" before the comma is too short to be a useful label → keep full text.
    expect(sectionLabel("x, the rest of the heading")).toBe("x, the rest of the heading");
  });

  test("ellipsises when still too long", () => {
    const long = "an extraordinarily long heading that simply will not fit in the rail tooltip at all";
    const out = sectionLabel(long, 20);
    // Capped at max (trailing space before the ellipsis is trimmed, so it may be
    // a hair under, never over).
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });
});
