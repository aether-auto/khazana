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
 *   1. data/feed/history.json (the build ledger) when present — authoritative;
 *   2. otherwise fall back to scanning blog MDX frontmatter `publishedAt`.
 *
 * Safe by construction: dry-run is the default, every file op is guarded, and
 * the pure age math (selectExpired) clamps RETENTION_DAYS so today is never
 * pruned. Never throws on missing files.
 */
import { readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RETENTION_DAYS, selectExpired, type DatedEntry } from "../packages/core/src/retention.ts";
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
function frontmatterPublishedAt(mdx: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(mdx);
  if (!fm) return "";
  const line = /^publishedAt:\s*(.+)$/m.exec(fm[1] ?? "");
  return line?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

/**
 * Build the dated-entry list from the ledger when present, else by scanning
 * blog frontmatter. Each entry's `id` is the Read slug.
 */
function gatherEntries(): { entries: DatedEntry[]; source: string } {
  const ledger = readLedger(ledgerPath);

  if (ledger.days.length > 0) {
    const entries: DatedEntry[] = [];
    for (const d of ledger.days) {
      for (const slug of d.slugs) {
        entries.push({ id: slug, day: d.day });
      }
    }
    return { entries, source: `ledger (${ledgerPath})` };
  }

  // Fallback: scan blog MDX frontmatter publishedAt.
  const entries: DatedEntry[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(blogDir).filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));
  } catch {
    files = [];
  }
  for (const f of files) {
    const slug = f.replace(/\.(mdx?|md)$/i, "");
    const day = frontmatterPublishedAt(readSafe(join(blogDir, f)));
    entries.push({ id: slug, day });
  }
  return { entries, source: `frontmatter scan (${blogDir})` };
}

function main(): void {
  const { entries, source } = gatherEntries();
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

main();
