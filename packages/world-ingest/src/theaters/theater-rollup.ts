import type { Side, Theater, TheaterBounds } from "@khazana/core";

/**
 * ActiveTheater — the lean public projection of a live theater the Globe consumes.
 *
 * Defined LOCALLY in world-ingest (not @khazana/core): this is a rollup artifact
 * shape, not a cross-subsystem contract. It carries only what a client needs to
 * draw a theater — identity, name, belligerent sides, and rendering bounds — and
 * deliberately drops registry provenance, lifecycle timestamps, and status.
 */
export interface ActiveTheater {
  id: string;
  name: string;
  sides: Side[];
  bounds: TheaterBounds;
}

/**
 * Project the persistent theater registry into the `active.json` rollup.
 *
 * Keeps only `active`-status theaters, strips them to the ActiveTheater shape, and
 * sorts by id so the output is byte-for-byte deterministic across runs (a stable
 * diff is what lets the medium lane commit active.json only when it truly changed).
 */
export function buildActiveJson(registry: Theater[]): ActiveTheater[] {
  return registry
    .filter((theater) => theater.status === "active")
    .map((theater) => ({
      id: theater.id,
      name: theater.name,
      sides: theater.sides,
      bounds: theater.bounds,
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
