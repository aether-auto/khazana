import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  mergeSourceHealth,
  parseRegistry,
  parseSourceHealthFile,
  partitionSafeFeedItems,
  RegistrySchema,
  SourceHealthFileSchema,
  type FeedItem,
  type Registry,
  type SourceHealthFile,
} from "@khazana/core";
import { sanitizeFeedItemContent } from "./extract.js";

/**
 * Load the registry, layering committed source health onto the SEED when no
 * local `sources.json` exists — i.e. every CI run (that file is gitignored,
 * so it never survives a fresh `actions/checkout`; see `SourceHealthFile` in
 * `@khazana/core/registry.ts` for the full "why"). When a local `sources.json`
 * IS present (local dev, having run ingest at least once), it's returned as-is
 * — that full snapshot is already self-consistent from its own last save and
 * should not be overwritten by a possibly-older committed health file.
 */
export function loadRegistry(dataDir: string): Registry {
  const main = join(dataDir, "sources.json");
  if (existsSync(main)) {
    return parseRegistry(JSON.parse(readFileSync(main, "utf8")));
  }
  const seed = parseRegistry(JSON.parse(readFileSync(join(dataDir, "sources.seed.json"), "utf8")));
  return mergeSourceHealth(seed, loadSourceHealth(dataDir));
}

export function saveRegistry(dataDir: string, registry: Registry): void {
  const path = join(dataDir, "sources.json");
  writeFileSync(path, JSON.stringify(RegistrySchema.parse(registry), null, 2) + "\n");
}

/**
 * Load the committed cross-clone health file (`data/source-health.json`).
 * Returns an empty file (no sources) when it doesn't exist yet — the common
 * case before the very first reconciled run commits one.
 */
export function loadSourceHealth(dataDir: string): SourceHealthFile {
  const path = join(dataDir, "source-health.json");
  if (!existsSync(path)) return { version: 1, sources: [] };
  return parseSourceHealthFile(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * Persist the committed cross-clone health file. Callers extract the subset
 * worth persisting via `extractSourceHealth` (`@khazana/core`) from a just-
 * reconciled registry; this just validates + writes it. `pipeline.yml` (the
 * once-daily workflow with `contents: write`) commits this file back so
 * status/consecutiveFailures/disabledAt survive the next run's fresh clone.
 */
export function saveSourceHealth(dataDir: string, health: SourceHealthFile): void {
  const path = join(dataDir, "source-health.json");
  writeFileSync(path, JSON.stringify(SourceHealthFileSchema.parse(health), null, 2) + "\n");
}

/**
 * Persist the fetched feed to `data/feed/raw.json`, enforcing the HTML-safety
 * guarantee at the single convergence point every source type flows through
 * (post-enrich, regardless of EXTRACT): each item's `summary` is reduced to
 * safe plain text and `body` to sanitized allowlisted HTML, then a final
 * structural drop-net excludes anything that STILL looks unsafe (defense in
 * depth) rather than shipping it to the `set:html` render sink downstream.
 */
export function writeFeed(dataDir: string, items: FeedItem[]): string {
  const path = join(dataDir, "feed", "raw.json");
  const sanitized = items.map(sanitizeFeedItemContent);
  const { safe, dropped } = partitionSafeFeedItems(sanitized);
  for (const { item, reasons } of dropped) {
    console.warn(`[ingest] DROPPED unsafe item ${item.id} (source=${item.source}): ${reasons.join("; ")}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(safe, null, 2) + "\n");
  return path;
}
