import type { CandidateSource, Registry } from "@khazana/core";
import { normalizeDomain } from "../gaps.js";
import { registryDomainSet } from "../candidate.js";

/** One `<outline …>` element's attributes. */
const OUTLINE_RE = /<outline\b([^>]*)\/?>/gi;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

export interface OpmlOpts {
  /** Label recorded in evidence (e.g. the OPML filename or subscription list name). */
  fileLabel?: string;
  limit?: number;
}

/**
 * OPML import: a no-AI candidate generator. An OPML file is a portable list of
 * feed subscriptions (blogrolls, "awesome" exports, another reader's OPML).
 * Parse each `<outline>` with an `xmlUrl`, use `htmlUrl` (or the feed URL) as
 * the candidate site, drop already-registered domains, and dedupe.
 *
 * Pure over the provided OPML string — no network. Malformed input yields `[]`.
 */
export function importOpml(opml: string, registry: Registry, opts: OpmlOpts = {}): CandidateSource[] {
  const limit = opts.limit ?? 500;
  const label = opts.fileLabel ?? "OPML import";
  const registered = registryDomainSet(registry);

  const byDomain = new Map<string, CandidateSource>();
  for (const match of opml.matchAll(OUTLINE_RE)) {
    const attrs = parseAttrs(match[1]!);
    const xmlUrl = attrs.get("xmlurl");
    if (!xmlUrl || !/^https?:\/\//i.test(xmlUrl)) continue; // only feed outlines
    const htmlUrl = attrs.get("htmlurl");
    const candidateUrl = htmlUrl && /^https?:\/\//i.test(htmlUrl) ? htmlUrl : xmlUrl;

    const domain = normalizeDomain(candidateUrl);
    if (!domain || registered.has(domain) || byDomain.has(domain)) continue;

    const text = attrs.get("text") ?? attrs.get("title");
    byDomain.set(domain, {
      url: candidateUrl,
      feedUrl: xmlUrl,
      discoveredVia: "opml",
      evidence: [`listed in ${label}${text ? ` as "${text}"` : ""}`],
      seenCount: 1,
    });
  }

  return [...byDomain.values()].slice(0, limit);
}

function parseAttrs(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of raw.matchAll(ATTR_RE)) {
    map.set(m[1]!.toLowerCase(), m[2]!);
  }
  return map;
}
