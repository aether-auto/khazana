// The Sources explorer core. PURE + deterministic: no DOM, no I/O, no Date.now.
// One entry — `buildSources(sources, items, pending)` — joins the source registry
// to the curated feed (by `item.source === entry.id`) and returns every dataset
// the page (SSR overview) and the interactive island consume. The island agent
// depends on these EXACT interface field names; do not rename them. Every reducer
// guards empty input so the page renders with 0 sources.
//
// Read-time is derived from each item's HTML body via the same logic as the rest
// of the site (`readTimeFromHtml`, 225 wpm, floor 1) so the numbers agree.
import { readTimeFromHtml } from "../../../lib/read-time.js";

// ── Input shapes (minimal structural subsets) ─────────────────────────────
// We accept a structural subset of SourceEntry / FeedItem so the lib is testable
// without the full zod schemas and never reaches for fields it doesn't use.
export interface SourcesEntry {
  id: string;
  type: string;
  url: string;
  channels: string[];
  enabled: boolean;
  trustScore: number;
  addedBy: string;
  failureCount: number;
  notes?: string;
}
export interface SourcesItem {
  id: string;
  source: string;
  sourceType: string;
  url: string;
  title: string;
  publishedAt: string;
  topics: string[];
  trustScore?: number;
  tasteScore?: number;
  body?: string;
  kind: string;
}

// ── Output datasets (the data contract the island builds to) ──────────────
export interface RecentItem {
  id: string;
  title: string;
  publishedAt: string;
  href: string; // `${base}/item/${id}`
}
export type SourceStatus = "producing" | "dormant" | "failing" | "disabled";
export interface EnrichedSource {
  id: string;
  type: string;
  url: string;
  host: string; // url hostname without leading www.
  channels: string[]; // registry channels (declared)
  enabled: boolean;
  trustScore: number;
  addedBy: string;
  failureCount: number;
  notes: string | null;
  itemCount: number; // curated items joined by id
  avgReadMin: number; // 0 when itemCount === 0
  avgTaste: number; // 0 when itemCount === 0
  lastPublished: string | null; // max publishedAt among its items, else null
  producedChannels: string[]; // topics actually on its items, by freq desc
  recentItems: RecentItem[]; // top 5 by publishedAt desc
  status: SourceStatus;
}
export interface FacetCount {
  value: string;
  count: number;
}
export interface SourcesHealth {
  total: number;
  enabled: number;
  disabled: number;
  failing: number;
  producing: number;
  dormant: number;
  candidates: number;
  avgTrust: number;
  byType: FacetCount[]; // sorted count desc, for a mini bar
}
export interface SourcesData {
  sources: EnrichedSource[]; // default sort: trustScore desc, then id asc
  facets: {
    type: FacetCount[];
    channel: FacetCount[];
    status: FacetCount[];
    provenance: FacetCount[];
  };
  health: SourcesHealth;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** url hostname without a leading `www.`; falls back to the raw url if unparseable. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Round to one decimal place (stable, avoids float jitter in the contract). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Count occurrences of each string in `values`, returned as `{value,count}` sorted
 * by count desc then value asc (stable). The empty input → `[]`.
 */
function tally(values: string[]): FacetCount[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// Stable canonical order for the status facet (most→least healthy).
const STATUS_ORDER: SourceStatus[] = ["producing", "dormant", "failing", "disabled"];
// Stable canonical order for the provenance facet.
const PROVENANCE_ORDER = ["seed", "scout", "manual"];

/** A frequency facet over a fixed canonical key order (zero-count keys dropped). */
function tallyOrdered(values: string[], order: readonly string[]): FacetCount[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const out: FacetCount[] = [];
  for (const key of order) {
    const count = counts.get(key);
    if (count) out.push({ value: key, count });
  }
  // Any value outside the canonical order still surfaces (count desc, after).
  for (const [value, count] of counts) {
    if (!order.includes(value)) out.push({ value, count });
  }
  return out;
}

/**
 * Classify a source: `disabled` if not enabled; else `failing` if it has any
 * failures; else `producing` if it has curated items; else `dormant`.
 */
function statusOf(enabled: boolean, failureCount: number, itemCount: number): SourceStatus {
  if (!enabled) return "disabled";
  if (failureCount > 0) return "failing";
  if (itemCount > 0) return "producing";
  return "dormant";
}

// ── entry point ──────────────────────────────────────────────────────────

export function buildSources(
  sources: SourcesEntry[],
  items: SourcesItem[],
  pending: SourcesEntry[],
  opts: { base?: string } = {},
): SourcesData {
  const base = (opts.base ?? "").replace(/\/$/, "");

  // Index curated items by their source id (the join key). Orphan items — whose
  // source matches no registry entry — simply never get read, so they're ignored.
  const bySource = new Map<string, SourcesItem[]>();
  for (const it of items) {
    const list = bySource.get(it.source);
    if (list) list.push(it);
    else bySource.set(it.source, [it]);
  }

  const enriched: EnrichedSource[] = sources.map((s) => {
    const own = bySource.get(s.id) ?? [];
    const itemCount = own.length;

    const avgReadMin =
      itemCount === 0
        ? 0
        : round1(own.reduce((sum, it) => sum + readTimeFromHtml(it.body), 0) / itemCount);
    const avgTaste =
      itemCount === 0
        ? 0
        : round1(own.reduce((sum, it) => sum + (it.tasteScore ?? 0), 0) / itemCount);

    const lastPublished =
      itemCount === 0
        ? null
        : own.reduce((max, it) => (it.publishedAt > max ? it.publishedAt : max), own[0]!.publishedAt);

    // Channels the source ACTUALLY produced (item topics), by frequency desc.
    const producedChannels = tally(own.flatMap((it) => it.topics)).map((f) => f.value);

    // Newest 5 items, descending by publishedAt (id tiebreak for stability).
    const recentItems: RecentItem[] = own
      .slice()
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : a.id.localeCompare(b.id)))
      .slice(0, 5)
      .map((it) => ({
        id: it.id,
        title: it.title,
        publishedAt: it.publishedAt,
        href: `${base}/item/${it.id}`,
      }));

    return {
      id: s.id,
      type: s.type,
      url: s.url,
      host: hostOf(s.url),
      channels: s.channels,
      enabled: s.enabled,
      trustScore: s.trustScore,
      addedBy: s.addedBy,
      failureCount: s.failureCount,
      notes: s.notes ?? null,
      itemCount,
      avgReadMin,
      avgTaste,
      lastPublished,
      producedChannels,
      recentItems,
      status: statusOf(s.enabled, s.failureCount, itemCount),
    };
  });

  // Default sort: trustScore desc, then id asc.
  enriched.sort((a, b) => b.trustScore - a.trustScore || a.id.localeCompare(b.id));

  // ── facets ──────────────────────────────────────────────────────────────
  const typeFacet = tally(enriched.map((s) => s.type));
  const channelFacet = tally(enriched.flatMap((s) => s.channels));
  const statusFacet = tallyOrdered(
    enriched.map((s) => s.status),
    STATUS_ORDER,
  );
  const provenanceFacet = tallyOrdered(
    enriched.map((s) => s.addedBy),
    PROVENANCE_ORDER,
  );

  // ── health ────────────────────────────────────────────────────────────────
  const total = enriched.length;
  const statusCount = (st: SourceStatus) => enriched.filter((s) => s.status === st).length;
  const avgTrust = total === 0 ? 0 : enriched.reduce((sum, s) => sum + s.trustScore, 0) / total;

  const health: SourcesHealth = {
    total,
    enabled: enriched.filter((s) => s.enabled).length,
    disabled: statusCount("disabled"),
    failing: statusCount("failing"),
    producing: statusCount("producing"),
    dormant: statusCount("dormant"),
    candidates: pending.length,
    avgTrust,
    byType: typeFacet,
  };

  return {
    sources: enriched,
    facets: {
      type: typeFacet,
      channel: channelFacet,
      status: statusFacet,
      provenance: provenanceFacet,
    },
    health,
  };
}
