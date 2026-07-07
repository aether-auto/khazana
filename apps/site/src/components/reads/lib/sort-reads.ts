// Sort comparators for the /reads gallery — pure, deterministic, no DOM. The
// SSR default (buildReadsIndex, build-reads.ts) is always newest-first, so a
// no-JS visitor always sees a sensible order; this module is what the
// client-side ReadsSort island (progressive enhancement only) uses to reorder
// the already-rendered cards without re-fetching or re-rendering anything.
//
// Deliberately generic over a MINIMAL structural shape (`SortableRead`) rather
// than importing the full `ReadCardData` from build-reads.ts: the client-side
// island only has 4 data-* attributes per rendered card to read back (slug,
// format, publishedAt, readMin), and a full `ReadCardData` satisfies this
// shape structurally, so the same functions serve both the (tested, in-memory)
// build-time data and the (untyped-DOM) client-time data with no duplication.
export interface SortableRead {
  slug: string;
  format: string;
  publishedAt: string;
  readMin: number;
}

export const READS_SORT_KEYS = ["newest", "longest", "format"] as const;
export type ReadsSortKey = (typeof READS_SORT_KEYS)[number];

/** The SSR default — matches buildReadsIndex's own ordering exactly. */
export const READS_SORT_DEFAULT: ReadsSortKey = "newest";

export function isReadsSortKey(value: string): value is ReadsSortKey {
  return (READS_SORT_KEYS as readonly string[]).includes(value);
}

/** Newest-first, slug tiebreak — the same stable rule buildReadsIndex uses. */
function newestFirst(a: SortableRead, b: SortableRead): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  return a.slug.localeCompare(b.slug);
}

/**
 * Compare two cards under a given sort key. `formatOrder` is the canonical
 * FORMAT_NAMES sequence (or any format-priority list); a format absent from
 * it sorts after every listed format. Every key falls back to newest-first as
 * its tiebreak, so re-sorting never reshuffles reads that tie on the primary
 * key — ties stay in a stable, predictable order.
 */
export function compareReads<T extends SortableRead>(
  a: T,
  b: T,
  key: ReadsSortKey,
  formatOrder: readonly string[] = [],
): number {
  switch (key) {
    case "longest":
      return b.readMin - a.readMin || newestFirst(a, b);
    case "format": {
      const rank = (f: string) => {
        const i = formatOrder.indexOf(f);
        return i === -1 ? formatOrder.length : i;
      };
      return rank(a.format) - rank(b.format) || newestFirst(a, b);
    }
    case "newest":
    default:
      return newestFirst(a, b);
  }
}

/** Sort a COPY of `cards` by `key` — never mutates the input array. */
export function sortReads<T extends SortableRead>(
  cards: readonly T[],
  key: ReadsSortKey,
  formatOrder: readonly string[] = [],
): T[] {
  return [...cards].sort((a, b) => compareReads(a, b, key, formatOrder));
}
