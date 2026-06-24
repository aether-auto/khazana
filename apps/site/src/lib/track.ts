import { sendEvent } from "@khazana/worker/src/client.ts";

type SendFn = typeof sendEvent;

export interface TrackDeps {
  endpoint: string;
  send?: SendFn;
  now?: string;
  deviceId?: string;
}

/** Read PUBLIC_WORKER_URL from an env-like object; "" when unset (→ beacon no-ops). */
export function resolveEndpoint(env: { PUBLIC_WORKER_URL?: string }): string {
  return (env.PUBLIC_WORKER_URL ?? "").trim();
}

function fire(
  body: { itemId: string; type: "open" | "dwell"; dwellMs?: number },
  deps: TrackDeps,
): boolean {
  if (!deps.endpoint) return false; // no endpoint → graceful no-op
  const send = deps.send ?? sendEvent;
  return send(deps.endpoint, body, { now: deps.now, deviceId: deps.deviceId });
}

/** Fire an `open` event for an item. No-ops without an endpoint. */
export function trackOpen(itemId: string, deps: TrackDeps): boolean {
  return fire({ itemId, type: "open" }, deps);
}

/** Fire a `dwell` event (with dwellMs) for an item. No-ops without an endpoint. */
export function trackDwell(itemId: string, dwellMs: number, deps: TrackDeps): boolean {
  return fire({ itemId, type: "dwell", dwellMs }, deps);
}
