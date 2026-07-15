import { expect, test } from "vitest";
import type { Provenance, Theater, WorldEvent } from "@khazana/core";
import { shouldEscalateToTheater, stageMembership } from "./fast.js";

const provenance: Provenance = {
  sourceId: "gdelt",
  sourceUrl: "https://example.org/gdelt/row",
  methodUrl: "https://example.org/gdelt/method",
  licenseTier: "redistribute-raw-ok",
  redistribution: true,
  origin: "referenced",
  retrievedAt: "2026-07-07T12:00:00.000Z",
  uncertainty: { kind: "none" },
};

const theater: Theater = {
  id: "t-box",
  name: "Box",
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
};

function makeEvent(id: string, category: WorldEvent["category"], lat: number, lng: number): WorldEvent {
  return {
    id,
    headline: "e",
    geo: { lat, lng },
    time: "2023-01-01T00:00:00.000Z",
    category,
    severity: "medium",
    reportings: [],
    provenance,
  };
}

test("membership is staged for every event, category preserved, input order kept", () => {
  const events = [
    makeEvent("c1", "conflict", 45, 25),
    makeEvent("e1", "economy", 45, 25),
    makeEvent("d1", "diplomacy", 0, 0),
  ];
  const staged = stageMembership(events, [theater]);
  expect(staged.map((s) => s.eventId)).toEqual(["c1", "e1", "d1"]);
  expect(staged.map((s) => s.category)).toEqual(["conflict", "economy", "diplomacy"]);
});

test("event inside a theater resolves its theaterId regardless of category", () => {
  const staged = stageMembership([makeEvent("e1", "economy", 45, 25)], [theater]);
  expect(staged[0]?.theaterId).toBe("t-box");
});

test("event outside every theater stages a reason and no theaterId", () => {
  const staged = stageMembership([makeEvent("c1", "conflict", 0, 0)], [theater]);
  expect(staged[0]?.theaterId).toBeUndefined();
  expect(staged[0]?.reason).toBeTruthy();
});

test("shouldEscalateToTheater: conflict category escalates even without a theater match", () => {
  const [row] = stageMembership([makeEvent("c1", "conflict", 0, 0)], [theater]);
  expect(shouldEscalateToTheater(row!)).toBe(true);
});

test("shouldEscalateToTheater: non-conflict event inside a theater escalates via membership", () => {
  const [row] = stageMembership([makeEvent("e1", "economy", 45, 25)], [theater]);
  expect(shouldEscalateToTheater(row!)).toBe(true);
});

test("shouldEscalateToTheater: non-conflict event outside every theater does not escalate", () => {
  const [row] = stageMembership([makeEvent("s1", "society", 0, 0)], [theater]);
  expect(shouldEscalateToTheater(row!)).toBe(false);
});
