import type { FeedItem } from "@khazana/core";
import { enrichItems, type LlmClient } from "./enrich.js";
import { clusterItems, type ClusterOpts } from "./cluster.js";
import { computeTasteProfile, type TasteOpts } from "./taste.js";
import { rankItems, type RankOpts } from "./rank.js";
import type { EngagementEvent } from "./io.js";

export interface CurateOpts {
  now: string;
  cluster?: ClusterOpts;
  taste?: Omit<TasteOpts, "now">;
  rank?: Omit<RankOpts, "now">;
  concurrency?: number;
}

export interface CurateResult {
  items: FeedItem[];
  clusterCount: number;
  profileReady: boolean;
}

export async function runCurate(
  items: FeedItem[],
  events: EngagementEvent[],
  client: LlmClient | null,
  opts: CurateOpts,
): Promise<CurateResult> {
  const enriched = await enrichItems(items, client, { concurrency: opts.concurrency });
  const clustered = clusterItems(enriched, opts.cluster);

  const itemsById = new Map(clustered.map((it) => [it.id, it]));
  const profile = computeTasteProfile(events, itemsById, { now: opts.now, ...opts.taste });

  const ranked = rankItems(clustered, profile, { now: opts.now, ...opts.rank });

  const clusterCount = new Set(clustered.map((it) => it.clusterId)).size;
  return { items: ranked, clusterCount, profileReady: profile.ready };
}
