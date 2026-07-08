/**
 * ideation-eval — assemble the EXACT context bundle the SURVEY subagent
 * (`.claude/agents/reads-survey.md`) receives, from the CURRENT real data, and
 * freeze it to a snapshot on disk.
 *
 * Why: so the orchestrator can run the survey agent repeatably over a FIXED
 * board and capture its slate for founder review + prompt iteration — without
 * the feed shifting underneath between runs. The bundle deliberately EXCLUDES
 * full FeedItem bodies (they'd blow the context budget and the survey agent's
 * job is board-level ideation, not drafting); the downstream researcher/writer
 * fetches full text later.
 *
 * Usage:
 *   pnpm tsx scripts/ideation-eval.mts                 # write default snapshot
 *   pnpm tsx scripts/ideation-eval.mts --top 120       # cap the feed digest size
 *   pnpm tsx scripts/ideation-eval.mts --out /tmp/x.json
 *
 * Output: a JSON snapshot under .superpowers/sdd/ideation-snapshots/ plus a
 * printed stats summary. The snapshot path is what you paste to the survey agent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Import workspace packages by SOURCE PATH: this script runs from the repo root
// where the @khazana/* aliases are not symlinked (root has no node_modules link).
// tsx transpiles the .ts sources directly, so this needs no build step.
import {
  FeedItemSchema,
  RegistrySchema,
  type FeedItem,
  type Registry,
} from "../packages/core/src/index.ts";
import { readReadsLedger, type ReadsLedgerEntry } from "../packages/generate/src/reads-ledger.ts";
import { loadTaste, type TastePayload } from "../apps/site/src/lib/taste.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DATA_DIR = join(REPO_ROOT, "data");
const BLOG_DIR = join(REPO_ROOT, "apps", "site", "src", "content", "blog");
const SNAPSHOT_DIR = join(REPO_ROOT, ".superpowers", "sdd", "ideation-snapshots");

interface Args {
  top: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let top = 150;
  let out = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--top") top = Number(argv[++i]);
    else if (argv[i] === "--out") out = argv[++i] ?? "";
  }
  return { top, out };
}

/** A trimmed FeedItem — everything the survey agent needs to reason, no bodies. */
interface FeedDigestItem {
  id: string;
  title: string;
  source: string;
  sourceType: string;
  url: string;
  topics: string[];
  entities: string[];
  clusterId: string | null;
  tasteScore: number | null;
  trustScore: number | null;
  publishedAt: string;
  kind: string;
  /** First ~240 chars of the summary for a scent of substance (NOT the body). */
  summarySnippet: string;
}

function digestItem(it: FeedItem): FeedDigestItem {
  return {
    id: it.id,
    title: it.title,
    source: it.source,
    sourceType: it.sourceType,
    url: it.url,
    topics: it.topics,
    entities: it.entities,
    clusterId: it.clusterId ?? null,
    tasteScore: it.tasteScore ?? null,
    trustScore: it.trustScore ?? null,
    publishedAt: it.publishedAt,
    kind: it.kind,
    summarySnippet: (it.summary ?? "").slice(0, 240),
  };
}

/**
 * Load the curated feed for ideation, preferring the fresh ingest snapshot but
 * falling back to the committed rolling archive when it's absent.
 *
 * `data/feed/curated.json` is gitignored and written ONLY by the ingest GitHub
 * Action — in a fresh clone (exactly what the twice-daily Reads routine runs
 * against) it does not exist, so `loadCurated` used to silently return `[]`
 * and the entire feed-grounded ideation lane went dark on every run (P0).
 * `data/feed/archive.json` is a small, committed, display-only projection
 * (see `packages/core/src/archive.ts`'s `toArchiveItem`) that already
 * satisfies `FeedItemSchema` — so it doubles as a feed-grounded fallback with
 * zero shape adaptation needed.
 */
export function loadCurated(dataDir: string = DATA_DIR): FeedItem[] {
  for (const name of ["curated.json", "archive.json"]) {
    const path = join(dataDir, "feed", name);
    if (!existsSync(path)) continue;
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const arr = Array.isArray(raw) ? raw : [];
    const out: FeedItem[] = [];
    for (const c of arr) {
      const r = FeedItemSchema.safeParse(c);
      if (r.success) out.push(r.data);
    }
    if (out.length > 0) return out;
  }
  console.warn(
    "[ideation-eval] MISSING DATA: neither data/feed/curated.json (gitignored, ingest-only) nor " +
      "the committed data/feed/archive.json produced any usable feed items — the feed-grounded " +
      "ideation lane is EMPTY this run. This is a missing-precondition, NOT evidence the feed is " +
      "genuinely empty; investigate before treating this as a quality signal.",
  );
  return [];
}

function loadRegistry(): Registry {
  for (const name of ["sources.json", "sources.seed.json"]) {
    const path = join(DATA_DIR, name);
    if (!existsSync(path)) continue;
    const r = RegistrySchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (r.success) return r.data;
  }
  return { version: 1, sources: [] };
}

/** Group by clusterId (fallback: id) and rank by tasteSum + log10(1+size). */
interface ClusterSummary {
  clusterId: string;
  size: number;
  channel: string;
  channels: string[];
  score: number;
  newestAt: string;
  itemIds: string[];
  topTitles: string[];
}

function summarizeClusters(items: FeedItem[]): ClusterSummary[] {
  const byCluster = new Map<string, FeedItem[]>();
  for (const it of items) {
    const key = it.clusterId ?? it.id;
    const list = byCluster.get(key) ?? [];
    list.push(it);
    byCluster.set(key, list);
  }
  const out: ClusterSummary[] = [];
  for (const [clusterId, members] of byCluster) {
    const sorted = [...members].sort((a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0));
    const tasteSum = sorted.reduce((s, it) => s + (it.tasteScore ?? 0), 0);
    const score = tasteSum + Math.log10(1 + sorted.length);
    const channels = [...new Set(sorted.flatMap((it) => it.topics))];
    out.push({
      clusterId,
      size: sorted.length,
      channel: sorted[0]!.topics[0] ?? "ideas",
      channels,
      score: Number(score.toFixed(3)),
      newestAt: new Date(Math.max(...sorted.map((it) => Date.parse(it.publishedAt)))).toISOString(),
      itemIds: sorted.map((it) => it.id),
      topTitles: sorted.slice(0, 3).map((it) => it.title),
    });
  }
  return out.sort(
    (a, b) => b.score - a.score || Date.parse(b.newestAt) - Date.parse(a.newestAt) || a.clusterId.localeCompare(b.clusterId),
  );
}

function channelCounts(items: FeedItem[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const it of items) for (const t of it.topics) c[t] = (c[t] ?? 0) + 1;
  return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]));
}

interface ContextBundle {
  generatedAt: string;
  meta: {
    top: number;
    feedItemsTotal: number;
    feedItemsIncluded: number;
    clusterCount: number;
    channelCount: number;
    sourceCount: number;
    pastReadsCount: number;
    tasteReady: boolean;
  };
  taste: TastePayload;
  channelCounts: Record<string, number>;
  registry: {
    sourceCount: number;
    byType: Record<string, number>;
    channelsCovered: string[];
    sources: { id: string; type: string; channels: string[]; trustScore: number; enabled: boolean }[];
  };
  clusters: ClusterSummary[];
  feedDigest: FeedDigestItem[];
  pastReads: ReadsLedgerEntry[];
}

function assembleBundle(top: number): ContextBundle {
  const curated = loadCurated();
  const registry = loadRegistry();
  const taste = loadTaste(DATA_DIR);
  const pastReads = readReadsLedger(BLOG_DIR);

  // Rank items by tasteScore desc (curate's committed order), then take the top N.
  const ranked = [...curated].sort((a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0));
  const included = ranked.slice(0, top);

  const clusters = summarizeClusters(curated);
  const byType: Record<string, number> = {};
  for (const s of registry.sources) byType[s.type] = (byType[s.type] ?? 0) + 1;
  const channelsCovered = [...new Set(registry.sources.flatMap((s) => s.channels))].sort();

  return {
    generatedAt: new Date().toISOString(),
    meta: {
      top,
      feedItemsTotal: curated.length,
      feedItemsIncluded: included.length,
      clusterCount: clusters.length,
      channelCount: Object.keys(channelCounts(curated)).length,
      sourceCount: registry.sources.length,
      pastReadsCount: pastReads.length,
      tasteReady: taste.ready,
    },
    taste,
    channelCounts: channelCounts(curated),
    registry: {
      sourceCount: registry.sources.length,
      byType,
      channelsCovered,
      sources: registry.sources.map((s) => ({
        id: s.id,
        type: s.type,
        channels: s.channels,
        trustScore: s.trustScore,
        enabled: s.enabled,
      })),
    },
    clusters,
    feedDigest: included.map(digestItem),
    pastReads,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const bundle = assembleBundle(args.top);
  const stamp = bundle.generatedAt.replace(/[:.]/g, "-");
  const outPath = args.out ? resolve(args.out) : join(SNAPSHOT_DIR, `snapshot-${stamp}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(bundle, null, 2) + "\n");

  const m = bundle.meta;
  console.log("ideation context bundle assembled");
  console.log(`  snapshot:        ${outPath}`);
  console.log(`  feed items:      ${m.feedItemsIncluded} of ${m.feedItemsTotal} (top ${m.top} by tasteScore)`);
  console.log(`  clusters:        ${m.clusterCount}`);
  console.log(`  channels:        ${m.channelCount}`);
  console.log(`  sources:         ${m.sourceCount}`);
  console.log(`  past reads:      ${m.pastReadsCount}`);
  console.log(`  taste ready:     ${m.tasteReady}`);
  console.log("");
  console.log("  top 5 clusters by score:");
  for (const c of bundle.clusters.slice(0, 5)) {
    console.log(`    [${c.score}] ${c.channel} ×${c.size} — ${c.topTitles[0] ?? ""}`);
  }
  console.log("");
  console.log("  past reads (novelty ledger):");
  for (const r of bundle.pastReads) {
    console.log(`    ${r.publishedAt.slice(0, 10)} · ${r.format} · ${r.channels.join("/")} — ${r.title}`);
  }
}

// Only run when invoked directly (so the unit test can import loadCurated
// without triggering a real snapshot write against live repo data) — mirrors
// the same guard already used by prune-history.mts / build-resilient.mts.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
