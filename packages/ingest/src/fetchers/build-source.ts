import type { FeedItem, FetchContext, Source, SourceEntry } from "@khazana/core";
import { fetchReddit } from "./reddit.js";
import { parseRssFeed } from "./rss.js";

export interface FetchResult {
  ok: boolean;
  status: number;
  /** Final URL after any redirects (undefined if the FetchFn doesn't expose it). */
  url?: string;
  /** Whether the response followed at least one redirect (best-effort). */
  redirected?: boolean;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export type FetchFn = (url: string, init?: { headers?: Record<string, string>; method?: string; body?: string }) => Promise<FetchResult>;

/**
 * A realistic, current Chrome User-Agent. Many origins block non-browser UAs
 * outright; a browser UA is strictly more permissive for public RSS/Atom and
 * is what we want as the default for every generic (non-reddit) feed fetch.
 * Kept in sync with reddit.ts's REDDIT_BROWSER_UA in spirit (that path owns its
 * own UA for empirically-tuned reasons — see reddit.ts).
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Accept header for feed fetches. Many feed origins return HTTP 406 when no
 * acceptable type is offered; advertising the feed/XML/JSON types we actually
 * parse (with a wildcard floor) fixes that class of failure.
 */
export const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, application/json;q=0.7, */*;q=0.5";

/**
 * Merge HTTP headers with overrides winning. Header names are case-insensitive
 * per the spec, so an override (e.g. `user-agent`) replaces a default with a
 * differently-cased name (`User-Agent`) rather than producing two entries.
 */
export function mergeHeaders(
  defaults: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> {
  if (!overrides) return { ...defaults };
  const overriddenLower = new Set(Object.keys(overrides).map((k) => k.toLowerCase()));
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(defaults)) {
    if (!overriddenLower.has(k.toLowerCase())) merged[k] = v;
  }
  return { ...merged, ...overrides };
}

export const defaultFetch: FetchFn = async (url, init) => {
  // redirect:"follow" is Node's default, but set it explicitly + intentionally
  // so a moved feed (301/302) is transparently followed.
  const res = await fetch(url, {
    headers: init?.headers,
    method: init?.method,
    body: init?.body,
    redirect: "follow",
  });
  return {
    ok: res.ok,
    status: res.status,
    url: res.url,
    redirected: res.redirected,
    text: () => res.text(),
    json: () => res.json(),
  };
};

export interface BuildSourceOptions {
  /**
   * Caller-supplied headers for the generic feed fetch. These OVERRIDE the
   * browser-UA / feed-Accept defaults (per-header, case-insensitive); any
   * default not overridden still fills the gap. Does not affect reddit, which
   * owns its own headers.
   */
  headers?: Record<string, string>;
}

export function buildSource(
  entry: SourceEntry,
  fetchFn: FetchFn = defaultFetch,
  opts: BuildSourceOptions = {},
): Source {
  return {
    id: entry.id,
    type: entry.type,
    channels: entry.channels,
    async fetch(ctx: FetchContext): Promise<FeedItem[]> {
      // reddit: JSON listing API (rich) → bounded 429/403 backoff → .rss fallback.
      // See fetchReddit; it owns its own UA, retry, and graceful degradation.
      if (entry.type === "reddit") return fetchReddit(entry, fetchFn, ctx);

      // Generic (rss / eng-blog / news / arxiv) feed fetch: send a browser-like
      // UA (unblocks bot-UA-gated origins) and a feed-appropriate Accept (fixes
      // the 406 class). Caller headers override these; defaults fill the gaps.
      const headers = mergeHeaders(
        { "User-Agent": BROWSER_USER_AGENT, Accept: FEED_ACCEPT },
        opts.headers,
      );
      const res = await fetchFn(entry.url, { headers });
      if (!res.ok) throw new Error(`${entry.id}: HTTP ${res.status}`);
      const items = await parseRssFeed(await res.text(), entry, ctx.now);
      return ctx.limit ? items.slice(0, ctx.limit) : items;
    },
  };
}
