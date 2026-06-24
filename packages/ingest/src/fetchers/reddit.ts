import { FeedItemSchema, makeFeedItemId, type FeedItem, type MediaRef, type SourceEntry } from "@khazana/core";

interface RedditChild {
  data?: {
    title?: string; permalink?: string; author?: string;
    created_utc?: number; num_comments?: number; score?: number;
    selftext?: string; thumbnail?: string;
  };
}
interface RedditListing { data?: { children?: RedditChild[] } }

export function parseRedditListing(json: unknown, entry: SourceEntry, now: string): FeedItem[] {
  const children = (json as RedditListing).data?.children ?? [];
  const out: FeedItem[] = [];
  for (const c of children) {
    const d = c.data;
    if (!d?.title || !d.permalink) continue;
    const url = `https://www.reddit.com${d.permalink}`;
    const media: MediaRef[] =
      d.thumbnail && /^https?:\/\//.test(d.thumbnail) ? [{ type: "image", url: d.thumbnail }] : [];
    const parsed = FeedItemSchema.safeParse({
      id: makeFeedItemId(entry.type, url),
      source: entry.id,
      sourceType: entry.type,
      url,
      title: d.title.trim(),
      author: d.author,
      publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : now,
      fetchedAt: now,
      topics: entry.channels,
      entities: [],
      summary: "",
      body: d.selftext || undefined,
      media,
      metrics: { score: d.score, comments: d.num_comments },
      trustScore: entry.trustScore,
      kind: "discussion",
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
