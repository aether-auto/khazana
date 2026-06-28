import { FeedItemSchema, makeFeedItemId, type FeedItem, type FetchContext, type MediaRef, type SourceEntry } from "@khazana/core";
import type { FetchFn } from "./build-source.js";
import { parseRssFeed } from "./rss.js";
import { defaultSleep, type SleepFn } from "../retry.js";

/**
 * Empirically (tested from a residential IP): reddit's UNAUTH endpoints are
 * gated by User-Agent, not just rate.
 *   - `www.reddit.com/r/<sub>/.rss` + a *browser* UA  → HTTP 200, real Atom feed.
 *   - same `.rss` + our bot UA `web:khazana:...`       → 429.
 *   - same `.rss` + empty UA                           → 403.
 *   - `.json` (hot.json) even with a browser UA        → 403 (unauth JSON clamped).
 * So a browser-like UA on the `.rss` feed is the path that actually returns data.
 * The authenticated JSON API (oauth.reddit.com) DOES work and has a far larger
 * budget — but only with OAuth creds, so it's an opt-in escalation (see below).
 */
export const REDDIT_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * UA sent on the AUTHENTICATED OAuth JSON path. Reddit's API rules ask for a
 * unique descriptive UA in `<platform>:<app-id>:<version> (by /u/<user>)` form;
 * this is only used once we hold a bearer token (oauth.reddit.com), where the
 * descriptive UA is expected and a browser UA is not.
 */
export const REDDIT_OAUTH_UA = "web:khazana:v0.1 (by /u/khazana)";

/** Default number of listing items to request from the OAuth JSON API. */
const DEFAULT_JSON_LIMIT = 50;

/**
 * Default minimum gap between reddit requests, in ms. Reddit's unauth `.rss`
 * budget is TIGHT (rapid repeats → 429) but not a permanent ban — pacing fixes
 * it. Overridable via REDDIT_MIN_GAP_MS. The ingest per-host limiter applies
 * this to `www.reddit.com` (see resolveRedditMinGapMs / ingest.ts).
 */
export const DEFAULT_REDDIT_MIN_GAP_MS = 4000;

/** Bounded retries on HTTP 429 (rate-limited) before giving up on a sub. */
const RSS_MAX_ATTEMPTS = 3;
const RSS_BACKOFF_BASE_MS = 2000;

/** Resolve the reddit per-host min-gap (env REDDIT_MIN_GAP_MS, else default). */
export function resolveRedditMinGapMs(): number {
  const env = parseInt(process.env["REDDIT_MIN_GAP_MS"] ?? "", 10);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_REDDIT_MIN_GAP_MS;
}

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

/** OAuth client-credentials token endpoint + the authenticated API host. */
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_OAUTH_HOST = "https://oauth.reddit.com";

/** Read OAuth app creds from the env, if both are present. */
function redditOAuthCreds(): { id: string; secret: string } | undefined {
  const id = process.env["REDDIT_CLIENT_ID"];
  const secret = process.env["REDDIT_CLIENT_SECRET"];
  return id && secret ? { id, secret } : undefined;
}

/**
 * Client-credentials (app-only) OAuth: POST grant_type=client_credentials with
 * HTTP Basic `id:secret`. Returns the bearer token, or undefined on any failure
 * (so we degrade to the `.rss` path rather than throwing).
 */
async function fetchRedditToken(
  fetchFn: FetchFn,
  creds: { id: string; secret: string },
): Promise<string | undefined> {
  try {
    const basic =
      typeof btoa === "function"
        ? btoa(`${creds.id}:${creds.secret}`)
        : Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
    const res = await fetchFn(REDDIT_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": REDDIT_OAUTH_UA,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return undefined;
    const token = (await res.json()) as { access_token?: unknown };
    return typeof token.access_token === "string" ? token.access_token : undefined;
  } catch {
    return undefined;
  }
}

/** OAuth JSON path: oauth.reddit.com/r/<sub>/hot.json with bearer + descriptive UA. */
async function fetchRedditOAuth(
  entry: SourceEntry,
  fetchFn: FetchFn,
  ctx: FetchContext,
  token: string,
): Promise<FeedItem[]> {
  const path = new URL(redditJsonUrl(entry.url, ctx.limit ? { limit: ctx.limit } : undefined)).pathname;
  const search = new URL(redditJsonUrl(entry.url, ctx.limit ? { limit: ctx.limit } : undefined)).search;
  const res = await fetchFn(`${REDDIT_OAUTH_HOST}${path}${search}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": REDDIT_OAUTH_UA },
  });
  if (!res.ok) throw new Error(`${entry.id}: reddit OAuth JSON HTTP ${res.status}`);
  const items = parseRedditListing(await res.json(), entry, ctx.now);
  return ctx.limit ? items.slice(0, ctx.limit) : items;
}

/** Browser-UA `.rss` path with bounded 429 backoff. Throws if it can't get data. */
async function fetchRedditRss(
  entry: SourceEntry,
  fetchFn: FetchFn,
  ctx: FetchContext,
  sleepFn: SleepFn,
): Promise<FeedItem[]> {
  const headers = { "User-Agent": REDDIT_BROWSER_UA };
  let delay = RSS_BACKOFF_BASE_MS;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= RSS_MAX_ATTEMPTS; attempt++) {
    const res = await fetchFn(entry.url, { headers });
    if (res.ok) {
      const items = await parseRssFeed(await res.text(), entry, ctx.now);
      return ctx.limit ? items.slice(0, ctx.limit) : items;
    }
    lastStatus = res.status;
    // 429 = the tight per-IP budget; pacing/backoff usually clears it. Retry.
    if (res.status === 429 && attempt < RSS_MAX_ATTEMPTS) {
      await sleepFn(delay);
      delay *= 2;
      continue;
    }
    break;
  }
  throw new Error(`${entry.id}: reddit .rss HTTP ${lastStatus}`);
}

/**
 * Fetch a reddit source. Strategy (empirically tuned — see UA constants above):
 *
 *   1. If REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set, escalate to the
 *      AUTHENTICATED OAuth JSON API (rich: score/comments/selftext, big budget).
 *      Any OAuth failure degrades silently to step 2.
 *   2. PRIMARY (and the $0 default): the registry `.rss` Atom feed with a
 *      browser-like UA, paced by the per-host limiter, with bounded 429 backoff.
 *
 * Throws only if every path fails, so one blocked sub never kills the run (the
 * outer ingest catches it). Reddit requests flow through ingest.ts's per-host
 * limiter keyed on `www.reddit.com`, gapped by REDDIT_MIN_GAP_MS.
 */
export async function fetchReddit(
  entry: SourceEntry,
  fetchFn: FetchFn,
  ctx: FetchContext,
  sleepFn: SleepFn = defaultSleep,
): Promise<FeedItem[]> {
  const creds = redditOAuthCreds();
  if (creds) {
    const token = await fetchRedditToken(fetchFn, creds);
    if (token) {
      try {
        return await fetchRedditOAuth(entry, fetchFn, ctx, token);
      } catch {
        // OAuth listing failed (expired token, transient) — fall through to .rss.
      }
    }
  }
  return fetchRedditRss(entry, fetchFn, ctx, sleepFn);
}
