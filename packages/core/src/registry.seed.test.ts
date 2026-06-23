import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parseRegistry } from "./registry.js";

test("data/sources.seed.json is a valid registry with >= 10 sources", () => {
  const path = fileURLToPath(new URL("../../../data/sources.seed.json", import.meta.url));
  const reg = parseRegistry(JSON.parse(readFileSync(path, "utf8")));
  expect(reg.sources.length).toBeGreaterThanOrEqual(10);
  expect(new Set(reg.sources.map((s) => s.id)).size).toBe(reg.sources.length); // unique ids
});
