import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorldRegistrySchema } from "@khazana/core";
import type { WorldRegistry } from "@khazana/core";

function readWorldRegistry(path: string): WorldRegistry {
  return WorldRegistrySchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function loadWorldRegistry(dataDir: string): WorldRegistry {
  const mainPath = join(dataDir, "world-sources.json");
  if (existsSync(mainPath)) {
    return readWorldRegistry(mainPath);
  }

  return readWorldRegistry(join(dataDir, "world-sources.seed.json"));
}

export function saveWorldRegistry(dataDir: string, registry: WorldRegistry): void {
  const path = join(dataDir, "world-sources.json");
  const validatedRegistry = WorldRegistrySchema.parse(registry);
  writeFileSync(path, `${JSON.stringify(validatedRegistry, null, 2)}\n`);
}
