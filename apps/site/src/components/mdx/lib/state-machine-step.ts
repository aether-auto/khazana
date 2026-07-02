// apps/site/src/components/mdx/lib/state-machine-step.ts
//
// Pure token-stepping logic for <StateMachine> — extracted for testability. No
// DOM, no React, no rendering: just the arithmetic and graph bookkeeping that
// decides which state the active token is in and which transitions it has spent.
//
// A StateMachine renders states as node boxes (reusing <Diagram>'s SVG/edge core
// via `layoutDiagram`) and transitions as labeled edges. A "token" sits on the
// active state; stepping fires a transition and moves the token to that
// transition's target. Two step modes:
//
//   1. SEQUENCE mode — the author supplies an explicit ordered `sequence` of
//      transition indices (the canonical walk, e.g. a TCP handshake). Stepping
//      advances a cursor through that list; each step is deterministic.
//   2. FREE mode — no sequence; the reader clicks any transition leaving the
//      current state. Stepping is reader-directed; we expose which transitions
//      are currently fireable (leave the active state).
//
// The active state glows amber; "spent" transitions (already fired on the walk
// so far) dim. Keeping all of this pure means the island is a thin renderer and
// the tricky index math is unit-tested.

/** An author-facing state. `id` is referenced by transitions + `start`. */
export interface SMState {
  id: string;
  label: string;
}

/** An author-facing transition: fire `on` to move from state `from` to `to`. */
export interface SMTransition {
  from: string;
  to: string;
  /** The event/label that fires this transition (e.g. "SYN", "digit"). */
  on: string;
}

/**
 * A resolved transition — the author transition plus its stable index in the
 * `transitions` array (used as the identity for "spent" tracking + sequences).
 */
export interface IndexedTransition extends SMTransition {
  index: number;
}

/**
 * The full stepping state: which state the token sits on, how far along the
 * sequence walk we are, and the set of spent transition indices.
 */
export interface StepState {
  /** id of the state the token currently occupies. */
  activeState: string;
  /**
   * Cursor into `sequence` (SEQUENCE mode only): how many sequence steps have
   * been taken. 0 = at start, sequence.length = walk complete. In FREE mode this
   * simply counts steps taken and is not bounded by a sequence.
   */
  cursor: number;
  /** Transition indices that have fired on the walk so far (spent → dimmed). */
  spent: number[];
}

/**
 * Build the initial stepping state: the token sits on `start`, no steps taken,
 * nothing spent. Pure — the same inputs always yield the same seed.
 */
export function initialStep(start: string): StepState {
  return { activeState: start, cursor: 0, spent: [] };
}

/**
 * Resolve a `sequence` of transition references into concrete indexed
 * transitions. Each sequence entry is either a numeric index into `transitions`
 * or a string of the form "from>to" / "from>to:on" naming the transition. Unknown
 * / malformed refs are dropped (defensive — a bad ref must not blank the figure).
 * Returns the ordered list of indexed transitions to walk.
 */
export function resolveSequence(
  transitions: ReadonlyArray<SMTransition>,
  sequence: ReadonlyArray<string> | undefined,
): IndexedTransition[] {
  if (!sequence || sequence.length === 0) return [];
  const out: IndexedTransition[] = [];
  for (const ref of sequence) {
    const idx = matchTransitionRef(transitions, ref);
    if (idx >= 0) out.push({ ...transitions[idx]!, index: idx });
  }
  return out;
}

/**
 * Match a single sequence reference to a transition index. Accepts:
 *   - a bare numeric string ("2") → that index
 *   - "from>to" → the first transition with that from/to pair
 *   - "from>to:on" → the transition with that from/to AND matching `on`
 * Returns -1 when nothing matches. Pure + deterministic (first match wins).
 */
export function matchTransitionRef(
  transitions: ReadonlyArray<SMTransition>,
  ref: string,
): number {
  const trimmed = ref.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return n >= 0 && n < transitions.length ? n : -1;
  }
  // "from>to" or "from>to:on"
  const arrow = trimmed.split(">");
  if (arrow.length !== 2) return -1;
  const from = arrow[0]!.trim();
  const rest = arrow[1]!.split(":");
  const to = rest[0]!.trim();
  const on = rest.length > 1 ? rest.slice(1).join(":").trim() : undefined;
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i]!;
    if (t.from === from && t.to === to && (on === undefined || t.on === on)) return i;
  }
  return -1;
}

/**
 * The transitions currently fireable from `state` — i.e. those whose `from`
 * equals the active state. In FREE mode these are the reader's options; in
 * SEQUENCE mode the UI still highlights the next scripted one among them.
 */
export function outgoing(
  transitions: ReadonlyArray<SMTransition>,
  state: string,
): IndexedTransition[] {
  const out: IndexedTransition[] = [];
  for (let i = 0; i < transitions.length; i++) {
    if (transitions[i]!.from === state) out.push({ ...transitions[i]!, index: i });
  }
  return out;
}

/**
 * Advance one SEQUENCE step. Returns the next StepState after firing the
 * transition at `resolved[cursor]`, or the SAME state (a no-op) when the walk is
 * already complete. Idempotent at the end — stepping past the last transition
 * never throws and never moves the token. Pure.
 */
export function stepSequence(
  current: StepState,
  resolved: ReadonlyArray<IndexedTransition>,
): StepState {
  if (current.cursor >= resolved.length) return current; // walk complete → no-op
  const t = resolved[current.cursor]!;
  return {
    activeState: t.to,
    cursor: current.cursor + 1,
    spent: appendUnique(current.spent, t.index),
  };
}

/**
 * Fire a SPECIFIC transition (FREE mode — reader clicked it, or clicked any
 * transition in sequence mode). Only fires when the transition actually leaves
 * the active state; otherwise it's a no-op (you can't take an edge you're not
 * standing on). Returns the next StepState. Pure.
 */
export function fireTransition(
  current: StepState,
  transitions: ReadonlyArray<SMTransition>,
  index: number,
): StepState {
  const t = transitions[index];
  if (!t || t.from !== current.activeState) return current; // not fireable → no-op
  return {
    activeState: t.to,
    cursor: current.cursor + 1,
    spent: appendUnique(current.spent, index),
  };
}

/** Whether the sequence walk is complete (cursor at/after the last step). */
export function isComplete(current: StepState, sequenceLength: number): boolean {
  return sequenceLength > 0 && current.cursor >= sequenceLength;
}

/** Append `value` to `arr` only if not already present (stable order). Pure. */
export function appendUnique(arr: ReadonlyArray<number>, value: number): number[] {
  return arr.includes(value) ? arr.slice() : [...arr, value];
}

/**
 * The ordered list of state ids visited along a resolved sequence, starting at
 * `start`. Used by the SSR / reduced-motion fallback to LIST the walk ("start →
 * … → end") without any client JS. Pure + deterministic.
 */
export function sequenceStateWalk(
  start: string,
  resolved: ReadonlyArray<IndexedTransition>,
): string[] {
  const walk = [start];
  for (const t of resolved) walk.push(t.to);
  return walk;
}
