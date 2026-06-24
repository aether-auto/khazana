import type { EngagementEvent } from "@khazana/core";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEVICE_ID_KEY = "khazana:deviceId";

export function getDeviceId(storage: StorageLike = globalThis.localStorage): string {
  const existing = storage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export type EventInput = Omit<EngagementEvent, "at" | "deviceId">;

export interface SendDeps {
  now?: string;
  deviceId?: string;
  storage?: StorageLike;
  beacon?: (url: string, body: string) => boolean;
  fetchFn?: typeof fetch;
}

export function sendEvent(endpoint: string, event: EventInput, deps: SendDeps = {}): boolean {
  const now = deps.now ?? new Date().toISOString();
  const deviceId = deps.deviceId ?? getDeviceId(deps.storage);
  const full: EngagementEvent = { ...event, at: now, deviceId };
  const url = `${endpoint}/event`;
  const body = JSON.stringify(full);

  const beacon =
    deps.beacon ??
    (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? (u: string, b: string) => navigator.sendBeacon(u, b)
      : undefined);
  if (beacon) {
    return beacon(url, body);
  }

  const fetchFn = deps.fetchFn ?? fetch;
  void fetchFn(url, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  });
  return false;
}
