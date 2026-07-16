import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { loadWorldRegistry, saveWorldRegistry } from "./registry-io.js";

let dataDir: string;

const seed = {
  sources: [
    {
      id: "seed-source",
      name: "Seed source",
      homepage: "https://example.com/seed-source",
      licenseTier: "derived-only",
      cadenceLane: "slow",
    },
  ],
};

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "khazana-world-registry-"));
  writeFileSync(join(dataDir, "world-sources.seed.json"), JSON.stringify(seed));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test("loads seed registry and applies WorldRegistry defaults when main file is absent", () => {
  const registry = loadWorldRegistry(dataDir);

  expect(registry.version).toBe(1);
  expect(registry.sources).toHaveLength(1);
  expect(registry.sources[0]).toMatchObject({
    id: "seed-source",
    fields: [],
    enabled: true,
    trustScore: 0.5,
    failureCount: 0,
  });
});

test("prefers validated world-sources.json over seed registry", () => {
  writeFileSync(
    join(dataDir, "world-sources.json"),
    JSON.stringify({
      sources: [{ ...seed.sources[0], id: "main-source", cadenceLane: "fast" }],
    }),
  );

  const registry = loadWorldRegistry(dataDir);

  expect(registry.sources).toHaveLength(1);
  expect(registry.sources[0]?.id).toBe("main-source");
  expect(registry.sources[0]?.cadenceLane).toBe("fast");
});

test("saves deterministic JSON and reloads schema-validated registry", () => {
  const registry = loadWorldRegistry(dataDir);
  registry.sources[0]!.notes = "round-trip";

  saveWorldRegistry(dataDir, registry);

  const serialized = readFileSync(join(dataDir, "world-sources.json"), "utf8");
  expect(serialized).toBe(`${JSON.stringify(registry, null, 2)}\n`);
  expect(loadWorldRegistry(dataDir)).toEqual(registry);
});

test("rejects malformed main registry instead of silently falling back to seed", () => {
  writeFileSync(
    join(dataDir, "world-sources.json"),
    JSON.stringify({ version: "one", sources: [{ id: 42 }] }),
  );

  expect(() => loadWorldRegistry(dataDir)).toThrow();
});
