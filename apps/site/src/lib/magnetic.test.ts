import { describe, expect, test } from "vitest";
import { magneticOffset } from "./magnetic.js";

const rect = { left: 100, top: 100, width: 200, height: 100 }; // centre (200,150)

describe("magneticOffset", () => {
  test("returns zero at the element centre", () => {
    expect(magneticOffset(200, 150, rect)).toEqual({ x: 0, y: 0 });
  });

  test("follows a fraction of the cursor distance (strength 0.3, within max)", () => {
    // cursor 40px right of centre, 30px below → 0.3 * (40, 30) = (12, 9), under max 14
    expect(magneticOffset(240, 180, rect, { max: 14 })).toEqual({ x: 12, y: 9 });
  });

  test("respects a custom strength", () => {
    // 60px right of centre * 0.5 = 30, raise max so the fraction is what's tested
    expect(magneticOffset(260, 150, rect, { strength: 0.5, max: 100 })).toEqual({
      x: 30,
      y: 0,
    });
  });

  test("clamps travel to the max on each axis", () => {
    // huge distance, but max 14 caps it both ways
    const far = magneticOffset(5000, -5000, rect, { strength: 0.3, max: 14 });
    expect(far).toEqual({ x: 14, y: -14 });
  });

  test("clamps symmetrically for negative offsets", () => {
    expect(magneticOffset(0, 0, rect, { strength: 1, max: 50 })).toEqual({
      x: -50,
      y: -50,
    });
  });
});
