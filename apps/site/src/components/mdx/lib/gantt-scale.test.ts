// apps/site/src/components/mdx/lib/gantt-scale.test.ts
import { describe, expect, test } from "vitest";
import {
  layoutGantt,
  formatDuration,
  projectTime,
  type GanttTask,
} from "./gantt-scale.js";

const TASKS: GanttTask[] = [
  { label: "Design", start: 0, end: 3, note: "sketches + BOM" },
  { label: "Print", start: 3, end: 8 },
  { label: "Wire", start: 8, end: 10, note: "solder headers" },
];

describe("formatDuration", () => {
  test("days pluralize; 1 is singular", () => {
    expect(formatDuration(3, "day")).toBe("3 days");
    expect(formatDuration(1, "day")).toBe("1 day");
  });
  test("hours are invariant", () => {
    expect(formatDuration(6, "hr")).toBe("6 hr");
    expect(formatDuration(1, "hr")).toBe("1 hr");
  });
  test("fractional keeps one decimal", () => {
    expect(formatDuration(1.5, "hr")).toBe("1.5 hr");
    expect(formatDuration(2.5, "day")).toBe("2.5 days");
  });
  test("non-positive / NaN clamps to 0", () => {
    expect(formatDuration(0, "day")).toBe("0 days");
    expect(formatDuration(-4, "day")).toBe("0 days");
    expect(formatDuration(Number.NaN, "hr")).toBe("0 hr");
  });
});

describe("projectTime", () => {
  test("maps endpoints onto the track", () => {
    expect(projectTime(0, 0, 10, 100, 600)).toBe(100);
    expect(projectTime(10, 0, 10, 100, 600)).toBe(700);
    expect(projectTime(5, 0, 10, 100, 600)).toBe(400);
  });
  test("degenerate axis (min===max) collapses to track start (no NaN)", () => {
    expect(projectTime(5, 5, 5, 100, 600)).toBe(100);
  });
});

describe("layoutGantt", () => {
  test("throws on empty tasks", () => {
    expect(() => layoutGantt([], "day")).toThrow(/at least one/);
  });
  test("throws on end < start", () => {
    expect(() => layoutGantt([{ label: "x", start: 5, end: 2 }], "day")).toThrow(/end < start/);
  });
  test("throws on non-finite bounds", () => {
    expect(() =>
      layoutGantt([{ label: "x", start: 0, end: Number.POSITIVE_INFINITY }], "day"),
    ).toThrow(/finite/);
  });

  test("axis spans min start .. max end", () => {
    const l = layoutGantt(TASKS, "day");
    expect(l.min).toBe(0);
    expect(l.max).toBe(10);
  });

  test("preserves author order top-to-bottom", () => {
    const l = layoutGantt(TASKS, "day");
    expect(l.lanes.map((x) => x.label)).toEqual(["Design", "Print", "Wire"]);
  });

  test("lane y increases by rowStep per row", () => {
    const l = layoutGantt(TASKS, "day");
    const step = l.lanes[1]!.y - l.lanes[0]!.y;
    expect(step).toBe(l.rowStep);
    expect(l.lanes[2]!.y - l.lanes[1]!.y).toBe(l.rowStep);
  });

  test("height is content-sized (grows with lane count)", () => {
    const two = layoutGantt(TASKS.slice(0, 2), "day");
    const three = layoutGantt(TASKS, "day");
    expect(three.height).toBeGreaterThan(two.height);
    expect(three.height - two.height).toBe(three.rowStep);
  });

  test("bar x/w reflect start/end on the track", () => {
    const l = layoutGantt(TASKS, "day");
    const design = l.lanes[0]!;
    // start=0 → left edge at trackX
    expect(design.x).toBeCloseTo(l.trackX, 5);
    const wire = l.lanes[2]!;
    // end=10 (the max) → right edge at trackX+trackW
    expect(wire.x + wire.w).toBeCloseTo(l.trackX + l.trackW, 5);
  });

  test("zero-duration task still gets a visible min bar width", () => {
    const l = layoutGantt([{ label: "instant", start: 4, end: 4 }, { label: "b", start: 0, end: 8 }], "day");
    const instant = l.lanes[0]!;
    expect(instant.w).toBeGreaterThanOrEqual(3);
  });

  test("durationLabel is computed per unit", () => {
    const days = layoutGantt(TASKS, "day");
    expect(days.lanes[0]!.durationLabel).toBe("3 days");
    const hrs = layoutGantt(TASKS, "hr");
    expect(hrs.lanes[0]!.durationLabel).toBe("3 hr");
  });
});
