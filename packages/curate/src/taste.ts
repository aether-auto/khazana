import {
  aggregateProfile,
  DEFAULT_TASTE_OPTS,
  EVENT_WEIGHTS,
  DWELL_MS_PER_POINT,
  DWELL_CAP,
  type FeedItem,
  type TasteOpts,
  type TasteProfile,
} from "@khazana/core";
import type { EngagementEvent } from "./io.js";

// The taste-aggregation math now lives in @khazana/core (taste-model) so the
// build pipeline and the browser client share ONE implementation. We keep the
// original curate names/signatures so curate's index and tests are unaffected.
export { DEFAULT_TASTE_OPTS, EVENT_WEIGHTS, DWELL_MS_PER_POINT, DWELL_CAP };
export type { TasteOpts, TasteProfile };

export function computeTasteProfile(
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  opts: TasteOpts,
): TasteProfile {
  return aggregateProfile(events, itemsById, opts);
}
