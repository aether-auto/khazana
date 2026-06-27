// The Observatory analytics core. PURE + deterministic: no DOM, no I/O, no
// Date.now (relative time is derived from the corpus's own timestamps, or an
// optional `now` param). One entry — `analyze(items, posts, taste)` — returns
// every dataset the page (SSR charts) and the six interactive island charts
// consume. Chart agents depend on these EXACT interface field names; do not
// rename them. Every reducer guards empty input so the page renders with 0 items.
//
// Read-time is derived from each item's HTML body via the same logic as the rest
// of the site (`readTimeFromHtml`, 225 wpm, floor 1) so the numbers agree.
import { readTimeFromHtml } from "../../../lib/read-time.js";

// ── Input shapes (a minimal, self-contained view of FeedItem) ──────────────
// We accept a structural subset of FeedItem so the lib is testable without the
// full schema and never reaches for the empty `entities`/`media` fields.
export interface AnalyticsItem {
  id: string;
  source: string;
  sourceType: string;
  url: string;
  title: string;
  author?: string;
  publishedAt: string;
  topics: string[];
  summary: string;
  body?: string;
  trustScore?: number;
  tasteScore?: number;
  clusterId?: string;
  kind: string;
}
export interface AnalyticsPost {
  slug: string;
  title: string;
  channels: string[];
}
export interface AnalyticsTaste {
  ready: boolean;
  topics: Record<string, number>;
  entities: Record<string, number>;
  formatAffinity: Record<string, number>;
}

// ── Output datasets (the data contract chart agents build to) ──────────────
export interface HeroStat {
  label: string;
  value: string;
  sub?: string;
}
export interface CoocData {
  channels: string[];
  matrix: number[][];
  counts: Record<string, number>;
}
export interface ClusterDatum {
  id: string;
  size: number;
  channel: string;
  title: string;
  taste: number;
}
export interface ScatterPoint {
  id: string;
  title: string;
  trust: number;
  taste: number;
  readMin: number;
  channel: string;
  group: string;
  sourceType: string;
  href: string;
}
export interface ReadTimeDistData {
  bins: { x0: number; x1: number; count: number }[];
  peak: { x: number; y: number }[];
  median: number;
  mean: number;
}
export interface TimeBin {
  date: string;
  [group: string]: number | string;
}
export interface TimeSeriesData {
  bins: TimeBin[];
  groups: string[];
}
export interface ReadBySourceDatum {
  sourceType: string;
  values: number[];
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
}
export interface Analytics {
  hero: HeroStat[];
  cooc: CoocData;
  clusters: ClusterDatum[];
  scatter: ScatterPoint[];
  readDist: ReadTimeDistData;
  timeSeries: TimeSeriesData;
  readBySource: ReadBySourceDatum[];
  treemap: { channel: string; group: string; count: number; avgTaste: number }[];
  sourceMix: { sourceType: string; count: number }[];
  topSources: { source: string; count: number; avgTaste: number }[];
  topAuthors: { author: string; count: number }[];
  topItems: { id: string; title: string; channel: string; taste: number; readMin: number; href: string }[];
  trustHist: { x0: number; x1: number; count: number }[];
  tasteByChannel: { channel: string; group: string; avgTaste: number; count: number }[];
}

// ── Channel → GROUP mapping (mirrors Shell.astro `channelGroups`) ──────────
// The Shell collapses 18 channels into 4 nav groups (world/science/data/make).
// The Observatory promotes `ai` to its own group so the AI cluster — the densest
// part of the corpus — reads as its own hue instead of vanishing into science.
const GROUP_CHANNELS: Record<string, readonly string[]> = {
  world: ["history", "geopolitics", "politics", "geography"],
  science: ["science", "tech", "quantum"],
  data: ["data-science", "ds-sports", "data-strategy", "finance"],
  make: ["ideas", "diy", "3d-printing", "iot", "embedded", "ai-projects"],
  ai: ["ai"],
};

const CHANNEL_TO_GROUP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [group, chans] of Object.entries(GROUP_CHANNELS)) {
    for (const c of chans) m[c] = group;
  }
  return m;
})();

/** Map a channel to its GROUP. Unknown channels fall back to "science" (stable). */
export function channelGroup(channel: string): string {
  return CHANNEL_TO_GROUP[channel] ?? "science";
}

/**
 * GROUP → color. Restrained, warm-dark — NOT a rainbow. Hues are pinned to the
 * design tokens so the charts stay on-palette: amber (signal), clay (heat), sage,
 * plus two restrained cool tones. Hardcoded hex (not var()) because these are used
 * inside SVG fills / canvas where CSS custom props don't resolve in build-time SSR
 * string emission; the values mirror tokens.css exactly.
 */
export const GROUP_COLORS: Record<string, string> = {
  ai: "#ffb627", // --accent — amber, the signal hue (AI is the densest signal)
  world: "#c1554a", // --editorial — clay
  science: "#6b8a9e", // restrained slate
  data: "#9a7bb0", // muted violet
  make: "#7faa6e", // --good — sage
};

// ── small pure helpers ─────────────────────────────────────────────────────
function readMinOf(it: AnalyticsItem): number {
  return readTimeFromHtml(it.body);
}

/** Dominant GROUP of an item = the group of its first topic (curated primary). */
function itemGroup(it: AnalyticsItem): string {
  const primary = it.topics[0] ?? "tech";
  return channelGroup(primary);
}
function itemChannel(it: AnalyticsItem): string {
  return it.topics[0] ?? "tech";
}

/** Quantile of a SORTED ascending numeric array (linear interpolation). */
function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

/** Monday-anchored ISO week start (UTC) as a YYYY-MM-DD string. */
function weekStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

/** Day key YYYY-MM-DD (UTC) for the calendar heatmap / temporal aggregation. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function relativeFromNow(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const sec = Math.max(0, (now.getTime() - then) / 1000);
  const day = sec / 86400;
  if (day < 1) {
    const hr = Math.round(sec / 3600);
    return hr <= 1 ? "just now" : `${hr}h ago`;
  }
  if (day < 14) return `${Math.round(day)}d ago`;
  if (day < 60) return `${Math.round(day / 7)}w ago`;
  return `${Math.round(day / 30)}mo ago`;
}

function spanLabel(oldest: string, newest: string): string {
  const a = new Date(oldest);
  const b = new Date(newest);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const days = Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
  if (days < 14) return `${days} days`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export interface AnalyzeOpts {
  base?: string;
  now?: Date;
}

export function analyze(
  items: AnalyticsItem[],
  posts: AnalyticsPost[],
  taste: AnalyticsTaste,
  opts: AnalyzeOpts = {},
): Analytics {
  const base = (opts.base ?? "").replace(/\/$/, "");
  const href = (id: string) => `${base}/item/${id}`;
  // "now" is the newest item's timestamp unless overridden — keeps relative time
  // deterministic and avoids Date.now in pure code.
  const validTimes = items
    .map((it) => new Date(it.publishedAt).getTime())
    .filter((t) => !Number.isNaN(t));
  // No items → 0 (epoch). The hero builder guards `total ? … : "—"`, so a zero
  // here is never displayed; this keeps analyze() pure/deterministic (no Date.now).
  const newestTime = validTimes.length ? Math.max(...validTimes) : 0;
  const now = opts.now ?? new Date(newestTime);

  // Precompute read minutes once (used across hero, scatter, dists, boxplots).
  const readMin = new Map<string, number>();
  for (const it of items) readMin.set(it.id, readMinOf(it));

  // ── hero ──────────────────────────────────────────────────────────────
  const hero = buildHero(items, readMin, now);

  // ── cooc ──────────────────────────────────────────────────────────────
  const cooc = buildCooc(items);

  // ── clusters ────────────────────────────────────────────────────────────
  const clusters = buildClusters(items);

  // ── scatter ─────────────────────────────────────────────────────────────
  const scatter: ScatterPoint[] = items.map((it) => {
    const ch = itemChannel(it);
    return {
      id: it.id,
      title: it.title,
      trust: it.trustScore ?? 0,
      taste: it.tasteScore ?? 0,
      readMin: readMin.get(it.id) ?? 1,
      channel: ch,
      group: channelGroup(ch),
      sourceType: it.sourceType,
      href: href(it.id),
    };
  });

  // ── readDist ────────────────────────────────────────────────────────────
  const readDist = buildReadDist(items.map((it) => readMin.get(it.id) ?? 1));

  // ── timeSeries (weekly, by group, last ~26 populated weeks) ──────────────
  const timeSeries = buildTimeSeries(items);

  // ── readBySource (box-plot five-number summary per sourceType) ───────────
  const readBySource = buildReadBySource(items, readMin);

  // ── treemap (per channel) ────────────────────────────────────────────────
  const treemap = buildPerChannel(items).map((c) => ({
    channel: c.channel,
    group: channelGroup(c.channel),
    count: c.count,
    avgTaste: c.avgTaste,
  }));

  // ── sourceMix (per sourceType count) ──────────────────────────────────────
  const sourceMix = countBy(items, (it) => it.sourceType)
    .map(([sourceType, count]) => ({ sourceType, count }))
    .sort((a, b) => b.count - a.count || a.sourceType.localeCompare(b.sourceType));

  // ── topSources (top ~12 by item count) ───────────────────────────────────
  const topSources = aggregateSources(items).slice(0, 12);

  // ── topAuthors (top ~10, skip empty) ──────────────────────────────────────
  const topAuthors = countBy(
    items.filter((it) => (it.author ?? "").trim().length > 0),
    (it) => it.author!.trim(),
  )
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
    .slice(0, 10);

  // ── topItems (top 10 by tasteScore) ───────────────────────────────────────
  const topItems = [...items]
    .sort(
      (a, b) =>
        (b.tasteScore ?? 0) - (a.tasteScore ?? 0) || a.id.localeCompare(b.id),
    )
    .slice(0, 10)
    .map((it) => ({
      id: it.id,
      title: it.title,
      channel: itemChannel(it),
      taste: it.tasteScore ?? 0,
      readMin: readMin.get(it.id) ?? 1,
      href: href(it.id),
    }));

  // ── trustHist (0..1 in 0.1 bins) ──────────────────────────────────────────
  const trustHist = buildTrustHist(items);

  // ── tasteByChannel (avg taste per channel, desc) ──────────────────────────
  const tasteByChannel = buildPerChannel(items)
    .map((c) => ({
      channel: c.channel,
      group: channelGroup(c.channel),
      avgTaste: c.avgTaste,
      count: c.count,
    }))
    .sort((a, b) => b.avgTaste - a.avgTaste || a.channel.localeCompare(b.channel));

  // posts/taste are part of the contract; reads volume is tiny so they enrich
  // hero rather than drive a dataset. `taste` informs nothing computed here yet
  // (the taste page owns affinity bars) but is accepted for forward-compat.
  void posts;
  void taste;

  return {
    hero,
    cooc,
    clusters,
    scatter,
    readDist,
    timeSeries,
    readBySource,
    treemap,
    sourceMix,
    topSources,
    topAuthors,
    topItems,
    trustHist,
    tasteByChannel,
  };
}

// ── builders ────────────────────────────────────────────────────────────────

function buildHero(
  items: AnalyticsItem[],
  readMin: Map<string, number>,
  now: Date,
): HeroStat[] {
  const total = items.length;
  const totalMin = items.reduce((s, it) => s + (readMin.get(it.id) ?? 0), 0);
  const hours = totalMin / 60;
  const mins = items.map((it) => readMin.get(it.id) ?? 1).sort((a, b) => a - b);
  const medMin = mins.length ? quantileSorted(mins, 0.5) : 0;
  const channels = new Set<string>();
  for (const it of items) for (const t of it.topics) channels.add(t);
  const sources = new Set(items.map((it) => it.source));
  const podcasts = items.filter((it) => it.sourceType === "podcast").length;

  const times = items
    .map((it) => it.publishedAt)
    .filter((p) => !Number.isNaN(new Date(p).getTime()))
    .sort();
  const oldest = times[0] ?? "";
  const newest = times[times.length - 1] ?? "";

  return [
    { label: "items curated", value: String(total) },
    { label: "reading hours", value: hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1), sub: "in the corpus" },
    { label: "median read", value: `${Math.round(medMin)}`, sub: "minutes" },
    { label: "channels", value: String(channels.size), sub: "of 18 covered" },
    { label: "sources", value: String(sources.size), sub: "distinct" },
    { label: "podcasts", value: String(podcasts), sub: "transcribed" },
    { label: "freshest pull", value: total ? relativeFromNow(newest, now) : "—" },
    { label: "span", value: total ? spanLabel(oldest, newest) : "—", sub: "oldest → newest" },
  ];
}

function buildCooc(items: AnalyticsItem[]): CoocData {
  // Channels present, sorted by total frequency desc (stable on ties), so the
  // densest channels anchor the chord/heatmap.
  const counts: Record<string, number> = {};
  for (const it of items) for (const t of it.topics) counts[t] = (counts[t] ?? 0) + 1;
  const channels = Object.keys(counts).sort(
    (a, b) => (counts[b]! - counts[a]!) || a.localeCompare(b),
  );
  const idx = new Map(channels.map((c, i) => [c, i]));
  const n = channels.length;
  const matrix: number[][] = channels.map(() => new Array(n).fill(0));

  for (const it of items) {
    const ts = it.topics.filter((t) => idx.has(t));
    if (ts.length === 1) {
      // solo-channel item contributes to the diagonal
      const i = idx.get(ts[0]!)!;
      matrix[i]![i] = (matrix[i]![i] ?? 0) + 1;
    } else {
      // every unordered pair co-occurs; symmetric fill
      for (let a = 0; a < ts.length; a++) {
        for (let b = a + 1; b < ts.length; b++) {
          const i = idx.get(ts[a]!)!;
          const j = idx.get(ts[b]!)!;
          matrix[i]![j] = (matrix[i]![j] ?? 0) + 1;
          matrix[j]![i] = (matrix[j]![i] ?? 0) + 1;
        }
      }
    }
  }
  return { channels, matrix, counts };
}

function buildClusters(items: AnalyticsItem[]): ClusterDatum[] {
  const byCluster = new Map<string, AnalyticsItem[]>();
  for (const it of items) {
    if (!it.clusterId) continue;
    const arr = byCluster.get(it.clusterId);
    if (arr) arr.push(it);
    else byCluster.set(it.clusterId, [it]);
  }
  const out: ClusterDatum[] = [];
  for (const [id, members] of byCluster) {
    // dominant group → its most-frequent channel within the cluster
    const groupCount = new Map<string, number>();
    for (const m of members) {
      const g = itemGroup(m);
      groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
    }
    let domGroup = "";
    let domN = -1;
    for (const [g, c] of groupCount) {
      if (c > domN || (c === domN && g.localeCompare(domGroup) < 0)) {
        domGroup = g;
        domN = c;
      }
    }
    // representative channel: most-frequent channel whose group == domGroup
    const chCount = new Map<string, number>();
    for (const m of members) {
      const ch = itemChannel(m);
      if (channelGroup(ch) === domGroup) chCount.set(ch, (chCount.get(ch) ?? 0) + 1);
    }
    let channel = itemChannel(members[0]!);
    let chN = -1;
    for (const [ch, c] of chCount) {
      if (c > chN || (c === chN && ch.localeCompare(channel) < 0)) {
        channel = ch;
        chN = c;
      }
    }
    const best = [...members].sort(
      (a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0) || a.id.localeCompare(b.id),
    )[0]!;
    out.push({
      id,
      size: members.length,
      channel,
      title: best.title,
      taste: Math.max(...members.map((m) => m.tasteScore ?? 0)),
    });
  }
  return out.sort(
    (a, b) => b.size - a.size || b.taste - a.taste || a.id.localeCompare(b.id),
  );
}

function buildReadDist(minsRaw: number[]): ReadTimeDistData {
  if (minsRaw.length === 0) {
    return { bins: [], peak: [], median: 0, mean: 0 };
  }
  const mins = [...minsRaw].sort((a, b) => a - b);
  const mean = mins.reduce((s, m) => s + m, 0) / mins.length;
  const median = quantileSorted(mins, 0.5);

  const width = 2;
  const maxMin = mins[mins.length - 1]!;
  const top = Math.max(width, Math.ceil((maxMin + 1) / width) * width);
  const bins: { x0: number; x1: number; count: number }[] = [];
  for (let x0 = 0; x0 < top; x0 += width) {
    const x1 = x0 + width;
    // last bin is inclusive of its upper edge so the max value lands somewhere
    const count = mins.filter((m) => (x1 >= top ? m >= x0 && m <= x1 : m >= x0 && m < x1)).length;
    bins.push({ x0, x1, count });
  }
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  // Gaussian centered at the curation read-time target (15 min), scaled so its
  // crest == the tallest bin. Sampled across the x-range at the bin resolution.
  const mu = 15;
  const sigma = 7;
  const peak: { x: number; y: number }[] = [];
  for (let x = 0; x <= top; x += 1) {
    const g = Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
    peak.push({ x, y: g * maxCount });
  }
  return { bins, peak, median, mean };
}

function buildTimeSeries(items: AnalyticsItem[]): TimeSeriesData {
  const groups = Array.from(new Set(items.map(itemGroup))).sort();
  if (items.length === 0) return { bins: [], groups };

  // bucket by ISO week-start × group
  const byWeek = new Map<string, Map<string, number>>();
  for (const it of items) {
    const wk = weekStart(it.publishedAt);
    if (!wk) continue;
    const g = itemGroup(it);
    let row = byWeek.get(wk);
    if (!row) {
      row = new Map();
      byWeek.set(wk, row);
    }
    row.set(g, (row.get(g) ?? 0) + 1);
  }
  if (byWeek.size === 0) return { bins: [], groups };

  // sort weeks asc, cap to the last 26 that have data (ignores rare old outliers)
  const weeks = Array.from(byWeek.keys()).sort().slice(-26);
  const bins: TimeBin[] = weeks.map((wk) => {
    const row = byWeek.get(wk)!;
    const bin: TimeBin = { date: wk };
    for (const g of groups) bin[g] = row.get(g) ?? 0;
    return bin;
  });
  return { bins, groups };
}

function buildReadBySource(
  items: AnalyticsItem[],
  readMin: Map<string, number>,
): ReadBySourceDatum[] {
  const byType = new Map<string, number[]>();
  for (const it of items) {
    const arr = byType.get(it.sourceType);
    const v = readMin.get(it.id) ?? 1;
    if (arr) arr.push(v);
    else byType.set(it.sourceType, [v]);
  }
  const out: ReadBySourceDatum[] = [];
  for (const [sourceType, vals] of byType) {
    const sorted = [...vals].sort((a, b) => a - b);
    out.push({
      sourceType,
      values: sorted,
      min: sorted[0]!,
      q1: quantileSorted(sorted, 0.25),
      median: quantileSorted(sorted, 0.5),
      q3: quantileSorted(sorted, 0.75),
      max: sorted[sorted.length - 1]!,
    });
  }
  return out.sort((a, b) => b.median - a.median || a.sourceType.localeCompare(b.sourceType));
}

function buildPerChannel(
  items: AnalyticsItem[],
): { channel: string; count: number; avgTaste: number }[] {
  const agg = new Map<string, { count: number; taste: number }>();
  for (const it of items) {
    for (const ch of it.topics) {
      const a = agg.get(ch) ?? { count: 0, taste: 0 };
      a.count += 1;
      a.taste += it.tasteScore ?? 0;
      agg.set(ch, a);
    }
  }
  return Array.from(agg.entries())
    .map(([channel, a]) => ({ channel, count: a.count, avgTaste: a.count ? a.taste / a.count : 0 }))
    .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
}

function aggregateSources(
  items: AnalyticsItem[],
): { source: string; count: number; avgTaste: number }[] {
  const agg = new Map<string, { count: number; taste: number }>();
  for (const it of items) {
    const a = agg.get(it.source) ?? { count: 0, taste: 0 };
    a.count += 1;
    a.taste += it.tasteScore ?? 0;
    agg.set(it.source, a);
  }
  return Array.from(agg.entries())
    .map(([source, a]) => ({ source, count: a.count, avgTaste: a.count ? a.taste / a.count : 0 }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

function buildTrustHist(items: AnalyticsItem[]): { x0: number; x1: number; count: number }[] {
  const bins: { x0: number; x1: number; count: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const x0 = i / 10;
    const x1 = (i + 1) / 10;
    const last = i === 9;
    const count = items.filter((it) => {
      const t = it.trustScore;
      if (t == null) return false;
      return last ? t >= x0 && t <= x1 : t >= x0 && t < x1;
    }).length;
    bins.push({ x0, x1, count });
  }
  return bins;
}

function countBy<T>(arr: T[], key: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of arr) {
    const k = key(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries());
}

// ── calendar heatmap helper (used SSR by the page) ─────────────────────────
/**
 * Items-per-day over the corpus's populated range, for the GitHub-style calendar
 * heatmap. Returns one entry per day from the oldest to newest item (inclusive),
 * gaps filled with count 0. Pure; bounded by the data's own span. Outlier-safe:
 * if the span is absurdly long (> ~400 days, e.g. a stray 2015 item) we clamp to
 * the most recent ~365 days so the grid stays a year of cells, not a decade.
 */
export function calendarDays(items: AnalyticsItem[]): { date: string; count: number }[] {
  const keys = items.map((it) => dayKey(it.publishedAt)).filter((k) => k.length > 0);
  if (keys.length === 0) return [];
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);

  const sorted = [...keys].sort();
  const newest = new Date(`${sorted[sorted.length - 1]!}T00:00:00.000Z`);
  let oldest = new Date(`${sorted[0]!}T00:00:00.000Z`);
  const maxSpanMs = 400 * 86400000;
  if (newest.getTime() - oldest.getTime() > maxSpanMs) {
    oldest = new Date(newest.getTime() - 365 * 86400000);
  }

  const out: { date: string; count: number }[] = [];
  for (let t = oldest.getTime(); t <= newest.getTime(); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}
