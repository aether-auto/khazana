import {
  aggregateFormatAffinity,
  type FeedItem,
  type FormatName,
  type FormatAffinityOpts,
} from "@khazana/core";
import type { EngagementEvent } from "./io.js";
import type { TasteProfile } from "./taste.js";

export type TastePayload = TasteProfile & { formatAffinity: Partial<Record<FormatName, number>> };

// Format-affinity math now lives in @khazana/core (taste-model). Re-exported
// under curate's original names so curate's index and tests are unaffected.
export function computeFormatAffinity(
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  opts: FormatAffinityOpts,
): Partial<Record<FormatName, number>> {
  return aggregateFormatAffinity(events, itemsById, opts);
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
