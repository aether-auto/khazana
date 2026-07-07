// Sort comparators for the Workshop board — pure, deterministic, no DOM. The
// SSR default (selectIdeas, lib/feed.ts) is always maker-score-ranked, so a
// no-JS visitor always sees a sensible order; this module is what the
// client-side BuildsSort island (progressive enhancement only) uses to reorder
// the already-rendered cards without re-fetching or re-rendering anything.
// Mirrors reads/lib/sort-reads.ts exactly, so the two sort instruments feel
// like one coherent mechanism rather than two libraries bolted together.
//
// Deliberately generic over a MINIMAL structural shape (`SortableBuild`) rather
// than the full `FeedItem`: the client-side island only has 4 data-* attributes
// per rendered card to read back (id, source, channel, publishedAt), and a
// build-time `FeedItem`-derived record satisfies this shape structurally, so
// the same functions serve both the (tested, in-memory) build-time data and the
// (untyped-DOM) client-time data with no duplication.
export interface SortableBuild {
  id: string;
  source: string;
  /** The build's primary maker channel (see maker-channel-style.ts). */
  channel: string;
  publishedAt: string;
}

export const BUILD_SORT_KEYS = ["newest", "channel", "source"] as const;
export type BuildSortKey = (typeof BUILD_SORT_KEYS)[number];

/** The SSR default — newest first, matching the board's rank order closely enough
 * that switching to "newest" never feels like a jarring reshuffle. */
export const BUILD_SORT_DEFAULT: BuildSortKey = "newest";

export function isBuildSortKey(value: string): value is BuildSortKey {
  return (BUILD_SORT_KEYS as readonly string[]).includes(value);
}

/** Newest-first, id tiebreak — deterministic across re-sorts. */
function newestFirst(a: SortableBuild, b: SortableBuild): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  return a.id.localeCompare(b.id);
}

/**
 * Compare two builds under a given sort key. `channelOrder` is the canonical
 * WORKSHOP_BROWSE_CHANNELS sequence (or any channel-priority list); a channel
 * absent from it sorts after every listed channel. Every key falls back to
 * newest-first as its tiebreak, so re-sorting never reshuffles builds that tie
 * on the primary key — ties stay in a stable, predictable order.
 */
export function compareBuilds<T extends SortableBuild>(
  a: T,
  b: T,
  key: BuildSortKey,
  channelOrder: readonly string[] = [],
): number {
  switch (key) {
    case "channel": {
      const rank = (c: string) => {
        const i = channelOrder.indexOf(c);
        return i === -1 ? channelOrder.length : i;
      };
      return rank(a.channel) - rank(b.channel) || newestFirst(a, b);
    }
    case "source":
      return a.source.localeCompare(b.source) || newestFirst(a, b);
    case "newest":
    default:
      return newestFirst(a, b);
  }
}

/** Sort a COPY of `builds` by `key` — never mutates the input array. */
export function sortBuilds<T extends SortableBuild>(
  builds: readonly T[],
  key: BuildSortKey,
  channelOrder: readonly string[] = [],
): T[] {
  return [...builds].sort((a, b) => compareBuilds(a, b, key, channelOrder));
}
