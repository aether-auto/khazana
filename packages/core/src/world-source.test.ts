import { expect, test } from "vitest";
import { WorldSourceEntrySchema, parseWorldRegistry } from "./world-source.js";

test("round-trips a fully-populated WorldSourceEntry fixture", () => {
  const full = {
    id: "world-bank-wdi",
    name: "World Bank World Development Indicators",
    homepage: "https://data.worldbank.org",
    licenseTier: "redistribute-raw-ok" as const,
    cadenceLane: "slow" as const,
    fields: ["macro", "fiscal"] as const,
    countries: ["USA", "IND"],
    enabled: true,
    trustScore: 0.9,
    addedAt: "2026-07-07T12:00:00.000Z",
    lastFetchedAt: "2026-07-14T12:00:00.000Z",
    failureCount: 0,
    notes: "primary macro source",
  };
  const parsed = WorldSourceEntrySchema.parse(full);
  expect(parsed).toEqual(full);
});

test("applies enabled/trustScore/failureCount/fields defaults when omitted", () => {
  const minimal = {
    id: "gdelt-gkg",
    name: "GDELT Global Knowledge Graph",
    homepage: "https://www.gdeltproject.org",
    licenseTier: "derived-only" as const,
    cadenceLane: "fast" as const,
  };
  const parsed = WorldSourceEntrySchema.parse(minimal);
  expect(parsed.enabled).toBe(true);
  expect(parsed.trustScore).toBe(0.5);
  expect(parsed.failureCount).toBe(0);
  expect(parsed.fields).toEqual([]);
  expect(parsed.countries).toBeUndefined();
});

test("parseWorldRegistry applies version/sources defaults on an empty payload", () => {
  const reg = parseWorldRegistry({});
  expect(reg.version).toBe(1);
  expect(reg.sources).toEqual([]);
});

test("parseWorldRegistry validates a populated registry payload", () => {
  const reg = parseWorldRegistry({
    version: 1,
    sources: [
      {
        id: "usaspending",
        name: "USAspending.gov",
        homepage: "https://www.usaspending.gov",
        licenseTier: "redistribute-raw-ok",
        cadenceLane: "medium",
      },
    ],
  });
  expect(reg.sources[0]!.id).toBe("usaspending");
  expect(reg.sources[0]!.trustScore).toBe(0.5);
});

test("parseWorldRegistry throws on an entry missing the required id", () => {
  expect(() =>
    parseWorldRegistry({
      version: 1,
      sources: [
        {
          name: "USAspending.gov",
          homepage: "https://www.usaspending.gov",
          licenseTier: "redistribute-raw-ok",
          cadenceLane: "medium",
        },
      ],
    }),
  ).toThrow();
});

test("parseWorldRegistry throws on an invalid licenseTier or cadenceLane value", () => {
  expect(() =>
    parseWorldRegistry({
      version: 1,
      sources: [
        {
          id: "bad-license",
          name: "Bad License",
          homepage: "https://example.com",
          licenseTier: "totally-free",
          cadenceLane: "medium",
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    parseWorldRegistry({
      version: 1,
      sources: [
        {
          id: "bad-cadence",
          name: "Bad Cadence",
          homepage: "https://example.com",
          licenseTier: "redistribute-raw-ok",
          cadenceLane: "glacial",
        },
      ],
    }),
  ).toThrow();
});
