import type { FeedItem, FetchContext, Source, SourceEntry } from "@khazana/core";
import { fetchReddit } from "./reddit.js";
import { parseRssFeed } from "./rss.js";

export interface FetchResult {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export type FetchFn = (url: string, init?: { headers?: Record<string, string>; method?: string; body?: string }) => Promise<FetchResult>;

export const defaultFetch: FetchFn = async (url, init) => {
  const res = await fetch(url, { headers: init?.headers, method: init?.method, body: init?.body });
  return { ok: res.ok, status: res.status, text: () => res.text(), json: () => res.json() };
};

export function buildSource(entry: SourceEntry, fetchFn: FetchFn = defaultFetch): Source {
  return {
    id: entry.id,
    type: entry.type,
    channels: entry.channels,
    async fetch(ctx: FetchContext): Promise<FeedItem[]> {
      // reddit: JSON listing API (rich) → bounded 429/403 backoff → .rss fallback.
      // See fetchReddit; it owns its own UA, retry, and graceful degradation.
      if (entry.type === "reddit") return fetchReddit(entry, fetchFn, ctx);

      const res = await fetchFn(entry.url);
      if (!res.ok) throw new Error(`${entry.id}: HTTP ${res.status}`);
      const items = await parseRssFeed(await res.text(), entry, ctx.now);
      return ctx.limit ? items.slice(0, ctx.limit) : items;
    },
  };
}
