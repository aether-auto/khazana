/**
 * Content-addressed cache keys. Pure functions — a stable sha256 hex digest of
 * the identifying string, so a cache entry can be located by URL / episode
 * without any per-run state. Deleting a key file just triggers a cache miss
 * (cold cache does full work), which is the whole safety model.
 */

import { createHash } from "node:crypto";

/** sha256 hex of `s`. */
function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Stable cache key for a URL (feed URL, article URL). */
export function urlKey(url: string): string {
  return sha256(url);
}

/**
 * Stable cache key for a podcast/media episode. Keyed on the enclosure URL
 * (the stable CDN audio URL) when available, else the episode GUID. Returns
 * null when neither identifier exists — such an episode is simply not cached.
 */
export function episodeKey(
  enclosureUrl: string | undefined,
  guid: string | undefined,
): string | null {
  if (enclosureUrl) return sha256(`enclosure:${enclosureUrl}`);
  if (guid) return sha256(`guid:${guid}`);
  return null;
}
