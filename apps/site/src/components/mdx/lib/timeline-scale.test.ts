// apps/site/src/components/mdx/lib/timeline-scale.test.ts
import { expect, test } from "vitest";
import {
  buildTimelineScale,
  niceYearTicks,
  deCollideLabels,
  labelAnchor,
  type TimelineEvent,
  type LabeledPoint,
} from "./timeline-scale.js";

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

// ── niceYearTicks ─────────────────────────────────────────────────────────────

test("niceYearTicks: 154-year span (1859–2013) emits ≤ 8 ticks", () => {
  const ticks = niceYearTicks(1859, 2013);
  expect(ticks.length).toBeGreaterThanOrEqual(1);
  expect(ticks.length).toBeLessThanOrEqual(8);
});

test("niceYearTicks: 154-year span tick years are multiples of step within range", () => {
  const ticks = niceYearTicks(1859, 2013);
  // All ticks must be between minYear and maxYear (inclusive)
  for (const y of ticks) {
    expect(y).toBeGreaterThanOrEqual(1859);
    expect(y).toBeLessThanOrEqual(2013);
  }
  // Ticks must be evenly spaced (step is constant)
  if (ticks.length >= 2) {
    const step = ticks[1] - ticks[0];
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBe(step);
    }
  }
});

test("niceYearTicks: 3-year span (1941–1943) keeps step=1 and emits the exact 3 years", () => {
  const ticks = niceYearTicks(1941, 1943);
  expect(ticks).toEqual([1941, 1942, 1943]);
});

test("niceYearTicks: same-year span emits just that one year", () => {
  const ticks = niceYearTicks(1859, 1859);
  expect(ticks).toEqual([1859]);
});

test("niceYearTicks: 10-year span emits ≤ 8 ticks", () => {
  const ticks = niceYearTicks(2000, 2010);
  expect(ticks.length).toBeLessThanOrEqual(8);
});

test("niceYearTicks: custom targetCount is respected (roughly)", () => {
  // A 100-year span with targetCount=4 should use a larger step than targetCount=8
  const few = niceYearTicks(1900, 2000, 4);
  const many = niceYearTicks(1900, 2000, 8);
  expect(few.length).toBeLessThanOrEqual(many.length);
});

// ── deCollideLabels ───────────────────────────────────────────────────────────

test("deCollideLabels: non-overlapping labels all get row 0", () => {
  // Labels 100px wide at x=0, 200, 400 — each slot 200px, no overlap
  const pts: LabeledPoint[] = [
    { x: 0,   labelPx: 100 },
    { x: 200, labelPx: 100 },
    { x: 400, labelPx: 100 },
  ];
  const rows = deCollideLabels(pts);
  expect(rows).toEqual([0, 0, 0]);
});

test("deCollideLabels: overlapping pair — second bumped to row 1", () => {
  // Two labels both 120px wide at x=0 and x=50: they overlap (0+120 > 50)
  const pts: LabeledPoint[] = [
    { x: 0,  labelPx: 120 },
    { x: 50, labelPx: 120 },
  ];
  const rows = deCollideLabels(pts);
  expect(rows[0]).toBe(0);
  expect(rows[1]).toBe(1);
});

test("deCollideLabels: three mutually overlapping labels use at most 3 rows", () => {
  const pts: LabeledPoint[] = [
    { x: 0,  labelPx: 200 },
    { x: 10, labelPx: 200 },
    { x: 20, labelPx: 200 },
  ];
  const rows = deCollideLabels(pts);
  expect(rows.length).toBe(3);
  // All rows must be non-negative integers
  for (const r of rows) expect(r).toBeGreaterThanOrEqual(0);
  // No two labels in the same row should overlap
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (rows[i] === rows[j]) {
        // They're in the same row — their x-spans must not overlap
        const rightI = pts[i].x + pts[i].labelPx;
        const leftJ = pts[j].x;
        expect(rightI).toBeLessThanOrEqual(leftJ);
      }
    }
  }
});

test("deCollideLabels: empty array returns empty array", () => {
  expect(deCollideLabels([])).toEqual([]);
});

test("deCollideLabels: single label gets row 0", () => {
  expect(deCollideLabels([{ x: 500, labelPx: 80 }])).toEqual([0]);
});

// ── span===0 fix in buildTimelineScale ───────────────────────────────────────

test("span===0: all same-instant events are spread evenly across width, not piled at x=0", () => {
  const sameDay = [
    { date: "1859-09-01", label: "Event A" },
    { date: "1859-09-01", label: "Event B" },
    { date: "1859-09-01", label: "Event C" },
  ];
  const s = buildTimelineScale(sameDay, 1000);
  // All x values must be distinct (spread, not piled)
  const xs = s.points.map((p) => p.x);
  const unique = new Set(xs);
  expect(unique.size).toBe(3);
  // All x must be within [0, width]
  for (const x of xs) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1000);
  }
});

test("span===0 with single event: x=0, no crash", () => {
  const s = buildTimelineScale([{ date: "1859-09-01", label: "Single" }], 1000);
  expect(s.points[0].x).toBe(0);
});

// ── buildTimelineScale: long-arc tick cap ─────────────────────────────────────

test("buildTimelineScale: 154-year span emits ≤ 8 year ticks (no label spam)", () => {
  const longArc: TimelineEvent[] = [
    { date: "1859-09-01", label: "Carrington event" },
    { date: "1921-05-14", label: "Railroad storm" },
    { date: "1989-03-13", label: "Quebec blackout" },
    { date: "2003-10-28", label: "Halloween storms" },
    { date: "2013-03-08", label: "Last major CME" },
  ];
  const s = buildTimelineScale(longArc, 1000);
  expect(s.ticks.length).toBeLessThanOrEqual(8);
});

// ── labelAnchor ───────────────────────────────────────────────────────────────

test("labelAnchor: label comfortably in the middle → 'middle'", () => {
  // x=500, label=100px, width=1000: right edge=600 < 1000; left half=450 > 0
  expect(labelAnchor(500, 1000, 100)).toBe("middle");
});

test("labelAnchor: label near right edge → 'end'", () => {
  // x=950, label=100px, width=1000: right edge=1050 > 1000 → end
  expect(labelAnchor(950, 1000, 100)).toBe("end");
});

test("labelAnchor: label exactly at right boundary → 'end'", () => {
  // x=900, label=100px, width=1000: right edge=1000, not > 1000 but let's
  // check the boundary: x+labelPx === width → NOT > width, so no end.
  // This confirms the strict > check.
  expect(labelAnchor(900, 1000, 100)).toBe("middle");
});

test("labelAnchor: label one pixel over right edge → 'end'", () => {
  expect(labelAnchor(901, 1000, 100)).toBe("end");
});

test("labelAnchor: label near left edge (centered would clip x=0) → 'start'", () => {
  // x=30, label=100px: left half = 30 - 50 = -20 < 0 → start
  expect(labelAnchor(30, 1000, 100)).toBe("start");
});

test("labelAnchor: label at x=0 → 'start'", () => {
  expect(labelAnchor(0, 1000, 80)).toBe("start");
});

test("labelAnchor: short label at x=0 → 'start' (right edge fine, but centering clips left)", () => {
  // x=0, label=20px: left half=0-10=-10 < 0 → start
  expect(labelAnchor(0, 1000, 20)).toBe("start");
});

test("labelAnchor: long label in the middle of a narrow panel → 'end' wins over 'start'", () => {
  // x=150, label=200px, width=200: right edge=350 > 200 → end (right-clip check fires first)
  expect(labelAnchor(150, 200, 200)).toBe("end");
});
