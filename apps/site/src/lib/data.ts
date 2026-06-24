import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Absolute path to repo `data/feed`, resolved from this module's location. */
export function dataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/site/src/lib
  return join(here, "..", "..", "..", "..", "data", "feed");
}

/** Absolute path to the repo `data/` root (parent of `data/feed`). */
export function repoDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/site/src/lib
  return join(here, "..", "..", "..", "..", "data");
}
