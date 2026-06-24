// apps/site/src/components/mdx/lib/timeline-scale.test.ts
import { expect, test } from "vitest";
import { buildTimelineScale, type TimelineEvent } from "./timeline-scale.js";

const events: TimelineEvent[] = [
  { date: "1941-09-08", label: "Siege begins" },
  { date: "1942-01-24", label: "Ration raised", detail: "to 250g" },
  { date: "1943-01-18", label: "Corridor opened" },
];

test("maps first event to x=0 and last to x=width within margins", () => {
  const s = buildTimelineScale(events, 1000);
  expect(s.points[0].x).toBe(0);
  expect(s.points[2].x).toBe(1000);
});

test("positions are proportional to elapsed time (monotonic, in order)", () => {
  const s = buildTimelineScale(events, 1000);
  expect(s.points[1].x).toBeGreaterThan(s.points[0].x);
  expect(s.points[1].x).toBeLessThan(s.points[2].x);
  // (Jan24'42 - Sep8'41) / (Jan18'43 - Sep8'41) * 1000 ≈ 277.7
  // Computed: ~138 days / ~497 days * 1000
  expect(s.points[1].x).toBeCloseTo(278, 0);
});

test("carries label + detail through, sorted by date even if input unsorted", () => {
  const shuffled = [events[2], events[0], events[1]];
  const s = buildTimelineScale(shuffled, 1000);
  expect(s.points.map((p) => p.label)).toEqual([
    "Siege begins",
    "Ration raised",
    "Corridor opened",
  ]);
  expect(s.points[1].detail).toBe("to 250g");
});

test("emits year tick marks spanning the range", () => {
  const s = buildTimelineScale(events, 1000);
  expect(s.ticks.map((t) => t.year)).toEqual([1941, 1942, 1943]);
  expect(s.ticks[0].x).toBeGreaterThanOrEqual(0);
  expect(s.ticks.at(-1)!.x).toBeLessThanOrEqual(1000);
});

test("single event sits at x=0", () => {
  const s = buildTimelineScale([events[0]], 1000);
  expect(s.points[0].x).toBe(0);
  expect(s.ticks.length).toBeGreaterThanOrEqual(1);
});

test("rejects empty input", () => {
  expect(() => buildTimelineScale([], 1000)).toThrow(/event/i);
});

test("rejects unparseable dates", () => {
  expect(() => buildTimelineScale([{ date: "not-a-date", label: "x" }], 1000)).toThrow(/date/i);
});
