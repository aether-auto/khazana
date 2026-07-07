import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CitationLedgerEntrySchema, FeedItemSchema, type CitationLedger, type FeedItem } from "@khazana/core";
import type { TastePayload } from "@khazana/curate";
import type { VerifyReport } from "./verify.js";
import type { ComponentCatalog } from "./component-catalog.js";

const EMPTY_TASTE: TastePayload = { ready: false, topics: {}, entities: {}, formatAffinity: {} };

export function readCurated(dataDir: string): FeedItem[] {
  const path = join(dataDir, "feed", "curated.json");
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const raw = Array.isArray(parsed) ? parsed : [];
  const out: FeedItem[] = [];
  for (const candidate of raw) {
    const r = FeedItemSchema.safeParse(candidate);
    if (r.success) out.push(r.data);
  }
  return out;
}

/** Parse one ledger JSON file, dropping invalid entries (tolerant parse). */
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
    if (r.success) out.push(r.data);
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
