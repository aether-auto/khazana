import type { FeedItem } from "./feed-item.js";
import type { EngagementEvent } from "./events.js";
import { FORMAT_NAMES, type FormatName } from "./vocab.js";
import { formatsForChannel } from "./format.js";
import type { RankProfile } from "./scoring.js";

/**
 * Shared taste-aggregation MATH. Turns raw engagement events into a taste
 * profile (topic/entity affinities) and per-format affinities. Single source of
 * truth so the build pipeline and the Worker-fed browser client compute live
 * affinity with identical logic. Pure: all time-dependence flows through `now`.
 */

export interface TasteOpts {
  now: string;
  minEvents?: number;
  minDays?: number;
  halfLifeDays?: number;
}

export const DEFAULT_TASTE_OPTS = {
  minEvents: 20,
  minDays: 5,
  halfLifeDays: 7,
} as const;

/** Base weight per engagement type for taste aggregation (dwell handled by ms). */
export const EVENT_WEIGHTS = { open: 1, read: 3 } as const;
export const DWELL_MS_PER_POINT = 30000;
export const DWELL_CAP = 5;

const MS_PER_DAY = 86_400_000;

/**
 * The taste profile is structurally identical to the ranker's `RankProfile` —
 * we keep ONE canonical shape so a profile produced here drops straight into
 * `scoreContributions` with no adapter.
 */
export type TasteProfile = RankProfile;

/** Engagement weight for taste aggregation: dwell scales with ms (capped). */
export function eventWeight(event: EngagementEvent): number {
  if (event.type === "dwell") {
    const points = (event.dwellMs ?? 0) / DWELL_MS_PER_POINT;
    return Math.min(points, DWELL_CAP);
  }
  return EVENT_WEIGHTS[event.type];
}

function normalize(map: Map<string, number>): Record<string, number> {
  let max = 0;
  for (const v of map.values()) if (v > max) max = v;
  const out: Record<string, number> = {};
  if (max === 0) return out;
  for (const [k, v] of map) out[k] = v / max;
  return out;
}

/**
 * Aggregate engagement events into a recency-decayed, max-normalized taste
 * profile. Gates to `{ ready: false }` until there are enough events spanning
 * enough days. Extracted verbatim from curate's computeTasteProfile.
 */
export function aggregateProfile(
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  opts: TasteOpts,
): TasteProfile {
  const minEvents = opts.minEvents ?? DEFAULT_TASTE_OPTS.minEvents;
  const minDays = opts.minDays ?? DEFAULT_TASTE_OPTS.minDays;
  const halfLifeDays = opts.halfLifeDays ?? DEFAULT_TASTE_OPTS.halfLifeDays;
  const nowMs = Date.parse(opts.now);

  if (events.length < minEvents) {
    return { ready: false, topics: {}, entities: {} };
  }
  let minAt = Infinity;
  let maxAt = -Infinity;
  for (const e of events) {
    const t = Date.parse(e.at);
    if (t < minAt) minAt = t;
    if (t > maxAt) maxAt = t;
  }
  const spanDays = (maxAt - minAt) / MS_PER_DAY;
  if (spanDays < minDays) {
    return { ready: false, topics: {}, entities: {} };
  }

  const topics = new Map<string, number>();
  const entities = new Map<string, number>();
  for (const e of events) {
    const item = itemsById.get(e.itemId);
    if (!item) continue;
    const ageDays = (nowMs - Date.parse(e.at)) / MS_PER_DAY;
    const decay = Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
    const affinity = eventWeight(e) * decay;
    for (const topic of item.topics) topics.set(topic, (topics.get(topic) ?? 0) + affinity);
    for (const entity of item.entities) entities.set(entity, (entities.get(entity) ?? 0) + affinity);
  }

  return { ready: true, topics: normalize(topics), entities: normalize(entities) };
}

export interface FormatAffinityOpts {
  now: string;
  ready: boolean;
  halfLifeDays?: number;
}

/**
 * Flat per-type weights for FORMAT affinity. Note this differs from
 * `EVENT_WEIGHTS`: here dwell carries a flat weight of 2 (not ms-scaled),
 * matching curate's computeFormatAffinity behavior exactly.
 */
const FORMAT_EVENT_WEIGHTS: Record<EngagementEvent["type"], number> = { open: 1, read: 3, dwell: 2 };

/**
 * Aggregate per-format affinity from engagement events by mapping each engaged
 * item's channels to candidate formats and splitting the (decayed) weight across
 * them, then max-normalizing. Extracted verbatim from computeFormatAffinity.
 */
export function aggregateFormatAffinity(
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  opts: FormatAffinityOpts,
): Partial<Record<FormatName, number>> {
  if (!opts.ready) return {};
  const halfLifeDays = opts.halfLifeDays ?? DEFAULT_TASTE_OPTS.halfLifeDays;
  const nowMs = Date.parse(opts.now);

  const scores = new Map<FormatName, number>();
  for (const e of events) {
    const it = itemsById.get(e.itemId);
    if (!it) continue;
    const ageDays = (nowMs - Date.parse(e.at)) / MS_PER_DAY;
    const decay = Math.exp((-Math.LN2 * Math.max(ageDays, 0)) / halfLifeDays);
    const weight = (FORMAT_EVENT_WEIGHTS[e.type] ?? 0) * decay;
    // Map the item's channels to candidate formats, split the weight across them.
    const formats = new Set<FormatName>();
    for (const channel of it.topics) {
      for (const f of formatsForChannel(channel)) formats.add(f.name);
    }
    if (formats.size === 0) continue;
    const share = weight / formats.size;
    for (const name of formats) scores.set(name, (scores.get(name) ?? 0) + share);
  }

  let max = 0;
  for (const v of scores.values()) if (v > max) max = v;
  const out: Partial<Record<FormatName, number>> = {};
  if (max === 0) return out;
  for (const name of FORMAT_NAMES) {
    const v = scores.get(name);
    if (v) out[name] = v / max;
  }
  return out;
}

export interface GateState {
  ready: boolean;
  eventsNeeded: number;
  daysNeeded: number;
  minEvents: number;
  minDays: number;
}

/**
 * How far the engagement history is from "ready", for the UI's fuel gauges.
 * `eventsNeeded`/`daysNeeded` are clamped at 0 once a threshold is met. `ready`
 * requires BOTH thresholds, mirroring aggregateProfile's gate.
 */
export function gateState(
  eventCount: number,
  spanDays: number,
  opts?: { minEvents?: number; minDays?: number },
): GateState {
  const minEvents = opts?.minEvents ?? DEFAULT_TASTE_OPTS.minEvents;
  const minDays = opts?.minDays ?? DEFAULT_TASTE_OPTS.minDays;
  const eventsNeeded = Math.max(0, minEvents - eventCount);
  const daysNeeded = Math.max(0, minDays - spanDays);
  return {
    ready: eventCount >= minEvents && spanDays >= minDays,
    eventsNeeded,
    daysNeeded,
    minEvents,
    minDays,
  };
}
