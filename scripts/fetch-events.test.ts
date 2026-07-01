import { describe, expect, test } from "vitest";
import { serializeEvents, toValidEvents } from "./fetch-events.mts";

const valid = {
  itemId: "item-1",
  type: "read",
  at: "2026-06-30T00:00:00.000Z",
};

describe("toValidEvents", () => {
  test("keeps well-formed EngagementEvents", () => {
    const out = toValidEvents([valid, { ...valid, itemId: "item-2", type: "open" }]);
    expect(out).toHaveLength(2);
    expect(out[0]!.itemId).toBe("item-1");
  });

  test("drops malformed entries item-by-item", () => {
    const out = toValidEvents([
      valid,
      { itemId: "x" }, // missing type + at
      { itemId: "y", type: "bogus", at: valid.at }, // bad enum
      "not-an-object",
      { itemId: "z", type: "dwell", at: "not-a-date" }, // bad datetime
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.itemId).toBe("item-1");
  });

  test("non-array input yields empty (fail-soft for a bad payload)", () => {
    expect(toValidEvents(null)).toEqual([]);
    expect(toValidEvents({ events: [valid] })).toEqual([]);
    expect(toValidEvents("[]")).toEqual([]);
  });

  test("empty array stays empty", () => {
    expect(toValidEvents([])).toEqual([]);
  });
});

describe("serializeEvents", () => {
  test("pretty JSON with trailing newline (matches curate's on-disk shape)", () => {
    const s = serializeEvents(toValidEvents([valid]));
    expect(s.endsWith("\n")).toBe(true);
    expect(JSON.parse(s)).toHaveLength(1);
  });
});
