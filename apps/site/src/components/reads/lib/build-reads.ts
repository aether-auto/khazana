// The Reads-index core. PURE + deterministic: no DOM, no I/O, no Date.now.
// One entry — `buildReadsIndex(reads)` — sorts the reads newest-first, splits off
// the single FEATURED read (the most recent), and derives every dataset the index
// page (SSR) and the filter island consume: the gallery list, format/channel facet
// counts, and the editorial stats readout.
//
// The View-Transition contract lives here too: exactly ONE element per page may
// own a given `transition:name`. The featured read's title owns
// `read-title-${slug}` in the hero, so the featured read MUST be excluded from the
// gallery (or the name would be duplicated). `buildReadsIndex` enforces that split:
// `featured` and `gallery` are disjoint, and `featured` is never in `gallery`.
//
// Read-time is derived from each read's raw MDX body via the SAME strip-then-count
// logic the read page uses (pages/reads/[slug].astro): drop import lines, fenced
// code blocks, JSX tags and `{expressions}`, then countWords → estimateReadMinutes.
// So the minutes shown on the index agree exactly with the minutes on the read.
import { countWords, estimateReadMinutes } from "../../../lib/read-time.js";

// ── Input shape (a structural subset of the blog collection entry) ──────────
// We accept the minimal subset of an Astro content entry so the lib is testable
// without the full content collection: id, the validated frontmatter we render,
// the raw MDX `body`, and the source count (the page passes `sources.length`).
export interface ReadInput {
  slug: string;
  title: string;
  format: string;
  channels: string[];
  summary: string;
  /** ISO timestamp (Astro coerces frontmatter `publishedAt` to a Date; we pass .toISOString()). */
  publishedAt: string;
  /** raw MDX body — read-time is derived from this (stripped) word count. */
  body: string;
  sourceCount: number;
}

// ── Output shapes (the data contract the page + island build to) ────────────
export interface ReadCardData {
  slug: string;
  title: string;
  format: string;
  channels: string[];
  summary: string;
  publishedAt: string; // ISO
  dateLabel: string; // YYYY-MM-DD
  readMin: number; // whole-minute estimate, floor 1
  sourceCount: number;
  href: string; // `${base}/reads/${slug}`
}
export interface FacetCount {
  value: string;
  count: number;
}
export interface ReadsStats {
  total: number; // all reads (featured + gallery)
  totalMinutes: number; // summed readMin across all reads
  formats: number; // distinct formats present
  channels: number; // distinct channels present
  sources: number; // summed sourceCount across all reads
}
export interface ReadsIndexData {
  /** The most recent read — null only when there are zero reads. */
  featured: ReadCardData | null;
  /** Every read EXCEPT the featured one, newest-first. */
  gallery: ReadCardData[];
  /**
   * Format facet, canonical FORMAT_NAMES order. Counts span the WHOLE collection
   * (featured + gallery): the featured hero IS a filter target (it dims/hides when
   * a specific chip doesn't match it), so a chip's count must equal the number of
   * reads it reveals across the hero AND the gallery.
   */
  formatFacet: FacetCount[];
  /** Channel facet, count desc then value asc, over the WHOLE collection. */
  channelFacet: FacetCount[];
  /** Editorial telemetry — spans the WHOLE collection (featured included). */
  stats: ReadsStats;
}

// ── helpers ──────────────────────────────────────────────────────────────

/**
 * Strip MDX scaffolding from a raw body so the word count reflects PROSE only,
 * matching pages/reads/[slug].astro exactly: drop `^import …` lines, fenced
 * ```code``` blocks, `<JSX>` tags, and `{expressions}`.
 */
function proseWords(body: string): number {
  const prose = body
    .replace(/^import\s.+$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ");
  return countWords(prose);
}

/** Frequency facet over a fixed canonical key order (zero-count keys dropped). */
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

/** Frequency facet sorted count desc then value asc (stable). Empty input → []. */
function tally(values: string[]): FacetCount[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function toCard(read: ReadInput, base: string): ReadCardData {
  const readMin = estimateReadMinutes(proseWords(read.body));
  return {
    slug: read.slug,
    title: read.title,
    format: read.format,
    channels: read.channels,
    summary: read.summary,
    publishedAt: read.publishedAt,
    dateLabel: read.publishedAt.slice(0, 10),
    readMin,
    sourceCount: read.sourceCount,
    href: `${base}/reads/${read.slug}`,
  };
}

// ── entry point ────────────────────────────────────────────────────────────

export function buildReadsIndex(
  reads: ReadInput[],
  opts: { base?: string; formatOrder?: readonly string[] } = {},
): ReadsIndexData {
  const base = (opts.base ?? "").replace(/\/$/, "");
  const formatOrder = opts.formatOrder ?? [];

  // Newest-first; slug tiebreak so equal timestamps sort reproducibly.
  const cards = reads
    .map((r) => toCard(r, base))
    .sort((a, b) =>
      a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : a.slug.localeCompare(b.slug),
    );

  // FEATURED = most recent; the rest form the gallery. Disjoint by construction:
  // the featured card is sliced off the front, so it is never in `gallery`.
  const featured = cards[0] ?? null;
  const gallery = cards.slice(1);

  // Facet counts span the WHOLE collection (featured + gallery). The featured
  // read IS a filter target: when a specific chip is active, the hero dims/hides
  // if it doesn't match, so a chip's count must equal the number of reads it
  // reveals ACROSS the hero and the gallery — not the gallery alone. (e.g. the
  // chronicle chip reveals only the featured Carrington read → count 1.)
  const formatFacet = tallyOrdered(
    cards.map((c) => c.format),
    formatOrder,
  );
  const channelFacet = tally(cards.flatMap((c) => c.channels));

  const stats: ReadsStats = {
    total: cards.length,
    totalMinutes: cards.reduce((sum, c) => sum + c.readMin, 0),
    formats: new Set(cards.map((c) => c.format)).size,
    channels: new Set(cards.flatMap((c) => c.channels)).size,
    sources: cards.reduce((sum, c) => sum + c.sourceCount, 0),
  };

  return { featured, gallery, formatFacet, channelFacet, stats };
}
