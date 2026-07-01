import type { FetchFn } from "./fetchers/build-source.js";

export function looksLikeFeedUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  if (/\.(xml|rss|atom)\/?$/.test(path)) return true;
  return /(^|\/)(feed|rss|atom)(\/|$)/.test(path);
}

const LINK_TAG = /<link\b[^>]*>/gi;
const REL_ALTERNATE = /\brel\s*=\s*["'][^"']*\balternate\b[^"']*["']/i;
const FEED_TYPE = /\btype\s*=\s*["']application\/(rss|atom)\+xml["']/i;
const HREF = /\bhref\s*=\s*["']([^"']+)["']/i;

export function discoverFeed(html: string, baseUrl: string): string | null {
  if (looksLikeFeedUrl(baseUrl)) return baseUrl;
  const tags = html.match(LINK_TAG) ?? [];
  for (const tag of tags) {
    if (!REL_ALTERNATE.test(tag) || !FEED_TYPE.test(tag)) continue;
    const href = HREF.exec(tag)?.[1];
    if (!href) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchAndDiscoverFeed(url: string, fetchFn: FetchFn): Promise<string | null> {
  if (looksLikeFeedUrl(url)) return url;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    return discoverFeed(await res.text(), url);
  } catch {
    return null;
  }
}
