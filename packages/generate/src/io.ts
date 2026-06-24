import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FeedItemSchema, type FeedItem } from "@khazana/core";
import type { TastePayload } from "@khazana/curate";
import type { VerifyReport } from "./verify.js";

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
