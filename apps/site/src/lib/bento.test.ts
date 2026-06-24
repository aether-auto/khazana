import { describe, expect, test } from "vitest";
import { assignBento, type BentoSize } from "./bento.js";

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe("assignBento", () => {
  test("promotes the first item to a feature by default", () => {
    const cells = assignBento(ids(5));
    expect(cells[0].size).toBe("feature");
    expect(cells[0].index).toBe(0);
  });

  test("can opt out of the feature lead", () => {
    const cells = assignBento(ids(3), { feature: false });
    expect(cells[0].size).not.toBe("feature");
  });

  test("preserves item identity and order", () => {
    const items = ids(6);
    const cells = assignBento(items);
    expect(cells.map((c) => c.item)).toEqual(items);
    expect(cells.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("only the first item is ever a feature", () => {
    const cells = assignBento(ids(40));
    const features = cells.filter((c) => c.size === "feature");
    expect(features).toHaveLength(1);
  });

  test("produces a varied mosaic (not a uniform grid)", () => {
    const cells = assignBento(ids(13));
    const sizes = new Set<BentoSize>(cells.slice(1).map((c) => c.size));
    // at least three distinct sizes among the non-feature cells
    expect(sizes.size).toBeGreaterThanOrEqual(3);
  });

  test("is deterministic for a given length", () => {
    expect(assignBento(ids(20)).map((c) => c.size)).toEqual(
      assignBento(ids(20)).map((c) => c.size),
    );
  });

  test("handles empty + single-item lists", () => {
    expect(assignBento([])).toEqual([]);
    expect(assignBento(ids(1))[0].size).toBe("feature");
  });
});
