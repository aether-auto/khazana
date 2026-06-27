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
export type SourceStatus = "producing" | "dormant" | "deferred" | "failing" | "disabled";

// Types whose ingestion only runs in GitHub Actions (this machine's IP is blocked
// for them), so they're switched OFF locally. A disabled source of one of these
// types is "deferred" — cloud-gated, not dead — never plainly "disabled".
const ACTIONS_ONLY_TYPES = new Set<string>(["youtube"]);
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
  disabled: number; // truly-disabled only (excludes deferred / Actions-only)
  deferred: number; // off locally but cloud-gated (runs in Actions)
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

// Stable canonical order for the status facet (most→least healthy; deferred sits
// between dormant and failing — informational, not a problem).
const STATUS_ORDER: SourceStatus[] = ["producing", "dormant", "deferred", "failing", "disabled"];
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
 * Classify a source. If it's off, it's `deferred` when its type only ingests in
 * Actions (cloud-gated, not dead) and plainly `disabled` otherwise. If it's on:
 * `failing` with any failures, else `producing` with curated items, else `dormant`.
 */
function statusOf(
  enabled: boolean,
  failureCount: number,
  itemCount: number,
  type: string,
): SourceStatus {
  if (!enabled) return ACTIONS_ONLY_TYPES.has(type) ? "deferred" : "disabled";
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
      status: statusOf(s.enabled, s.failureCount, itemCount, s.type),
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
    deferred: statusCount("deferred"),
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

// ── trust basis ────────────────────────────────────────────────────────────
// The stored trustScore is hand-authored (seed) or claimedTrust+0.05 (scout) —
// there's no recorded rationale. assessTrust does NOT fake-reconstruct that exact
// number; it EXPLAINS credibility honestly from the observable signals we DO have
// (type, provenance, transport, fetch reliability, track record, editorial notes),
// keeping the stored score as the headline. Pure + deterministic; guards missing
// fields so it never throws.

export type TrustPolarity = "positive" | "neutral" | "caution";
export interface TrustFactor {
  label: string;
  detail: string;
  polarity: TrustPolarity;
}
export interface TrustBasis {
  score: number; // the stored trustScore (0-1), unchanged — the headline
  tier: string; // a credibility tier read from the source type (+ trust band)
  rationale: string; // one plain-English sentence synthesizing the factors
  factors: TrustFactor[];
}

// Credibility tier by source type — what KIND of source this is, before any score.
const TYPE_TIER: Record<string, string> = {
  arxiv: "scholarly preprint",
  "eng-blog": "primary engineering source",
  news: "press / journalism",
  rss: "independent feed",
  reddit: "community discussion",
  hn: "community aggregator",
  podcast: "audio / interview",
  youtube: "video / creator",
  x: "social post",
};

/** A short trust-band qualifier from the 0-1 score (high / mid / provisional). */
function trustBand(score: number): string {
  if (score >= 0.8) return "high-trust";
  if (score >= 0.6) return "trusted";
  if (score >= 0.4) return "mid-trust";
  return "provisional";
}

export function assessTrust(s: EnrichedSource): TrustBasis {
  const score = s.trustScore;
  const baseTier = TYPE_TIER[s.type] ?? "uncategorized source";
  const tier = `${trustBand(score)} ${baseTier}`;

  const factors: TrustFactor[] = [];

  // 1. Credibility tier (type-based). Scholarly / primary / press read positive;
  //    community / social are neutral context (not a knock, just lower provenance).
  const COMMUNITY = new Set(["reddit", "hn", "x"]);
  factors.push({
    label: "credibility tier",
    detail: `${baseTier} — ${s.type}`,
    polarity: COMMUNITY.has(s.type) ? "neutral" : "positive",
  });

  // 2. Provenance — how it entered the registry.
  if (s.addedBy === "seed") {
    factors.push({
      label: "provenance",
      detail: "curator-vetted (in the seed registry)",
      polarity: "positive",
    });
  } else if (s.addedBy === "scout") {
    factors.push({
      label: "provenance",
      detail: "auto-added by Scout",
      polarity: "neutral",
    });
  } else {
    factors.push({
      label: "provenance",
      detail: `manually added${s.addedBy ? ` (${s.addedBy})` : ""}`,
      polarity: "neutral",
    });
  }

  // 3. Transport — HTTPS is table stakes; plain HTTP is a caution.
  const isHttps = /^https:/i.test(s.url);
  factors.push({
    label: "transport",
    detail: isHttps ? "served over HTTPS" : "served over plain HTTP — unencrypted",
    polarity: isHttps ? "positive" : "caution",
  });

  // 4. Reliability — recent fetch failures.
  if (s.failureCount > 0) {
    factors.push({
      label: "reliability",
      detail: `${s.failureCount} recent fetch failure${s.failureCount === 1 ? "" : "s"}`,
      polarity: "caution",
    });
  } else {
    factors.push({
      label: "reliability",
      detail: "reliable fetch, no recent failures",
      polarity: "positive",
    });
  }

  // 5. Track record — is it actually producing into the feed?
  if (s.itemCount > 0) {
    factors.push({
      label: "track record",
      detail: `producing — ${s.itemCount} item${s.itemCount === 1 ? "" : "s"}, ~avg ${s.avgReadMin}-min reads`,
      polarity: "positive",
    });
  } else {
    factors.push({
      label: "track record",
      detail: "no items in the current feed yet",
      polarity: "neutral",
    });
  }

  // 6. Editorial note — the curator's prose, as neutral context.
  if (s.notes) {
    factors.push({
      label: "editorial note",
      detail: s.notes,
      polarity: "neutral",
    });
  }

  // 7. Divergence flag — a high stored trust that's currently failing is worth a look.
  if (score >= 0.75 && s.status === "failing") {
    factors.push({
      label: "needs review",
      detail: "high rated trust but currently failing — may need review",
      polarity: "caution",
    });
  }

  return { score, tier, rationale: synthesizeRationale(s, baseTier, factors), factors };
}

/** One plain-English sentence in the founder's voice, synthesizing the factors. */
function synthesizeRationale(s: EnrichedSource, baseTier: string, factors: TrustFactor[]): string {
  const cautions = factors.filter((f) => f.polarity === "caution");
  const pct = Math.round(s.trustScore * 100);

  // Lead clause: what it is + provenance.
  const prov =
    s.addedBy === "seed" ? "hand-vetted into the seed" : s.addedBy === "scout" ? "surfaced by the Scout" : "manually registered";
  const article = /^[aeiou]/i.test(baseTier) ? "An" : "A";
  let lead = `${article} ${baseTier} ${prov}, scored ${pct}`;

  // Track-record clause.
  if (s.itemCount > 0) {
    lead += `, and currently producing (${s.itemCount} item${s.itemCount === 1 ? "" : "s"} in the feed)`;
  } else {
    lead += `, not yet producing into the local feed`;
  }

  // Caution clause, if any.
  if (cautions.length === 0) return `${lead} with no outstanding reliability concerns.`;
  const reasons = cautions.map((c) => c.label).join(" and ");
  return `${lead}; watch its ${reasons}.`;
}
