/**
 * History ledger — the authoritative record of what each daily build produced,
 * so the prune step (scripts/prune-history.mts) knows the AGE of every Read and
 * feed item without rearchitecting the single-file feed.
 *
 * The ledger is `data/feed/history.json`: one record per build day. It lives
 * under the already-gitignored `data/feed/` tree (generated, regenerated each
 * run) so nothing here bloats the committed repo.
 *
 * This module is additive: the generate/build step calls `appendBuildDay()`
 * after it writes that day's Reads; the prune step calls `readLedger()`. Nothing
 * in the live ingest/curate pipeline depends on it, so it can be wired in (or
 * not) without touching verified behavior. If the ledger is ever missing or
 * corrupt, `readLedger()` returns an empty ledger and the prune falls back to
 * scanning frontmatter — it never throws.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Everything one daily build emitted, keyed by the build day (`YYYY-MM-DD`). */
export interface BuildDay {
  /** Build day, `YYYY-MM-DD` (UTC). */
  day: string;
  /** Slugs of the Reads (blog MDX) generated that day. */
  slugs: string[];
  /** FeedItem ids featured that day (for trimming dated feed history, if ever split out). */
  feedItemIds: string[];
}

export interface HistoryLedger {
  days: BuildDay[];
}

const EMPTY: HistoryLedger = { days: [] };

/** The UTC calendar day (`YYYY-MM-DD`) for a Date (defaults to now). */
export function dayStamp(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Read the ledger; returns an empty ledger if absent or unparseable (never throws). */
export function readLedger(path: string): HistoryLedger {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { days: [] };
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { days?: unknown }).days)
    ) {
      return parsed as HistoryLedger;
    }
  } catch {
    /* fall through to empty */
  }
  return { days: [] };
}

/** Write the ledger, creating the parent directory if needed. */
export function writeLedger(path: string, ledger: HistoryLedger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

/**
 * Append (or replace) today's build record and persist. Idempotent per day: a
 * second build on the same UTC day overwrites that day's record rather than
 * duplicating it. The build step calls this once, after it has written the
 * day's Reads.
 */
export function appendBuildDay(
  path: string,
  build: Omit<BuildDay, "day"> & { day?: string },
): HistoryLedger {
  const day = build.day ?? dayStamp();
  const ledger = readLedger(path);
  const record: BuildDay = {
    day,
    slugs: build.slugs,
    feedItemIds: build.feedItemIds,
  };
  ledger.days = [...ledger.days.filter((d) => d.day !== day), record];
  ledger.days.sort((a, b) => a.day.localeCompare(b.day));
  writeLedger(path, ledger);
  return ledger;
}
