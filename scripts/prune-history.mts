/**
 * Data-retention prune. Keeps the current build day plus `RETENTION_DAYS-1`
 * prior days of generated Reads; removes anything older so the repo / deployed
 * site never grow unbounded.
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/prune-history.mts            # DRY RUN (prints only)
 *   pnpm exec tsx scripts/prune-history.mts --apply    # actually delete
 *
 * Environment:
 *   RETENTION_DAYS   keep window in days (default 3; today + N-1 prior days)
 *   TODAY            override "today" as YYYY-MM-DD (CI/testing; default = now, UTC)
 *
 * Source of truth for an entry's AGE:
 *   1. each Read's COMMITTED frontmatter `publishedAt` — AUTHORITATIVE. It is
 *      committed, accurate, and survives the stateless cloud run.
 *   2. the build ledger (data/feed/history.json) — FALLBACK ONLY, used when a
 *      Read has no parseable `publishedAt`.
 *
 * Why not the ledger first? history.json is gitignored, so every stateless cloud
 * run starts without it; `record-build-day` then re-stamps EVERY Read as "today",
 * which made nothing ever look older than the window — prune removed nothing. The
 * committed frontmatter can't be reset that way, so it is the true age.
 *
 * Safe by construction: dry-run is the default, every file op is guarded, and
 * the pure age math (selectExpired) clamps RETENTION_DAYS so today is never
 * pruned. Never throws on missing files.
 */
import { readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RETENTION_DAYS,
  selectExpired,
  parseDayIndex,
  type DatedEntry,
} from "../packages/core/src/retention.ts";
import { readLedger, dayStamp } from "./lib/history.mts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const ledgerPath = join(repoRoot, "data/feed/history.json");
const blogDir = join(repoRoot, "apps/site/src/content/blog");

const apply = process.argv.includes("--apply");
const today = process.env.TODAY?.trim() || dayStamp();
const retentionDays = Number(process.env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);

/** Read a file, returning "" on any error (missing/unreadable). */
function readSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Pull `publishedAt` out of an MDX frontmatter block. Returns "" if absent. */
export function frontmatterPublishedAt(mdx: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(mdx);
  if (!fm) return "";
  const line = /^publishedAt:\s*(.+)$/m.exec(fm[1] ?? "");
  return line?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

/**
 * Build the dated-entry list, aging each Read by its COMMITTED frontmatter
 * `publishedAt` (authoritative). Only when a Read has no parseable `publishedAt`
 * do we fall back to the build ledger's recorded day for that slug. Each entry's
 * `id` is the Read slug. Pure w.r.t. its args (the caller passes the dirs/ledger),
 * so it's directly unit-testable.
 */
export function gatherEntries(
  blogDirPath: string,
  ledgerFilePath: string,
): { entries: DatedEntry[]; source: string } {
  const ledger = readLedger(ledgerFilePath);
  // slug → build-day, for the fallback path only (last write wins).
  const ledgerDay = new Map<string, string>();
  for (const d of ledger.days) {
    for (const slug of d.slugs) ledgerDay.set(slug, d.day);
  }

  let files: string[] = [];
  try {
    files = readdirSync(blogDirPath).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));
  } catch {
    files = [];
  }

  const entries: DatedEntry[] = [];
  let fromFrontmatter = 0;
  let fromLedger = 0;
  let undated = 0;
  for (const f of files) {
    const slug = f.replace(/\.(mdx?|md)$/i, "");
    const published = frontmatterPublishedAt(readSafe(join(blogDirPath, f)));
    if (parseDayIndex(published) !== null) {
      entries.push({ id: slug, day: published }); // authoritative
      fromFrontmatter++;
    } else if (ledgerDay.has(slug)) {
      entries.push({ id: slug, day: ledgerDay.get(slug)! }); // fallback
      fromLedger++;
    } else {
      entries.push({ id: slug, day: published }); // unparseable → selectExpired skips (keeps)
      undated++;
    }
  }
  return {
    entries,
    source:
      `frontmatter publishedAt (${blogDirPath})` +
      ` — ${fromFrontmatter} dated, ${fromLedger} via ledger fallback, ${undated} undated`,
  };
}

function main(): void {
  const { entries, source } = gatherEntries(blogDir, ledgerPath);
  const expiredSlugs = selectExpired(entries, today, retentionDays);

  console.log(`[prune] today=${today} retentionDays=${retentionDays} mode=${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`[prune] source=${source}`);
  console.log(`[prune] ${entries.length} dated Read(s); ${expiredSlugs.length} expired (older than ${retentionDays} days)`);

  if (expiredSlugs.length === 0) {
    console.log("[prune] nothing older than the window — nothing to do.");
    return;
  }

  // Resolve every file each expired Read owns: its MDX.
  const toRemove: string[] = [];
  for (const slug of expiredSlugs) {
    const mdx = join(blogDir, `${slug}.mdx`);
    if (existsSync(mdx)) toRemove.push(mdx);
    const md = join(blogDir, `${slug}.md`);
    if (existsSync(md)) toRemove.push(md);
  }

  for (const path of toRemove) {
    const rel = path.startsWith(repoRoot) ? path.slice(repoRoot.length) : path;
    if (!apply) {
      console.log(`[prune] would remove  ${rel}`);
      continue;
    }
    try {
      rmSync(path, { force: true });
      console.log(`[prune] removed       ${rel}`);
    } catch (err) {
      console.warn(`[prune] skip (error)  ${rel}: ${(err as Error).message}`);
    }
  }

  console.log(
    `[prune] ${apply ? "removed" : "would remove"} ${toRemove.length} file(s) across ${expiredSlugs.length} expired Read(s)`,
  );
  if (!apply) console.log("[prune] DRY-RUN — re-run with --apply to delete.");
}

// Only run when invoked directly (not when imported by the unit test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
