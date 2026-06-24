import { expect, test, vi } from "vitest";
import { trackOpen, trackDwell, resolveEndpoint } from "./track.js";

test("resolveEndpoint returns trimmed url or empty string", () => {
  expect(resolveEndpoint({ PUBLIC_WORKER_URL: "https://w.example.com " })).toBe(
    "https://w.example.com",
  );
  expect(resolveEndpoint({ PUBLIC_WORKER_URL: "" })).toBe("");
  expect(resolveEndpoint({})).toBe("");
});

test("trackOpen no-ops (returns false, no send) when endpoint is empty", () => {
  const send = vi.fn();
  expect(trackOpen("item-1", { endpoint: "", send })).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

test("trackOpen sends an open event when endpoint is set", () => {
  const send = vi.fn().mockReturnValue(true);
  const ok = trackOpen("item-1", {
    endpoint: "https://w.example.com",
    send,
    now: "2026-06-23T12:00:00.000Z",
    deviceId: "dev-1",
  });
  expect(ok).toBe(true);
  expect(send).toHaveBeenCalledWith(
    "https://w.example.com",
    { itemId: "item-1", type: "open" },
    { now: "2026-06-23T12:00:00.000Z", deviceId: "dev-1" },
  );
});

test("trackDwell includes dwellMs and no-ops without endpoint", () => {
  const send = vi.fn().mockReturnValue(true);
  expect(trackDwell("item-2", 4200, { endpoint: "", send })).toBe(false);
  expect(send).not.toHaveBeenCalled();

  trackDwell("item-2", 4200, {
    endpoint: "https://w.example.com",
    send,
    now: "2026-06-23T12:00:00.000Z",
    deviceId: "dev-1",
  });
  expect(send).toHaveBeenCalledWith(
    "https://w.example.com",
    { itemId: "item-2", type: "dwell", dwellMs: 4200 },
    { now: "2026-06-23T12:00:00.000Z", deviceId: "dev-1" },
  );
});
