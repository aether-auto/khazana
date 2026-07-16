import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseWorldRegistry, type WorldRegistry, type WorldSourceEntry } from "../packages/core/src/index.ts";

const REQUIRED_SEED_IDS = [
  "world-bank-wdi",
  "world-bank-wgi",
  "imf-sdmx",
  "ucdp",
  "gdelt-gkg",
  "usaspending",
  "ted",
  "ocds",
  "transparency-cpi",
  "polity5",
  "freedom-house",
  "fred",
  "open-budget-survey",
  "acled",
  "allsides",
  "adfontes",
  "mbfc",
  "gem-india",
  "niti-sdg",
  "rbi-dbie",
  "lok-dhaba",
  "open-budgets-india",
] as const;

const D4_LICENSE_TIERS: ReadonlyMap<string, WorldSourceEntry["licenseTier"]> = new Map([
  ["world-bank-wdi", "redistribute-raw-ok"],
  ["world-bank-wgi", "redistribute-raw-ok"],
  ["imf-sdmx", "redistribute-raw-ok"],
  ["ucdp", "redistribute-raw-ok"],
  ["gdelt-gkg", "redistribute-raw-ok"],
  ["usaspending", "redistribute-raw-ok"],
  ["ted", "redistribute-raw-ok"],
  ["ocds", "redistribute-raw-ok"],
  ["transparency-cpi", "derived-only"],
  ["polity5", "derived-only"],
  ["freedom-house", "derived-only"],
  ["fred", "derived-only"],
  ["open-budget-survey", "derived-only"],
  ["acled", "derived-only"],
  ["allsides", "derived-only"],
  ["adfontes", "derived-only"],
  ["mbfc", "derived-only"],
]);

const CADENCE_LANES: ReadonlyMap<string, WorldSourceEntry["cadenceLane"]> = new Map([
  ["world-bank-wdi", "slow"],
  ["world-bank-wgi", "slow"],
  ["imf-sdmx", "slow"],
  ["ucdp", "slow"],
  ["gdelt-gkg", "fast"],
  ["usaspending", "medium"],
  ["ted", "medium"],
  ["ocds", "medium"],
  ["transparency-cpi", "slow"],
  ["polity5", "slow"],
  ["freedom-house", "slow"],
  ["fred", "slow"],
  ["open-budget-survey", "slow"],
  ["acled", "medium"],
  ["allsides", "medium"],
  ["adfontes", "medium"],
  ["mbfc", "medium"],
  ["gem-india", "medium"],
  ["niti-sdg", "slow"],
  ["rbi-dbie", "slow"],
  ["lok-dhaba", "slow"],
  ["open-budgets-india", "slow"],
]);

const EMPTY_FIELDS_IDS = ["gdelt-gkg", "allsides", "adfontes", "mbfc", "usaspending", "ted", "ocds", "gem-india"] as const;

/** Check seed-registry rules beyond WorldRegistry schema. */
export function checkWorldRegistry(registry: WorldRegistry): string[] {
  const violations: string[] = [];
  const sourcesById = new Map<string, WorldSourceEntry>();

  for (const source of registry.sources) {
    if (sourcesById.has(source.id)) {
      violations.push(`source "${source.id}": duplicate id`);
      continue;
    }
    sourcesById.set(source.id, source);
  }

  for (const id of REQUIRED_SEED_IDS) {
    if (!sourcesById.has(id)) {
      violations.push(`registry: missing required seed id "${id}"`);
    }
  }

  for (const [id, expectedLicenseTier] of D4_LICENSE_TIERS) {
    const source = sourcesById.get(id);
    if (source && source.licenseTier !== expectedLicenseTier) {
      violations.push(
        `source "${id}": expected licenseTier "${expectedLicenseTier}", got "${source.licenseTier}"`,
      );
    }
  }

  for (const [id, expectedCadenceLane] of CADENCE_LANES) {
    const source = sourcesById.get(id);
    if (source && source.cadenceLane !== expectedCadenceLane) {
      violations.push(
        `source "${id}": expected cadenceLane "${expectedCadenceLane}", got "${source.cadenceLane}"`,
      );
    }
  }

  for (const id of EMPTY_FIELDS_IDS) {
    const source = sourcesById.get(id);
    if (source && source.fields.length > 0) {
      violations.push(`source "${id}": fields must be empty for contract/event/outlet source`);
    }
  }

  return violations;
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: pnpm exec tsx scripts/validate-world-registry.mts <path-to-registry.json>");
    process.exit(1);
    return;
  }

  let registry: WorldRegistry;
  try {
    registry = parseWorldRegistry(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    console.error(`[world-registry] cannot read or parse ${path}: ${(error as Error).message}`);
    process.exit(1);
    return;
  }

  const violations = checkWorldRegistry(registry);
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(violation);
    }
    process.exit(1);
    return;
  }

  console.log(`OK: ${registry.sources.length} sources validated`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
