import { createHash } from "node:crypto";
import {
  FORMATS,
  formatsForChannel,
  type FeedItem,
  type Format,
  type FormatName,
} from "@khazana/core";
import type { TastePayload } from "@khazana/curate";

export interface Assignment {
  slug: string;
  format: FormatName;
  channel: string;
  title: string;
  sourceItemIds: string[];
  length: "brief" | "feature";
  rationale: string;
  column: boolean;
}

export interface ColumnSpec {
  format: FormatName;
  channel: string;
}

export interface SelectInput {
  items: FeedItem[];
  taste: TastePayload;
  now: string;
  maxPerRun?: number;
  dueColumns?: ColumnSpec[];
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function dueColumns(now: string): ColumnSpec[] {
  const weekday = WEEKDAYS[new Date(now).getUTCDay()];
  const out: ColumnSpec[] = [];
  for (const format of Object.values(FORMATS)) {
    const series = format.series;
    if (!series) continue;
    const due = series.cadence === "daily" || (series.cadence === "weekly" && series.day === weekday);
    if (due) out.push({ format: format.name, channel: format.topics[0] ?? "" });
  }
  return out;
}

export function slugify(title: string, sourceItemIds: string[]): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const hash = createHash("sha1").update([...sourceItemIds].sort().join("|")).digest("hex").slice(0, 6);
  return `${base}-${hash}`;
}

interface ClusterAgg {
  clusterId: string;
  channel: string;
  items: FeedItem[];
  score: number;
  newestMs: number;
}

function aggregateClusters(items: FeedItem[]): ClusterAgg[] {
  const byCluster = new Map<string, FeedItem[]>();
  for (const it of items) {
    const key = it.clusterId ?? it.id;
    const list = byCluster.get(key) ?? [];
    list.push(it);
    byCluster.set(key, list);
  }
  const aggs: ClusterAgg[] = [];
  for (const [clusterId, members] of byCluster) {
    // Items arrive ranked (curate sorts desc by tasteScore); keep that order.
    const sorted = [...members].sort((a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0));
    const tasteSum = sorted.reduce((s, it) => s + (it.tasteScore ?? 0), 0);
    const sizeBoost = Math.log10(1 + sorted.length);
    const newestMs = Math.max(...sorted.map((it) => Date.parse(it.publishedAt)));
    aggs.push({
      clusterId,
      channel: sorted[0]!.topics[0] ?? "ideas",
      items: sorted,
      score: tasteSum + sizeBoost,
      newestMs,
    });
  }
  // Deterministic order: score desc, then recency desc, then clusterId asc as a stable tiebreak.
  return aggs.sort(
    (a, b) => b.score - a.score || b.newestMs - a.newestMs || a.clusterId.localeCompare(b.clusterId),
  );
}

function pickFormat(channel: string, items: FeedItem[], taste: TastePayload): Format {
  const candidates = formatsForChannel(channel);
  const pool = candidates.length > 0 ? candidates : [FORMATS["field-notes"]];
  if (taste.ready) {
    // Bias by formatAffinity; deterministic tiebreak by format name.
    return [...pool].sort(
      (a, b) =>
        (taste.formatAffinity[b.name] ?? 0) - (taste.formatAffinity[a.name] ?? 0) ||
        a.name.localeCompare(b.name),
    )[0]!;
  }
  // Not ready: length by cluster size — bigger/feature for richer clusters, else first candidate.
  const wantFeature = items.length >= 2;
  const byLength = [...pool].sort((a, b) => {
    const av = a.length === "feature" ? 1 : 0;
    const bv = b.length === "feature" ? 1 : 0;
    return (wantFeature ? bv - av : av - bv) || a.name.localeCompare(b.name);
  });
  return byLength[0]!;
}

export function selectAssignments(input: SelectInput): Assignment[] {
  const maxPerRun = input.maxPerRun ?? 3;
  const columns = input.dueColumns ?? dueColumns(input.now);
  const out: Assignment[] = [];
  const usedClusters = new Set<string>();

  // 1) Recurring columns first (they define the publication's heartbeat).
  for (const col of columns) {
    if (out.length >= maxPerRun) break;
    const fmt = FORMATS[col.format];
    // Source the column from the top items in its channel, if any.
    const channelItems = input.items
      .filter((it) => it.topics.includes(col.channel))
      .sort((a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0))
      .slice(0, fmt.length === "feature" ? 4 : 2);
    const ids = channelItems.map((it) => it.id);
    const title = channelItems[0]?.title ?? `${fmt.name} column`;
    out.push({
      slug: slugify(`${fmt.name}-${title}`, ids.length > 0 ? ids : [col.format, col.channel]),
      format: fmt.name,
      channel: col.channel,
      title,
      sourceItemIds: ids,
      length: fmt.length,
      rationale: `Recurring ${fmt.series?.cadence} column (${fmt.name}) due on ${new Date(input.now).getUTCDay()}.`,
      column: true,
    });
    for (const it of channelItems) if (it.clusterId) usedClusters.add(it.clusterId);
  }

  // 2) On-demand picks from the day's top clusters.
  for (const agg of aggregateClusters(input.items)) {
    if (out.length >= maxPerRun) break;
    if (usedClusters.has(agg.clusterId)) continue;
    const fmt = pickFormat(agg.channel, agg.items, input.taste);
    const ids = agg.items.map((it) => it.id);
    out.push({
      slug: slugify(agg.items[0]!.title, ids),
      format: fmt.name,
      channel: agg.channel,
      title: agg.items[0]!.title,
      sourceItemIds: ids,
      length: fmt.length,
      rationale: `Top cluster (${agg.items.length} item(s), score ${agg.score.toFixed(2)}) on "${agg.channel}" → ${fmt.name}.`,
      column: false,
    });
    usedClusters.add(agg.clusterId);
  }

  return out;
}
