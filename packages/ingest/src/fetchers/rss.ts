import Parser from "rss-parser";
import { FeedItemSchema, makeFeedItemId, type FeedItem, type SourceEntry } from "@khazana/core";

const parser = new Parser();

function toIso(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const t = Date.parse(value);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

export async function parseRssFeed(xml: string, entry: SourceEntry, now: string): Promise<FeedItem[]> {
  const feed = await parser.parseString(xml);
  const kind = entry.type === "arxiv" ? "paper" : "link";
  const out: FeedItem[] = [];
  for (const it of feed.items ?? []) {
    const url = it.link?.trim();
    if (!url || !it.title) continue;
    const parsed = FeedItemSchema.safeParse({
      id: makeFeedItemId(entry.type, url),
      source: entry.id,
      sourceType: entry.type,
      url,
      title: it.title.trim(),
      author: it.creator ?? (it as { author?: string }).author,
      publishedAt: toIso(it.isoDate ?? it.pubDate, now),
      fetchedAt: now,
      topics: entry.channels,
      entities: [],
      summary: "",
      body: it.contentSnippet ?? it.content,
      media: [],
      trustScore: entry.trustScore,
      kind,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
