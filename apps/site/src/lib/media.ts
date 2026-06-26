// apps/site/src/lib/media.ts
// Helpers for deriving video/audio affordance data from FeedItem URLs.
// Pure functions — no side effects, fully testable.

/**
 * Extract a YouTube video ID from a canonical YouTube URL.
 * Handles:
 *   - https://www.youtube.com/watch?v={id}[&...]
 *   - https://youtu.be/{id}
 * Returns null for any non-YouTube URL or a YouTube URL with no video ID.
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    // Short URL: youtu.be/{id}
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1); // strip leading /
      return id.length > 0 ? id : null;
    }
    // Canonical: youtube.com/watch?v={id}
    if (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") {
      const v = u.searchParams.get("v");
      return v && v.length > 0 ? v : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * True when a URL is a YouTube **Short** (`youtube.com/shorts/{id}`).
 * Shorts are vertical sub-60s clips — not "best signal" — so the feed excludes
 * them from the bento, the media rails, AND the register tail. They also lack a
 * `?v=` param, so `extractYouTubeId` already returns null for them (no thumbnail);
 * this predicate lets us drop them up front rather than render a broken tile.
 * Returns false for any non-YouTube URL or a malformed input.
 */
export function isYouTubeShort(url: string): boolean {
  try {
    const u = new URL(url);
    const isYt =
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com" ||
      u.hostname === "m.youtube.com";
    return isYt && u.pathname.startsWith("/shorts/");
  } catch {
    return false;
  }
}

/**
 * Build the YouTube `hqdefault` thumbnail URL for a given video ID.
 * Uses the img.youtube.com CDN — no API key required, no CORS issues.
 */
export function buildYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
