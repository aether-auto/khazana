import { describe, expect, it } from "vitest";
import {
  crossFaceAccentRole,
  resolveCrossFaceType,
  resolveCrossFaceTypeFromPath,
  type CrossFaceDestination,
} from "./face-cross.ts";

// Pure-logic contract for the inline `<CrossFaceLink>` tell (faces-cross-face-
// moments plan). Distinct from face-switch.test.ts: this resolver ALWAYS returns
// a "quiet" type (never null — an inline tell is always a genuine crossing by
// construction, unlike bezel same-face nav) and is typed exhaustively over the
// two destination faces.

describe("resolveCrossFaceType — both directions", () => {
  it('"atlas" destination resolves to "to-atlas-quiet"', () => {
    expect(resolveCrossFaceType("atlas")).toBe("to-atlas-quiet");
  });

  it('"study" destination resolves to "to-study-quiet"', () => {
    expect(resolveCrossFaceType("study")).toBe("to-study-quiet");
  });

  it("is total and exhaustive over CrossFaceDestination (no third value exists)", () => {
    const destinations: CrossFaceDestination[] = ["atlas", "study"];
    for (const d of destinations) {
      expect(["to-atlas-quiet", "to-study-quiet"]).toContain(resolveCrossFaceType(d));
    }
  });
});

describe("resolveCrossFaceTypeFromPath — reuses isAtlasPath from face-switch.ts", () => {
  it("Atlas-path hrefs resolve to to-atlas-quiet", () => {
    expect(resolveCrossFaceTypeFromPath("/atlas")).toBe("to-atlas-quiet");
    expect(resolveCrossFaceTypeFromPath("/atlas/reports/india")).toBe("to-atlas-quiet");
    // BASE_URL-prefixed deployments still resolve correctly (segment match).
    expect(resolveCrossFaceTypeFromPath("/khazana/atlas/bias")).toBe("to-atlas-quiet");
  });

  it("Study-path hrefs (including a false-positive substring) resolve to to-study-quiet", () => {
    expect(resolveCrossFaceTypeFromPath("/reads/some-post")).toBe("to-study-quiet");
    expect(resolveCrossFaceTypeFromPath("/")).toBe("to-study-quiet");
    // "/atlas-notes" is NOT an Atlas segment match — must stay Study.
    expect(resolveCrossFaceTypeFromPath("/atlas-notes")).toBe("to-study-quiet");
  });
});

describe("crossFaceAccentRole — destination-colored, never origin-colored", () => {
  it('Atlas-destination tells use the "info" (cool slate) role', () => {
    expect(crossFaceAccentRole("atlas")).toBe("info");
  });

  it('Study-destination tells use the "accent" (amber) role', () => {
    expect(crossFaceAccentRole("study")).toBe("accent");
  });
});
