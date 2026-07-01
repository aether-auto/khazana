/**
 * Moved-feed rediscovery — the IO half of the self-healing loop.
 *
 * The pure reducer (`@khazana/core` `reconcileRegistry`) decides WHICH
 * permanently-failing sources are about to be auto-disabled and returns them as
 * `rediscover` candidates. This wrapper does the actual network probe (reusing
 * `fetchAndDiscoverFeed`) to see if the feed simply moved. If a *different*
 * live feed URL is found, we apply `applyRediscovery` (reset strikes, re-enable,
 * record `resolvedUrl`) instead of leaving the source disabled.
 *
 * Kept thin + IO-only so the decision logic stays unit-tested in core.
 */

import type { Registry, ReconcileOpts, SourceEntry } from "@khazana/core";
import { applyRediscovery } from "@khazana/core";
import { fetchAndDiscoverFeed } from "./discover-feed.js";
import type { FetchFn } from "./fetchers/build-source.js";

/**
 * For each rediscovery candidate, probe its URL for a moved feed. On a *new*
 * URL, heal the entry in the registry; otherwise leave it as reconcile left it
 * (disabled). Returns a new registry; never mutates the input.
 */
export async function rediscoverMovedFeeds(
  registry: Registry,
  candidates: readonly SourceEntry[],
  fetchFn: FetchFn,
  opts: ReconcileOpts,
): Promise<Registry> {
  if (candidates.length === 0) return registry;

  const healed = new Map<string, SourceEntry>();
  for (const entry of candidates) {
    const found = await fetchAndDiscoverFeed(entry.url, fetchFn);
    // A hit only counts if it's a *different* URL — the same URL means the feed
    // is genuinely gone (a real 404), not merely moved.
    if (found && found !== entry.url) {
      healed.set(entry.id, applyRediscovery(entry, found, opts));
    }
  }

  if (healed.size === 0) return registry;
  return {
    ...registry,
    sources: registry.sources.map((s) => healed.get(s.id) ?? s),
  };
}
