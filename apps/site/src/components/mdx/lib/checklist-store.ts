// apps/site/src/components/mdx/lib/checklist-store.ts
/**
 * Pure, DOM-free helpers for <Checklist> persistence — extracted for testability.
 *
 * The island stores a reader's tick-state in `localStorage` so progress survives
 * reloads. Two things must be pure and unit-tested: (1) how a STABLE storage key
 * is derived from the checklist's identity, and (2) how the persisted value is
 * (de)serialised safely. All `localStorage` ACCESS is guarded in the component
 * (SSR-safe, private-mode-safe); this module never touches the DOM.
 */

/** One checklist item. `label` is the identity; `note`/`href` are decoration. */
export interface ChecklistItem {
  /** The step text — also the per-item identity within the list. */
  label: string;
  /** Optional short clarification, shown muted under the label. */
  note?: string;
  /** Optional link (docs, a part, a ledger URL). */
  href?: string;
}

const KEY_PREFIX = "khz:checklist:";

/**
 * A tiny, stable, non-cryptographic string hash (FNV-1a, 32-bit, hex). Used ONLY
 * to fold the checklist's identity into a short deterministic token for the
 * storage key — never for security. Deterministic across SSR/CSR and machines,
 * so the same checklist always resolves to the same key.
 */
export function hashString(input: string): string {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // FNV prime multiply, kept in 32-bit range via Math.imul.
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 → unsigned; pad to 8 hex chars for a stable fixed-width token.
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Derive the STABLE localStorage key for a checklist.
 *
 * Scheme: `khz:checklist:<hash>` where `<hash>` is FNV-1a over the checklist's
 * identity string — the optional `title` plus every item `label`, joined by a
 * newline. This means:
 *   • the key is DETERMINISTIC (same content → same key on every render/machine),
 *   • it CHANGES when the author edits the title or the item set (so stale
 *     progress from a since-rewritten checklist is never wrongly re-applied), and
 *   • it is INDEPENDENT of item order-only churn? No — order is part of identity
 *     on purpose: reordering steps is a meaningful edit for a reproduce-this list.
 *
 * Only `label` (and `title`) contribute — `note`/`href` are presentation and can
 * be tweaked without invalidating a reader's saved progress.
 */
export function storageKey(items: ReadonlyArray<ChecklistItem>, title?: string): string {
  const identity = [title ?? "", ...items.map((it) => it.label)].join("\n");
  return `${KEY_PREFIX}${hashString(identity)}`;
}

/**
 * Parse a persisted value into a boolean[] of the given length. Tolerant of
 * garbage (private-mode quirks, hand-edited storage, a since-changed length):
 * anything unparseable or the wrong shape yields an all-false array. Extra
 * entries are dropped; missing entries default to false. Never throws.
 */
export function parseState(raw: string | null, length: number): boolean[] {
  const empty = () => new Array<boolean>(length).fill(false);
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return empty();
    return Array.from({ length }, (_, i) => parsed[i] === true);
  } catch {
    return empty();
  }
}

/** Serialise the tick-state for storage. Compact JSON boolean array. */
export function serializeState(state: ReadonlyArray<boolean>): string {
  return JSON.stringify(state.map((b) => b === true));
}

/** Count completed items — for the "n / total done" progress readout. */
export function completedCount(state: ReadonlyArray<boolean>): number {
  return state.reduce((n, b) => (b ? n + 1 : n), 0);
}
