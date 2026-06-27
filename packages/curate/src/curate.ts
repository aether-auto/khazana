import { isMakerCandidate, MAKER_MIN_READ_MINUTES, type FeedItem } from "@khazana/core";
import { enrichItems, type LlmClient } from "./enrich.js";
import { clusterItems, type ClusterOpts } from "./cluster.js";
import { computeTasteProfile, type TasteOpts } from "./taste.js";
import { rankItems, applyDiversityFloor, readTimeMinutes, MIN_READ_MINUTES, type RankOpts } from "./rank.js";
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

  // TWO-TIER read-time floor (drop short items before ranking so counts are correct):
  //   • Default floor MIN_READ_MINUTES (5) for everything — the Feed's sacred bar.
  //     Removes bare-link items (no body → 0 min), short summaries, and
  //     transcript-less videos/audio (0 min).
  //   • RELAXED floor MAKER_MIN_READ_MINUTES (3) for MAKER candidates only
  //     (source ∈ PURE_MAKER_ALLOWLIST or a HARD maker channel tag — the
  //     registry-free `isMakerCandidate` signal). The founder lowered the bar for
  //     the Workshop ("mostly signal"); short 3–5 min maker tutorials are kept so
  //     they can reach curated.json → the Workshop. The Feed re-applies its ≥5-min
  //     floor on the site side, so these short makers never leak into the Feed.
  const substantial = clustered.filter((it) => {
    const minutes = readTimeMinutes(it);
    if (minutes >= MIN_READ_MINUTES) return true;
    return isMakerCandidate(it) && minutes >= MAKER_MIN_READ_MINUTES;
  });

  const itemsById = new Map(substantial.map((it) => [it.id, it]));
  const profile = computeTasteProfile(events, itemsById, { now: opts.now, ...opts.taste });

  const ranked = applyDiversityFloor(rankItems(substantial, profile, { now: opts.now, ...opts.rank }));

  const clusterCount = new Set(clustered.map((it) => it.clusterId)).size;
  return { items: ranked, clusterCount, profileReady: profile.ready };
}
