// NARRATION — pure helpers for the ReadPlayer island.
//
// Everything time/lookup-related that the player needs lives here so it can be
// unit-tested without a DOM or an <audio> element. No React, no window. The
// component is the only thing that touches the media element + localStorage; the
// math is all here, deterministic and side-effect-free.

/** A paragraph's start time in the narration, in seconds. Mirrors the prop on
 *  the component so the lookup and the UI share one shape. */
export interface ParagraphMark {
  index: number;
  startSec: number;
}

/**
 * Find the index (into a *sorted-by-startSec* marks array) of the paragraph
 * being spoken at `t` seconds — i.e. the last mark whose startSec is <= t.
 *
 * Returns -1 when `t` precedes the first mark (or there are no marks) so the
 * caller can clear any active highlight before narration reaches paragraph 0.
 * Binary search: the prose can carry hundreds of paragraphs and this runs on
 * every `timeupdate` (~4Hz), so we keep it O(log n) and allocation-free.
 *
 * Marks are assumed pre-sorted by startSec (the manifest emits them in reading
 * order, which is monotonic in time); `sortMarks` below guarantees it for any
 * untrusted input.
 */
export function activeMarkIndex(marks: readonly ParagraphMark[], t: number): number {
  let lo = 0;
  let hi = marks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    // Non-null: mid is always within [lo, hi] ⊆ [0, length-1].
    if (marks[mid]!.startSec <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * The DOM `data-para-index` of the paragraph active at `t`, or null when none.
 * The component highlights elements carrying `[data-para-index="<n>"]`, so it
 * needs the *paragraph index*, not the array position — this resolves the mark
 * then hands back its `.index`.
 */
export function activeParagraphIndex(marks: readonly ParagraphMark[], t: number): number | null {
  const i = activeMarkIndex(marks, t);
  return i < 0 ? null : marks[i]!.index;
}

/** Defensive sort + de-dupe by paragraph index, so a hand-authored or
 *  out-of-order manifest can't break the binary search. Stable on startSec. */
export function sortMarks(marks: readonly ParagraphMark[]): ParagraphMark[] {
  const seen = new Set<number>();
  return [...marks]
    .filter((m) => Number.isFinite(m.startSec) && Number.isFinite(m.index))
    .sort((a, b) => a.startSec - b.startSec)
    .filter((m) => (seen.has(m.index) ? false : (seen.add(m.index), true)));
}

/**
 * Format a duration as a compact, monospace-friendly clock. Hours only appear
 * past the hour mark (1:04:09), otherwise m:ss (4:09, 0:07). Negative / NaN /
 * non-finite inputs clamp to 0:00 so a still-loading <audio> (duration = NaN)
 * never renders "NaN:NaN" in the readout.
 */
export function formatClock(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Map a media position + duration to a 0..1 fraction for the scrub fill.
 *  Guards a zero / NaN duration (pre-metadata) so the bar starts empty, not full
 *  or NaN-width. Always clamped to [0, 1]. */
export function progressFraction(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(positionSec) || positionSec <= 0) return 0;
  return Math.min(1, positionSec / durationSec);
}

/** Inverse of progressFraction: a click/drag fraction (0..1) of the bar back to
 *  a seek time in seconds. Clamps the fraction so an over-drag can't seek past
 *  the end or before 0. */
export function seekTimeFromFraction(fraction: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return f * durationSec;
}

/** The set of playback speeds the UI offers, in order. 1× is the default. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** Coerce an arbitrary number (e.g. from localStorage) to the nearest offered
 *  rate, defaulting to 1× when the stored value is gone/garbage. Keeps the speed
 *  control's active state always matching a real button. */
export function coerceRate(value: unknown): PlaybackRate {
  // `Number(null)` is 0 and `Number("")` is 0 — both are "no stored pref", not a
  // real 0× rate, so reject anything that isn't already a number or numeric string.
  if (value == null || value === "") return 1;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  let best: PlaybackRate = 1;
  let bestDelta = Infinity;
  for (const r of PLAYBACK_RATES) {
    const d = Math.abs(r - n);
    if (d < bestDelta) {
      bestDelta = d;
      best = r;
    }
  }
  return best;
}

/** Clamp an arbitrary volume (e.g. from localStorage) into [0, 1], defaulting to
 *  1 for non-finite input so a corrupt pref never mutes the user silently. */
export function coerceVolume(value: unknown): number {
  // A missing pref (null / "") defaults to full volume, never silent-mute.
  if (value == null || value === "") return 1;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}
