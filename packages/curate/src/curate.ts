import {
  dedupeItems,
  isMakerCandidate,
  isFullTextRead,
  isTranscriptlessMedia,
  MAKER_MIN_READ_MINUTES,
  type DedupeOpts,
  type FeedItem,
} from "@khazana/core";
import { enrichItems, type LlmClient } from "./enrich.js";
import { clusterItems, type ClusterOpts } from "./cluster.js";
import { computeTasteProfile, type TasteOpts } from "./taste.js";
import { rankItems, applyDiversityFloor, readTimeMinutes, MIN_READ_MINUTES, type RankOpts } from "./rank.js";
import type { EngagementEvent } from "./io.js";

export interface CurateOpts {
  now: string;
  cluster?: ClusterOpts;
  dedupe?: DedupeOpts;
  taste?: Omit<TasteOpts, "now">;
  rank?: Omit<RankOpts, "now">;
  concurrency?: number;
}

export interface CurateResult {
  items: FeedItem[];
  clusterCount: number;
  /** Mirror duplicates collapsed before clustering (enriched.length − deduped.length). */
  duplicatesRemoved: number;
  profileReady: boolean;
}

export async function runCurate(
  items: FeedItem[],
  events: EngagementEvent[],
  client: LlmClient | null,
  opts: CurateOpts,
): Promise<CurateResult> {
  const enriched = await enrichItems(items, client, { concurrency: opts.concurrency });

  // Collapse near-duplicate mirrors (one article registered under two source ids
  // → same normalized title + publishedAt, or exact-URL match) BEFORE clustering,
  // so cluster boost and counts operate on unique articles, not inflated mirrors.
  const deduped = dedupeItems(enriched, opts.dedupe);
  const duplicatesRemoved = enriched.length - deduped.length;

  const clustered = clusterItems(deduped, opts.cluster);

  // FULL-TEXT INVARIANT + two-tier read-time floor. The feed contains ONLY
  // genuine full-text reads — this is a HARD GATE, not a down-weight. An item is
  // kept iff:
  //   1. It is a genuine full-text read (`isFullTextRead`): a real extracted body
  //      (> MIN_FULLTEXT_CHARS), not a teaser / snippet / abstract / bare link.
  //      Full-content RSS items (long body that equals its summary) ARE full text
  //      and pass. Transcript-less video/audio (`isTranscriptlessMedia`) fails
  //      this gate (no body) and is explicitly excluded — so teaser-prone or
  //      media-only sources can never leak into the feed even if added later.
  //   AND
  //   2. It clears the read-time floor:
  //      • Default floor MIN_READ_MINUTES (5) for everything — the Feed's bar.
  //      • RELAXED floor MAKER_MIN_READ_MINUTES (3) for MAKER candidates only
  //        (source ∈ PURE_MAKER_ALLOWLIST or a HARD maker channel tag — the
  //        registry-free `isMakerCandidate` signal). The founder lowered the bar
  //        for the Workshop ("mostly signal"); short 3–5 min maker tutorials reach
  //        curated.json → the Workshop. The Feed re-applies its ≥5-min floor on
  //        the site side, so these short makers never leak into the Feed. Makers
  //        must ALSO be full text — the gate is not relaxed for them.
  const substantial = clustered.filter((it) => {
    if (isTranscriptlessMedia(it)) return false;
    if (!isFullTextRead(it)) return false;
    const minutes = readTimeMinutes(it);
    if (minutes >= MIN_READ_MINUTES) return true;
    return isMakerCandidate(it) && minutes >= MAKER_MIN_READ_MINUTES;
  });

  const itemsById = new Map(substantial.map((it) => [it.id, it]));
  const profile = computeTasteProfile(events, itemsById, { now: opts.now, ...opts.taste });

  const ranked = applyDiversityFloor(rankItems(substantial, profile, { now: opts.now, ...opts.rank }));

  const clusterCount = new Set(clustered.map((it) => it.clusterId)).size;
  return { items: ranked, clusterCount, duplicatesRemoved, profileReady: profile.ready };
}
