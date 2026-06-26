import type { FeedItem } from "@khazana/core";
import type { FetchFn } from "./fetchers/build-source.js";
import {
  extractArticle,
  extractMetaText,
  extractWithArticleExtractor,
  findAmpUrl,
  htmlToText,
  sanitizeArticleHtml,
  type ExtractedArticle,
} from "./extract.js";
import { fetchYouTubeTranscriptResult, transcriptToHtml, youTubeVideoId } from "./youtube.js";
import { fetchPodcastTranscript } from "./podcast.js";
import { isFullTranscript, transcribePodcastEpisode } from "./whisper.js";

/**
 * Min plain-text length for an extraction result to be considered "good enough"
 * to stop the fallback chain early.
 */
const MIN_GOOD_TEXT = 800;
/** Below this, a Readability result is treated as a miss and we try the next method. */
const MIN_READABILITY_TEXT = 600;
/** Min length for an RSS-inline content block to be trusted as full text. */
const MIN_RSS_CONTENT_TEXT = 1500;

/**
 * Realistic desktop-browser request headers. The default fetch UA is blocked or
 * served truncated/paywall-stub HTML by many publishers; a real browser UA plus
 * Accept headers recovers full text from a large share of sites.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Names of the extraction methods, in chain order, for debug/reporting. */
export type ExtractMethod =
  | "rss-content"
  | "readability"
  | "article-extractor"
  | "amp"
  | "meta"
  | "headless";

export interface EnrichContentOptions {
  /** Master switch; when false, items are returned untouched (default true). */
  enabled?: boolean;
  /** Max concurrent fetches (default 4). */
  concurrency?: number;
  /** Per-request timeout in ms (default 8000). */
  timeoutMs?: number;
  /**
   * Last-resort headless render (playwright-core + system Chrome) for JS-rendered
   * pages. OFF by default to keep the normal run fast and dependency-light.
   */
  headless?: boolean;
  /**
   * Optional sink for which method won per item (id -> method). Lets callers /
   * the report see the extraction-method distribution. Never affects output.
   */
  methodSink?: Map<string, ExtractMethod>;
}

// Item carries optional transient fields stashed by the RSS parser.
type EnrichableItem = FeedItem & {
  transcriptUrl?: string;
  rssContent?: string;
  enclosureUrl?: string;
};

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
async function enrichItem(
  item: EnrichableItem,
  fetchFn: FetchFn,
  opts: EnrichContentOptions,
): Promise<EnrichableItem> {
  try {
    if (item.sourceType === "youtube") {
      const id = youTubeVideoId(item.url);
      if (id) {
        const result = await fetchYouTubeTranscriptResult(id, fetchFn);
        if (result.kind === "transcript") {
          item.body = transcriptToHtml(result.text);
        }
        // kind === "none": all methods failed — leave body untouched.
      }
      return item;
    }

    if (item.sourceType === "podcast") {
      // 1. Try a published <podcast:transcript> URL — but only accept it when
      //    the fetched content is a FULL transcript (long, dialogue), not a
      //    chapter list or episode summary stub.
      if (item.transcriptUrl) {
        const html = await fetchPodcastTranscript(item.transcriptUrl, fetchFn);
        if (html && isFullTranscript(html)) {
          item.body = html;
          return item;
        }
        // Short/stub transcript — fall through to Whisper.
      }

      // 2. Whisper transcription from the audio enclosure (MP3 on show's own CDN).
      //    Uses native fetch internally (binary-safe), ignores the injected fetchFn.
      //    Skipped if no enclosureUrl was stashed or if ffmpeg is not available.
      if (item.enclosureUrl) {
        const whisperHtml = await transcribePodcastEpisode(item.enclosureUrl);
        if (whisperHtml) {
          item.body = whisperHtml;
          return item;
        }
      }

      // 3. Keep the show-notes / description already in body (fallback).
      return item;
    }

    // Article-style sources (news / eng-blog / rss / arxiv): run the full-text
    // fallback chain, taking the best (longest clean) result. Only upgrade the
    // body when the extraction is actually richer than the RSS summary we
    // already have — never replace a summary with something shorter.
    const result = await extractFullText(item, fetchFn, opts);
    const existingLen = htmlToText(item.body ?? item.summary ?? "").length;
    if (result && result.article.text.length > existingLen) {
      item.body = result.article.html;
      opts.methodSink?.set(item.id, result.method);
    }
    return item;
  } catch {
    return item;
  }
}

/** A candidate extraction together with the method that produced it. */
interface MethodResult {
  method: ExtractMethod;
  article: ExtractedArticle;
}

/**
 * Multi-method full-text fallback chain. Tries methods in order, keeps the best
 * (longest clean text) seen so far, and STOPS early once a method clears
 * MIN_GOOD_TEXT. Every method is wrapped so a failure falls through to the next;
 * this never throws. Returns the best candidate, or null if nothing usable was
 * found (caller then keeps the existing RSS summary).
 */
async function extractFullText(
  item: EnrichableItem,
  fetchFn: FetchFn,
  opts: EnrichContentOptions,
): Promise<MethodResult | null> {
  let best: MethodResult | null = null;
  // Length of the best result so far. Tracked separately so control-flow reads
  // don't get confused by `best` being mutated inside the closure below.
  let bestLen = 0;
  const consider = (method: ExtractMethod, article: ExtractedArticle | null): boolean => {
    if (!article) return false;
    if (article.text.length > bestLen) {
      best = { method, article };
      bestLen = article.text.length;
    }
    return article.text.length >= MIN_GOOD_TEXT; // good enough → stop early
  };

  // 1) RSS full content already inline in the feed — no fetch needed.
  if (item.rssContent && htmlToText(item.rssContent).length >= MIN_RSS_CONTENT_TEXT) {
    const sanitized = sanitizeArticleHtml(item.rssContent);
    if (sanitized) {
      const article: ExtractedArticle = { html: sanitized, text: htmlToText(sanitized) };
      if (consider("rss-content", article)) return best;
    }
  }

  // Fetch the page once with realistic browser headers (recovers many sites).
  const res = await safeFetch(fetchFn, item.url, { headers: BROWSER_HEADERS });
  const html = res?.ok ? await safeText(res) : "";

  if (html) {
    // 2) Readability over the fetched HTML.
    if (consider("readability", tryReadability(html, item.url))) return best;
    // 3) Second extractor when Readability came up short.
    if (bestLen < MIN_READABILITY_TEXT) {
      if (consider("article-extractor", await extractWithArticleExtractor(html, item.url))) return best;
    }
    // 4a) AMP variant when still short.
    if (bestLen < MIN_READABILITY_TEXT) {
      const ampUrl = findAmpUrl(html, item.url);
      if (ampUrl && ampUrl !== item.url) {
        const ampRes = await safeFetch(fetchFn, ampUrl, { headers: BROWSER_HEADERS });
        const ampHtml = ampRes?.ok ? await safeText(ampRes) : "";
        if (ampHtml && consider("amp", tryReadability(ampHtml, ampUrl))) return best;
      }
    }
    // 5) Optional headless render for JS-rendered pages (default OFF).
    if (opts.headless && bestLen < MIN_READABILITY_TEXT) {
      const rendered = await renderHeadless(item.url, opts.timeoutMs ?? 8000);
      if (rendered && consider("headless", tryReadability(rendered, item.url))) return best;
    }
    // 4b) Page metadata as a last text source (better than a bare link). Runs
    // whenever no method yet cleared the full-text bar, even if an earlier method
    // returned a trivially short result.
    if (bestLen < MIN_READABILITY_TEXT) consider("meta", extractMetaText(html, item.url));
  }

  return best;
}

/** Readability wrapped so it never throws (extractArticle already returns null on failure). */
function tryReadability(html: string, url: string): ExtractedArticle | null {
  try {
    return extractArticle(html, url);
  } catch {
    return null;
  }
}

/** Fetch wrapper that swallows rejections into null. */
async function safeFetch(
  fetchFn: FetchFn,
  url: string,
  init?: { headers?: Record<string, string> },
): Promise<{ ok: boolean; status: number; text(): Promise<string> } | null> {
  try {
    return await fetchFn(url, init);
  } catch {
    return null;
  }
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Render a page with a headless system Chrome via playwright-core and return its
 * HTML. Imported lazily so the dependency is never required for the normal run.
 * Returns null if playwright-core / Chrome are unavailable or rendering fails.
 */
async function renderHeadless(url: string, timeoutMs: number): Promise<string | null> {
  try {
    // Lazy, optional dependency — kept out of the dependency graph for the
    // default (non-headless) path. The non-literal specifier keeps the type
    // checker from requiring playwright-core to be installed.
    const specifier = "playwright-core";
    const mod = (await import(/* @vite-ignore */ specifier).catch(() => null)) as {
      chromium?: {
        launch(opts: { channel?: string; headless?: boolean }): Promise<{
          newPage(): Promise<{
            goto(u: string, o: { waitUntil: string; timeout: number }): Promise<unknown>;
            content(): Promise<string>;
          }>;
          close(): Promise<void>;
        }>;
      };
    } | null;
    if (!mod?.chromium) return null;
    const browser = await mod.chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
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
    await enrichItem(it, timed, opts);
  });
  // Drop transient fields so they never leak into output.
  for (const it of items as EnrichableItem[]) {
    delete it.transcriptUrl;
    delete it.rssContent;
    delete it.enclosureUrl;
  }
  return items;
}
