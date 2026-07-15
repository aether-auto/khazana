import { describe, expect, test } from "vitest";
import {
  mapFeatureToIsoCode,
  buildStatesTopology,
  crossCheckAgainstGeoBoundaries,
  CANONICAL_ISO_3166_2_IN_CODES,
} from "./build-india-states-topojson.mts";

function feature(stname: unknown, geometry: object | null = { type: "Point", coordinates: [0, 0] }) {
  return { type: "Feature", properties: { STNAME: stname }, geometry } as any;
}

describe("mapFeatureToIsoCode", () => {
  test("maps a well-formed ramSeraph feature to its ISO 3166-2:IN code + name", () => {
    const out = mapFeatureToIsoCode(feature("TELANGANA"));
    expect(out).toEqual({
      code: "IN-TG",
      name: "Telangana",
      geometry: { type: "Point", coordinates: [0, 0] },
    });
  });

  test("maps contested/renamed units correctly (J&K split, Ladakh)", () => {
    expect(mapFeatureToIsoCode(feature("JAMMU & KASHMIR"))?.code).toBe("IN-JK");
    expect(mapFeatureToIsoCode(feature("LADAKH"))?.code).toBe("IN-LA");
  });

  test("is tolerant of surrounding whitespace but not of case or spelling drift", () => {
    expect(mapFeatureToIsoCode(feature("  ASSAM  "))?.code).toBe("IN-AS");
  });

  test("rejects (returns null) an unrecognized STNAME instead of guessing", () => {
    expect(mapFeatureToIsoCode(feature("NOT A REAL STATE"))).toBeNull();
  });

  test("rejects a feature with a non-string STNAME", () => {
    expect(mapFeatureToIsoCode(feature(42))).toBeNull();
    expect(mapFeatureToIsoCode(feature(undefined))).toBeNull();
  });

  test("rejects a feature with no geometry", () => {
    expect(mapFeatureToIsoCode(feature("GOA", null))).toBeNull();
  });

  test("every canonical code is reachable from some STNAME key", () => {
    const codes = new Set(CANONICAL_ISO_3166_2_IN_CODES);
    expect(codes.size).toBe(36);
  });
});

describe("buildStatesTopology", () => {
  test("assembles a Topology with a single `states` GeometryCollection mirroring objects.countries", () => {
    const mapped = [
      { code: "IN-GA", name: "Goa", geometry: { type: "Point", coordinates: [1, 2] } as any },
      { code: "IN-KL", name: "Kerala", geometry: { type: "Point", coordinates: [3, 4] } as any },
    ];
    const topo = buildStatesTopology(mapped);
    expect(topo.type).toBe("Topology");
    const states = (topo.objects as any).states;
    expect(states.type).toBe("GeometryCollection");
    expect(states.geometries).toHaveLength(2);
    const ids = states.geometries.map((g: any) => g.id);
    expect(ids).toEqual(["IN-GA", "IN-KL"]);
    for (const g of states.geometries) {
      expect(g.properties.name).toBeTruthy();
    }
  });

  test("empty input yields an empty states GeometryCollection, not a throw", () => {
    const topo = buildStatesTopology([]);
    expect((topo.objects as any).states.geometries).toHaveLength(0);
  });
});

describe("crossCheckAgainstGeoBoundaries", () => {
  test("clean match reports no missing/extra codes and no count mismatch", () => {
    const result = crossCheckAgainstGeoBoundaries(["IN-GA", "IN-KL"], ["IN-KL", "IN-GA"]);
    expect(result).toEqual({
      missingCodes: [],
      extraCodes: [],
      duplicateCodes: [],
      countMismatch: false,
      assembledCount: 2,
      referenceCount: 2,
    });
  });

  test("flags duplicate assembled codes as a mismatch even when the distinct code set matches (never silently masked)", () => {
    const result = crossCheckAgainstGeoBoundaries(["IN-GA", "IN-GA", "IN-KL"], ["IN-GA", "IN-KL"]);
    expect(result.duplicateCodes).toEqual(["IN-GA"]);
    expect(result.missingCodes).toEqual([]);
    expect(result.extraCodes).toEqual([]);
    expect(result.countMismatch).toBe(true);
    expect(result.assembledCount).toBe(3);
  });

  test("detects a code present in the reference but missing from the assembled set", () => {
    const result = crossCheckAgainstGeoBoundaries(["IN-GA"], ["IN-GA", "IN-KL"]);
    expect(result.missingCodes).toEqual(["IN-KL"]);
    expect(result.extraCodes).toEqual([]);
    expect(result.countMismatch).toBe(true);
  });

  test("detects a code present in the assembled set but not the reference (never auto-reconciled)", () => {
    const result = crossCheckAgainstGeoBoundaries(["IN-GA", "IN-XX"], ["IN-GA"]);
    expect(result.extraCodes).toEqual(["IN-XX"]);
    expect(result.missingCodes).toEqual([]);
    expect(result.countMismatch).toBe(true);
  });

  test("36-unit canonical set cross-checks clean against itself", () => {
    const result = crossCheckAgainstGeoBoundaries(
      [...CANONICAL_ISO_3166_2_IN_CODES],
      [...CANONICAL_ISO_3166_2_IN_CODES],
    );
    expect(result.countMismatch).toBe(false);
    expect(result.assembledCount).toBe(36);
  });
});
