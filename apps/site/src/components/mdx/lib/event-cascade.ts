// apps/site/src/components/mdx/lib/event-cascade.ts
// Pure reveal / geometry math for <EventCascade> — extracted for testability.
// No DOM, no React: just the arithmetic that decides how many causal-chain nodes
// have scrolled into view and how the connecting "spine" is drawn between them.
// Keeping this pure means the island stays a thin shell and the tricky
// position→reveal-count logic is unit-tested.

/** The kind of a node in the causal chain — drives its emphasis styling. */
export type CascadeKind = "cause" | "effect" | "turning-point";

/** One node in the causal cascade. `detail` is a plain string (serializable). */
export interface CascadeNode {
  /** The short causal claim (the visible headline of the node). */
  label: string;
  /** The longer explanation, revealed on hover/focus. Plain string. */
  detail: string;
  /** Optional emphasis kind; defaults to a neutral link in the chain. */
  kind?: CascadeKind;
}

/**
 * The connective word printed on the spine BETWEEN two nodes — the causal
 * operator ("because", "therefore") that makes this a chain, not a clock. It is
 * chosen by the kind of the node the link leads INTO: a cause introduces its
 * effect ("therefore"), an effect is explained by what precedes it ("because"),
 * a turning-point is the hinge ("and so"). This is what visually distinguishes
 * the cascade from a Timeline: the links are labeled reasoning, not elapsed time.
 */
export function connectorLabel(intoKind: CascadeKind | undefined): string {
  switch (intoKind) {
    case "cause":
      return "which drives";
    case "turning-point":
      return "and so";
    case "effect":
    default:
      return "therefore";
  }
}

/** Clamp a reveal count into the valid [0, count] range (0 = nothing shown). */
export function clampRevealCount(revealed: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(revealed)) return count; // NaN → safest is fully revealed
  const n = Math.trunc(revealed);
  if (n < 0) return 0;
  if (n > count) return count;
  return n;
}

/** Whether node `i` is revealed given `revealed` nodes are showing. */
export function isNodeRevealed(i: number, revealed: number): boolean {
  return i < revealed;
}

/**
 * Whether the link (spine segment + connector) BELOW node `i` should be drawn.
 * A link is drawn once BOTH the node above it and the node below it are
 * revealed — the spine is the causal tissue between two visible claims, so it
 * only exists when both endpoints do. There are `count - 1` links for `count`
 * nodes; the last node has no link below it.
 */
export function isLinkRevealed(i: number, revealed: number, count: number): boolean {
  if (i < 0 || i >= count - 1) return false; // no link below the last node
  return isNodeRevealed(i + 1, revealed);
}

/**
 * How many nodes are revealed given the figure's scroll progress.
 *
 * `tops` are each node's current viewport-relative top
 * (`getBoundingClientRect().top`), `viewportH` the viewport height, `offset` the
 * fraction-from-top trigger line (shared with the rest of the scrolly family so
 * reveal feels consistent). A node counts as revealed once its top has reached
 * or passed the trigger line. Because it is derived PURELY from current position
 * (not from crossing events), re-running it on scroll is correct at ANY scroll
 * position — including right after a late `client:visible` hydration, when a
 * crossing-observer would have missed every earlier crossing and frozen.
 *
 * The count is monotonic in scroll depth: it returns the number of nodes at or
 * above the trigger line, which for a top-to-bottom stack is a prefix — so nodes
 * reveal strictly in order and never "un-reveal" a node above a hidden one.
 */
export function revealedFromScroll(
  tops: ReadonlyArray<number>,
  viewportH: number,
  offset: number,
): number {
  if (tops.length === 0) return 0;
  const line = offset * viewportH;
  let revealed = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i]! <= line) revealed = i + 1;
  }
  return revealed;
}

/**
 * The fraction-from-top trigger line that decides when a node is "revealed".
 * Set low in the viewport (0.85) so a node reveals as it rises into the lower
 * third — the reader sees the link draw just before they read the claim, and
 * the whole chain is revealed by the time the figure's bottom leaves the screen.
 */
export const REVEAL_TRIGGER_OFFSET = 0.85;
