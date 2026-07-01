import type { CandidateSource, FeedItem, Registry } from "@khazana/core";
import { normalizeDomain } from "../gaps.js";
import { registryDomainSet } from "../candidate.js";
import { isIgnoredDomain } from "./ignore-domains.js";

/** Absolute http(s) URLs appearing in an `href="…"` / `href='…'` attribute. */
const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;

export interface LinkMineOpts {
  /** Only mine items at or above this tasteScore (skip low-signal items). Default 0. */
  minTasteScore?: number;
  /** Max candidates to emit (highest seenCount first). Default 200. */
  limit?: number;
}

/**
 * Link-mining: a no-AI candidate generator. Our best curated items repeatedly
 * cite the publishers worth following. For every high-quality item, extract the
 * outbound domains referenced in its HTML `body`, drop the item's own host and
 * anything already registered, and tally cross-item recurrence. A domain many
 * of our best posts cite is a strong source candidate.
 *
 * Pure over already-fetched `curated` items — no network. The cloud appraiser
 * decides channels + credibility from the evidence we attach.
 */
export function mineLinks(curated: FeedItem[], registry: Registry, opts: LinkMineOpts = {}): CandidateSource[] {
  const minTaste = opts.minTasteScore ?? 0;
  const limit = opts.limit ?? 200;
  const registered = registryDomainSet(registry);

  // domain → { url, seenCount, citing item titles }
  const acc = new Map<string, { url: string; count: number; titles: Set<string> }>();

  for (const item of curated) {
    if ((item.tasteScore ?? 0) < minTaste) continue;
    if (!item.body) continue;
    const selfDomain = normalizeDomain(item.url);

    // dedupe outbound domains WITHIN one item so a single post can't inflate a count
    const seenHere = new Set<string>();
    for (const match of item.body.matchAll(HREF_RE)) {
      const href = match[1]!;
      if (!/^https?:\/\//i.test(href)) continue;
      const domain = normalizeDomain(href);
      if (!domain || domain === selfDomain || registered.has(domain) || seenHere.has(domain)) continue;
      if (isIgnoredDomain(domain)) continue;
      seenHere.add(domain);

      const entry = acc.get(domain);
      if (entry) {
        entry.count += 1;
        entry.titles.add(item.title);
      } else {
        acc.set(domain, { url: originOf(href), count: 1, titles: new Set([item.title]) });
      }
    }
  }

  return [...acc.entries()]
    .sort(([da, a], [db, b]) => b.count - a.count || da.localeCompare(db))
    .slice(0, limit)
    .map(([, v]) => ({
      url: v.url,
      discoveredVia: "link-mine" as const,
      evidence: [...v.titles].slice(0, 5).map((t) => `cited by "${t}"`),
      seenCount: v.count,
    }));
}

/** The bare `https://host/` origin of a URL (so a candidate URL is a site root, not a deep link). */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
