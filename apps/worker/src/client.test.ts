import { expect, test } from "vitest";
import { getDeviceId, sendEvent, type StorageLike } from "./client.js";

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
  };
}

test("getDeviceId generates and persists a stable id", () => {
  const storage = fakeStorage();
  const id = getDeviceId(storage);
  expect(id).toMatch(/[0-9a-f-]{36}/);
  expect(storage.map.get("khazana:deviceId")).toBe(id);
  // second call returns the same persisted id (no regeneration)
  expect(getDeviceId(storage)).toBe(id);
});

test("getDeviceId returns the existing id without overwriting", () => {
  const storage = fakeStorage({ "khazana:deviceId": "existing-id" });
  expect(getDeviceId(storage)).toBe("existing-id");
  expect(storage.map.get("khazana:deviceId")).toBe("existing-id");
});

test("sendEvent posts a stamped, device-tagged event to <endpoint>/event via beacon", () => {
  let sentUrl: string | undefined;
  let sentBody: string | undefined;
  const used = sendEvent(
    "https://w.dev",
    { itemId: "item-1", type: "open" },
    {
      now: "2026-06-23T05:00:00.000Z",
      deviceId: "dev-9",
      beacon: (url, body) => {
        sentUrl = url;
        sentBody = body;
        return true;
      },
    },
  );
  expect(used).toBe(true);
  expect(sentUrl).toBe("https://w.dev/event");
  expect(JSON.parse(sentBody!)).toEqual({
    itemId: "item-1",
    type: "open",
    at: "2026-06-23T05:00:00.000Z",
    deviceId: "dev-9",
  });
});

test("sendEvent includes optional fields like dwellMs in the payload", () => {
  let sentBody: string | undefined;
  sendEvent(
    "https://w.dev",
    { itemId: "i", type: "dwell", dwellMs: 7000 },
    { now: "2026-06-23T05:00:00.000Z", deviceId: "d", beacon: (_u, b) => ((sentBody = b), true) },
  );
  expect(JSON.parse(sentBody!)).toEqual({
    itemId: "i",
    type: "dwell",
    dwellMs: 7000,
    at: "2026-06-23T05:00:00.000Z",
    deviceId: "d",
  });
});

test("sendEvent falls back to fetch with keepalive when no beacon is available", () => {
  let calledUrl: string | undefined;
  let calledInit: RequestInit | undefined;
  const fetchFn = ((url: string, init?: RequestInit) => {
    calledUrl = url;
    calledInit = init;
    return Promise.resolve(new Response(null, { status: 202 }));
  }) as unknown as typeof fetch;
  const used = sendEvent(
    "https://w.dev",
    { itemId: "i", type: "read" },
    { now: "2026-06-23T05:00:00.000Z", deviceId: "d", beacon: undefined, fetchFn },
  );
  expect(used).toBe(false);
  expect(calledUrl).toBe("https://w.dev/event");
  expect(calledInit?.method).toBe("POST");
  expect(calledInit?.keepalive).toBe(true);
  expect(JSON.parse(String(calledInit?.body))).toEqual({
    itemId: "i",
    type: "read",
    at: "2026-06-23T05:00:00.000Z",
    deviceId: "d",
  });
});

test("sendEvent stamps at from the provided clock deterministically", () => {
  let sentBody: string | undefined;
  sendEvent(
    "https://w.dev",
    { itemId: "i", type: "open" },
    { now: "2030-01-01T00:00:00.000Z", deviceId: "d", beacon: (_u, b) => ((sentBody = b), true) },
  );
  expect(JSON.parse(sentBody!).at).toBe("2030-01-01T00:00:00.000Z");
});
