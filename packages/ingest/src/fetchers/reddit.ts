import { FeedItemSchema, makeFeedItemId, type FeedItem, type FetchContext, type MediaRef, type SourceEntry } from "@khazana/core";
import type { FetchFn } from "./build-source.js";
import { parseRssFeed } from "./rss.js";
import { defaultSleep, type SleepFn } from "../retry.js";

/**
 * Reddit blocks generic / bot User-Agents and bursty traffic. Their API rules
 * ask for a unique, descriptive UA in the form `<platform>:<app-id>:<version>
 * (by /u/<reddit-user>)`. Using this dramatically lowers the 429/403 rate on the
 * unauthenticated JSON listing API vs. a generic "khazana/0.1" string.
 */
export const REDDIT_USER_AGENT = "web:khazana:v0.1 (by /u/khazana)";

/** Default number of listing items to request from the JSON API. */
const DEFAULT_JSON_LIMIT = 50;

/** Bounded retries for the JSON API on 429/403 before falling back to .rss. */
const JSON_MAX_ATTEMPTS = 2;
const JSON_BACKOFF_BASE_MS = 1000;

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

/**
 * Derive reddit's unauthenticated JSON listing endpoint from a registry URL.
 *
 * Registry reddit URLs are Atom feeds — `/r/<sub>/.rss`, `/r/<sub>/`,
 * `/r/<sub>/top/.rss`, etc. We map those to the equivalent JSON listing:
 *   `/r/<sub>/.rss`            → `/r/<sub>/hot.json?limit=<n>`
 *   `/r/<sub>/top/.rss?t=week` → `/r/<sub>/top.json?limit=<n>&t=week`
 *
 * The sort segment (`hot` | `top` | `new` | `rising` | `controversial`) is read
 * from the URL path if present, else defaults to `hot`. Sub names are kept in
 * their original case (reddit is case-insensitive but preserving it is harmless).
 * Existing query params (notably `t=` for `top`) are carried over.
 */
const REDDIT_SORTS = new Set(["hot", "top", "new", "rising", "controversial"]);

export function redditJsonUrl(entryUrl: string, opts?: { limit?: number }): string {
  const u = new URL(entryUrl);
  // Strip a trailing `.rss` (or `.json`) and any trailing slash from the path.
  const segments = u.pathname
    .replace(/\.(rss|json)$/i, "")
    .split("/")
    .filter((s) => s.length > 0);

  // Expect `["r", "<sub>", <maybe sort>]`.
  const rIdx = segments.indexOf("r");
  const sub = rIdx >= 0 ? segments[rIdx + 1] : undefined;
  if (!sub) throw new Error(`redditJsonUrl: cannot derive subreddit from ${entryUrl}`);

  const maybeSort = segments[rIdx + 2]?.toLowerCase();
  const sort = maybeSort && REDDIT_SORTS.has(maybeSort) ? maybeSort : "hot";

  const limit = opts?.limit ?? DEFAULT_JSON_LIMIT;
  const params = new URLSearchParams(u.search);
  params.set("limit", String(limit));
  // `t` (time window) only meaningful for `top`/`controversial`; harmless otherwise.

  return `https://www.reddit.com/r/${sub}/${sort}.json?${params.toString()}`;
}

/**
 * Fetch a reddit source with graceful degradation:
 *   1. Try the JSON listing API (rich: score, comments, selftext) with a
 *      descriptive UA and a bounded backoff on 429/403.
 *   2. On persistent block, fall back to the original Atom `.rss` feed parsed
 *      via {@link parseRssFeed} (loses metrics; still yields FeedItems).
 *
 * Only throws if BOTH the JSON API and the `.rss` fallback fail, so a single
 * blocked sub never kills the whole ingest run (the outer pipeline catches it).
 *
 * The per-host rate limiter in ingest.ts already gates `www.reddit.com`, and the
 * derived JSON URL keeps that hostname so it shares the same gap/concurrency.
 */
export async function fetchReddit(
  entry: SourceEntry,
  fetchFn: FetchFn,
  ctx: FetchContext,
  sleepFn: SleepFn = defaultSleep,
): Promise<FeedItem[]> {
  const headers = { "User-Agent": REDDIT_USER_AGENT };
  const jsonUrl = redditJsonUrl(entry.url, ctx.limit ? { limit: ctx.limit } : undefined);

  let delay = JSON_BACKOFF_BASE_MS;
  let blocked = false;
  for (let attempt = 1; attempt <= JSON_MAX_ATTEMPTS; attempt++) {
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await fetchFn(jsonUrl, { headers });
    } catch {
      // Network error on JSON — go straight to the .rss fallback.
      blocked = true;
      break;
    }
    if (res.ok) {
      const items = parseRedditListing(await res.json(), entry, ctx.now);
      return ctx.limit ? items.slice(0, ctx.limit) : items;
    }
    // 429 (rate-limited) and 403 (UA / IP block) are the signals to back off
    // then fall back; any other non-OK status falls back immediately.
    if (res.status === 429 || res.status === 403) {
      blocked = true;
      if (attempt < JSON_MAX_ATTEMPTS) await sleepFn(delay);
      delay *= 2;
      continue;
    }
    blocked = true;
    break;
  }

  if (!blocked) return [];

  // Fallback: the original Atom `.rss` feed. reddit `.rss` is Atom; rss-parser
  // maps entries to FeedItems (no score/comments). Let errors here propagate so
  // the outer ingest records the source as failed.
  const rssRes = await fetchFn(entry.url, { headers });
  if (!rssRes.ok) throw new Error(`${entry.id}: reddit JSON blocked and .rss HTTP ${rssRes.status}`);
  const items = await parseRssFeed(await rssRes.text(), entry, ctx.now);
  return ctx.limit ? items.slice(0, ctx.limit) : items;
}
