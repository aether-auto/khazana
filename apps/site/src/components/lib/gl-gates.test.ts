// apps/site/src/components/lib/gl-gates.test.ts
//
// Direct unit coverage of the shared live-WebGL gates (isLowPower,
// prefersReducedMotion, hasWebGL) extracted into gl-gates.ts and consumed by
// Model3D.tsx and FirstLight.tsx (and the future Atlas Globe.tsx).
//
// The repo's vitest include glob runs in the Node environment (no jsdom). Node
// 21+ ships an ambient `globalThis.navigator` (userAgent "Node.js/<major>",
// deviceMemory undefined) but NO `window`/`document`. So we never rely on the
// ambient base case — every case explicitly stubs the globals it exercises via
// vi.stubGlobal and restores them in afterEach with vi.unstubAllGlobals, so
// nothing leaks into the other 88 test files in the site suite.
import { afterEach, describe, expect, test, vi } from "vitest";
import { hasWebGL, isLowPower, prefersReducedMotion } from "./gl-gates.js";

// A realistic desktop UA (no Mobi/Android) so the mobile branch cannot fire and
// deviceMemory is the only signal under test.
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isLowPower()", () => {
  test("SSR-safe: navigator undefined → true (no live GL on the server)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(typeof navigator).toBe("undefined");
    expect(isLowPower()).toBe(true);
  });

  test("mobile-UA branch: Android/Mobi UA → true even with deviceMemory unset", () => {
    vi.stubGlobal("navigator", { userAgent: MOBILE_UA });
    expect(isLowPower()).toBe(true);
  });

  test("deviceMemory<4 branch: desktop UA + deviceMemory 2 → true", () => {
    // Desktop UA isolates the memory signal: mobile short-circuit is off.
    vi.stubGlobal("navigator", { userAgent: DESKTOP_UA, deviceMemory: 2 });
    expect(isLowPower()).toBe(true);
  });

  test("high-memory desktop: desktop UA + deviceMemory 8 → false", () => {
    vi.stubGlobal("navigator", { userAgent: DESKTOP_UA, deviceMemory: 8 });
    expect(isLowPower()).toBe(false);
  });

  test("desktop UA + deviceMemory undefined → false (no signal fires)", () => {
    vi.stubGlobal("navigator", { userAgent: DESKTOP_UA });
    expect(isLowPower()).toBe(false);
  });
});

describe("prefersReducedMotion()", () => {
  test("SSR-safe: window undefined → true", () => {
    vi.stubGlobal("window", undefined);
    expect(typeof window).toBe("undefined");
    expect(prefersReducedMotion()).toBe(true);
  });

  test("window present but no matchMedia → true (defensive default)", () => {
    vi.stubGlobal("window", {});
    expect(prefersReducedMotion()).toBe(true);
  });

  test("matchMedia passthrough: matches true → true, and queries the reduce media", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("window", { matchMedia });
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  test("matchMedia passthrough: matches false → false", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("hasWebGL()", () => {
  // Hand-stub document.createElement("canvas") since there is no jsdom. The
  // canvas' getContext decides the result.
  function stubDocument(getContext: (id: string) => unknown): void {
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        expect(tag).toBe("canvas");
        return { getContext };
      },
    });
  }

  test("SSR-safe: document undefined → false", () => {
    vi.stubGlobal("document", undefined);
    expect(typeof document).toBe("undefined");
    expect(hasWebGL()).toBe(false);
  });

  test("webgl2 context available → true", () => {
    stubDocument((id) => (id === "webgl2" ? {} : null));
    expect(hasWebGL()).toBe(true);
  });

  test("webgl2 null but legacy webgl available → true (fallback chain)", () => {
    stubDocument((id) => (id === "webgl" ? {} : null));
    expect(hasWebGL()).toBe(true);
  });

  test("experimental-webgl only → true", () => {
    stubDocument((id) => (id === "experimental-webgl" ? {} : null));
    expect(hasWebGL()).toBe(true);
  });

  test("no GL context of any kind → false", () => {
    stubDocument(() => null);
    expect(hasWebGL()).toBe(false);
  });

  test("getContext throws → caught → false", () => {
    stubDocument(() => {
      throw new Error("context lost");
    });
    expect(hasWebGL()).toBe(false);
  });

  test("createElement throws → caught → false", () => {
    vi.stubGlobal("document", {
      createElement: () => {
        throw new Error("no DOM");
      },
    });
    expect(hasWebGL()).toBe(false);
  });
});
