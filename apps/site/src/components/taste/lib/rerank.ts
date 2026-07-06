// The client-side re-ranker — the load-bearing parity piece of the Calibration
// Bench. PURE + deterministic: no DOM, no I/O, no clock. All time-dependence
// flows through `now`. The scoring MATH is NOT reimplemented here: every score
// goes through `@khazana/core`'s `scoreContributions`, the same function the
// build pipeline (`@khazana/curate`) runs — so the bench preview equals the real
// feed by construction. This file only owns the filter → cluster → score → sort →
// diversity passes around that shared math.
import {
  scoreContributions,
  RANK_WEIGHTS,
  GAUSSIAN_DEFAULTS,
  MIN_READ_MINUTES,
  FEATURED_SIZE,
  type RankWeights,
  type GaussianParams,
  type RankProfile,
  type ScoreBreakdown,
  type FeedItem,
  type FormatName,
} from "@khazana/core";
import { matchesFacet } from "../../../lib/filter/index.js";

// ── Candidate shape the page serializes at build time ────────────────────────
// RerankItem carries the FULL set of FeedItem fields the scorer reads (body,
// topics, entities, publishedAt, trustScore, metrics, clusterId, kind) so it can
// be handed straight to core `scoreContributions` with no adapter — plus the
// trimmed display fields the bench feed renders (title, href, channel, group) and
// three PRECOMPUTED values (readMin, hasFullText, isMedia) for fast filtering and
// display. The precomputed flags are display/filter conveniences; the SCORE is
// always recomputed through core, never from these.
export interface RerankItem {
  id: string;
  title: string;
  href: string;
  topics: string[];
  entities: string[];
  publishedAt: string;
  trustScore?: number;
  metrics?: { score?: number; comments?: number };
  clusterId?: string;
  kind: FeedItem["kind"];
  channel: string;
  group: string;
  /** Item body — kept so core's readTime/fullText math runs identically. */
  body?: string;
  /** Precomputed at build: rendered read minutes (for the floor + the feed cell). */
  readMin: number;
  /** Precomputed at build: whether the item carries real full text. */
  hasFullText: boolean;
  /** Precomputed at build: transcript-less video/audio (diversity-floor target). */
  isMedia: boolean;
}

export interface RerankOpts {
  weights: RankWeights;
  gaussian: GaussianParams;
  gates: { minReadMinutes: number; featuredOn: boolean; diversityOn: boolean };
  filters: { channels: string[]; format: FormatName | "all" };
  profile: RankProfile;
  now: string;
  halfLifeDays?: number;
}

export interface RankedItem extends RerankItem {
  tasteScore: number;
  contributions: ScoreBreakdown["contributions"];
  rankIndex: number;
}

// ── Diversity-floor constants (ported verbatim from packages/curate/src/rank.ts) ──
// MIRRORS curate's applyDiversityFloor. The site cannot import @khazana/curate
// (a pipeline package), so the algorithm is ported here unchanged; keep the two in
// sync. FEATURED_SIZE comes from core (shared), the window/min constants are the
// curate values.
export const DIVERSITY_WINDOW = 50;
export const DIVERSITY_MIN_VIDEO = 2;
export const DIVERSITY_MIN_AUDIO = 2;

/**
 * Post-sort diversity pass guaranteeing a minimum presence of video and audio
 * within the scrollable list region [FEATURED_SIZE, FEATURED_SIZE+WINDOW).
 * Ported verbatim from curate's `applyDiversityFloor`, generalized over any
 * `{ kind; tasteScore }` row so it operates on RankedItem[].
 */
export function applyDiversityFloor<T extends { kind: FeedItem["kind"]; tasteScore: number }>(
  items: T[],
): T[] {
  if (items.length === 0) return items;

  const result = [...items];
  const listStart = Math.min(FEATURED_SIZE, result.length);
  const listEnd = Math.min(listStart + DIVERSITY_WINDOW, result.length);

  const needs: Array<{ kind: "video" | "audio"; min: number }> = [
    { kind: "video", min: DIVERSITY_MIN_VIDEO },
    { kind: "audio", min: DIVERSITY_MIN_AUDIO },
  ];

  for (const { kind, min } of needs) {
    const countInList = result.slice(listStart, listEnd).filter((it) => it.kind === kind).length;
    const deficit = min - countInList;
    if (deficit <= 0) continue;

    const candidates = result
      .slice(listEnd)
      .filter((it) => it.kind === kind)
      .sort((a, b) => b.tasteScore - a.tasteScore);

    const toPromote = candidates.slice(0, deficit);
    if (toPromote.length === 0) continue;

    const buriedIndices = toPromote
      .map((c) => result.findIndex((it, idx) => idx >= listEnd && it === c))
      .filter((idx) => idx !== -1)
      .sort((a, b) => b - a);

    for (const idx of buriedIndices) result.splice(idx, 1);

    for (let i = 0; i < toPromote.length; i++) {
      const insertAt = listEnd - toPromote.length + i;
      result.splice(insertAt, 0, toPromote[i]!);
    }
  }

  return result;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Does the item survive the current channel/format filters and read-time floor?
 * Channel/format matching is the shared predicate (apps/site/src/lib/filter) —
 * empty selection / "all" sentinel both mean "show everything".
 */
function passesFilters(it: RerankItem, opts: RerankOpts): boolean {
  if (it.readMin < opts.gates.minReadMinutes) return false;
  if (!matchesFacet(it.channel, opts.filters.channels)) return false;
  // Format filtering is by channel→format membership; "all" passes everything.
  // (The page maps format → channels when it builds the candidate set; here we
  // only honor an explicit single-format restriction via the item's group/channel
  // when provided. With "all" — the default — nothing is excluded.)
  if (!matchesFacet(it.group, opts.filters.format !== "all" ? [opts.filters.format] : [])) return false;
  return true;
}

// ── entry point ──────────────────────────────────────────────────────────────

export function rerank(items: RerankItem[], opts: RerankOpts): RankedItem[] {
  // (1) filter by read-time floor + channel/format.
  const kept = items.filter((it) => passesFilters(it, opts));

  // (2) cluster sizes over the FILTERED set (so the preview matches what's shown).
  const clusterSizes = new Map<string, number>();
  for (const it of kept) {
    if (it.clusterId) clusterSizes.set(it.clusterId, (clusterSizes.get(it.clusterId) ?? 0) + 1);
  }

  // (3) score each item through core (no math reimplemented here).
  const scored: RankedItem[] = kept.map((it) => {
    const clusterSize = it.clusterId ? clusterSizes.get(it.clusterId) ?? 1 : 1;
    const { total, contributions } = scoreContributions(it as unknown as FeedItem, {
      weights: opts.weights,
      gaussian: opts.gaussian,
      clusterSize,
      now: opts.now,
      profile: opts.profile,
      halfLifeDays: opts.halfLifeDays,
    });
    return { ...it, tasteScore: total, contributions, rankIndex: 0 };
  });

  // (4) sort desc by total (id tiebreak for determinism).
  scored.sort((a, b) => b.tasteScore - a.tasteScore || a.id.localeCompare(b.id));

  // (5) optional diversity floor.
  const ordered = opts.gates.diversityOn ? applyDiversityFloor(scored) : scored;

  // (6) assign rankIndex.
  return ordered.map((it, i) => ({ ...it, rankIndex: i }));
}

/**
 * id → (baselineIndex − currentIndex): how far each item MOVED versus the factory
 * baseline. Positive = climbed (▲), negative = fell (▼), 0 = held. Items absent
 * from either ranking are omitted.
 */
export function rankDeltas(current: RankedItem[], baseline: RankedItem[]): Map<string, number> {
  const baseIndex = new Map<string, number>();
  baseline.forEach((it, i) => baseIndex.set(it.id, i));
  const deltas = new Map<string, number>();
  current.forEach((it, i) => {
    const b = baseIndex.get(it.id);
    if (b !== undefined) deltas.set(it.id, b - i);
  });
  return deltas;
}

/**
 * The factory-default ranking — RANK_WEIGHTS / GAUSSIAN_DEFAULTS, default gates
 * (MIN_READ_MINUTES floor, no featured/diversity), no filters. This is the
 * baseline `rankDeltas` measures movement against.
 */
export function defaultRerank(items: RerankItem[], profile: RankProfile, now: string): RankedItem[] {
  return rerank(items, {
    weights: RANK_WEIGHTS,
    gaussian: GAUSSIAN_DEFAULTS,
    gates: { minReadMinutes: MIN_READ_MINUTES, featuredOn: false, diversityOn: false },
    filters: { channels: [], format: "all" },
    profile,
    now,
  });
}
