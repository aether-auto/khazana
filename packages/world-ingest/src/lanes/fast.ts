import type { Theater, WorldEvent, WorldEventCategory } from "@khazana/core";
import { resolveTheaterMembership } from "../theaters/membership.js";

/**
 * Fast-lane GDELT refresh → theater membership staging.
 *
 * The GDELT fetch/normalize half of the fast lane lands in a sibling sprint-3 task;
 * this module owns only the membership-resolution wiring so that events begin
 * resolving to a theater the moment both halves are merged. It is pure and
 * deterministic: it takes the already-normalized WorldEvents and the theater
 * registry, and returns staged membership rows for later Globe use.
 *
 * Membership is resolved for EVERY event, independent of category: the Globe's
 * theater lens escalates a card when `category === "conflict"` OR the event's
 * geo/time falls inside an active theater, so a diplomacy/economy/society event
 * inside Ukraine or Gaza must still carry its `theaterId`. Category filtering is a
 * caller decision (`shouldEscalateToTheater`), not something this stage bakes in.
 */

export interface StagedMembership {
  eventId: string;
  category: WorldEventCategory;
  /** Present when the event resolved to a theater. */
  theaterId?: string;
  /** Why it resolved, or the dominant miss cause. */
  reason?: string;
}

/**
 * Resolve theater membership for every event, preserving input order. Category is
 * carried through so the caller can decide escalation without re-reading the event.
 */
export function stageMembership(events: WorldEvent[], registry: Theater[]): StagedMembership[] {
  return events.map((event) => {
    const { theaterId, reason } = resolveTheaterMembership(event, registry);
    return { eventId: event.id, category: event.category, theaterId, reason };
  });
}

/**
 * The Globe theater-lens escalation trigger: a conflict-category event, OR any event
 * that resolved to an active/archived theater by geo/time membership.
 */
export function shouldEscalateToTheater(row: StagedMembership): boolean {
  return row.category === "conflict" || row.theaterId !== undefined;
}
