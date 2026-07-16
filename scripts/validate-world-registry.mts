/**
 * Validates a `WorldRegistry` JSON file (2026-07-07-world-data-spine-design.md §3.7,
 * §4.1, §4.2, §1.4) beyond what `WorldRegistrySchema` alone checks: no duplicate source
 * ids, all 22 §4.1-named seed ids present, correct `licenseTier` on the 17 sources §1.4
 * (Decision #4) explicitly buckets into redistribute-raw-ok / derived-only, correct
 * `cadenceLane` against §4.2's fast/medium/slow lane table, and an empty `fields` array
 * on every event/outlet/contract-shaped source (a source that does not feed
 * `Indicator.field` has nothing to declare there).
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/validate-world-registry.mts <path-to-registry.json>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseWorldRegistry, type WorldRegistry, type WorldSourceEntry } from "../packages/core/src/index.ts";

/**
 * The 22 seed `WorldSourceEntry` ids named in spec §4.1 (the `packages/world-ingest/src/
 * sources/` listing) — the registry's required floor per the density mandate (D3), never
 * a ceiling: the registry may grow past these, but must never lack them at seed time.
 */
export const REQUIRED_SEED_IDS = [
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

/**
 * §1.4 Decision #4's explicit two-bucket split — the only 17 ids the spec text itself
 * names a `licenseTier` for. The 5 India sources not named here (gem-india, niti-sdg,
 * rbi-dbie, lok-dhaba, open-budgets-india) are deliberately excluded: their tier is a
 * per-source research call (recorded in each entry's `notes`), not a spec-mandated value,
 * so this map must never be "completed" by guessing at those 5.
 */
export const EXPECTED_LICENSE_TIER: Record<string, WorldSourceEntry["licenseTier"]> = {
  "world-bank-wdi": "redistribute-raw-ok",
  "world-bank-wgi": "redistribute-raw-ok",
  "imf-sdmx": "redistribute-raw-ok",
  ucdp: "redistribute-raw-ok",
  "gdelt-gkg": "redistribute-raw-ok",
  usaspending: "redistribute-raw-ok",
  ted: "redistribute-raw-ok",
  ocds: "redistribute-raw-ok",
  "transparency-cpi": "derived-only",
  polity5: "derived-only",
  "freedom-house": "derived-only",
  fred: "derived-only",
  "open-budget-survey": "derived-only",
  acled: "derived-only",
  allsides: "derived-only",
  adfontes: "derived-only",
  mbfc: "derived-only",
};

/**
 * §4.2's cron-cadence-tier table, id-by-id. AllSides/Ad Fontes/MBFC are not named
 * individually in the table's prose (which lists the medium row's "outlet corpus scan →
 * BiasProfile recompute" activity, not the three rater sources by id), but this task's
 * own `long_description_md` resolves that ambiguity explicitly: the three raters feed
 * that same medium-lane recompute, so they are `medium`, not `slow` — this is an
 * inferred-from-task-text (not spec-table-literal) mapping, flagged in this task's
 * `learnings`.
 */
export const EXPECTED_CADENCE_LANE: Record<string, WorldSourceEntry["cadenceLane"]> = {
  "gdelt-gkg": "fast",
  acled: "medium",
  usaspending: "medium",
  ted: "medium",
  ocds: "medium",
  "gem-india": "medium",
  allsides: "medium",
  adfontes: "medium",
  mbfc: "medium",
  "world-bank-wdi": "slow",
  "world-bank-wgi": "slow",
  "imf-sdmx": "slow",
  ucdp: "slow",
  "transparency-cpi": "slow",
  polity5: "slow",
  "freedom-house": "slow",
  fred: "slow",
  "open-budget-survey": "slow",
  "niti-sdg": "slow",
  "rbi-dbie": "slow",
  "lok-dhaba": "slow",
  "open-budgets-india": "slow",
};

/**
 * Sources whose output shape is `WorldEvent` (gdelt-gkg), `Contract` (usaspending, ted,
 * ocds, gem-india), or `Outlet`/`ReferenceRating` (allsides, adfontes, mbfc) — none of
 * these feed `Indicator.field`, so `fields` must stay the schema default `[]`.
 */
export const EMPTY_FIELDS_IDS = ["gdelt-gkg", "usaspending", "ted", "ocds", "gem-india", "allsides", "adfontes", "mbfc"] as const;

/** Pure semantic check over an already-schema-valid `WorldRegistry`. Returns one string per violation, `[]` if compliant. */
export function checkWorldRegistry(registry: WorldRegistry): string[] {
  const violations: string[] = [];

  const seenIds = new Set<string>();
  for (const source of registry.sources) {
    if (seenIds.has(source.id)) {
      violations.push(`duplicate source id "${source.id}"`);
    }
    seenIds.add(source.id);
  }

  for (const requiredId of REQUIRED_SEED_IDS) {
    if (!seenIds.has(requiredId)) {
      violations.push(`missing required seed source "${requiredId}"`);
    }
  }

  const byId = new Map(registry.sources.map((s) => [s.id, s] as const));

  for (const [id, expectedTier] of Object.entries(EXPECTED_LICENSE_TIER)) {
    const source = byId.get(id);
    if (!source) continue; // already reported as missing above
    if (source.licenseTier !== expectedTier) {
      violations.push(
        `source "${id}": licenseTier "${source.licenseTier}" does not match spec §1.4 Decision #4's required "${expectedTier}"`,
      );
    }
  }

  for (const [id, expectedLane] of Object.entries(EXPECTED_CADENCE_LANE)) {
    const source = byId.get(id);
    if (!source) continue;
    if (source.cadenceLane !== expectedLane) {
      violations.push(
        `source "${id}": cadenceLane "${source.cadenceLane}" does not match spec §4.2's required "${expectedLane}"`,
      );
    }
  }

  for (const id of EMPTY_FIELDS_IDS) {
    const source = byId.get(id);
    if (!source) continue;
    if (source.fields.length > 0) {
      violations.push(
        `source "${id}": fields must be empty (event/outlet/contract-shaped source, does not feed Indicator.field), got [${source.fields.join(", ")}]`,
      );
    }
  }

  return violations;
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: pnpm exec tsx scripts/validate-world-registry.mts <path-to-registry.json>");
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`[validate-world-registry] failed to read/parse ${path}: ${(err as Error).message}`);
    process.exit(1);
  }

  let registry: WorldRegistry;
  try {
    registry = parseWorldRegistry(raw);
  } catch (err) {
    console.error(`[validate-world-registry] ${path}: schema validation failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const violations = checkWorldRegistry(registry);
  if (violations.length > 0) {
    console.error(`[validate-world-registry] ${path}: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }

  console.log(`[validate-world-registry] ${path}: OK (${registry.sources.length} sources, zero violations)`);
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  main();
}
