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
  const project = (t: number): number => (span === 0 ? 0 : ((t - min) / span) * width);

  const points: TimelinePoint[] = parsed.map((e) => ({ ...e, x: project(e.t) }));

  const startYear = new Date(min).getUTCFullYear();
  const endYear = new Date(max).getUTCFullYear();
  const ticks: TimelineTick[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const t = Date.UTC(y, 0, 1);
    const clamped = Math.min(Math.max(t, min), max);
    ticks.push({ year: y, x: project(clamped) });
  }

  return { points, ticks, width };
}
