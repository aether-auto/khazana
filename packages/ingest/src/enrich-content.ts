import type { FeedItem } from "@khazana/core";
import type { FetchFn } from "./fetchers/build-source.js";
import { extractArticle } from "./extract.js";
import { fetchYouTubeTranscript, transcriptToHtml, youTubeVideoId } from "./youtube.js";
import { fetchPodcastTranscript } from "./podcast.js";

/** Min plain-text length for an extracted article to be considered "full text". */
const MIN_FULLTEXT_CHARS = 600;

export interface EnrichContentOptions {
  /** Master switch; when false, items are returned untouched (default true). */
  enabled?: boolean;
  /** Max concurrent fetches (default 4). */
  concurrency?: number;
  /** Per-request timeout in ms (default 8000). */
  timeoutMs?: number;
}

// Item carries an optional transcriptUrl stashed by the RSS parser.
type EnrichableItem = FeedItem & { transcriptUrl?: string };

/** Wrap a fetch with a timeout that resolves (never rejects) into ok:false. */
function withTimeout(fetchFn: FetchFn, timeoutMs: number): FetchFn {
  return (url, init) =>
    new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ ok: false, status: 0, text: async () => "", json: async () => ({}) });
      }, timeoutMs);
      fetchFn(url, init).then(
        (res) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(res);
        },
        () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ ok: false, status: 0, text: async () => "", json: async () => ({}) });
        },
      );
    });
}

/**
 * Enrich a single item's `body` with full-text / transcript content.
 * Always resolves; never throws. Mutates and returns the item. When nothing
 * better is found, the RSS summary already in `body` is left untouched.
 */
async function enrichItem(item: EnrichableItem, fetchFn: FetchFn): Promise<EnrichableItem> {
  try {
    if (item.sourceType === "youtube") {
      const id = youTubeVideoId(item.url);
      if (id) {
        const transcript = await fetchYouTubeTranscript(id, fetchFn);
        const html = transcriptToHtml(transcript);
        if (html) item.body = html;
      }
      return item;
    }

    if (item.sourceType === "podcast") {
      if (item.transcriptUrl) {
        const html = await fetchPodcastTranscript(item.transcriptUrl, fetchFn);
        if (html) item.body = html;
      }
      // else: keep the show-notes / description already in body.
      return item;
    }

    // Article-style sources (news / eng-blog / rss / arxiv): fetch + extract.
    const res = await fetchFn(item.url);
    if (!res.ok) return item;
    const html = await res.text();
    const article = extractArticle(html, item.url);
    if (article && article.text.length > MIN_FULLTEXT_CHARS) {
      item.body = article.html;
    }
    return item;
  } catch {
    return item;
  }
}

/** Run an async mapper over items with a bounded concurrency pool. */
async function pooledMap<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i]!);
    }
  });
  await Promise.all(workers);
}

/**
 * Enrich every item's `body` with full readable content where freely available
 * (article full-text, YouTube/podcast transcripts). Resilient and bounded; a
 * failure on any item never affects others or the run. Returns the same array.
 *
 * Article sources we attempt full-text extraction for. Others (reddit/hn/x)
 * already carry their own text and are skipped.
 */
const ARTICLE_TYPES = new Set(["news", "eng-blog", "rss", "arxiv"]);

export async function enrichContent(
  items: FeedItem[],
  fetchFn: FetchFn,
  opts: EnrichContentOptions = {},
): Promise<FeedItem[]> {
  if (opts.enabled === false) return items;
  const timed = withTimeout(fetchFn, opts.timeoutMs ?? 8000);
  const targets = (items as EnrichableItem[]).filter(
    (it) => ARTICLE_TYPES.has(it.sourceType) || it.sourceType === "youtube" || it.sourceType === "podcast",
  );
  await pooledMap(targets, opts.concurrency ?? 4, async (it) => {
    await enrichItem(it, timed);
  });
  // Drop the transient transcriptUrl so it never leaks into output.
  for (const it of items as EnrichableItem[]) delete it.transcriptUrl;
  return items;
}
