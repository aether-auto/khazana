import { expect, test } from "vitest";
import type { Provenance, Theater } from "@khazana/core";
import { buildActiveJson } from "./theater-rollup.js";

const provenance: Provenance = {
  sourceId: "khazana-atlas-curation",
  sourceUrl: "https://example.org/theater/registry",
  methodUrl: "https://example.org/theater/methodology",
  licenseTier: "redistribute-raw-ok",
  redistribution: true,
  origin: "referenced",
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" },
};

function makeTheater(overrides: Partial<Theater> = {}): Theater {
  return {
    id: "t",
    name: "T",
    status: "active",
    sides: [
      { id: "a", label: "A", belligerents: [{ name: "A forces", role: "state" }] },
      { id: "b", label: "B", belligerents: [{ name: "B forces", role: "state" }] },
    ],
    bounds: { north: 50, south: 40, east: 30, west: 20 },
    startedAt: "2022-01-01T00:00:00.000Z",
    endedAt: null,
    primaryCountries: [],
    provenance,
    ...overrides,
  };
}

test("keeps only active-status theaters", () => {
  const registry = [
    makeTheater({ id: "act", status: "active" }),
    makeTheater({ id: "arch", status: "archived" }),
    makeTheater({ id: "prop", status: "proposed" }),
    makeTheater({ id: "dorm", status: "dormant" }),
  ];
  expect(buildActiveJson(registry).map((t) => t.id)).toEqual(["act"]);
});

test("projects to the lean {id,name,sides,bounds} shape only", () => {
  const [projected] = buildActiveJson([makeTheater({ id: "x", name: "X" })]);
  expect(Object.keys(projected!).sort()).toEqual(["bounds", "id", "name", "sides"]);
  expect(projected).toEqual({
    id: "x",
    name: "X",
    sides: makeTheater().sides,
    bounds: { north: 50, south: 40, east: 30, west: 20 },
  });
});

test("output is sorted by id for determinism regardless of input order", () => {
  const registry = [makeTheater({ id: "zebra" }), makeTheater({ id: "alpha" }), makeTheater({ id: "mango" })];
  expect(buildActiveJson(registry).map((t) => t.id)).toEqual(["alpha", "mango", "zebra"]);
});

test("empty registry yields an empty array", () => {
  expect(buildActiveJson([])).toEqual([]);
});
