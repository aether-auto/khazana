import { describe, expect, test } from "vitest";
import type { WorldRegistry, WorldSourceEntry } from "../packages/core/src/index.ts";
import { REQUIRED_SEED_IDS, checkWorldRegistry } from "./validate-world-registry.mts";

function entry(overrides: Partial<WorldSourceEntry> & Pick<WorldSourceEntry, "id">): WorldSourceEntry {
  return {
    name: `${overrides.id} name`,
    homepage: "https://example.com",
    licenseTier: "redistribute-raw-ok",
    cadenceLane: "slow",
    fields: [],
    enabled: true,
    trustScore: 0.5,
    failureCount: 0,
    ...overrides,
  };
}

/** One compliant entry per §4.1 seed id + §1.4/§4.2-correct tier/lane/fields for the 17
 * spec-bucketed + fields-empty ids; the 5 India sources get a researched tier + notes. */
function compliantRegistry(): WorldRegistry {
  const sources: WorldSourceEntry[] = [
    entry({ id: "world-bank-wdi", licenseTier: "redistribute-raw-ok", cadenceLane: "slow", fields: ["macro", "fiscal"] }),
    entry({ id: "world-bank-wgi", licenseTier: "redistribute-raw-ok", cadenceLane: "slow", fields: ["governance"] }),
    entry({ id: "imf-sdmx", licenseTier: "redistribute-raw-ok", cadenceLane: "slow", fields: ["macro"] }),
    entry({ id: "ucdp", licenseTier: "redistribute-raw-ok", cadenceLane: "slow", fields: ["conflict"] }),
    entry({ id: "gdelt-gkg", licenseTier: "redistribute-raw-ok", cadenceLane: "fast", fields: [] }),
    entry({ id: "usaspending", licenseTier: "redistribute-raw-ok", cadenceLane: "medium", fields: [] }),
    entry({ id: "ted", licenseTier: "redistribute-raw-ok", cadenceLane: "medium", fields: [] }),
    entry({ id: "ocds", licenseTier: "redistribute-raw-ok", cadenceLane: "medium", fields: [] }),
    entry({ id: "transparency-cpi", licenseTier: "derived-only", cadenceLane: "slow", fields: ["corruption"] }),
    entry({ id: "polity5", licenseTier: "derived-only", cadenceLane: "slow", fields: ["governance"] }),
    entry({ id: "freedom-house", licenseTier: "derived-only", cadenceLane: "slow", fields: ["governance"] }),
    entry({ id: "fred", licenseTier: "derived-only", cadenceLane: "slow", fields: ["macro"] }),
    entry({ id: "open-budget-survey", licenseTier: "derived-only", cadenceLane: "slow", fields: ["fiscal"] }),
    entry({ id: "acled", licenseTier: "derived-only", cadenceLane: "medium", fields: ["conflict"] }),
    entry({ id: "allsides", licenseTier: "derived-only", cadenceLane: "medium", fields: [] }),
    entry({ id: "adfontes", licenseTier: "derived-only", cadenceLane: "medium", fields: [] }),
    entry({ id: "mbfc", licenseTier: "derived-only", cadenceLane: "medium", fields: [] }),
    entry({ id: "gem-india", licenseTier: "redistribute-raw-ok", cadenceLane: "medium", fields: [], notes: "GODL" }),
    entry({ id: "niti-sdg", licenseTier: "derived-only", cadenceLane: "slow", fields: ["wellbeing"], notes: "no explicit license found" }),
    entry({ id: "rbi-dbie", licenseTier: "derived-only", cadenceLane: "slow", fields: ["macro"], notes: "ambiguous ToS" }),
    entry({ id: "lok-dhaba", licenseTier: "derived-only", cadenceLane: "slow", fields: ["elections"], notes: "attribution-only terms" }),
    entry({ id: "open-budgets-india", licenseTier: "redistribute-raw-ok", cadenceLane: "slow", fields: ["fiscal"], notes: "CC-BY 4.0" }),
  ];
  return { version: 1, sources };
}

describe("checkWorldRegistry", () => {
  test("compliant fixture: zero violations", () => {
    expect(checkWorldRegistry(compliantRegistry())).toEqual([]);
    expect(compliantRegistry().sources).toHaveLength(REQUIRED_SEED_IDS.length);
  });

  test("duplicate id fixture: reports the duplicate", () => {
    const registry = compliantRegistry();
    registry.sources.push(entry({ id: "gdelt-gkg", cadenceLane: "fast", fields: [] }));
    const violations = checkWorldRegistry(registry);
    expect(violations.some((v) => v.includes('duplicate source id "gdelt-gkg"'))).toBe(true);
  });

  test("missing required seed id fixture: reports the missing id", () => {
    const registry = compliantRegistry();
    registry.sources = registry.sources.filter((s) => s.id !== "acled");
    const violations = checkWorldRegistry(registry);
    expect(violations.some((v) => v.includes('missing required seed source "acled"'))).toBe(true);
  });

  test("incorrect D4 licenseTier fixture: reports the mismatch", () => {
    const registry = compliantRegistry();
    const wdi = registry.sources.find((s) => s.id === "world-bank-wdi")!;
    wdi.licenseTier = "derived-only";
    const violations = checkWorldRegistry(registry);
    expect(
      violations.some((v) => v.includes('source "world-bank-wdi"') && v.includes("licenseTier")),
    ).toBe(true);
  });

  test("gdelt-gkg on wrong cadenceLane fixture: reports the mismatch", () => {
    const registry = compliantRegistry();
    const gdelt = registry.sources.find((s) => s.id === "gdelt-gkg")!;
    gdelt.cadenceLane = "slow";
    const violations = checkWorldRegistry(registry);
    expect(
      violations.some((v) => v.includes('source "gdelt-gkg"') && v.includes("cadenceLane")),
    ).toBe(true);
  });

  test("non-empty fields on a contract-shaped source fixture: reports the violation", () => {
    const registry = compliantRegistry();
    const ocds = registry.sources.find((s) => s.id === "ocds")!;
    ocds.fields = ["fiscal"];
    const violations = checkWorldRegistry(registry);
    expect(
      violations.some((v) => v.includes('source "ocds"') && v.includes("fields must be empty")),
    ).toBe(true);
  });
});
