/**
 * Record today's build into the history ledger (`data/feed/history.json`) by
 * calling `appendBuildDay()` — the function the audit flagged as never wired
 * (`.superpowers/sdd/audit-orchestration.md` §B / punch-list #5). Without this,
 * `history.json` never exists and prune falls back to scanning MDX frontmatter.
 *
 * Run this in the daily pipeline AFTER generate + render-audio and BEFORE prune,
 * so prune-history.mts reads the authoritative ledger. Idempotent per UTC day
 * (a re-run overwrites today's record).
 *
 * What it records for today:
 *   slugs        every Read in apps/site/src/content/blog/ (the committed MDX)
 *   audioFiles   every file in apps/site/public/audio/reads/ (repo-relative)
 *   feedItemIds  best-effort: ids from data/feed/curated.json (for future feed
 *                trimming; prune only uses slugs today)
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/record-build-day.mts
 *
 * Environment:
 *   TODAY   override the build day as YYYY-MM-DD (CI/testing; default = now UTC)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendBuildDay, dayStamp } from "./lib/history.mts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const ledgerPath = join(repoRoot, "data", "feed", "history.json");
const blogDir = join(repoRoot, "apps", "site", "src", "content", "blog");
const audioDir = join(repoRoot, "apps", "site", "public", "audio", "reads");
const curatedPath = join(repoRoot, "data", "feed", "curated.json");

/** Directory listing that returns [] on any error (missing dir, unreadable). */
function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Read+parse a JSON file, returning `fallback` on any error. */
function safeJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const day = process.env.TODAY?.trim() || dayStamp();

const slugs = safeList(blogDir)
  .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))
  .map((f) => f.replace(/\.(mdx?|md)$/i, ""))
  .sort();

// Repo-relative audio paths, matching how prune resolves ledger audio
// (prune joins repoRoot + the recorded path — see prune-history.mts:127).
const audioFiles = safeList(audioDir)
  .map((n) => join("apps", "site", "public", "audio", "reads", n))
  .sort();

const curated = safeJson<Array<{ id?: unknown }>>(curatedPath, []);
const feedItemIds = Array.isArray(curated)
  ? curated.map((i) => (typeof i?.id === "string" ? i.id : "")).filter(Boolean)
  : [];

const ledger = appendBuildDay(ledgerPath, { day, slugs, audioFiles, feedItemIds });

console.log(
  `[record-build-day] ${day}: ${slugs.length} Read(s), ${audioFiles.length} audio file(s), ` +
    `${feedItemIds.length} feed id(s) → ${ledgerPath} (${ledger.days.length} day(s) in ledger).`,
);
