import { expect, test } from "vitest";
import worker from "./index.js";
import { createFakeKV } from "./test-kv.js";
import type { Env } from "./env.js";

test("default export exposes a fetch handler that routes to handleRequest", async () => {
  const env: Env = { KV: createFakeKV() };
  const res = await worker.fetch(new Request("https://w.dev/health"), env);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("default export fetch stores a posted event in the injected KV", async () => {
  const env: Env = { KV: createFakeKV() };
  const res = await worker.fetch(
    new Request("https://w.dev/event", {
      method: "POST",
      body: JSON.stringify({ itemId: "i", type: "open", at: "2026-06-23T01:00:00.000Z" }),
    }),
    env,
  );
  expect(res.status).toBe(202);
  expect((env.KV as ReturnType<typeof createFakeKV>).store.size).toBe(1);
});
