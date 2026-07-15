import { describe, expect, it } from "vitest";
import {
  isAtlasPath,
  isTimeoutError,
  resolveFaceTransition,
  supportsCrossDocumentVT,
} from "./face-switch.ts";

// Pure-logic contract for the signature face-switch transition (spec §4). The
// DOM-event wiring (pageswap/pagereveal/focus) is browser-verified; here we lock
// the two testable pieces the choreography hinges on: destination-URL → type
// resolution (both directions + same-face no-op) and the TimeoutError branch.

describe("isAtlasPath", () => {
  it("treats /atlas and /atlas/* as Atlas", () => {
    expect(isAtlasPath("/atlas")).toBe(true);
    expect(isAtlasPath("/atlas/")).toBe(true);
    expect(isAtlasPath("/atlas/browser")).toBe(true);
    expect(isAtlasPath("/atlas/reports/india")).toBe(true);
  });

  it("treats every other path as the Study", () => {
    expect(isAtlasPath("/")).toBe(false);
    expect(isAtlasPath("/reads")).toBe(false);
    expect(isAtlasPath("/workshop")).toBe(false);
    // a Study path that merely starts with the letters "atlas" is NOT Atlas.
    expect(isAtlasPath("/atlas-notes")).toBe(false);
  });

  it("tolerates a deployment BASE_URL prefix (matches the atlas SEGMENT)", () => {
    expect(isAtlasPath("/khazana/atlas")).toBe(true);
    expect(isAtlasPath("/khazana/atlas/bias")).toBe(true);
    expect(isAtlasPath("/khazana/")).toBe(false);
  });
});

describe("resolveFaceTransition — both directions", () => {
  it("Study → Atlas resolves to `to-atlas`", () => {
    expect(resolveFaceTransition("/", "/atlas")).toBe("to-atlas");
    expect(resolveFaceTransition("/reads", "/atlas/browser")).toBe("to-atlas");
  });

  it("Atlas → Study resolves to `to-study`", () => {
    expect(resolveFaceTransition("/atlas", "/")).toBe("to-study");
    expect(resolveFaceTransition("/atlas/reports/india", "/workshop")).toBe("to-study");
  });

  it("same-face navigation resolves to null (fires NO ceremony — beat budget)", () => {
    expect(resolveFaceTransition("/", "/reads")).toBeNull();
    expect(resolveFaceTransition("/reads", "/workshop")).toBeNull();
    expect(resolveFaceTransition("/atlas", "/atlas/bias")).toBeNull();
    expect(resolveFaceTransition("/atlas/browser", "/atlas/sources")).toBeNull();
  });
});

describe("isTimeoutError — the renderable-timeout branch", () => {
  it("is true for a DOMException-shaped TimeoutError", () => {
    expect(isTimeoutError({ name: "TimeoutError", message: "timed out" })).toBe(true);
    // a real DOMException in environments that expose the constructor.
    if (typeof DOMException !== "undefined") {
      expect(isTimeoutError(new DOMException("gone", "TimeoutError"))).toBe(true);
    }
  });

  it("is false for any other error or non-error value", () => {
    expect(isTimeoutError(new Error("boom"))).toBe(false);
    expect(isTimeoutError({ name: "AbortError" })).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
    expect(isTimeoutError("TimeoutError")).toBe(false);
  });
});

describe("supportsCrossDocumentVT — the fallback capability gate", () => {
  it("is true when the window exposes onpagereveal", () => {
    expect(supportsCrossDocumentVT({ onpagereveal: null })).toBe(true);
  });

  it("is false when onpagereveal is absent or the arg is not an object", () => {
    expect(supportsCrossDocumentVT({})).toBe(false);
    expect(supportsCrossDocumentVT(undefined)).toBe(false);
    expect(supportsCrossDocumentVT(null)).toBe(false);
  });
});
