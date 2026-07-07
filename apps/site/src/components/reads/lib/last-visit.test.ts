import { describe, expect, test } from "vitest";
import { isNewSinceVisit, READS_LAST_VISIT_KEY } from "./last-visit.js";

describe("READS_LAST_VISIT_KEY", () => {
  test("follows the site's khz.* client-state key convention", () => {
    expect(READS_LAST_VISIT_KEY).toBe("khz.reads.lastVisit");
  });
});

describe("isNewSinceVisit", () => {
  test("null lastVisit (first-ever visit) never marks anything new", () => {
    expect(isNewSinceVisit("2026-07-06T09:00:00.000Z", null)).toBe(false);
  });

  test("a read published after the stored last-visit IS new", () => {
    expect(isNewSinceVisit("2026-07-06T09:00:00.000Z", "2026-07-01T00:00:00.000Z")).toBe(true);
  });

  test("a read published before the stored last-visit is NOT new", () => {
    expect(isNewSinceVisit("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z")).toBe(false);
  });

  test("a read published at exactly the last-visit instant is NOT new (strictly after)", () => {
    const t = "2026-07-01T00:00:00.000Z";
    expect(isNewSinceVisit(t, t)).toBe(false);
  });

  test("a malformed publishedAt fails closed to false, never throws", () => {
    expect(isNewSinceVisit("not-a-date", "2026-07-01T00:00:00.000Z")).toBe(false);
  });

  test("a malformed lastVisit fails closed to false, never throws", () => {
    expect(isNewSinceVisit("2026-07-06T09:00:00.000Z", "not-a-date")).toBe(false);
  });

  test("an empty-string lastVisit is treated like no baseline (false)", () => {
    expect(isNewSinceVisit("2026-07-06T09:00:00.000Z", "")).toBe(false);
  });
});
