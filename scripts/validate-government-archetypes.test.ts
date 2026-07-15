import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { GovArchetype, GovArchetypeLibrary } from "../packages/core/src/index.ts";
import { validateLibrary, validateLibraryObject } from "./validate-government-archetypes.mts";

function baseArchetype(overrides: Partial<GovArchetype> = {}): GovArchetype {
  return {
    id: "westminster-parliamentary",
    systemType: "parliamentary",
    label: "Westminster parliamentary",
    institutions: [
      { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
      { slot: "head-of-government", branch: "executive", tier: "national", kind: "head-of-government" },
      { slot: "lower-house", branch: "legislative", tier: "national", kind: "chamber" },
    ],
    edges: [
      {
        fromSlot: "head-of-government",
        toSlot: "lower-house",
        relation: "confidence",
        defaultBasis: "characteristic of a parliamentary system's confidence convention",
      },
    ],
    ...overrides,
  };
}

function libraryOf(archetypes: GovArchetype[]): GovArchetypeLibrary {
  return { version: 1, archetypes };
}

const ALL_FAMILY_ARCHETYPES: GovArchetype[] = [
  baseArchetype({ id: "westminster-parliamentary", systemType: "parliamentary" }),
  baseArchetype({ id: "continental-parliamentary", systemType: "parliamentary" }),
  baseArchetype({ id: "us-presidential", systemType: "presidential" }),
  baseArchetype({ id: "latin-american-presidential", systemType: "presidential" }),
  baseArchetype({ id: "french-semi-presidential", systemType: "semi-presidential" }),
  baseArchetype({ id: "russian-semi-presidential", systemType: "semi-presidential" }),
  baseArchetype({ id: "directorial-collegial", systemType: "directorial" }),
  baseArchetype({ id: "constitutional-monarchy", systemType: "constitutional-monarchy" }),
  baseArchetype({ id: "absolute-monarchy", systemType: "absolute-monarchy" }),
  baseArchetype({ id: "one-party-state", systemType: "one-party" }),
  baseArchetype({ id: "military-junta", systemType: "military-junta" }),
  baseArchetype({ id: "provisional-government", systemType: "provisional" }),
  baseArchetype({ id: "theocratic", systemType: "other" }),
  baseArchetype({ id: "assembly-elected-president-hybrid", systemType: "other" }),
  baseArchetype({ id: "generic-fallback", systemType: "other" }),
];

describe("validateLibrary", () => {
  test("accepts a well-formed, family-complete library", () => {
    const result = validateLibrary(libraryOf(ALL_FAMILY_ARCHETYPES));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects duplicate archetype ids", () => {
    const dup = [...ALL_FAMILY_ARCHETYPES, baseArchetype({ id: "westminster-parliamentary" })];
    const result = validateLibrary(libraryOf(dup));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('archetype "westminster-parliamentary": duplicate archetype id'))).toBe(true);
  });

  test("rejects duplicate slots within one archetype", () => {
    const bad = baseArchetype({
      institutions: [
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "head-of-state" },
        { slot: "head-of-state", branch: "executive", tier: "national", kind: "cabinet" },
      ],
    });
    const result = validateLibrary(libraryOf([...ALL_FAMILY_ARCHETYPES.slice(1), bad]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('slot "head-of-state": duplicate slot'))).toBe(true);
  });

  test("rejects empty institutions and empty edges", () => {
    const noInstitutions = baseArchetype({ id: "empty-institutions", institutions: [] });
    const noEdges = baseArchetype({ id: "empty-edges", edges: [] });
    const result = validateLibrary(libraryOf([...ALL_FAMILY_ARCHETYPES, noInstitutions, noEdges]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('archetype "empty-institutions": institutions must be non-empty'))).toBe(true);
    expect(result.errors.some((e) => e.includes('archetype "empty-edges": edges must be non-empty'))).toBe(true);
  });

  test("rejects edges whose endpoints are not declared slots", () => {
    const bad = baseArchetype({
      edges: [
        {
          fromSlot: "head-of-government",
          toSlot: "no-such-slot",
          relation: "confidence",
          defaultBasis: "characteristic of a parliamentary system's confidence convention",
        },
      ],
    });
    const result = validateLibrary(libraryOf([...ALL_FAMILY_ARCHETYPES.slice(1), bad]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('toSlot "no-such-slot" is not a declared institution slot'))).toBe(true);
  });

  test("rejects self-loop edges", () => {
    const bad = baseArchetype({
      edges: [
        {
          fromSlot: "head-of-government",
          toSlot: "head-of-government",
          relation: "confidence",
          defaultBasis: "characteristic of a parliamentary system's confidence convention",
        },
      ],
    });
    const result = validateLibrary(libraryOf([...ALL_FAMILY_ARCHETYPES.slice(1), bad]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("self-loop edges are not allowed"))).toBe(true);
  });

  test("rejects a defaultBasis that looks like a country-specific constitutional citation", () => {
    const bad = baseArchetype({
      edges: [
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "confidence",
          defaultBasis: "per Article 75 of the constitution",
        },
      ],
    });
    const result = validateLibrary(libraryOf([...ALL_FAMILY_ARCHETYPES.slice(1), bad]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("looks like a country-specific constitutional citation"))).toBe(true);
  });

  test("rejects a defaultBasis that doesn't read as a generic family convention", () => {
    const bad = baseArchetype({
      edges: [
        {
          fromSlot: "head-of-government",
          toSlot: "lower-house",
          relation: "confidence",
          defaultBasis: "the Prime Minister answers to Parliament",
        },
      ],
    });
    const result = validateLibrary(libraryOf([...ALL_FAMILY_ARCHETYPES.slice(1), bad]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("must read as a generic family convention"))).toBe(true);
  });

  test("rejects missing family coverage", () => {
    const result = validateLibrary(libraryOf([baseArchetype()]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('missing required archetype "us-presidential"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('missing required archetype "theocratic"'))).toBe(true);
  });

  test("rejects a required archetype id present with the wrong systemType", () => {
    const wrongType = ALL_FAMILY_ARCHETYPES.map((a) =>
      a.id === "theocratic" ? { ...a, systemType: "parliamentary" as const } : a,
    );
    const result = validateLibrary(libraryOf(wrongType));
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes('archetype "theocratic": expected systemType "other" for this required family, got "parliamentary"')),
    ).toBe(true);
  });
});

describe("validateLibraryObject", () => {
  test("surfaces zod schema errors for a structurally invalid payload", () => {
    const result = validateLibraryObject({ version: "not-a-number", archetypes: "not-an-array" });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("schema:"))).toBe(true);
  });

  test("non-object input fails schema validation", () => {
    const result = validateLibraryObject(null);
    expect(result.ok).toBe(false);
  });
});

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const realLibraryPath = process.env.GOV_ARCHETYPE_LIBRARY_PATH
  ? join(repoRoot, process.env.GOV_ARCHETYPE_LIBRARY_PATH)
  : undefined;

describe.skipIf(!process.env.GOV_ARCHETYPE_LIBRARY_PATH || !existsSync(realLibraryPath!))(
  "the real committed archetype library (GOV_ARCHETYPE_LIBRARY_PATH)",
  () => {
    test("validates cleanly", () => {
      const raw = JSON.parse(readFileSync(realLibraryPath!, "utf8"));
      const result = validateLibraryObject(raw);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    });
  },
);
