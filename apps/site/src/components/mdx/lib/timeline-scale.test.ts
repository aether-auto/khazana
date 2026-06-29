// apps/site/src/components/mdx/lib/timeline-scale.test.ts
import { expect, test } from "vitest";
import {
  buildTimelineScale,
  niceYearTicks,
  deCollideLabels,
  labelAnchor,
  layoutTimeline,
  formatGap,
  formatNodeDate,
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

test("deCollideLabels: honors a horizontal gutter between same-row labels", () => {
  // Two 100px labels at x=0 and x=120: right edge of #1 is 100, leftof #2 is 120
  // → fits in row 0 with default gutter 0, but with gutter 40 they collide.
  expect(deCollideLabels([{ x: 0, labelPx: 100 }, { x: 120, labelPx: 100 }])).toEqual([0, 0]);
  expect(deCollideLabels([{ x: 0, labelPx: 100 }, { x: 120, labelPx: 100 }], 40)).toEqual([0, 1]);
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

// ── formatGap ─────────────────────────────────────────────────────────────────

test("formatGap: sub-day spans read in hours", () => {
  const oneHr = 60 * 60 * 1000;
  expect(formatGap(oneHr)).toBe("+1 hr");
  expect(formatGap(17.6 * oneHr)).toBe("+18 hr");
});

test("formatGap: sub-hour spans read in minutes", () => {
  expect(formatGap(45 * 60 * 1000)).toBe("+45 min");
});

test("formatGap: multi-day spans read in days", () => {
  const day = 24 * 60 * 60 * 1000;
  expect(formatGap(3 * day)).toBe("+3 days");
  expect(formatGap(1 * day)).toBe("+1 day");
});

test("formatGap: multi-month spans read in months", () => {
  const day = 24 * 60 * 60 * 1000;
  expect(formatGap(75 * day)).toBe("+2 mo");
});

test("formatGap: multi-year spans read in years", () => {
  const yr = 365.25 * 24 * 60 * 60 * 1000;
  expect(formatGap(153 * yr)).toBe("+153 yr");
  expect(formatGap(1 * yr)).toBe("+1 yr");
});

test("formatGap: zero or negative gap returns empty string", () => {
  expect(formatGap(0)).toBe("");
  expect(formatGap(-5)).toBe("");
});

// ── formatNodeDate ─────────────────────────────────────────────────────────────

test("formatNodeDate: date-only ISO renders day-month-year, no time", () => {
  // Parsed as UTC midnight; we render the calendar date.
  expect(formatNodeDate("1859-09-01")).toMatch(/1859/);
  expect(formatNodeDate("1859-09-01")).not.toMatch(/:/);
});

test("formatNodeDate: full ISO with a time still renders the date label", () => {
  expect(formatNodeDate("1859-09-02T09:00:00Z")).toMatch(/1859/);
});

// ── layoutTimeline: mode selection ─────────────────────────────────────────────

test("layoutTimeline: 2 same-day events → sequence mode (proportional stretch is useless)", () => {
  const twoSameDay: TimelineEvent[] = [
    { date: "1859-09-01T11:18:00Z", label: "Flare observed" },
    { date: "1859-09-02T04:00:00Z", label: "CME impact" },
  ];
  const l = layoutTimeline(twoSameDay, { width: 1000 });
  expect(l.mode).toBe("sequence");
  // Two nodes, evenly inset from the edges (not pinned hard at 0 and width).
  expect(l.nodes).toHaveLength(2);
  expect(l.nodes[0].x).toBeGreaterThan(0);
  expect(l.nodes[1].x).toBeLessThan(1000);
  expect(l.nodes[0].x).toBeLessThan(l.nodes[1].x);
});

test("layoutTimeline: sequence mode annotates the real elapsed gap between nodes", () => {
  const twoSameDay: TimelineEvent[] = [
    { date: "1859-09-01T11:18:00Z", label: "Flare observed" },
    { date: "1859-09-02T04:00:00Z", label: "CME impact" },
  ];
  const l = layoutTimeline(twoSameDay, { width: 1000 });
  // One gap annotation between the two nodes, reading ~17 hours.
  expect(l.gaps).toHaveLength(1);
  expect(l.gaps[0].label).toMatch(/hr/);
  // The gap sits between the two node x positions.
  expect(l.gaps[0].x).toBeGreaterThan(l.nodes[0].x);
  expect(l.gaps[0].x).toBeLessThan(l.nodes[1].x);
});

test("layoutTimeline: an 8-event arc with meaningful spread → proportional mode", () => {
  const arc: TimelineEvent[] = [
    { date: "1859-09-01", label: "Carrington sees the flare" },
    { date: "1859-09-02", label: "The storm hits" },
    { date: "2003-07-01", label: "Tsurutani reconstruction" },
    { date: "2008-01-01", label: "National Academies warning" },
    { date: "2012-02-23", label: "Riley: ~12% per decade" },
    { date: "2012-07-23", label: "The near-miss" },
    { date: "2013-05-01", label: "Lloyd's risk model" },
    { date: "2015-02-11", label: "DSCOVR at L1" },
  ];
  const l = layoutTimeline(arc, { width: 1000 });
  expect(l.mode).toBe("proportional");
  expect(l.nodes).toHaveLength(8);
});

test("layoutTimeline: proportional mode compresses the huge 1859→2003 void so the modern cluster spreads", () => {
  const arc: TimelineEvent[] = [
    { date: "1859-09-01", label: "Carrington sees the flare" },
    { date: "1859-09-02", label: "The storm hits" },
    { date: "2003-07-01", label: "Tsurutani reconstruction" },
    { date: "2008-01-01", label: "National Academies warning" },
    { date: "2012-02-23", label: "Riley: ~12% per decade" },
    { date: "2012-07-23", label: "The near-miss" },
    { date: "2013-05-01", label: "Lloyd's risk model" },
    { date: "2015-02-11", label: "DSCOVR at L1" },
  ];
  const l = layoutTimeline(arc, { width: 1000 });
  // There must be at least one compressed axis break (the 1859→2003 gap).
  expect(l.breaks.length).toBeGreaterThanOrEqual(1);
  // After compression, the 2003→2015 cluster should occupy a real fraction of the
  // width (not be squashed into the far right edge). Measure span of the last 6 nodes.
  const clusterStart = l.nodes[2].x;
  const clusterEnd = l.nodes[7].x;
  expect(clusterEnd - clusterStart).toBeGreaterThan(300);
});

test("layoutTimeline: nodes stay strictly increasing in x and within [0, width]", () => {
  const arc: TimelineEvent[] = [
    { date: "1859-09-01", label: "a" },
    { date: "2003-07-01", label: "b" },
    { date: "2012-02-23", label: "c" },
    { date: "2015-02-11", label: "d" },
  ];
  const l = layoutTimeline(arc, { width: 1000 });
  for (let i = 1; i < l.nodes.length; i++) {
    expect(l.nodes[i].x).toBeGreaterThan(l.nodes[i - 1].x);
  }
  for (const node of l.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.x).toBeLessThanOrEqual(1000);
  }
});

test("layoutTimeline: height is content-sized — fewer label rows → shorter figure", () => {
  // A clean 3-event spread (no collisions) should be shorter than a dense 8-event
  // cluster that forces multiple label rows.
  const sparse = layoutTimeline(events, { width: 1000 });
  // A clustered arc (the M3 defect): one early anchor then a tight modern
  // cluster of long labels. Compression spreads the cluster, but the long
  // labels still collide and must stack across multiple rows.
  const dense = layoutTimeline(
    [
      { date: "1859-09-01", label: "Carrington sees the flare" },
      { date: "2012-02-23", label: "Riley: ~12% per decade" },
      { date: "2012-07-23", label: "The 2012 near-miss event" },
      { date: "2013-05-01", label: "Lloyd's risk model published" },
      { date: "2015-02-11", label: "DSCOVR at L1 begins watch" },
    ],
    { width: 1000 },
  );
  expect(dense.rowCount).toBeGreaterThan(sparse.rowCount);
  expect(dense.height).toBeGreaterThan(sparse.height);
  // Height must be finite and reasonably bounded (not a giant fixed void).
  expect(sparse.height).toBeGreaterThan(0);
  expect(sparse.height).toBeLessThan(400);
});

test("layoutTimeline: every node carries an aria-friendly date string and its source event", () => {
  const l = layoutTimeline(events, { width: 1000 });
  for (const node of l.nodes) {
    expect(typeof node.dateLabel).toBe("string");
    expect(node.dateLabel.length).toBeGreaterThan(0);
    expect(typeof node.label).toBe("string");
  }
});

test("layoutTimeline: single event renders one centered node in sequence mode, no crash", () => {
  const l = layoutTimeline([events[0]], { width: 1000 });
  expect(l.nodes).toHaveLength(1);
  expect(l.gaps).toHaveLength(0);
  expect(l.nodes[0].x).toBeGreaterThan(0);
  expect(l.nodes[0].x).toBeLessThan(1000);
});

test("layoutTimeline: rejects empty input", () => {
  expect(() => layoutTimeline([], { width: 1000 })).toThrow(/event/i);
});

test("layoutTimeline: rows are assigned so no two same-row labels overlap", () => {
  const dense = layoutTimeline(
    [
      { date: "2012-01-01", label: "Aaaaaaaaaaaaaaaa" },
      { date: "2012-01-15", label: "Bbbbbbbbbbbbbbbb" },
      { date: "2012-02-01", label: "Cccccccccccccccc" },
      { date: "2012-02-15", label: "Dddddddddddddddd" },
    ],
    { width: 1000 },
  );
  const nodes = dense.nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].row === nodes[j].row) {
        // same row → x-spans (approximated by labelPx) must not overlap
        expect(nodes[i].x + nodes[i].labelPx).toBeLessThanOrEqual(nodes[j].x);
      }
    }
  }
});
