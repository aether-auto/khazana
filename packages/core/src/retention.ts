/**
 * Data-retention math for khazana's daily build. Each Actions run produces a
 * fresh day of Featured Reads + feed items; the deployed site carries the
 * current day plus a short history, and anything older is pruned in CI so the
 * repo / site / narration audio never grow unbounded.
 *
 * This module is the PURE decision layer: given a list of dated entries and
 * "today", it answers "which ids fall outside the retention window?". All I/O
 * (reading the history ledger, deleting MDX + audio) lives in
 * `scripts/prune-history.mts` — this file has no clock, no filesystem, no
 * globals, and never mutates its inputs.
 */

/** The default retention window, in days (today + the prior N-1 days are kept). */
export const DEFAULT_RETENTION_DAYS = 3;

const MS_PER_DAY = 86_400_000;

/** A single prunable thing (a Read slug, a feed-item id, an audio file path) with the day it was generated. */
export interface DatedEntry {
  /** Opaque identifier returned verbatim when the entry is expired. */
  id: string;
  /** The day the entry was generated — `YYYY-MM-DD` or a full ISO timestamp; the date portion is used. */
  day: string;
}

/**
 * Parse the date portion of a `YYYY-MM-DD` (or full ISO) string into a UTC
 * day-index (whole days since the epoch). Returns `null` for anything that
 * doesn't parse to a real calendar date, so callers can skip it rather than
 * mis-aging it. We re-serialize and compare to reject overflow dates like
 * `2026-13-99` that `Date.parse` would silently roll forward.
 */
export function parseDayIndex(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(ms)) return null;
  // Reject rolled-over dates (e.g. month 13, day 99) by round-tripping.
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== Number(y) ||
    back.getUTCMonth() !== Number(m) - 1 ||
    back.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Return the ids of every entry strictly OLDER than the retention window,
 * preserving input order. With `retentionDays = N`, ages `0..N-1` are kept and
 * age `>= N` is expired (so the boundary day age `=== N` is the first removed).
 *
 * - `today` keeps age-0 entries; future-dated entries are never expired.
 * - A `retentionDays` of 0 or less is clamped to 1 ("keep only today") so an
 *   accidental `RETENTION_DAYS=0` can never wipe the current build.
 * - Entries with unparseable days are skipped (kept), and if `today` itself is
 *   malformed the function fails safe by expiring nothing.
 */
export function selectExpired(
  entries: readonly DatedEntry[],
  today: string,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): string[] {
  const todayIdx = parseDayIndex(today);
  if (todayIdx === null) return [];
  const window = Math.max(1, Math.floor(retentionDays));

  const expired: string[] = [];
  for (const { id, day } of entries) {
    const idx = parseDayIndex(day);
    if (idx === null) continue; // malformed → keep (skip)
    const age = todayIdx - idx;
    if (age >= window) expired.push(id);
  }
  return expired;
}
