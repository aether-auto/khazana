/**
 * Moved-feed discovery now lives in `@khazana/ingest` so the ingest pipeline
 * can reuse it for rediscovery without a scout↔ingest dependency cycle. This
 * shim re-exports it to keep scout's existing imports (cli.ts, index.ts) stable.
 */
export { discoverFeed, fetchAndDiscoverFeed, looksLikeFeedUrl } from "@khazana/ingest";
