import type { FeedItem, FetchContext, Source, SourceEntry } from "@khazana/core";
import { parseRedditListing } from "./reddit.js";
import { parseRssFeed } from "./rss.js";

export interface FetchResult {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchResult>;

export const defaultFetch: FetchFn = async (url, init) => {
  const res = await fetch(url, { headers: init?.headers });
  return { ok: res.ok, status: res.status, text: () => res.text(), json: () => res.json() };
};

const USER_AGENT = "khazana/0.1 (+https://github.com/khazana)";

export function buildSource(entry: SourceEntry, fetchFn: FetchFn = defaultFetch): Source {
  return {
    id: entry.id,
    type: entry.type,
    channels: entry.channels,
    async fetch(ctx: FetchContext): Promise<FeedItem[]> {
      const headers: Record<string, string> = entry.type === "reddit" ? { "User-Agent": USER_AGENT } : {};
      const res = await fetchFn(entry.url, { headers });
      if (!res.ok) throw new Error(`${entry.id}: HTTP ${res.status}`);
      const items =
        entry.type === "reddit"
          ? parseRedditListing(await res.json(), entry, ctx.now)
          : await parseRssFeed(await res.text(), entry, ctx.now);
      return ctx.limit ? items.slice(0, ctx.limit) : items;
    },
  };
}
