import { expect, test } from "vitest";
import type { Provenance, Theater, TheaterStatus, WorldEvent } from "@khazana/core";
import { resolveTheaterMembership } from "./membership.js";

// --- fixtures -------------------------------------------------------------

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
    id: "t-box",
    name: "Box Theater",
    status: "active",
    sides: [
      { id: "a", label: "Side A", belligerents: [{ name: "A forces", role: "state" }] },
      { id: "b", label: "Side B", belligerents: [{ name: "B forces", role: "state" }] },
    ],
    bounds: { north: 50, south: 40, east: 30, west: 20 },
    startedAt: "2022-01-01T00:00:00.000Z",
    endedAt: null,
    primaryCountries: [],
    provenance,
    ...overrides,
  };
}

function makeEvent(lat: number, lng: number, time: string): WorldEvent {
  return {
    id: `e-${lat}-${lng}-${time}`,
    headline: "test event",
    geo: { lat, lng },
    time,
    category: "conflict",
    severity: "medium",
    reportings: [],
    provenance,
  };
}

// --- point-in-bounds ------------------------------------------------------

test("event strictly inside bounds and after start resolves", () => {
  const r = resolveTheaterMembership(makeEvent(45, 25, "2023-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBe("t-box");
});

test("event on a corner of the bounds matches (inclusive)", () => {
  const r = resolveTheaterMembership(makeEvent(50, 30, "2023-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBe("t-box");
});

test("event on the south/west edge matches (inclusive)", () => {
  const r = resolveTheaterMembership(makeEvent(40, 20, "2023-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBe("t-box");
});

test("event just north of bounds does not match", () => {
  const r = resolveTheaterMembership(makeEvent(50.0001, 25, "2023-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBeUndefined();
  expect(r.reason).toBeTruthy();
});

test("event just east of bounds does not match", () => {
  const r = resolveTheaterMembership(makeEvent(45, 30.0001, "2023-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBeUndefined();
});

// --- time window ----------------------------------------------------------

test("event exactly at startedAt matches (inclusive lower bound)", () => {
  const r = resolveTheaterMembership(makeEvent(45, 25, "2022-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBe("t-box");
});

test("event before startedAt does not match", () => {
  const r = resolveTheaterMembership(makeEvent(45, 25, "2021-12-31T23:59:59.000Z"), [makeTheater()]);
  expect(r.theaterId).toBeUndefined();
});

test("active theater has an unbounded end — far-future event matches", () => {
  const r = resolveTheaterMembership(makeEvent(45, 25, "2099-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBe("t-box");
});

test("archived theater matches events strictly before endedAt", () => {
  const t = makeTheater({ status: "archived", endedAt: "2023-06-01T00:00:00.000Z" });
  const r = resolveTheaterMembership(makeEvent(45, 25, "2023-05-31T23:59:59.000Z"), [t]);
  expect(r.theaterId).toBe("t-box");
});

test("archived theater excludes events exactly at endedAt (exclusive upper bound)", () => {
  const t = makeTheater({ status: "archived", endedAt: "2023-06-01T00:00:00.000Z" });
  const r = resolveTheaterMembership(makeEvent(45, 25, "2023-06-01T00:00:00.000Z"), [t]);
  expect(r.theaterId).toBeUndefined();
});

test("archived theater excludes events after endedAt", () => {
  const t = makeTheater({ status: "archived", endedAt: "2023-06-01T00:00:00.000Z" });
  const r = resolveTheaterMembership(makeEvent(45, 25, "2024-01-01T00:00:00.000Z"), [t]);
  expect(r.theaterId).toBeUndefined();
});

// --- status filter --------------------------------------------------------

test.each<[TheaterStatus, boolean]>([
  ["active", true],
  ["archived", true],
  ["proposed", false],
  ["dormant", false],
])("status %s resolves=%s", (status, resolves) => {
  // archived needs an endedAt after the event to be resolvable on its own merits
  const t = makeTheater({ status, endedAt: status === "archived" ? "2099-01-01T00:00:00.000Z" : null });
  const r = resolveTheaterMembership(makeEvent(45, 25, "2023-01-01T00:00:00.000Z"), [t]);
  expect(r.theaterId === "t-box").toBe(resolves);
});

// --- multi-match determinism & rejection paths ----------------------------

test("multiple overlapping matches resolve deterministically to the id-sorted first", () => {
  const zebra = makeTheater({ id: "zebra" });
  const alpha = makeTheater({ id: "alpha" });
  // registry order deliberately reversed; tiebreak must be id-sorted, so 'alpha' wins.
  const r = resolveTheaterMembership(makeEvent(45, 25, "2023-01-01T00:00:00.000Z"), [zebra, alpha]);
  expect(r.theaterId).toBe("alpha");
});

test("empty registry returns no theaterId with a reason", () => {
  const r = resolveTheaterMembership(makeEvent(45, 25, "2023-01-01T00:00:00.000Z"), []);
  expect(r.theaterId).toBeUndefined();
  expect(r.reason).toBeTruthy();
});

test("event outside all bounds returns a reason and no theaterId", () => {
  const r = resolveTheaterMembership(makeEvent(0, 0, "2023-01-01T00:00:00.000Z"), [makeTheater()]);
  expect(r.theaterId).toBeUndefined();
  expect(r.reason).toBeTruthy();
});

test("proposed/dormant-only registry never resolves even inside bounds", () => {
  const registry = [
    makeTheater({ id: "p", status: "proposed" }),
    makeTheater({ id: "d", status: "dormant" }),
  ];
  const r = resolveTheaterMembership(makeEvent(45, 25, "2023-01-01T00:00:00.000Z"), registry);
  expect(r.theaterId).toBeUndefined();
});
