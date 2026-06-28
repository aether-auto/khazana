// Model/live shaping for the Calibration Bench's §5 (THE MODEL) and §6 (LIVE
// SIGNAL). PURE + deterministic. Thin derivations over `@khazana/core`'s taste
// math (aggregateProfile / aggregateFormatAffinity / gateState) so the page's
// live layer computes affinity with the SAME logic as the build — and over the
// Observatory's channelGroup() so the bars stay chromatically continuous with
// the rest of the instrument.
import {
  aggregateProfile,
  aggregateFormatAffinity,
  gateState,
  EVENT_WEIGHTS,
  DWELL_MS_PER_POINT,
  DWELL_CAP,
  DEFAULT_TASTE_OPTS,
  type RankProfile,
  type TasteProfile,
  type GateState,
  type EngagementEvent,
  type FeedItem,
  type FormatName,
} from "@khazana/core";
import { channelGroup } from "../../observatory/lib/build-analytics.js";

// gateState is re-exported so the fuel-gauge island imports it from one place.
export { gateState };

// ── §5 decay curve ───────────────────────────────────────────────────────────

export interface DecayPoint {
  day: number;
  weight: number;
}

/**
 * The engagement-decay curve: weight = exp(−ln2 · day / halfLife), sampled at
 * whole days 0..maxDays (default 3× the half-life so the tail is visible). Day 0
 * is weight 1; day === halfLife is weight 0.5.
 */
export function decaySeries(halfLifeDays: number, maxDays?: number): DecayPoint[] {
  const span = maxDays ?? Math.round(halfLifeDays * 3);
  const out: DecayPoint[] = [];
  for (let day = 0; day <= span; day++) {
    out.push({ day, weight: Math.exp((-Math.LN2 * day) / halfLifeDays) });
  }
  return out;
}

// ── §5 channel affinity bars ───────────────────────────────────────────────────

export interface ChannelBar {
  channel: string;
  group: string;
  value: number;
}

/**
 * Topic affinities as bars, value desc (channel asc on ties), each tagged with
 * its Observatory GROUP for coloring. Channels are the topic vocabulary, so
 * profile.topics IS the channel affinity map.
 */
export function channelBars(profile: RankProfile): ChannelBar[] {
  return Object.entries(profile.topics)
    .map(([channel, value]) => ({ channel, value, group: channelGroup(channel) }))
    .sort((a, b) => b.value - a.value || a.channel.localeCompare(b.channel));
}

// ── §5 event-weight ladder ─────────────────────────────────────────────────────

export interface WeightRung {
  label: string;
  weight: number;
  /** A short note for the dwell rung's variable weighting (empty for fixed rungs). */
  note: string;
}

/**
 * The y-axis rungs for the decay chart: open=1, read=3, and the dwell band
 * (variable, capped). Drawn from EVENT_WEIGHTS / DWELL_* so the ladder can never
 * drift from the scorer.
 */
export function eventWeightLadder(): WeightRung[] {
  const dwellPerPointSec = Math.round(DWELL_MS_PER_POINT / 1000);
  return [
    { label: "open", weight: EVENT_WEIGHTS.open, note: "" },
    { label: "read", weight: EVENT_WEIGHTS.read, note: "" },
    {
      label: "dwell",
      weight: DWELL_CAP,
      note: `≤${DWELL_CAP}, ${dwellPerPointSec}s per point`,
    },
  ];
}

// ── §6 live profile (composes core aggregation) ────────────────────────────────

export interface LiveProfile {
  profile: TasteProfile;
  formatAffinity: Partial<Record<FormatName, number>>;
}

/**
 * Turn the Worker /summary's raw events into a live taste profile + format
 * affinity with the SAME math the build runs (core aggregateProfile /
 * aggregateFormatAffinity), so live and snapshot are apples-to-apples. Uses the
 * default gate/half-life options.
 */
export function liveProfileFromEvents(
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  now: string,
): LiveProfile {
  const profile = aggregateProfile(events, itemsById, { now });
  const formatAffinity = aggregateFormatAffinity(events, itemsById, {
    now,
    ready: profile.ready,
    halfLifeDays: DEFAULT_TASTE_OPTS.halfLifeDays,
  });
  return { profile, formatAffinity };
}

// ── §6 live-vs-snapshot merge ──────────────────────────────────────────────────

export interface LiveSnapshotRow {
  key: string;
  snapshot: number;
  live: number;
}

/**
 * Union the keys of the build snapshot and the live affinity maps so the page can
 * draw paired bars; missing values default to 0. Sorted by max(live, snapshot)
 * desc (key asc on ties) so the dominant affinities lead.
 */
export function mergeLiveSnapshot(
  snapshot: Record<string, number>,
  live: Record<string, number>,
): LiveSnapshotRow[] {
  const keys = new Set([...Object.keys(snapshot), ...Object.keys(live)]);
  return [...keys]
    .map((key) => ({ key, snapshot: snapshot[key] ?? 0, live: live[key] ?? 0 }))
    .sort(
      (a, b) =>
        Math.max(b.live, b.snapshot) - Math.max(a.live, a.snapshot) || a.key.localeCompare(b.key),
    );
}

// ── §6 sparkline ───────────────────────────────────────────────────────────────

/**
 * Normalize a daily engagement series to [0,1] (divide by the max), preserving
 * order, for the §6 sparkline. Empty in → empty out; an all-zero series → zeros.
 */
export function dailySparkline(daily: Array<{ date: string; weight: number }>): number[] {
  let max = 0;
  for (const d of daily) if (d.weight > max) max = d.weight;
  if (max === 0) return daily.map(() => 0);
  return daily.map((d) => d.weight / max);
}

// ── gate label (fuel-gauge sentence) ───────────────────────────────────────────

/** Pluralize a count: `1 more event`, `4 more events`. */
function plural(n: number, unit: string): string {
  return `${n} more ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The plain-English gauge sentence: "4 more events, 1 more day until the model is
 * ready." When both thresholds are met, reads "model ready."
 */
export function gaugeLabel(gate: GateState): string {
  if (gate.ready) return "model ready.";
  const parts: string[] = [];
  if (gate.eventsNeeded > 0) parts.push(plural(gate.eventsNeeded, "event"));
  if (gate.daysNeeded > 0) parts.push(plural(Math.ceil(gate.daysNeeded), "day"));
  if (parts.length === 0) return "model ready.";
  return `${parts.join(", ")} until the model is ready.`;
}
