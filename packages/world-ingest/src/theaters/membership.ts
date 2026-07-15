import type { Theater, WorldEvent } from "@khazana/core";

/**
 * Theater membership resolution — Phase A7 (Conflict Theaters).
 *
 * Decides which registered theater, if any, a WorldEvent belongs to using a
 * deterministic point-in-bounds + time-window test. This is intentionally a pure
 * function: no I/O, no clock reads. Given the same event and registry it always
 * returns the same result, so the fast/medium lanes and any later Globe build can
 * agree on membership without re-deriving it.
 *
 * Rules (see 2026-07-07-atlas-conflict-theaters-design.md §2):
 *   - Only `active` and `archived` theaters are candidates. `proposed` and
 *     `dormant` never resolve — they are not live surfaces.
 *   - Bounds are inclusive on all four edges: an event on a corner or edge matches.
 *   - The lower time bound is inclusive (event.time >= startedAt).
 *   - `active` theaters have an unbounded upper time bound.
 *   - `archived` theaters have an EXCLUSIVE upper time bound (event.time < endedAt);
 *     an event exactly at endedAt does not belong to the archived theater.
 *   - When several theaters match, the tiebreak is deterministic: the candidate whose
 *     `id` sorts first lexicographically wins, regardless of registry array order.
 */

export interface TheaterMembership {
  /** The resolved theater's id, present only on a match. */
  theaterId?: string;
  /** Human-readable reason for the outcome (match or the dominant miss cause). */
  reason?: string;
}

const RESOLVABLE_STATUSES = new Set<Theater["status"]>(["active", "archived"]);

function withinBounds(event: WorldEvent, theater: Theater): boolean {
  const { lat, lng } = event.geo;
  const { north, south, east, west } = theater.bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

function withinTimeWindow(event: WorldEvent, theater: Theater): boolean {
  const t = Date.parse(event.time);
  const start = Date.parse(theater.startedAt);
  if (Number.isNaN(t) || Number.isNaN(start)) return false;
  if (t < start) return false;
  if (theater.status === "archived") {
    // Archived theaters carry an endedAt; treat a missing one as unresolvable
    // rather than silently unbounded. Upper bound is exclusive.
    if (theater.endedAt === null) return false;
    const end = Date.parse(theater.endedAt);
    if (Number.isNaN(end)) return false;
    return t < end;
  }
  // active: unbounded upper edge.
  return true;
}

export function resolveTheaterMembership(event: WorldEvent, registry: Theater[]): TheaterMembership {
  if (registry.length === 0) {
    return { reason: "no theaters registered" };
  }

  const candidates = registry
    .filter((theater) => RESOLVABLE_STATUSES.has(theater.status))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  if (candidates.length === 0) {
    return { reason: "no active or archived theaters to match against" };
  }

  for (const theater of candidates) {
    if (withinBounds(event, theater) && withinTimeWindow(event, theater)) {
      return { theaterId: theater.id, reason: `within bounds and time window of ${theater.id}` };
    }
  }

  const inSomeBounds = candidates.some((theater) => withinBounds(event, theater));
  return {
    reason: inSomeBounds
      ? "inside a theater's bounds but outside its time window"
      : "outside every active/archived theater's bounds",
  };
}
