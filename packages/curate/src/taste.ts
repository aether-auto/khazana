import type { FeedItem } from "@khazana/core";
import type { EngagementEvent } from "./io.js";

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

export const EVENT_WEIGHTS = { open: 1, read: 3 } as const;
export const DWELL_MS_PER_POINT = 30000;
export const DWELL_CAP = 5;

export interface TasteProfile {
  ready: boolean;
  topics: Record<string, number>;
  entities: Record<string, number>;
}

const MS_PER_DAY = 86_400_000;

function eventWeight(event: EngagementEvent): number {
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

export function computeTasteProfile(
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
