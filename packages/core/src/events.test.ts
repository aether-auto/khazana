import { expect, test } from "vitest";
import { EngagementEventSchema, type EngagementEvent } from "./events.js";

test("accepts a minimal valid open event", () => {
  const parsed = EngagementEventSchema.safeParse({
    itemId: "abc",
    type: "open",
    at: "2026-06-23T00:00:00.000Z",
  });
  expect(parsed.success).toBe(true);
});

test("accepts a dwell event with dwellMs and deviceId", () => {
  const parsed = EngagementEventSchema.safeParse({
    itemId: "abc",
    type: "dwell",
    at: "2026-06-23T00:00:00.000Z",
    dwellMs: 4200,
    deviceId: "device-1",
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    const ev: EngagementEvent = parsed.data;
    expect(ev.dwellMs).toBe(4200);
    expect(ev.deviceId).toBe("device-1");
  }
});

test("rejects an unknown event type", () => {
  const parsed = EngagementEventSchema.safeParse({
    itemId: "abc",
    type: "click",
    at: "2026-06-23T00:00:00.000Z",
  });
  expect(parsed.success).toBe(false);
});

test("rejects a non-datetime at", () => {
  const parsed = EngagementEventSchema.safeParse({
    itemId: "abc",
    type: "read",
    at: "not-a-date",
  });
  expect(parsed.success).toBe(false);
});
