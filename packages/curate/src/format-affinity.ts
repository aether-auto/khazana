import { FORMAT_NAMES, formatsForChannel, type FeedItem, type FormatName } from "@khazana/core";
import type { EngagementEvent } from "./io.js";
import type { TasteProfile } from "./taste.js";
import { DEFAULT_TASTE_OPTS } from "./taste.js";

export type TastePayload = TasteProfile & { formatAffinity: Partial<Record<FormatName, number>> };

const EVENT_WEIGHTS: Record<EngagementEvent["type"], number> = { open: 1, read: 3, dwell: 2 };
const MS_PER_DAY = 86_400_000;

export interface FormatAffinityOpts {
  now: string;
  ready: boolean;
  halfLifeDays?: number;
}

export function computeFormatAffinity(
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
    const weight = (EVENT_WEIGHTS[e.type] ?? 0) * decay;
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

export function buildTastePayload(
  profile: TasteProfile,
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  opts: { now: string; halfLifeDays?: number },
): TastePayload {
  return {
    ...profile,
    formatAffinity: computeFormatAffinity(events, itemsById, {
      now: opts.now,
      ready: profile.ready,
      halfLifeDays: opts.halfLifeDays,
    }),
  };
}
