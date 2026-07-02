// apps/site/src/components/mdx/lib/force-comparison.test.ts
import { describe, expect, test } from "vitest";
import {
  layoutForceComparison,
  computeRatio,
  formatRatio,
  formatForceValue,
  normalizeTone,
  type ForceComparisonProps,
} from "./force-comparison.js";

const props: ForceComparisonProps = {
  sides: [
    { label: "Union", tone: "friendly" },
    { label: "Confederate", tone: "enemy" },
  ],
  metrics: [
    { label: "Troops", values: [93921, 71699], unit: "men" },
    { label: "Artillery", values: [372, 283], unit: "guns" },
    { label: "Casualties", values: [23049, 28063], unit: "men", higherIsWorse: true },
  ],
};

describe("normalizeTone", () => {
  test("passes valid tones through", () => {
    expect(normalizeTone("friendly")).toBe("friendly");
    expect(normalizeTone("enemy")).toBe("enemy");
    expect(normalizeTone("neutral")).toBe("neutral");
  });
  test("defaults missing/unknown to neutral", () => {
    expect(normalizeTone(undefined)).toBe("neutral");
    // @ts-expect-error deliberately invalid
    expect(normalizeTone("bogus")).toBe("neutral");
  });
});

describe("formatForceValue", () => {
  test("groups thousands", () => {
    expect(formatForceValue(93921)).toBe("93,921");
  });
  test("appends unit when given", () => {
    expect(formatForceValue(372, "guns")).toBe("372 guns");
  });
  test("keeps fractional precision bounded", () => {
    expect(formatForceValue(3.14159)).toBe("3.14");
  });
  test("non-finite → em dash", () => {
    expect(formatForceValue(NaN)).toBe("—");
  });
});

describe("computeRatio", () => {
  test("bigger over smaller, one decimal", () => {
    expect(computeRatio([93921, 71699])).toBe(1.3);
    expect(computeRatio([300, 100])).toBe(3);
  });
  test("large ratios round to whole", () => {
    expect(computeRatio([1200, 100])).toBe(12);
  });
  test("order-independent", () => {
    expect(computeRatio([100, 300])).toBe(computeRatio([300, 100]));
  });
  test("null when a side is zero or missing", () => {
    expect(computeRatio([300, 0])).toBeNull();
    expect(computeRatio([300])).toBeNull();
    expect(computeRatio([300, NaN])).toBeNull();
  });
});

describe("formatRatio", () => {
  test("whole vs decimal formatting", () => {
    expect(formatRatio(3)).toBe("3:1");
    expect(formatRatio(3.2)).toBe("3.2:1");
    expect(formatRatio(null)).toBe("—");
  });
});

describe("layoutForceComparison", () => {
  test("throws on no sides", () => {
    expect(() => layoutForceComparison({ sides: [], metrics: [] })).toThrow(/at least one/);
  });

  test("normalizes side tones", () => {
    const l = layoutForceComparison(props);
    expect(l.sides.map((s) => s.tone)).toEqual(["friendly", "enemy"]);
  });

  test("larger side fills the half (frac === 1) and is marked isMax", () => {
    const l = layoutForceComparison(props);
    const troops = l.rows[0];
    expect(troops.cells[0].frac).toBe(1); // Union larger
    expect(troops.cells[0].isMax).toBe(true);
    expect(troops.cells[1].isMax).toBe(false);
    // smaller side scaled proportionally, strictly between 0 and 1
    expect(troops.cells[1].frac).toBeGreaterThan(0);
    expect(troops.cells[1].frac).toBeLessThan(1);
  });

  test("bar fraction is proportional to magnitude", () => {
    const l = layoutForceComparison(props);
    const troops = l.rows[0];
    expect(troops.cells[1].frac).toBeCloseTo(71699 / 93921, 5);
  });

  test("ratio + label per row", () => {
    const l = layoutForceComparison(props);
    expect(l.rows[0].ratio).toBe(1.3);
    expect(l.rows[0].ratioLabel).toBe("1.3:1");
    expect(l.rows[1].ratioLabel).toBe("1.3:1"); // 372/283 ≈ 1.31
  });

  test("advantage points to the LARGER side normally", () => {
    const l = layoutForceComparison(props);
    expect(l.rows[0].advantageSide).toBe(0); // Union has more troops
    expect(l.rows[0].cells[0].isAdvantaged).toBe(true);
    expect(l.rows[0].cells[1].isAdvantaged).toBe(false);
  });

  test("higherIsWorse flips advantage to the SMALLER side", () => {
    const l = layoutForceComparison(props);
    const cas = l.rows[2]; // casualties: Union 23049 < Confederate 28063
    expect(cas.higherIsWorse).toBe(true);
    expect(cas.advantageSide).toBe(0); // Union suffered fewer → advantaged
    // but the bigger BAR is still the Confederate (more casualties)
    expect(cas.cells[1].isMax).toBe(true);
    expect(cas.cells[1].frac).toBe(1);
  });

  test("missing value renders as em dash with zero bar", () => {
    const l = layoutForceComparison({
      sides: props.sides,
      metrics: [{ label: "Ships", values: [12], unit: "ships" }],
    });
    const row = l.rows[0];
    expect(row.cells[1].display).toBe("—");
    expect(row.cells[1].frac).toBe(0);
    expect(row.ratioLabel).toBe("—"); // no ratio without two finite values
  });

  test("display strings carry grouping + unit", () => {
    const l = layoutForceComparison(props);
    expect(l.rows[0].cells[0].display).toBe("93,921 men");
  });

  test("pct is a valid CSS width string", () => {
    const l = layoutForceComparison(props);
    for (const row of l.rows) {
      for (const c of row.cells) {
        expect(c.pct).toMatch(/^\d+(\.\d+)?%$/);
      }
    }
  });
});
