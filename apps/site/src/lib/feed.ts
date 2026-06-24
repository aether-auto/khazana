import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FeedItemSchema, type FeedItem } from "@khazana/core";

const WORKSHOP_CHANNELS = new Set([
  "ideas",
  "diy",
  "3d-printing",
  "iot",
  "embedded",
  "ai-projects",
]);

/**
 * Load the curated feed. Prefers the pipeline-generated `curated.json`
 * (gitignored), falling back to the committed `curated.sample.json` so the
 * site always builds. Each item is validated with FeedItemSchema; invalid
 * items are dropped (never crash the build). Curated order is preserved.
 */
export function loadCurated(dataDir: string): FeedItem[] {
  const main = join(dataDir, "curated.json");
  const sample = join(dataDir, "curated.sample.json");
  const path = existsSync(main) ? main : sample;
  if (!existsSync(path)) return [];
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const entry of raw) {
    const parsed = FeedItemSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Items whose `topics` include the channel. `null`/empty channel → all items. */
export function filterByChannel(items: FeedItem[], channel: string | null): FeedItem[] {
  if (!channel) return items;
  return items.filter((it) => it.topics.includes(channel));
}

/** Workshop selector: kind=idea OR any buildable-channel topic. */
export function selectIdeas(items: FeedItem[]): FeedItem[] {
  return items.filter(
    (it) => it.kind === "idea" || it.topics.some((t) => WORKSHOP_CHANNELS.has(t)),
  );
}

/** First `n` item titles, for the shell ticker. */
export function tickerTitles(items: FeedItem[], n: number): string[] {
  return items.slice(0, n).map((it) => it.title);
}
