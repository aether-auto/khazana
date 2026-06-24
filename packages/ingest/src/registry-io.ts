import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRegistry, RegistrySchema, type FeedItem, type Registry } from "@khazana/core";

export function loadRegistry(dataDir: string): Registry {
  const main = join(dataDir, "sources.json");
  const seed = join(dataDir, "sources.seed.json");
  const path = existsSync(main) ? main : seed;
  return parseRegistry(JSON.parse(readFileSync(path, "utf8")));
}

export function saveRegistry(dataDir: string, registry: Registry): void {
  const path = join(dataDir, "sources.json");
  writeFileSync(path, JSON.stringify(RegistrySchema.parse(registry), null, 2) + "\n");
}

export function writeFeed(dataDir: string, items: FeedItem[]): string {
  const path = join(dataDir, "feed", "raw.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(items, null, 2) + "\n");
  return path;
}
