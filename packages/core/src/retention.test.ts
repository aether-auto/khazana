import { describe, it, expect } from "vitest";
import { selectExpired, DEFAULT_RETENTION_DAYS, type DatedEntry } from "./retention.js";

// "today" is fixed across these tests so the window boundary is unambiguous.
const TODAY = "2026-06-28";

function entry(id: string, day: string): DatedEntry {
  return { id, day };
}

describe("selectExpired", () => {
  it("returns nothing for empty input", () => {
    expect(selectExpired([], TODAY, 3)).toEqual([]);
  });

  it("keeps today's entries (age 0)", () => {
    const e = [entry("a", "2026-06-28")];
    expect(selectExpired(e, TODAY, 3)).toEqual([]);
  });

  it("keeps entries strictly inside the window", () => {
    // window = today + 2 prior days kept (retentionDays=3 ⇒ ages 0,1,2 kept).
    const e = [
      entry("d0", "2026-06-28"),
      entry("d1", "2026-06-27"),
      entry("d2", "2026-06-26"),
    ];
    expect(selectExpired(e, TODAY, 3)).toEqual([]);
  });

  it("expires the entry exactly at the boundary (age === retentionDays)", () => {
    // retentionDays=3 keeps ages 0,1,2; age 3 (2026-06-25) is the first expired.
    const e = [
      entry("keep", "2026-06-26"), // age 2 → kept
      entry("edge", "2026-06-25"), // age 3 → expired (boundary)
    ];
    expect(selectExpired(e, TODAY, 3)).toEqual(["edge"]);
  });

  it("expires anything older than the window", () => {
    const e = [
      entry("old1", "2026-06-25"),
      entry("old2", "2026-06-20"),
      entry("ancient", "2026-01-01"),
      entry("fresh", "2026-06-28"),
    ];
    expect(selectExpired(e, TODAY, 3)).toEqual(["old1", "old2", "ancient"]);
  });

  it("respects a retentionDays of 1 (only today kept)", () => {
    const e = [
      entry("today", "2026-06-28"),
      entry("yesterday", "2026-06-27"),
    ];
    expect(selectExpired(e, TODAY, 1)).toEqual(["yesterday"]);
  });

  it("treats future-dated entries as kept (never expired)", () => {
    const e = [entry("future", "2026-07-01")];
    expect(selectExpired(e, TODAY, 3)).toEqual([]);
  });

  it("skips entries with malformed dates rather than throwing", () => {
    const e = [
      entry("bad", "not-a-date"),
      entry("empty", ""),
      entry("partial", "2026-13-99"),
      entry("old", "2026-06-20"),
    ];
    expect(selectExpired(e, TODAY, 3)).toEqual(["old"]);
  });

  it("accepts full ISO timestamps as the day field (date portion is used)", () => {
    const e = [
      entry("a", "2026-06-25T09:00:00.000Z"), // age 3 → expired
      entry("b", "2026-06-27T23:59:59.000Z"), // age 1 → kept
    ];
    expect(selectExpired(e, TODAY, 3)).toEqual(["a"]);
  });

  it("returns ids in input order and is deterministic", () => {
    const e = [
      entry("z", "2026-06-01"),
      entry("y", "2026-06-02"),
      entry("x", "2026-06-03"),
    ];
    const first = selectExpired(e, TODAY, 3);
    const second = selectExpired(e, TODAY, 3);
    expect(first).toEqual(["z", "y", "x"]);
    expect(first).toEqual(second);
  });

  it("treats a non-positive retentionDays as 'keep only today'", () => {
    const e = [
      entry("today", "2026-06-28"),
      entry("yesterday", "2026-06-27"),
    ];
    // Guard against an env-override of 0; never expire today.
    expect(selectExpired(e, TODAY, 0)).toEqual(["yesterday"]);
  });

  it("skips an entry when today itself is malformed (fails safe: expire nothing)", () => {
    const e = [entry("old", "2026-01-01")];
    expect(selectExpired(e, "garbage", 3)).toEqual([]);
  });

  it("exposes a default retention window of 3", () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(3);
  });
});
