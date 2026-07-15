import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TheaterSchema } from "@khazana/core";
import { buildActiveJson } from "./theater-rollup.js";

/**
 * Medium-lane rollup entrypoint: read the hand-curated theater registry, validate
 * every entry against TheaterSchema, project the active ones with buildActiveJson,
 * and write the deterministic active.json the Globe consumes.
 *
 * Default paths point at the package's committed `seed/` staging copy (the private
 * khazana-world-data repo is the real home at data/world/theaters/, but is blocked
 * from creation). The medium-lane workflow overrides argv[2]/argv[3] with the
 * checked-out private-repo paths.
 */

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "../../");
const registryPath = process.argv[2] ?? resolve(packageRoot, "seed/registry.json");
const activePath = process.argv[3] ?? resolve(packageRoot, "seed/active.json");

const raw: unknown = JSON.parse(readFileSync(registryPath, "utf8"));
const registry = z.array(TheaterSchema).parse(raw);
const active = buildActiveJson(registry);

writeFileSync(activePath, `${JSON.stringify(active, null, 2)}\n`);
console.log(`wrote ${active.length} active theater(s) → ${activePath}`);
