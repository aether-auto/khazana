// apps/site/src/components/mdx/lib/timeline-scale.ts
/** Pure deterministic time-scale for <Timeline>. No DOM, no `now` dependency. */

export interface TimelineEvent {
  /** ISO date (YYYY-MM-DD or full ISO). */
  date: string;
  label: string;
  detail?: string;
}

export interface TimelinePoint extends TimelineEvent {
  /** x in [0, width]. */
  x: number;
  /** epoch ms, for stable keys/sorting. */
  t: number;
}

export interface TimelineTick {
  year: number;
  x: number;
}

export interface TimelineScale {
  points: TimelinePoint[];
  ticks: TimelineTick[];
  width: number;
}

/** Input to deCollideLabels: a point's x position and its rendered label width. */
export interface LabeledPoint {
  x: number;
  /** Estimated rendered width of this label in pixels. */
  labelPx: number;
  /**
   * Optional explicit horizontal span [left, right] of the RENDERED label in the
   * same coordinate space as `x`. When present, de-collision uses these bounds
   * directly instead of assuming the label extends rightward from `x`. This is
   * what makes de-collision agree with `text-anchor` (a middle/end-anchored
   * label extends left of `x`, so treating `x` as its left edge under-counts the
   * collision and lets labels visually overlap even though the packer thought
   * they were clear). Deriving these from the anchor closes that gap.
   */
  left?: number;
  right?: number;
}

/**
 * The rendered horizontal span [left, right] of a label given the SVG
 * `text-anchor` used to draw it. `"start"` extends rightward from x; `"end"`
 * extends leftward; `"middle"` straddles x. Pure geometry, unit-tested — this
 * is the single source of truth both the de-collision packer and (implicitly)
 * the renderer agree on, so a de-collided layout can never visually overlap.
 */
export function labelSpan(
  x: number,
  labelPx: number,
  anchor: "start" | "middle" | "end",
): { left: number; right: number } {
  if (anchor === "end") return { left: x - labelPx, right: x };
  if (anchor === "middle") return { left: x - labelPx / 2, right: x + labelPx / 2 };
  return { left: x, right: x + labelPx };
}

// ── niceYearTicks ─────────────────────────────────────────────────────────────

/**
 * Returns an array of year integers at a "nice" step that keeps the total
 * count at or below `targetCount` (default 7).  Steps are chosen from the
 * sequence {1, 2, 5, 10, 20, 25, 50, 100, 200, 500} — the same set that
 * d3-scale's `tickIncrement` uses for linear data.
 *
 * For a same-year span (minYear === maxYear) the result is just [minYear].
 * For a sub-2-year span the step is always 1 so adjacent years are shown.
 */
export function niceYearTicks(
  minYear: number,
  maxYear: number,
  targetCount: number = 7,
): number[] {
  if (minYear === maxYear) return [minYear];
  const span = maxYear - minYear;
  const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  // Pick the smallest step that produces ≤ targetCount ticks.
  let step = 1;
  for (const s of STEPS) {
    // Number of multiples of s that lie within [minYear, maxYear]:
    const first = Math.ceil(minYear / s) * s;
    const count = Math.floor((maxYear - first) / s) + 1;
    if (count <= targetCount) {
      step = s;
      break;
    }
  }
  // Emit all multiples of step within [minYear, maxYear].
  const first = Math.ceil(minYear / step) * step;
  const ticks: number[] = [];
  for (let y = first; y <= maxYear; y += step) {
    ticks.push(y);
  }
  // Edge-case: if the step landed no ticks inside the range (e.g. step=100
  // but span=40), fall back to just the bounding years.
  if (ticks.length === 0) return [minYear, maxYear];
  return ticks;
}

// ── labelAnchor ───────────────────────────────────────────────────────────────

/**
 * Returns the SVG `text-anchor` value that keeps a label from clipping either
 * panel edge.  The decision is purely geometric:
 *
 * - If the label's right edge (x + labelPx) would exceed `width`, anchor
 *   `"end"` so the label extends leftward from the point.
 * - If the label's left half (x − labelPx/2) would go below 0 when
 *   centered, anchor `"start"` so it extends rightward from the point.
 * - Otherwise anchor `"middle"`.
 *
 * "Left zone" and "right zone" are derived purely from `labelPx` and the
 * actual panel `width`, so the threshold automatically adjusts as label
 * lengths vary rather than relying on magic percentage constants.
 */
export function labelAnchor(
  x: number,
  width: number,
  labelPx: number,
): "start" | "middle" | "end" {
  if (x + labelPx > width) return "end";
  if (x - labelPx / 2 < 0) return "start";
  return "middle";
}

// ── deCollideLabels ───────────────────────────────────────────────────────────

/**
 * Greedy de-collision for SVG timeline labels.  Given an array of
 * `LabeledPoint` values (already sorted ascending by x), assigns each label
 * to the lowest row whose last-placed label's right edge (x + labelPx +
 * gutter) does not overlap this label's left edge (x).
 *
 * `gutter` is a minimum horizontal breathing space (px) required between two
 * labels that share a row — it stops labels from kissing edge-to-edge.
 *
 * Returns an array of row indices (0-based) parallel to the input array.
 * Row 0 is the baseline row; higher rows are drawn at an increasing y offset
 * so labels never visually overlap.
 */
export function deCollideLabels(
  points: ReadonlyArray<LabeledPoint>,
  gutter: number = 0,
): number[] {
  if (points.length === 0) return [];
  // Each label's TRUE rendered span. When explicit left/right are supplied
  // (anchor-aware), use them; otherwise fall back to "extends rightward from x".
  const spanOf = (pt: LabeledPoint): { left: number; right: number } =>
    pt.left != null && pt.right != null
      ? { left: pt.left, right: pt.right }
      : { left: pt.x, right: pt.x + pt.labelPx };
  // rowRight[r] = the rightmost edge reached by the last label placed in row r.
  const rowRight: number[] = [];
  const result: number[] = [];
  for (const pt of points) {
    const span = spanOf(pt);
    // Find the lowest row whose last label clears this label's LEFT edge.
    let placed = false;
    for (let r = 0; r < rowRight.length; r++) {
      if ((rowRight[r] ?? 0) <= span.left) {
        result.push(r);
        rowRight[r] = span.right + gutter;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Open a new row.
      result.push(rowRight.length);
      rowRight.push(span.right + gutter);
    }
  }
  return result;
}

// ── buildTimelineScale ────────────────────────────────────────────────────────

function parse(date: string): number {
  const t = Date.parse(date);
  if (Number.isNaN(t)) throw new Error(`Timeline: unparseable date "${date}"`);
  return t;
}

export function buildTimelineScale(events: ReadonlyArray<TimelineEvent>, width: number): TimelineScale {
  if (!events || events.length === 0) throw new Error("Timeline: needs at least one event");
  const parsed = events
    .map((e) => ({ ...e, t: parse(e.date) }))
    .sort((a, b) => a.t - b.t);

  const min = parsed[0].t;
  const max = parsed[parsed.length - 1].t;
  const span = max - min;
  const n = parsed.length;

  // ── span===0 fix: spread points evenly instead of piling at x=0 ──────────
  const project = (t: number, i: number): number => {
    if (span === 0) {
      // Single event → x=0; multiple same-instant events → evenly spaced.
      return n === 1 ? 0 : ((i + 1) / (n + 1)) * width;
    }
    return ((t - min) / span) * width;
  };

  const points: TimelinePoint[] = parsed.map((e, i) => ({ ...e, x: project(e.t, i) }));

  // ── Adaptive year ticks (no label spam on long spans) ────────────────────
  const startYear = new Date(min).getUTCFullYear();
  const endYear = new Date(max).getUTCFullYear();
  const tickYears = niceYearTicks(startYear, endYear);

  const ticks: TimelineTick[] = tickYears.map((y) => {
    const t = Date.UTC(y, 0, 1);
    // Clamp to [min, max] then project onto the timeline.
    const tClamped = Math.min(Math.max(t, min), max);
    const x = span === 0 ? width / 2 : ((tClamped - min) / span) * width;
    return { year: y, x };
  });

  return { points, ticks, width };
}

// ── layoutTimeline ────────────────────────────────────────────────────────────
//
// The full layout engine the <Timeline> component renders. Everything spatial
// lives here so the component is a thin, dumb renderer and all geometry is
// unit-tested. Two modes, picked automatically:
//
//   "sequence"      — for few events, or events whose true time-spread would
//                     waste the axis (one tiny cluster on a vast empty line).
//                     Nodes are spaced EVENLY and the *real* elapsed gap is
//                     written between them ("+17 hr", "+153 yr"). The axis
//                     becomes a labelled progression — it EARNS its place by
//                     reporting the gap as a number, not as whitespace.
//
//   "proportional"  — for enough events with genuine spread. True time-x, with
//                     GAP COMPRESSION: a contiguous empty span far larger than
//                     its neighbours is collapsed to a fixed visual width and
//                     marked with a broken-axis glyph, so dense clusters spread
//                     out and read clearly instead of piling at one edge.

const MS_MIN = 60 * 1000;
const MS_HR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HR;
const MS_YEAR = 365.25 * MS_DAY;
const MS_MONTH = MS_YEAR / 12;

/**
 * Human-readable elapsed duration, written as a signed "+N unit" annotation
 * for the gap between two consecutive timeline nodes. Picks the coarsest unit
 * that yields a value ≥ 1, so the reader gets "+18 hr" or "+153 yr", never
 * "+550000000 ms". A non-positive gap returns "" (nothing to annotate).
 */
export function formatGap(ms: number): string {
  if (ms <= 0) return "";
  const round = (v: number) => Math.round(v);
  if (ms >= MS_YEAR) {
    const y = round(ms / MS_YEAR);
    return `+${y} yr`;
  }
  if (ms >= 2 * MS_MONTH) {
    const mo = round(ms / MS_MONTH);
    return `+${mo} mo`;
  }
  if (ms >= MS_DAY) {
    const d = round(ms / MS_DAY);
    return `+${d} ${d === 1 ? "day" : "days"}`;
  }
  if (ms >= MS_HR) {
    const h = round(ms / MS_HR);
    return `+${h} hr`;
  }
  const m = round(ms / MS_MIN);
  return `+${m} min`;
}

/**
 * The compact date stamp shown beneath each node. Date-only ISO strings render
 * as a calendar date with no time; full ISO timestamps still render the date
 * (the intra-day timing usually lives in the event's own label, e.g.
 * "11:18 GMT — flare"). Always UTC so SSR and client agree.
 */
export function formatNodeDate(date: string): string {
  const t = parse(date);
  const d = new Date(t);
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()] ?? "";
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A laid-out node: position, stacking row, and everything to render + label it. */
export interface TimelineNode extends TimelineEvent {
  /** epoch ms, for stable keys/sorting. */
  t: number;
  /** x in [0, width]. */
  x: number;
  /** stacking row (0 = closest to the axis; higher = lifted further). */
  row: number;
  /** the `text-anchor` keeping this node's label off the panel edges. */
  anchor: "start" | "middle" | "end";
  /** estimated rendered label width (px) used for de-collision. */
  labelPx: number;
  /** compact date stamp, e.g. "1 Sep 1859". */
  dateLabel: string;
}

/** An elapsed-gap annotation drawn between two consecutive sequence nodes. */
export interface TimelineGap {
  /** midpoint x between the two nodes it spans. */
  x: number;
  /** e.g. "+17 hr". */
  label: string;
}

/** A compressed empty span in proportional mode — drawn as a broken-axis mark. */
export interface TimelineBreak {
  /** x of the break glyph (centre of the collapsed span). */
  x: number;
}

export interface TimelineLayout {
  mode: "sequence" | "proportional";
  nodes: TimelineNode[];
  ticks: TimelineTick[];
  gaps: TimelineGap[];
  breaks: TimelineBreak[];
  /** number of label stacking rows actually used (≥ 1). */
  rowCount: number;
  width: number;
  /** content-sized total height (px) — never a fixed void. */
  height: number;
  /** y of the horizontal axis within the [0, height] box. */
  axisY: number;
}

export interface LayoutOpts {
  width: number;
  /** approx px per label character (mono at the label size). Default 6.5. */
  charPx?: number;
  /** vertical px per stacked label row. Default 26. */
  rowStep?: number;
  /** min horizontal breathing space between same-row labels. Default 16. */
  gutter?: number;
}

// At or below this many events, the time-axis rarely carries enough structure
// to be worth stretching — sequence mode reads better.
const SEQUENCE_MAX_EVENTS = 3;
// In proportional mode, an inter-event span wider than this fraction of the
// total time range is treated as "dead air" and compressed.
const COMPRESS_THRESHOLD = 0.18;
// Each compressed span is redrawn at this fraction of the width.
const COMPRESS_WIDTH = 0.06;

/**
 * Decide sequence vs proportional. Sequence when there are few events, OR when
 * proportional placement would strand most events in one tiny cluster against a
 * vast empty span (so the spatial axis conveys nothing). The latter is detected
 * by checking whether a single inter-event gap would eat most of the width.
 */
function pickMode(ts: number[]): "sequence" | "proportional" {
  if (ts.length <= SEQUENCE_MAX_EVENTS) return "sequence";
  const span = ts[ts.length - 1] - ts[0];
  if (span === 0) return "sequence";
  // Proportional handles big gaps via compression, so a dominant gap is fine —
  // only fall back to sequence for the genuinely small/degenerate cases above.
  return "proportional";
}

/**
 * Compress proportional x-positions so contiguous empty spans far larger than
 * their neighbours don't dominate the axis. Returns the compressed x for every
 * event plus the break positions. Monotonic and within [0, width].
 */
function compressProportional(
  ts: number[],
  width: number,
): { xs: number[]; breaks: TimelineBreak[] } {
  const n = ts.length;
  const span = ts[n - 1] - ts[0];
  if (span === 0) {
    const xs = ts.map((_, i) => ((i + 1) / (n + 1)) * width);
    return { xs, breaks: [] };
  }
  // Every gap gets a minimum weight so two near-coincident events (e.g. the two
  // 1859 days inside a 156-year arc) never collapse onto the same x — each pair
  // stays visibly distinct on the axis.
  const MIN_GAP = 0.5 / (n - 1 || 1);
  // Assign each inter-event gap a *weight* in [0, 1] of the layout width.
  // Normal gaps keep their true proportion (floored); oversized gaps are clamped
  // to a small fixed weight and flagged as breaks.
  const rawWeights: number[] = [];
  const isBreak: boolean[] = [];
  for (let i = 1; i < n; i++) {
    const frac = (ts[i] - ts[i - 1]) / span;
    if (frac > COMPRESS_THRESHOLD) {
      rawWeights.push(COMPRESS_WIDTH);
      isBreak.push(true);
    } else {
      rawWeights.push(Math.max(frac, MIN_GAP));
      isBreak.push(false);
    }
  }
  const total = rawWeights.reduce((s, w) => s + w, 0) || 1;
  const xs: number[] = [0];
  let acc = 0;
  for (let i = 0; i < rawWeights.length; i++) {
    acc += rawWeights[i] / total;
    xs.push(acc * width);
  }
  // Snap endpoints exactly to the edges.
  xs[0] = 0;
  xs[n - 1] = width;
  const breaks: TimelineBreak[] = [];
  for (let i = 0; i < isBreak.length; i++) {
    if (isBreak[i]) breaks.push({ x: (xs[i] + xs[i + 1]) / 2 });
  }
  return { xs, breaks };
}

export function layoutTimeline(
  events: ReadonlyArray<TimelineEvent>,
  opts: LayoutOpts,
): TimelineLayout {
  if (!events || events.length === 0) throw new Error("Timeline: needs at least one event");
  const width = opts.width;
  const charPx = opts.charPx ?? 6.5;
  const rowStep = opts.rowStep ?? 26;
  const gutter = opts.gutter ?? 16;

  const parsed = events
    .map((e) => ({ ...e, t: parse(e.date) }))
    .sort((a, b) => a.t - b.t);
  const ts = parsed.map((e) => e.t);
  const n = parsed.length;
  const mode = pickMode(ts);

  // ── x positions + gaps/breaks per mode ──────────────────────────────────────
  let xs: number[];
  let breaks: TimelineBreak[] = [];
  const gaps: TimelineGap[] = [];

  if (mode === "sequence") {
    // Evenly inset nodes; annotate the real elapsed gap between each pair.
    const inset = n === 1 ? width / 2 : width * 0.08;
    xs =
      n === 1
        ? [width / 2]
        : parsed.map((_, i) => inset + (i / (n - 1)) * (width - 2 * inset));
    for (let i = 1; i < n; i++) {
      const label = formatGap(ts[i] - ts[i - 1]);
      if (label) gaps.push({ x: (xs[i - 1] + xs[i]) / 2, label });
    }
  } else {
    const compressed = compressProportional(ts, width);
    xs = compressed.xs;
    breaks = compressed.breaks;
  }

  // Guarantee strict monotonicity (defends against coincident timestamps in
  // proportional mode nudging two nodes to the same x).
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] <= xs[i - 1]) xs[i] = Math.min(xs[i - 1] + 1, width);
  }

  // ── label de-collision into stacking rows ───────────────────────────────────
  // Compute the anchor FIRST (it decides which way each label extends), then
  // de-collide on each label's TRUE rendered span. Doing anchor-after-collision
  // (the old order) let the packer assume every label extended rightward from x,
  // so middle/end-anchored labels — which reach left of x — visually overlapped
  // even though the layout believed they were clear. Anchor-aware spans fix that.
  const labelPxs = parsed.map((e) => e.label.length * charPx);
  const anchors = xs.map((x, i) => labelAnchor(x, width, labelPxs[i]));
  const labeled: LabeledPoint[] = xs.map((x, i) => {
    const span = labelSpan(x, labelPxs[i], anchors[i]);
    return { x, labelPx: labelPxs[i], left: span.left, right: span.right };
  });
  const rows = deCollideLabels(labeled, gutter);
  const rowCount = rows.reduce((m, r) => Math.max(m, r), 0) + 1;

  const nodes: TimelineNode[] = parsed.map((e, i) => ({
    ...e,
    t: ts[i],
    x: xs[i],
    row: rows[i] ?? 0,
    anchor: anchors[i],
    labelPx: labelPxs[i],
    dateLabel: formatNodeDate(e.date),
  }));

  // ── adaptive year ticks (proportional only — sequence uses gap chips) ────────
  let ticks: TimelineTick[] = [];
  if (mode === "proportional") {
    const span = ts[n - 1] - ts[0];
    const startYear = new Date(ts[0]).getUTCFullYear();
    const endYear = new Date(ts[n - 1]).getUTCFullYear();
    // Place a tick at the x of the nearest event whose year matches, so ticks
    // honour the compressed scale instead of re-deriving a linear projection.
    const placed = niceYearTicks(startYear, endYear).map((y) => {
      const target = Date.UTC(y, 0, 1);
      // nearest node by time → borrow its compressed x (keeps ticks aligned to
      // the broken axis rather than floating in compressed dead air).
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(ts[i] - target);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      return { year: y, x: span === 0 ? width / 2 : xs[bestI] };
    });
    // Dedupe ticks that compression has collapsed onto (nearly) the same x —
    // several mid-century years can all snap to the lone early node, which would
    // otherwise stack identical labels. Keep the one closest to each x slot.
    ticks = [];
    for (const tick of placed) {
      const clash = ticks.find((kept) => Math.abs(kept.x - tick.x) < 24);
      if (!clash) ticks.push(tick);
    }
  }

  // ── content-sized height ─────────────────────────────────────────────────────
  // axis band + date stamps below + the actual stacked label rows above. No
  // fixed void: the figure is exactly as tall as the rows it uses.
  const AXIS_BAND = 34; // axis line + ticks/year labels below it
  const DATE_BAND = 18; // compact date stamp under each node
  const NODE_LIFT = 16; // baseline lift of row-0 label above the axis
  const TOP_PAD = 12;
  const labelsHeight = NODE_LIFT + rowCount * rowStep;
  const height = TOP_PAD + labelsHeight + AXIS_BAND + DATE_BAND;
  const axisY = TOP_PAD + labelsHeight;

  return { mode, nodes, ticks, gaps, breaks, rowCount, width, height, axisY };
}
