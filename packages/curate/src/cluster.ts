import { createHash } from "node:crypto";
import type { FeedItem } from "@khazana/core";

export interface ClusterOpts {
  titleJaccard?: number;
  minSharedEntities?: number;
}

export const DEFAULT_CLUSTER_OPTS: Required<ClusterOpts> = {
  titleJaccard: 0.6,
  minSharedEntities: 2,
};

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "with",
  "at", "by", "from", "as", "is", "are", "be", "this", "that", "new",
]);

export function titleTokens(title: string): Set<string> {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return new Set(cleaned);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sharedEntityCount(a: FeedItem, b: FeedItem): number {
  const setA = new Set(a.entities);
  let count = 0;
  for (const e of b.entities) if (setA.has(e)) count += 1;
  return count;
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

export function clusterItems(items: FeedItem[], opts: ClusterOpts = {}): FeedItem[] {
  const titleJaccard = opts.titleJaccard ?? DEFAULT_CLUSTER_OPTS.titleJaccard;
  const minSharedEntities = opts.minSharedEntities ?? DEFAULT_CLUSTER_OPTS.minSharedEntities;

  const tokens = items.map((it) => titleTokens(it.title));
  const uf = new UnionFind(items.length);
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const sameStory =
        jaccard(tokens[i]!, tokens[j]!) >= titleJaccard ||
        sharedEntityCount(items[i]!, items[j]!) >= minSharedEntities;
      if (sameStory) uf.union(i, j);
    }
  }

  const groups = new Map<number, string[]>();
  for (let i = 0; i < items.length; i += 1) {
    const root = uf.find(i);
    const list = groups.get(root) ?? [];
    list.push(items[i]!.id);
    groups.set(root, list);
  }

  const clusterIdByRoot = new Map<number, string>();
  for (const [root, ids] of groups) {
    const sorted = [...ids].sort();
    const hash = createHash("sha1").update(sorted.join("|")).digest("hex").slice(0, 12);
    clusterIdByRoot.set(root, hash);
  }

  return items.map((it, i) => ({ ...it, clusterId: clusterIdByRoot.get(uf.find(i))! }));
}
