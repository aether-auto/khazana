import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EngagementEventSchema, FeedItemSchema, type EngagementEvent, type FeedItem } from "@khazana/core";

// Re-exported from @khazana/core so the worker and curate share one contract.
export { EngagementEventSchema };
export type { EngagementEvent } from "@khazana/core";

function readJsonArray(path: string): unknown[] {
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

export function readRawFeed(dataDir: string): FeedItem[] {
  const raw = readJsonArray(join(dataDir, "feed", "raw.json"));
  const out: FeedItem[] = [];
  for (const candidate of raw) {
    const parsed = FeedItemSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function readEvents(dataDir: string): EngagementEvent[] {
  const raw = readJsonArray(join(dataDir, "events.json"));
  const out: EngagementEvent[] = [];
  for (const candidate of raw) {
    const parsed = EngagementEventSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function writeCuratedFeed(dataDir: string, items: FeedItem[]): string {
  const path = join(dataDir, "feed", "curated.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(items, null, 2) + "\n");
  return path;
}
