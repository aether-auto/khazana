import { expect, test } from "vitest";
import { handleRequest } from "./handler.js";
import { createFakeKV } from "./test-kv.js";
import type { Env } from "./env.js";
import type { EngagementEvent } from "@khazana/core";

function makeEnv(over: Partial<Env> = {}): Env {
  return { KV: createFakeKV(), ...over };
}

test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const env = makeEnv({ ALLOWED_ORIGIN: "https://khazana.pages.dev" });
  const res = await handleRequest(new Request("https://w.dev/event", { method: "OPTIONS" }), env);
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://khazana.pages.dev");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
  expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
});

test("CORS origin falls back to * when ALLOWED_ORIGIN is unset", async () => {
  const res = await handleRequest(new Request("https://w.dev/health"), makeEnv());
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
});

test("GET /health returns 200 { ok: true }", async () => {
  const res = await handleRequest(new Request("https://w.dev/health"), makeEnv());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("POST /event stores a valid event under an evt: key and returns 202", async () => {
  const env = makeEnv();
  const body: EngagementEvent = {
    itemId: "item-1",
    type: "open",
    at: "2026-06-23T01:00:00.000Z",
    deviceId: "dev-1",
  };
  const res = await handleRequest(
    new Request("https://w.dev/event", { method: "POST", body: JSON.stringify(body) }),
    env,
  );
  expect(res.status).toBe(202);
  const kv = env.KV as ReturnType<typeof createFakeKV>;
  const keys = [...kv.store.keys()];
  expect(keys).toHaveLength(1);
  expect(keys[0]!.startsWith("evt:dev-1:2026-06-23T01:00:00.000Z:")).toBe(true);
  expect(JSON.parse(kv.store.get(keys[0]!)!)).toEqual(body);
});

test("POST /event without deviceId keys under 'anon'", async () => {
  const env = makeEnv();
  await handleRequest(
    new Request("https://w.dev/event", {
      method: "POST",
      body: JSON.stringify({ itemId: "i", type: "read", at: "2026-06-23T01:00:00.000Z" }),
    }),
    env,
  );
  const kv = env.KV as ReturnType<typeof createFakeKV>;
  expect([...kv.store.keys()][0]!.startsWith("evt:anon:")).toBe(true);
});

test("POST /event with an invalid body returns 400 and stores nothing", async () => {
  const env = makeEnv();
  const res = await handleRequest(
    new Request("https://w.dev/event", {
      method: "POST",
      body: JSON.stringify({ itemId: "i", type: "click", at: "2026-06-23T01:00:00.000Z" }),
    }),
    env,
  );
  expect(res.status).toBe(400);
  expect((env.KV as ReturnType<typeof createFakeKV>).store.size).toBe(0);
});

test("POST /event with non-JSON body returns 400", async () => {
  const res = await handleRequest(
    new Request("https://w.dev/event", { method: "POST", body: "not json" }),
    makeEnv(),
  );
  expect(res.status).toBe(400);
});

test("GET /events returns 503 when EXPORT_TOKEN is not configured", async () => {
  const res = await handleRequest(new Request("https://w.dev/events"), makeEnv());
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "EXPORT_TOKEN not configured" });
});

test("GET /events returns stored events sorted by at ascending", async () => {
  const kv = createFakeKV({
    "evt:anon:2026-06-23T02:00:00.000Z:b": JSON.stringify({
      itemId: "i2", type: "read", at: "2026-06-23T02:00:00.000Z",
    }),
    "evt:anon:2026-06-23T01:00:00.000Z:a": JSON.stringify({
      itemId: "i1", type: "open", at: "2026-06-23T01:00:00.000Z",
    }),
  });
  const env = makeEnv({ KV: kv, EXPORT_TOKEN: "secret" });
  const res = await handleRequest(
    new Request("https://w.dev/events", { headers: { Authorization: "Bearer secret" } }),
    env,
  );
  expect(res.status).toBe(200);
  const events = (await res.json()) as EngagementEvent[];
  expect(events.map((e) => e.itemId)).toEqual(["i1", "i2"]);
});

test("GET /events?since filters out earlier events", async () => {
  const kv = createFakeKV({
    "evt:anon:2026-06-23T01:00:00.000Z:a": JSON.stringify({
      itemId: "old", type: "open", at: "2026-06-23T01:00:00.000Z",
    }),
    "evt:anon:2026-06-23T03:00:00.000Z:b": JSON.stringify({
      itemId: "new", type: "open", at: "2026-06-23T03:00:00.000Z",
    }),
  });
  const res = await handleRequest(
    new Request("https://w.dev/events?since=2026-06-23T02:00:00.000Z", {
      headers: { Authorization: "Bearer secret" },
    }),
    { KV: kv, EXPORT_TOKEN: "secret" },
  );
  const events = (await res.json()) as EngagementEvent[];
  expect(events.map((e) => e.itemId)).toEqual(["new"]);
});

test("GET /events ignores malformed stored values", async () => {
  const kv = createFakeKV({
    "evt:anon:2026-06-23T01:00:00.000Z:a": "{ not valid json",
    "evt:anon:2026-06-23T02:00:00.000Z:b": JSON.stringify({
      itemId: "ok", type: "open", at: "2026-06-23T02:00:00.000Z",
    }),
  });
  const res = await handleRequest(
    new Request("https://w.dev/events", { headers: { Authorization: "Bearer secret" } }),
    { KV: kv, EXPORT_TOKEN: "secret" },
  );
  const events = (await res.json()) as EngagementEvent[];
  expect(events.map((e) => e.itemId)).toEqual(["ok"]);
});

test("GET /events without bearer token returns 401 when EXPORT_TOKEN is set", async () => {
  const env = makeEnv({ EXPORT_TOKEN: "secret" });
  const res = await handleRequest(new Request("https://w.dev/events"), env);
  expect(res.status).toBe(401);
});

test("GET /events with a mismatched bearer token returns 401", async () => {
  const env = makeEnv({ EXPORT_TOKEN: "secret" });
  const res = await handleRequest(
    new Request("https://w.dev/events", { headers: { Authorization: "Bearer wrong" } }),
    env,
  );
  expect(res.status).toBe(401);
});

test("GET /events with the correct bearer token returns 200", async () => {
  const env = makeEnv({ EXPORT_TOKEN: "secret" });
  const res = await handleRequest(
    new Request("https://w.dev/events", { headers: { Authorization: "Bearer secret" } }),
    env,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});

test("unknown route returns 404", async () => {
  const res = await handleRequest(new Request("https://w.dev/nope"), makeEnv());
  expect(res.status).toBe(404);
});
