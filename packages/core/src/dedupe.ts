import type { FeedItem } from "./feed-item.js";
import { hasFullText } from "./scoring.js";

/**
 * Near-duplicate COLLAPSE. The same article published by one publisher under two
 * registered source ids (e.g. `import-ai` AND `jack-clark-import-ai-substack`,
 * or a `news-*` vs bare double-registration) lands in the feed twice. Clustering
 * only TAGS a shared clusterId; nothing removes the mirror. This module collapses
 * those mirrors to a single representative BEFORE clustering so the cluster boost
 * and counts operate on unique articles, not inflated by duplicates.
 *
 * Pure: no I/O, no clock, no globals. Returns new objects; never mutates inputs.
 */

export interface DedupeOpts {
  /** Max gap (hours) between two items' publishedAt for a title-match to count as a duplicate. */
  windowHours?: number;
}

const DEFAULT_WINDOW_HOURS = 36;
const MS_PER_HOUR = 3_600_000;

/**
 * Canonical title key: lowercase, every non-alphanumeric run → a single space,
 * collapse whitespace, trim. Mirrors `titleTokens` in `@khazana/curate` so the
 * two stages agree on what "the same title" means. Punctuation-only / blank
 * titles normalize to `""` and are NEVER grouped (see `dedupeItems`).
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Approx plain-text length of an item's body (strips HTML tags cheaply). */
function bodyTextLength(body: string | undefined): number {
  if (!body) return 0;
  return body
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function metricVolume(item: FeedItem): number {
  return (item.metrics?.score ?? 0) + (item.metrics?.comments ?? 0);
}

/**
 * Deterministic "better representative" comparison. Returns true if `a` is a
 * strictly better representative than `b`. Order: (1) full text over not;
 * (2) longer plain body; (3) higher trustScore (?? 0.5); (4) higher metric
 * volume (score+comments); (5) lexicographically smallest id as the final,
 * always-decisive tiebreak.
 */
function isBetterRepresentative(a: FeedItem, b: FeedItem): boolean {
  const aFull = hasFullText(a);
  const bFull = hasFullText(b);
  if (aFull !== bFull) return aFull;

  const aLen = bodyTextLength(a.body);
  const bLen = bodyTextLength(b.body);
  if (aLen !== bLen) return aLen > bLen;

  const aTrust = a.trustScore ?? 0.5;
  const bTrust = b.trustScore ?? 0.5;
  if (aTrust !== bTrust) return aTrust > bTrust;

  const aMetric = metricVolume(a);
  const bMetric = metricVolume(b);
  if (aMetric !== bMetric) return aMetric > bMetric;

  return a.id < b.id;
}

/** Union a representative's array with a dropped item's, deduped, order-preserved. */
function unionArrays(base: string[], extra: string[]): string[] {
  const seen = new Set(base);
  const out = [...base];
  for (const v of extra) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Element-wise MAX of two optional metrics blocks (undefined unless either has a value). */
function maxMetrics(a: FeedItem["metrics"], b: FeedItem["metrics"]): FeedItem["metrics"] {
  if (!a && !b) return undefined;
  const merged: { score?: number; comments?: number } = {};
  const score = Math.max(a?.score ?? -Infinity, b?.score ?? -Infinity);
  const comments = Math.max(a?.comments ?? -Infinity, b?.comments ?? -Infinity);
  if (Number.isFinite(score)) merged.score = score;
  if (Number.isFinite(comments)) merged.comments = comments;
  return merged.score === undefined && merged.comments === undefined ? undefined : merged;
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]!]!;
      x = this.parent[x]!;
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

/**
 * Collapse near-duplicate mirrors to a single representative each.
 *
 * Two items are duplicates iff EITHER:
 *   • their normalized titles are equal (and non-blank) AND their publishedAt
 *     timestamps are within `windowHours` of each other; OR
 *   • they share the exact same `url`.
 *
 * Groups are formed via union-find (transitive), one representative is chosen
 * per group (see `isBetterRepresentative`), and the rest are dropped after their
 * topics/entities/metrics are merged INTO the representative. Representatives
 * keep the input position of the group's FIRST occurrence. Deterministic
 * regardless of input order. Inputs are never mutated.
 */
export function dedupeItems(items: FeedItem[], opts: DedupeOpts = {}): FeedItem[] {
  if (items.length === 0) return [];

  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const windowMs = windowHours * MS_PER_HOUR;

  const keys = items.map((it) => normalizeTitle(it.title));
  const times = items.map((it) => Date.parse(it.publishedAt));
  const uf = new UnionFind(items.length);

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const sameUrl = items[i]!.url === items[j]!.url;
      const ki = keys[i]!;
      const sameTitleInWindow =
        ki !== "" && ki === keys[j]! && Math.abs(times[i]! - times[j]!) <= windowMs;
      if (sameUrl || sameTitleInWindow) uf.union(i, j);
    }
  }

  // Bucket indices by group root, preserving input order within each group.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < items.length; i += 1) {
    const root = uf.find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }

  // For each group, choose the representative index and merge the rest into it.
  // We key the merged result by the group's FIRST input index so output order
  // matches the first occurrence of each representative's group.
  const mergedByFirstIndex = new Map<number, FeedItem>();
  for (const [, indices] of groups) {
    let repIdx = indices[0]!;
    for (const idx of indices) {
      if (idx !== repIdx && isBetterRepresentative(items[idx]!, items[repIdx]!)) repIdx = idx;
    }

    const rep = items[repIdx]!;
    let topics = [...rep.topics];
    let entities = [...rep.entities];
    let metrics = rep.metrics;
    for (const idx of indices) {
      if (idx === repIdx) continue;
      const other = items[idx]!;
      topics = unionArrays(topics, other.topics);
      entities = unionArrays(entities, other.entities);
      metrics = maxMetrics(metrics, other.metrics);
    }

    const firstIndex = indices[0]!;
    mergedByFirstIndex.set(firstIndex, { ...rep, topics, entities, metrics });
  }

  // Emit one representative per group, in order of each group's first occurrence.
  const out: FeedItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const merged = mergedByFirstIndex.get(i);
    if (merged) out.push(merged);
  }
  return out;
}
