import { z } from "zod";
import { ChannelSchema, FormatNameSchema } from "./vocab.js";

/**
 * Candidate slate — the output contract of the SURVEY subagent (the ideation
 * foundation of the orchestrator-worker Reads pipeline). The survey agent reads
 * the whole board (sources registry, curated feed, taste model, past-reads
 * ledger), then proposes a RANKED slate of Read *ideas* (angles/theses, not bare
 * topics) with per-dimension scores and the evidence that justifies them.
 *
 * A downstream writer is only ever spawned on a candidate that cleared the
 * groundability gate here, so a scored/evidenced candidate is a real spec: a
 * thesis, its seed material, a suggested format, and a novelty argument against
 * the past-reads ledger.
 */

/**
 * The five ideation dimensions, each 0–1.
 * - `groundability`: are there enough PRIMARY sources to hit the PhD-thesis bar?
 *   This is the GATE — a low score should sink a candidate regardless of appeal.
 * - `novelty`: not a repeat of a past read; a deliberate, well-argued follow-up /
 *   series entry is a virtue, a rehash is not.
 * - `tasteFit`: alignment with the taste model's channels/entities.
 * - `interestingness`: genuine surprise/fun/depth — the "I didn't know that" payoff.
 * - `importance`: how consequential/significant the topic genuinely is (a major
 *   result, a pivotal event or anniversary, a consequential shift). DISTINCT from
 *   `interestingness`: a topic can be important-but-unsurprising (a landmark ruling)
 *   or surprising-but-inconsequential (a fun curiosity). Score both independently.
 */
export const CandidateScoresSchema = z.object({
  groundability: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  tasteFit: z.number().min(0).max(1),
  interestingness: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
});
export type CandidateScores = z.infer<typeof CandidateScoresSchema>;

/**
 * Which idea lane a candidate came from.
 * - `feed-grounded`: synthesized from clusters/themes in the curated feed — it has
 *   one or more `seedItemIds`.
 * - `interest-driven`: a genuinely important or fascinating topic drawn from the
 *   founder's channel interests and the wider world, discovered via research with
 *   NO feed seed — its grounding comes from researched primary sources, not the
 *   feed. Such a candidate legitimately has empty `seedItemIds`.
 */
export const CandidateOriginSchema = z.enum(["feed-grounded", "interest-driven"]);
export type CandidateOrigin = z.infer<typeof CandidateOriginSchema>;

/** One proposed Read idea. */
export const ReadCandidateSchema = z.object({
  /** Stable, human-readable id for the candidate (kebab-case). */
  id: z.string().min(1),
  /** The idea in 1–2 sentences: what this Read argues or reveals. */
  thesis: z.string().min(1),
  /** The specific lens/approach that makes it distinctive (not the topic). */
  angle: z.string().min(1),
  /** Which lane produced this idea: feed-grounded (has seeds) or interest-driven (world-sourced, no feed seed). */
  origin: CandidateOriginSchema,
  /**
   * Curated FeedItem ids the idea draws on. EMPTY is legitimate for interest-driven
   * ideas — those have no feed seed; their grounding comes from researched primary
   * sources, not `curated.json`. Feed-grounded ideas should carry ≥1 id.
   */
  seedItemIds: z.array(z.string()).default([]),
  /** Optional clusterId the idea centers on, when it maps to one curated cluster. */
  seedCluster: z.string().optional(),
  /** Canonical channels (from CHANNELS) the Read belongs to. */
  channels: z.array(ChannelSchema).min(1),
  /** Suggested format (from FORMAT_NAMES); a downstream step may override. */
  suggestedFormat: FormatNameSchema,
  /** Per-dimension scores, each 0–1. */
  scores: CandidateScoresSchema,
  /** Why this idea is worth writing, in the agent's own words. */
  rationale: z.string().min(1),
  /** What PRIMARY sources plausibly exist to ground it (the groundability evidence). */
  groundabilityEvidence: z.string().min(1),
  /** Why it is NOT a repeat of a past read (or how it deliberately extends one). */
  noveltyCheck: z.string().min(1),
  /** Optional blended score the agent ranked by (0–1). Informational; ranking is by array order. */
  blendedScore: z.number().min(0).max(1).optional(),
});
export type ReadCandidate = z.infer<typeof ReadCandidateSchema>;

/**
 * The full ranked slate. `candidates` are ordered best-first (descending by the
 * agent's blended judgement); consumers should treat array order as the ranking
 * and not re-sort.
 */
export const CandidateSlateSchema = z.object({
  /** ISO-8601 timestamp of when the slate was produced. */
  generatedAt: z.string().datetime(),
  /** Ranked candidates, best first. */
  candidates: z.array(ReadCandidateSchema),
  /** Free-text notes: board-level observations, what was passed over and why, open calls. */
  notes: z.string().default(""),
});
export type CandidateSlate = z.infer<typeof CandidateSlateSchema>;

/**
 * Default blend used for a deterministic sanity check / tie-break. Groundability
 * is weighted highest because it is the hard gate. `importance` carries a
 * meaningful weight comparable to `interestingness` and `tasteFit`, so that
 * genuinely consequential topics can rise even when they aren't the most
 * surprising or the most feed-aligned. The agent is free to rank by its own
 * judgement, but a slate whose order badly contradicts this blend is a smell.
 */
export const DEFAULT_SLATE_WEIGHTS = {
  groundability: 0.3,
  importance: 0.2,
  interestingness: 0.2,
  tasteFit: 0.17,
  novelty: 0.13,
} as const;

/** Weighted blend of a candidate's five scores in [0,1]. */
export function blendedScore(
  scores: CandidateScores,
  weights: Record<keyof CandidateScores, number> = DEFAULT_SLATE_WEIGHTS,
): number {
  return (
    scores.groundability * weights.groundability +
    scores.novelty * weights.novelty +
    scores.tasteFit * weights.tasteFit +
    scores.interestingness * weights.interestingness +
    scores.importance * weights.importance
  );
}
