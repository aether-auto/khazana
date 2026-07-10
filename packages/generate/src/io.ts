import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CitationLedgerEntrySchema, FeedItemSchema, type CitationLedger, type FeedItem } from "@khazana/core";
import type { TastePayload } from "@khazana/curate";
import type { VerifyReport } from "./verify.js";
import type { ComponentCatalog } from "./component-catalog.js";

const EMPTY_TASTE: TastePayload = { ready: false, topics: {}, entities: {}, formatAffinity: {} };

/**
 * Read the curated feed, preferring the fresh ingest snapshot but falling
 * back to the committed rolling archive when it's absent.
 *
 * `data/feed/curated.json` is gitignored and written ONLY by the ingest
 * GitHub Action — in a fresh clone (exactly what the Reads routine runs
 * against) it does not exist, so this used to silently return `[]` and starve
 * `plan`/`verify` of feed grounding on every run. `data/feed/archive.json` is
 * a small, committed, display-only projection (`packages/core/src/archive.ts`)
 * that already satisfies `FeedItemSchema`, so it works as a fallback as-is.
 */
export function readCurated(dataDir: string): FeedItem[] {
  for (const name of ["curated.json", "archive.json"]) {
    const path = join(dataDir, "feed", name);
    if (!existsSync(path)) continue;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const raw = Array.isArray(parsed) ? parsed : [];
    const out: FeedItem[] = [];
    for (const candidate of raw) {
      const r = FeedItemSchema.safeParse(candidate);
      if (r.success) out.push(r.data);
    }
    if (out.length > 0) return out;
  }
  console.warn(
    "[generate] MISSING DATA: neither data/feed/curated.json (gitignored, ingest-only) nor the " +
      "committed data/feed/archive.json produced any usable feed items — feed grounding has " +
      "NOTHING to work with this run. This is a missing-precondition, NOT evidence the feed is " +
      "genuinely empty; investigate before treating this as a quality signal.",
  );
  return [];
}

/**
 * Parse one ledger JSON file. Tolerant parse: an invalid entry is dropped
 * rather than failing the whole file, but the drop is LOUD (one concise
 * `console.warn` naming the entry and the offending field(s)) — this schema
 * has drifted from what the writers actually emit before (see
 * `citation-ledger.ts`'s `firstSeen` normalization) and a silent drop there
 * zeroed grounding for every draft in a run without any visible signal.
 */
function readLedgerFile(path: string): CitationLedger {
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed) ? parsed : [];
  const out: CitationLedger = [];
  for (const candidate of raw) {
    const r = CitationLedgerEntrySchema.safeParse(candidate);
    if (r.success) {
      out.push(r.data);
      continue;
    }
    const label =
      candidate && typeof candidate === "object" && "url" in candidate
        ? String((candidate as { url?: unknown }).url)
        : JSON.stringify(candidate);
    const fields = r.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ");
    console.warn(
      `[generate] DROPPED invalid citation-ledger entry in ${path} (url: ${label}): ` +
        `bad field(s) [${fields}] — ${r.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return out;
}

/**
 * Read the citation ledger (curated ∪ researched, appraised) that the research
 * phase persisted. Widens the grounding gate beyond the curated FeedItem set.
 *
 * Unions two sources under `data/generation/research/`:
 *  - the legacy shared `ledger.json` (kept for back-compat), AND
 *  - every per-slug `<slug>.ledger.json` file. Parallel writers each emit their
 *    own per-slug ledger so they never clobber a single shared file.
 *
 * Missing dir/files are fine (returns whatever exists). Invalid entries are
 * dropped per-file, mirroring readCurated's tolerant parse.
 */
export function readLedger(dataDir: string): CitationLedger {
  const researchDir = join(dataDir, "generation", "research");
  const out: CitationLedger = [...readLedgerFile(join(researchDir, "ledger.json"))];
  if (existsSync(researchDir)) {
    for (const f of readdirSync(researchDir)) {
      if (f.endsWith(".ledger.json")) out.push(...readLedgerFile(join(researchDir, f)));
    }
  }
  return out;
}

export function readTaste(dataDir: string): TastePayload {
  const path = join(dataDir, "taste.json");
  if (!existsSync(path)) return { ...EMPTY_TASTE };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<TastePayload>;
    return {
      ready: parsed.ready ?? false,
      topics: parsed.topics ?? {},
      entities: parsed.entities ?? {},
      formatAffinity: parsed.formatAffinity ?? {},
    };
  } catch {
    return { ...EMPTY_TASTE };
  }
}

export function readStyle(repoRoot: string): string {
  const path = join(repoRoot, "STYLE.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function writeBrief(dataDir: string, slug: string, markdown: string): string {
  const path = join(dataDir, "generation", "briefs", `${slug}.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown.endsWith("\n") ? markdown : markdown + "\n");
  return path;
}

export function listDrafts(contentDir: string): string[] {
  if (!existsSync(contentDir)) return [];
  return readdirSync(contentDir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => join(contentDir, f));
}

export function readDraft(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeReport(dataDir: string, report: VerifyReport): string {
  const path = join(dataDir, "generation", "report.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  return path;
}

/**
 * Commit the component catalog snapshot where writer skills can reference it
 * during Internalize (see `.claude/skills/writers/README.md`), NOT under
 * `data/generation/` (which is gitignored/ephemeral) — the catalog is meant to
 * be a checked-in artifact writers read like any other skill reference.
 */
export function writeComponentCatalog(repoRoot: string, catalog: ComponentCatalog): string {
  const path = join(repoRoot, ".claude", "skills", "writers", "component-catalog.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(catalog, null, 2) + "\n");
  return path;
}
