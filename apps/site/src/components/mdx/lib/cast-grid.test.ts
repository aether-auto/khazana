// apps/site/src/components/mdx/lib/cast-grid.test.ts
import { describe, expect, test } from "vitest";
import { normalizeCast } from "./cast-grid.js";

describe("normalizeCast", () => {
  test("numbers members 1-based and flags portraits", () => {
    const out = normalizeCast([
      { name: "Ada", role: "mathematician", note: "wrote the first algorithm", img: "/ada.avif" },
      { name: "Charles", role: "engineer", note: "designed the engine" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ n: 1, hasImg: true, img: "/ada.avif" });
    expect(out[1]).toMatchObject({ n: 2, hasImg: false });
    expect(out[1].img).toBeUndefined();
  });

  test("whitespace/empty img is treated as absent (no broken portrait)", () => {
    const out = normalizeCast([
      { name: "X", role: "r", note: "n", img: "   " },
      { name: "Y", role: "r", note: "n", img: "" },
    ]);
    expect(out[0].hasImg).toBe(false);
    expect(out[0].img).toBeUndefined();
    expect(out[1].hasImg).toBe(false);
  });

  test("trims strings and preserves sourceUrl", () => {
    const out = normalizeCast([
      { name: "  Ada  ", role: " poet ", note: "  wrote  ", sourceUrl: "https://x/ledger" },
    ]);
    expect(out[0].name).toBe("Ada");
    expect(out[0].role).toBe("poet");
    expect(out[0].note).toBe("wrote");
    expect(out[0].sourceUrl).toBe("https://x/ledger");
  });

  test("tolerates partial input without throwing", () => {
    // @ts-expect-error deliberately partial to prove runtime robustness
    const out = normalizeCast([{ name: "Solo" }]);
    expect(out[0].name).toBe("Solo");
    expect(out[0].role).toBe("");
    expect(out[0].note).toBe("");
    expect(out[0].hasImg).toBe(false);
  });

  test("empty/undefined cast → empty array", () => {
    expect(normalizeCast([])).toEqual([]);
    // @ts-expect-error prove undefined is tolerated
    expect(normalizeCast(undefined)).toEqual([]);
  });
});
