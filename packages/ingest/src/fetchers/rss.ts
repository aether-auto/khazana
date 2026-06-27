import Parser from "rss-parser";
import { FeedItemSchema, makeFeedItemId, type FeedItem, type SourceEntry } from "@khazana/core";

// Capture the Podcasting 2.0 <podcast:transcript> elements (kept as an array so
// multiple transcript formats survive) for later transcript fetching.
const parser = new Parser({
  customFields: {
    item: [
      ["podcast:transcript", "podcastTranscript", { keepArray: true }],
      // Some feeds use <content:encoded> for the full article HTML; rss-parser
      // already maps it to `content`, but capture it explicitly too in case a
      // feed only sets the namespaced element.
      ["content:encoded", "contentEncoded"],
    ],
  },
});

interface TranscriptRef {
  $?: { url?: string; type?: string };
}

function toIso(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const t = Date.parse(value);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

/** Pick the best <podcast:transcript> URL from the parsed custom field. */
export function pickTranscriptUrl(refs: TranscriptRef[] | undefined): string | undefined {
  const parsed = (refs ?? [])
    .map((r) => (r.$?.url ? { url: r.$.url, type: (r.$.type ?? "").toLowerCase() } : null))
    .filter((t): t is { url: string; type: string } => t !== null);
  if (parsed.length === 0) return undefined;
  return (
    parsed.find((t) => t.type.includes("plain")) ??
    parsed.find((t) => t.type.includes("html")) ??
    parsed[0]!
  ).url;
}

export async function parseRssFeed(xml: string, entry: SourceEntry, now: string): Promise<FeedItem[]> {
  const feed = await parser.parseString(xml);
  const kind =
    entry.type === "arxiv"
      ? "paper"
      : entry.type === "youtube"
        ? "video"
        : entry.type === "podcast"
          ? "audio"
          : entry.type === "reddit" // reddit .rss fallback: still a discussion thread
            ? "discussion"
            : "link";
  const out: FeedItem[] = [];
  for (const it of feed.items ?? []) {
    const url = it.link?.trim();
    if (!url || !it.title) continue;
    // RSS snippet is the graceful-fallback summary; body starts as the snippet
    // and is upgraded to full-text sanitized HTML by the enrich step.
    const snippet = it.contentSnippet ?? it.content ?? "";
    // Full article HTML carried inline by the feed (content:encoded). Stashed for
    // the enrich step's "RSS full content" extraction method; not part of the
    // FeedItem schema.
    const rssContent =
      (it as { contentEncoded?: string }).contentEncoded ?? it.content ?? undefined;
    const transcriptUrl = pickTranscriptUrl((it as { podcastTranscript?: TranscriptRef[] }).podcastTranscript);
    // Capture audio enclosure URL (the MP3 on the show's CDN) for Whisper transcription.
    // rss-parser exposes this as `item.enclosure.url`.
    const enclosureUrl =
      typeof (it as { enclosure?: { url?: string; type?: string } }).enclosure?.url === "string"
        ? (it as { enclosure: { url: string } }).enclosure.url
        : undefined;
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
      summary: snippet,
      body: snippet || undefined,
      media: [],
      trustScore: entry.trustScore,
      kind,
    });
    if (parsed.success) {
      // Stash transient fields on the item for the enrich step (not part of the
      // FeedItem schema; consumed and dropped before output).
      const enrichable = parsed.data as FeedItem & {
        transcriptUrl?: string;
        rssContent?: string;
        enclosureUrl?: string;
      };
      if (transcriptUrl) enrichable.transcriptUrl = transcriptUrl;
      if (rssContent) enrichable.rssContent = rssContent;
      if (enclosureUrl) enrichable.enclosureUrl = enclosureUrl;
      out.push(parsed.data);
    }
  }
  return out;
}
