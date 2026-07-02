// apps/site/src/components/mdx/lib/order-of-battle.test.ts
import { describe, expect, test } from "vitest";
import {
  normalizeOrderOfBattle,
  normalizeTone,
  normalizeKind,
  slug,
  type OOBSide,
} from "./order-of-battle.js";

const sides: OOBSide[] = [
  {
    id: "union",
    label: "Army of the Potomac",
    commander: "Maj. Gen. George Meade",
    tone: "friendly",
    formations: [
      {
        name: "I Corps",
        kind: "corps",
        strength: "≈12,000",
        commander: "John Reynolds",
        units: [
          { name: "1st Division", strength: "≈4,000" },
          { name: "2nd Division", strength: "≈4,000", note: "held Cemetery Ridge" },
        ],
      },
      { name: "Cavalry Corps", kind: "corps", commander: "Alfred Pleasonton" },
    ],
  },
  {
    // id intentionally omitted — exercises the slug-from-label derivation path.
    label: "Army of Northern Virginia",
    tone: "enemy",
    formations: [{ name: "First Corps", kind: "corps", commander: "James Longstreet" }],
  },
];

describe("normalizeTone / normalizeKind", () => {
  test("valid values pass through", () => {
    expect(normalizeTone("enemy")).toBe("enemy");
    expect(normalizeKind("division")).toBe("division");
  });
  test("defaults", () => {
    expect(normalizeTone(undefined)).toBe("neutral");
    // @ts-expect-error invalid
    expect(normalizeKind("battalion")).toBe("other");
  });
});

describe("slug", () => {
  test("lowercases + hyphenates", () => {
    expect(slug("Army of the Potomac")).toBe("army-of-the-potomac");
  });
  test("trims stray hyphens", () => {
    expect(slug("  I Corps! ")).toBe("i-corps");
  });
});

describe("normalizeOrderOfBattle", () => {
  test("carries labels + commanders + tones", () => {
    const n = normalizeOrderOfBattle(sides);
    expect(n[0].label).toBe("Army of the Potomac");
    expect(n[0].commander).toBe("Maj. Gen. George Meade");
    expect(n[0].tone).toBe("friendly");
    expect(n[1].tone).toBe("enemy");
  });

  test("derives a stable id from the label when id is missing", () => {
    const n = normalizeOrderOfBattle(sides);
    expect(n[1].id).toBe("army-of-northern-virginia");
  });

  test("keeps an explicit id", () => {
    const n = normalizeOrderOfBattle(sides);
    expect(n[0].id).toBe("union");
  });

  test("flags formations with sub-units", () => {
    const n = normalizeOrderOfBattle(sides);
    expect(n[0].formations[0].hasUnits).toBe(true);
    expect(n[0].formations[1].hasUnits).toBe(false); // Cavalry Corps has no units
  });

  test("normalizes each formation kind (default other)", () => {
    const n = normalizeOrderOfBattle([
      { id: "x", label: "X", formations: [{ name: "Task Force", kind: undefined }] },
    ]);
    expect(n[0].formations[0].kind).toBe("other");
  });

  test("formation keys are unique + stable", () => {
    const n = normalizeOrderOfBattle(sides);
    expect(n[0].formations[0].key).toBe("union-f1");
    expect(n[0].formations[1].key).toBe("union-f2");
  });

  test("blank/whitespace strengths & notes drop to undefined", () => {
    const n = normalizeOrderOfBattle([
      { id: "x", label: "X", formations: [{ name: "F", strength: "  ", note: "" }] },
    ]);
    expect(n[0].formations[0].strength).toBeUndefined();
    expect(n[0].formations[0].note).toBeUndefined();
  });

  test("empty / partial input never throws", () => {
    expect(() => normalizeOrderOfBattle([])).not.toThrow();
    expect(normalizeOrderOfBattle([])).toEqual([]);
    const n = normalizeOrderOfBattle([{ id: "", label: "", formations: [] }]);
    expect(n[0].id).toBe("side-1"); // no label → indexed fallback
    expect(n[0].formationCount).toBe(0);
  });

  test("counts formations for the summary line", () => {
    const n = normalizeOrderOfBattle(sides);
    expect(n[0].formationCount).toBe(2);
    expect(n[1].formationCount).toBe(1);
  });

  test("sub-units carry strength + note", () => {
    const n = normalizeOrderOfBattle(sides);
    const u = n[0].formations[0].units[1];
    expect(u.name).toBe("2nd Division");
    expect(u.strength).toBe("≈4,000");
    expect(u.note).toBe("held Cemetery Ridge");
  });
});
