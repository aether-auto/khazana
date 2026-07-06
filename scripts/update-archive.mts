/**
 * Update the committed rolling feed archive (`data/feed/archive.json`) — the
 * "treasury" that lets the Feed retain a ~2-week corpus of past stories instead
 * of resetting to whatever the latest ingest snapshot holds.
 *
 * It reads the just-produced fresh snapshot (`data/feed/curated.json`) and the
 * existing archive, runs the pure `mergeIntoArchive` (union by id, fresh wins,
 * drop anything older than ARCHIVE_WINDOW_DAYS, teaser-trim, newest-first), and
 * writes `archive.json` back. Wired into the DAILY pipeline only (pipeline.yml
 * already commits once/day); feed-refresh.yml stays deploy-only.
 *
 * Also serves as the day-0 BACKFILL: with an empty/absent archive it simply seeds
 * the archive from curated.json aged to the window. It performs NO ingest and no
 * network — pure file I/O over already-committed data.
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/update-archive.mts
 *
 * Environment:
 *   NOW   override "now" as an ISO timestamp (CI/testing; default = now, UTC)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FeedItemSchema,
  mergeIntoArchive,
  ARCHIVE_WINDOW_DAYS,
  type FeedItem,
} from "../packages/core/src/index.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const feedDir = join(repoRoot, "data", "feed");
const curatedPath = join(feedDir, "curated.json");
const archivePath = join(feedDir, "archive.json");

/** Load + validate a FeedItem[] JSON file, dropping invalid items. [] on any error. */
function loadItems(path: string): FeedItem[] {
  if (!existsSync(path)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const entry of raw) {
    const parsed = FeedItemSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function spanOf(items: FeedItem[]): string {
  if (items.length === 0) return "(empty)";
  const pubs = items.map((i) => i.publishedAt).filter(Boolean).sort();
  return `${pubs[0]} … ${pubs[pubs.length - 1]}`;
}

const nowISO = process.env.NOW?.trim() || new Date().toISOString();

const existing = loadItems(archivePath);
const fresh = loadItems(curatedPath);
const merged = mergeIntoArchive(existing, fresh, nowISO, ARCHIVE_WINDOW_DAYS);

mkdirSync(dirname(archivePath), { recursive: true });
writeFileSync(archivePath, JSON.stringify(merged, null, 2) + "\n", "utf8");

console.log(
  `[update-archive] now=${nowISO} window=${ARCHIVE_WINDOW_DAYS}d\n` +
    `[update-archive] existing archive: ${existing.length} item(s); fresh curated: ${fresh.length} item(s)\n` +
    `[update-archive] wrote ${merged.length} item(s) → ${archivePath}\n` +
    `[update-archive] publishedAt span: ${spanOf(merged)}`,
);
