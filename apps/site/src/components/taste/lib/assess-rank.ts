// "Why this item" — the rank-transparency lib. PURE + deterministic. Mirrors
// Sources' `assessTrust() → TrustBasis` (build-sources.ts) so the two
// explanations read as one family: same {score, tier, rationale, factors[]}
// shape, same synthesizeRationale idiom, same strength-dot rating. The score and
// every per-term contribution come from `@khazana/core`'s `scoreContributions`
// (no math reimplemented); this file only TRANSLATES those contributions into a
// human-readable basis. Updates live with the knobs because contributions are
// weight × subscore.
import {
  scoreContributions,
  readTimeMinutes,
  type RankWeights,
  type GaussianParams,
  type RankProfile,
  type FeedItem,
} from "@khazana/core";
import type { RerankItem } from "./rerank.js";

const MS_PER_DAY = 86_400_000;
const DEFAULT_HALF_LIFE_DAYS = 7;

export type RankStrength = "strong" | "solid" | "minor" | "none";
export type RankTier = "high resonance" | "solid" | "mid" | "buried";

export interface RankFactor {
  label: string; // "affinity" | "read-time" | "trust" | "recency" | …
  contribution: number; // weight × subscore — the additive amount
  share: number; // contribution / total (for the stacked bar)
  detail: string; // plain phrase, e.g. "topic ai 0.71"
  strength: RankStrength; // bucketed by share → ▰▰▰▰▰ rating
}

export interface RankBasis {
  score: number; // the item's tasteScore under the CURRENT knobs
  tier: RankTier;
  rationale: string; // one plain-English sentence (founder voice), ends "."
  factors: RankFactor[]; // one per scoring term, sorted by contribution desc
}

export interface AssessRankOpts {
  weights: RankWeights;
  gaussian: GaussianParams;
  profile: RankProfile;
  now: string;
  clusterSize: number;
  halfLifeDays?: number;
}

// Display label per contribution key (the order core emits them).
const LABELS: Record<string, string> = {
  affinity: "affinity",
  readTime: "read-time",
  content: "content",
  trust: "trust",
  recency: "recency",
  metrics: "metrics",
  cluster: "cluster",
};

/** Strength bucket from a factor's share of the total (mirrors strength dots). */
function strengthOf(share: number, contribution: number): RankStrength {
  if (contribution <= 0) return "none";
  if (share >= 0.3) return "strong";
  if (share >= 0.12) return "solid";
  return "minor";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Plain-English detail phrase for one contribution term. */
function detailFor(
  key: string,
  item: RerankItem,
  opts: AssessRankOpts,
  contribution: number,
): string {
  switch (key) {
    case "affinity": {
      if (!opts.profile.ready) return "taste model still learning — no affinity yet";
      if (opts.weights.affinity === 0) return "affinity weight at 0";
      const topTopics = item.topics
        .map((t) => ({ t, v: opts.profile.topics[t] ?? 0 }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 2)
        .map((x) => `topic ${x.t} ${round2(x.v)}`);
      const topEntities = item.entities
        .map((e) => ({ e, v: opts.profile.entities[e] ?? 0 }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 1)
        .map((x) => `entity ${x.e} ${round2(x.v)}`);
      const parts = [...topTopics, ...topEntities];
      return parts.length > 0 ? parts.join(" · ") : "no matching topics in your taste";
    }
    case "readTime": {
      const min = readTimeMinutes(item as unknown as FeedItem);
      const frac = round2(contribution / (opts.weights.readTime || 1));
      return `${min} min → ${frac} of the ${opts.gaussian.peakMin}-min peak`;
    }
    case "content": {
      if (item.hasFullText) return "carries full article body";
      if (item.isMedia) return "transcript-less media — partial credit";
      return "no full text";
    }
    case "trust": {
      const t = item.trustScore ?? 0.5;
      const band = t >= 0.8 ? "high-trust" : t >= 0.6 ? "trusted" : t >= 0.4 ? "mid-trust" : "provisional";
      return `${band} source (${round2(t)})`;
    }
    case "recency": {
      const halfLife = opts.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
      const ageDays = Math.max(
        0,
        Math.round((Date.parse(opts.now) - Date.parse(item.publishedAt)) / MS_PER_DAY),
      );
      const label = ageDays === 1 ? "1 day old" : `${ageDays} days old`;
      return `${label} · ${halfLife}-day half-life`;
    }
    case "metrics": {
      const score = item.metrics?.score ?? 0;
      const comments = item.metrics?.comments ?? 0;
      const total = score + comments;
      return total > 0 ? `${total} points + comments` : "no engagement metrics";
    }
    case "cluster": {
      return opts.clusterSize > 1 ? `${opts.clusterSize} sources converged` : "single source";
    }
    default:
      return key;
  }
}

/** Tier from the total score, on a sensible absolute scale for this corpus. */
function tierOf(total: number): RankTier {
  if (total >= 8) return "high resonance";
  if (total >= 5) return "solid";
  if (total >= 3) return "mid";
  return "buried";
}

export function assessRank(item: RerankItem, opts: AssessRankOpts): RankBasis {
  const { total, contributions } = scoreContributions(item as unknown as FeedItem, {
    weights: opts.weights,
    gaussian: opts.gaussian,
    clusterSize: opts.clusterSize,
    now: opts.now,
    profile: opts.profile,
    halfLifeDays: opts.halfLifeDays,
  });

  const denom = total > 0 ? total : 1;
  const factors: RankFactor[] = (
    Object.keys(contributions) as Array<keyof typeof contributions>
  ).map((key) => {
    const contribution = contributions[key];
    const share = contribution / denom;
    return {
      label: LABELS[key] ?? key,
      contribution,
      share,
      detail: detailFor(key, item, opts, contribution),
      strength: strengthOf(share, contribution),
    };
  });

  // Sort by contribution desc (label tiebreak for stable, deterministic order).
  factors.sort((a, b) => b.contribution - a.contribution || a.label.localeCompare(b.label));

  return {
    score: total,
    tier: tierOf(total),
    rationale: synthesizeRationale(item, factors, opts),
    factors,
  };
}

/** One plain-English sentence in the founder's terse voice, from the top factors. */
function synthesizeRationale(item: RerankItem, factors: RankFactor[], opts: AssessRankOpts): string {
  const positive = factors.filter((f) => f.contribution > 0);
  if (positive.length === 0) return "Ranks low — nothing in the current weights lifts it.";

  const tier = tierOf(factors.reduce((s, f) => s + f.contribution, 0));
  const opener = tier === "buried" ? "Ranks low" : tier === "mid" ? "Ranks mid" : "Ranks high";

  const top = positive.slice(0, 2);
  const reasons = top.map((f) => phraseFor(f, item, opts));
  const lead = reasons.length === 2 ? `${reasons[0]} and ${reasons[1]}` : reasons[0];

  return `${opener} mostly because it ${lead}.`;
}

/** A clause for the rationale sentence from one dominant factor. */
function phraseFor(f: RankFactor, item: RerankItem, opts: AssessRankOpts): string {
  switch (f.label) {
    case "affinity": {
      const topics = item.topics
        .filter((t) => (opts.profile.topics[t] ?? 0) > 0)
        .slice(0, 2)
        .join(", ");
      return topics ? `matches your taste (${topics})` : "matches your taste";
    }
    case "read-time":
      return `sits near the ${opts.gaussian.peakMin}-minute sweet spot`;
    case "trust":
      return "comes from a trusted source";
    case "recency":
      return "is fresh";
    case "metrics":
      return "is drawing engagement";
    case "cluster":
      return "was corroborated across sources";
    case "content":
      return "carries full text";
    default:
      return `scores on ${f.label}`;
  }
}
