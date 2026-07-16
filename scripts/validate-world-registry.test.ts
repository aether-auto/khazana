import { describe, expect, test } from "vitest";
import type { WorldRegistry, WorldSourceEntry } from "../packages/core/src/index.ts";
import { checkWorldRegistry } from "./validate-world-registry.mts";

const REQUIRED_IDS = [
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

const REDISTRIBUTE_RAW_OK_IDS = new Set([
  "world-bank-wdi",
  "world-bank-wgi",
  "imf-sdmx",
  "ucdp",
  "gdelt-gkg",
  "usaspending",
  "ted",
  "ocds",
]);

const MEDIUM_CADENCE_IDS = new Set([
  "acled",
  "usaspending",
  "ted",
  "ocds",
  "gem-india",
  "allsides",
  "adfontes",
  "mbfc",
]);

const EMPTY_FIELDS_IDS = new Set([
  "gdelt-gkg",
  "allsides",
  "adfontes",
  "mbfc",
  "usaspending",
  "ted",
  "ocds",
  "gem-india",
]);

function source(id: string): WorldSourceEntry {
  return {
    id,
    name: id,
    homepage: `https://example.com/${id}`,
    licenseTier: REDISTRIBUTE_RAW_OK_IDS.has(id) ? "redistribute-raw-ok" : "derived-only",
    cadenceLane: id === "gdelt-gkg" ? "fast" : MEDIUM_CADENCE_IDS.has(id) ? "medium" : "slow",
    fields: EMPTY_FIELDS_IDS.has(id) ? [] : ["macro"],
    enabled: true,
    trustScore: 0.5,
    addedAt: "2026-07-15T00:00:00.000Z",
    failureCount: 0,
  };
}

function compliantRegistry(): WorldRegistry {
  return { version: 1, sources: REQUIRED_IDS.map(source) };
}

describe("checkWorldRegistry", () => {
  test("accepts compliant 22-source seed baseline", () => {
    expect(checkWorldRegistry(compliantRegistry())).toEqual([]);
  });

  test("rejects duplicate ids", () => {
    const registry = compliantRegistry();
    registry.sources.push(source("world-bank-wdi"));

    expect(checkWorldRegistry(registry)).toContain('source "world-bank-wdi": duplicate id');
  });

  test("rejects missing required seed id", () => {
    const registry = compliantRegistry();
    registry.sources = registry.sources.filter((entry) => entry.id !== "ucdp");

    expect(checkWorldRegistry(registry)).toContain('registry: missing required seed id "ucdp"');
  });

  test("rejects wrong D4 licenseTier", () => {
    const registry = compliantRegistry();
    const entry = registry.sources.find((candidate) => candidate.id === "world-bank-wdi")!;
    entry.licenseTier = "derived-only";

    expect(checkWorldRegistry(registry)).toContain(
      'source "world-bank-wdi": expected licenseTier "redistribute-raw-ok", got "derived-only"',
    );
  });

  test("rejects gdelt-gkg outside fast cadence lane", () => {
    const registry = compliantRegistry();
    const gdelt = registry.sources.find((candidate) => candidate.id === "gdelt-gkg")!;
    gdelt.cadenceLane = "medium";
    const worldBankWdi = registry.sources.find((candidate) => candidate.id === "world-bank-wdi")!;
    worldBankWdi.cadenceLane = "fast";

    expect(checkWorldRegistry(registry)).toContain('source "gdelt-gkg": expected cadenceLane "fast", got "medium"');
    expect(checkWorldRegistry(registry)).toContain(
      'source "world-bank-wdi": expected cadenceLane "slow", got "fast"',
    );
  });

  test("rejects non-empty fields on contract-shaped source", () => {
    const registry = compliantRegistry();
    const entry = registry.sources.find((candidate) => candidate.id === "ocds")!;
    entry.fields = ["procurement"];

    expect(checkWorldRegistry(registry)).toContain('source "ocds": fields must be empty for contract/event/outlet source');
  });
});
