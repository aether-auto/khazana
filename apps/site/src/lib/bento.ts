// Bento-mosaic layout assignment for the Feed.
//
// Turns a ranked list of feed items into an asymmetric mosaic instead of a
// uniform list: the highest-ranked item leads as a large "feature", then the
// rest fall into a deliberately varied, repeating mosaic rhythm (wide / tall /
// regular) so no two rows feel like the same grid. Pure + deterministic so the
// SSR HTML and any client re-render agree, and so it's unit-testable.
//
// Sizes map to CSS grid spans in FeedSection (see its stylesheet):
//   feature → spans the full lead row (big display title + summary)
//   wide    → spans 2 columns
//   tall    → spans 2 rows
//   regular → 1×1
//
// The mosaic pattern is keyed off each item's index *after* the feature, so the
// rhythm is stable regardless of channel filtering (filtering only hides cards;
// it never re-flows the assignment, which would cause layout jank).

export type BentoSize = "feature" | "wide" | "tall" | "regular";

export interface BentoCell<T> {
  item: T;
  size: BentoSize;
  /** 0-based position in the ranked list (use for stagger delay). */
  index: number;
}

// Repeating mosaic rhythm applied to the non-feature items. Hand-tuned so that
// across any window you get a mix of wide/tall/regular without two large cells
// colliding into an unbalanced row. Index into this by (i % PATTERN.length).
const PATTERN: BentoSize[] = [
  "wide", // 0
  "regular", // 1
  "tall", // 2
  "regular", // 3
  "regular", // 4
  "wide", // 5
  "regular", // 6
  "regular", // 7
  "tall", // 8
  "regular", // 9
  "regular", // 10
  "wide", // 11
];

/**
 * Assign bento sizes to a ranked list.
 * @param items ranked feed items (index 0 = most prominent)
 * @param opts.feature whether to promote item 0 to a full-width feature (default true)
 */
export function assignBento<T>(
  items: readonly T[],
  opts: { feature?: boolean } = {},
): BentoCell<T>[] {
  const feature = opts.feature ?? true;
  return items.map((item, index) => {
    if (index === 0 && feature) {
      return { item, size: "feature", index };
    }
    const offset = feature ? index - 1 : index;
    const size = PATTERN[offset % PATTERN.length];
    return { item, size, index };
  });
}
