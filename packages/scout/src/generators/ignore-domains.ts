/**
 * Domains that are infrastructure, platforms, CDNs, or reference/archive
 * services — never first-party *sources* worth adding to the registry, even
 * when our best content cites them constantly. A citation of `github.com` or
 * `en.wikipedia.org` tells us nothing about a publisher to follow.
 *
 * Matching is suffix-based on the normalized (no-`www.`) host, so subdomains
 * (`gist.github.com`, `en.wikipedia.org`) are covered by their apex entry.
 */
export const IGNORE_DOMAINS: readonly string[] = [
  // code / package hosting
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "raw.githubusercontent.com",
  "githubusercontent.com",
  "npmjs.com",
  "pypi.org",
  // reference / archives / DOIs
  "wikipedia.org",
  "wikimedia.org",
  "archive.org",
  "web.archive.org",
  "doi.org",
  "arxiv.org",
  "ssrn.com",
  "semanticscholar.org",
  "scholar.google.com",
  // social / platforms (item-level, not a followable feed source)
  "x.com",
  "twitter.com",
  "t.co",
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "reddit.com",
  "news.ycombinator.com",
  "youtube.com",
  "youtu.be",
  "bsky.app",
  "mastodon.social",
  "threads.net",
  // CDNs / asset hosts / shorteners / trackers
  "substackcdn.com",
  "cloudfront.net",
  "amazonaws.com",
  "googleusercontent.com",
  "gstatic.com",
  "gravatar.com",
  "imgur.com",
  "bit.ly",
  "google.com",
  "docs.google.com",
];

/** True when `domain` is (or is a subdomain of) any ignored infrastructure domain. */
export function isIgnoredDomain(domain: string): boolean {
  return IGNORE_DOMAINS.some((ig) => domain === ig || domain.endsWith(`.${ig}`));
}
