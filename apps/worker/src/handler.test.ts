import { describe, expect, test } from "vitest";
import { handleRequest } from "./handler.js";
import { createFakeKV } from "./test-kv.js";
import type { Env } from "./env.js";
import { eventWeight, gateState, type EngagementEvent, type WorldEvent } from "@khazana/core";

function worldEvent(over: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: "evt-1",
    headline: "Test headline",
    geo: { lat: 1, lng: 2, country: "XX" },
    time: "2026-06-23T01:00:00.000Z",
    category: "conflict",
    severity: "medium",
    reportings: [],
    provenance: {
      sourceId: "gdelt",
      sourceUrl: "https://example.com/source",
      methodUrl: "https://example.com/method",
      licenseTier: "redistribute-raw-ok",
      redistribution: true,
      origin: "referenced",
      retrievedAt: "2026-06-23T01:05:00.000Z",
      uncertainty: { kind: "none" },
    },
    ...over,
  };
}

function makeEnv(over: Partial<Env> = {}): Env {
  return { KV: createFakeKV(), ...over };
}

test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const env = makeEnv({ ALLOWED_ORIGIN: "https://khazana.pages.dev" });
  const res = await handleRequest(new Request("https://w.dev/event", { method: "OPTIONS" }), env);
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://khazana.pages.dev");
  expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, OPTIONS");
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

interface SummaryResponse {
  deviceId: string;
  eventCount: number;
  firstAt: string | null;
  lastAt: string | null;
  spanDays: number;
  ready: boolean;
  gates: { minEvents: number; minDays: number };
  daily: { date: string; weight: number }[];
  events: EngagementEvent[];
}

function summaryReq(query: string): Request {
  return new Request(`https://w.dev/summary${query}`);
}

function evtKey(ev: EngagementEvent, suffix: string): string {
  return `evt:${ev.deviceId ?? "anon"}:${ev.at}:${suffix}`;
}

describe("GET /summary", () => {
  test("returns 400 when deviceId is missing", async () => {
    const res = await handleRequest(summaryReq(""), makeEnv());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "deviceId required" });
  });

  test("returns 400 when deviceId is empty", async () => {
    const res = await handleRequest(summaryReq("?deviceId="), makeEnv());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "deviceId required" });
  });

  test("unknown device → 200 with empty aggregate and ready false", async () => {
    const res = await handleRequest(summaryReq("?deviceId=ghost"), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as SummaryResponse;
    expect(body).toEqual({
      deviceId: "ghost",
      eventCount: 0,
      firstAt: null,
      lastAt: null,
      spanDays: 0,
      ready: false,
      gates: { minEvents: 20, minDays: 5 },
      daily: [],
      events: [],
    });
  });

  test("aggregates events: counts, span, daily weights, sorted events, gate", async () => {
    // 21 events spanning 6 UTC days for one device → meets both gates.
    const dev = "dev-x";
    const seed: Record<string, string> = {};
    const made: EngagementEvent[] = [];
    let n = 0;
    for (let day = 0; day < 6; day++) {
      const perDay = day === 0 ? 6 : 3; // 6 + 5*3 = 21 events
      for (let i = 0; i < perDay; i++) {
        const at = `2026-06-0${day + 1}T0${i}:00:00.000Z`;
        const ev: EngagementEvent = { itemId: `i${n}`, type: "read", at, deviceId: dev };
        seed[evtKey(ev, `s${n}`)] = JSON.stringify(ev);
        made.push(ev);
        n++;
      }
    }
    const env = makeEnv({ KV: createFakeKV(seed) });
    const res = await handleRequest(summaryReq(`?deviceId=${dev}`), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SummaryResponse;

    expect(body.deviceId).toBe(dev);
    expect(body.eventCount).toBe(21);
    expect(body.firstAt).toBe("2026-06-01T00:00:00.000Z");
    expect(body.lastAt).toBe("2026-06-06T02:00:00.000Z");
    expect(body.spanDays).toBeCloseTo(5 + 2 / 24, 6);

    // events sorted ascending by `at`
    const ats = body.events.map((e) => e.at);
    expect([...ats].sort()).toEqual(ats);
    expect(body.events).toHaveLength(21);

    // daily buckets: one entry per UTC date, sorted asc, weight = sum eventWeight
    expect(body.daily.map((d) => d.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
    ]);
    const perRead = eventWeight({ itemId: "x", type: "read", at: "2026-06-01T00:00:00.000Z" });
    expect(body.daily[0]!.weight).toBeCloseTo(6 * perRead, 6);
    expect(body.daily[1]!.weight).toBeCloseTo(3 * perRead, 6);

    const expectedGate = gateState(21, body.spanDays);
    expect(body.ready).toBe(expectedGate.ready);
    expect(body.ready).toBe(true);
    expect(body.gates).toEqual({ minEvents: 20, minDays: 5 });
  });

  test("few events → spanDays 0 and ready false", async () => {
    const ev: EngagementEvent = {
      itemId: "solo",
      type: "open",
      at: "2026-06-10T00:00:00.000Z",
      deviceId: "dev-solo",
    };
    const env = makeEnv({ KV: createFakeKV({ [evtKey(ev, "s")]: JSON.stringify(ev) }) });
    const res = await handleRequest(summaryReq("?deviceId=dev-solo"), env);
    const body = (await res.json()) as SummaryResponse;
    expect(body.eventCount).toBe(1);
    expect(body.spanDays).toBe(0);
    expect(body.firstAt).toBe("2026-06-10T00:00:00.000Z");
    expect(body.lastAt).toBe("2026-06-10T00:00:00.000Z");
    expect(body.ready).toBe(false);
  });

  test("dwell events contribute eventWeight to daily buckets", async () => {
    const dev = "dev-dwell";
    const ev: EngagementEvent = {
      itemId: "d",
      type: "dwell",
      at: "2026-06-12T00:00:00.000Z",
      dwellMs: 60000,
      deviceId: dev,
    };
    const env = makeEnv({ KV: createFakeKV({ [evtKey(ev, "s")]: JSON.stringify(ev) }) });
    const res = await handleRequest(summaryReq(`?deviceId=${dev}`), env);
    const body = (await res.json()) as SummaryResponse;
    expect(body.daily).toHaveLength(1);
    expect(body.daily[0]!.weight).toBeCloseTo(eventWeight(ev), 6);
  });

  test("caps events to the most-recent 2000", async () => {
    const dev = "dev-many";
    const seed: Record<string, string> = {};
    const total = 2050;
    for (let i = 0; i < total; i++) {
      // distinct minute-resolution timestamps, ascending
      const mm = String(i % 60).padStart(2, "0");
      const hh = String(Math.floor(i / 60) % 24).padStart(2, "0");
      const dd = String((Math.floor(i / 1440) % 28) + 1).padStart(2, "0");
      const at = `2026-07-${dd}T${hh}:${mm}:00.000Z`;
      const ev: EngagementEvent = { itemId: `i${i}`, type: "open", at, deviceId: dev };
      seed[evtKey(ev, `s${i}`)] = JSON.stringify(ev);
    }
    const env = makeEnv({ KV: createFakeKV(seed) });
    const res = await handleRequest(summaryReq(`?deviceId=${dev}`), env);
    const body = (await res.json()) as SummaryResponse;
    expect(body.eventCount).toBe(total); // count reflects all valid events
    expect(body.events).toHaveLength(2000); // events array is capped
    // capped to the LATEST 2000 → first kept is the 51st chronological event
    const ats = body.events.map((e) => e.at);
    expect([...ats].sort()).toEqual(ats);
    expect(body.events[body.events.length - 1]!.at).toBe(body.lastAt);
  });

  test("skips malformed KV values, still 200", async () => {
    const dev = "dev-bad";
    const good: EngagementEvent = {
      itemId: "ok",
      type: "open",
      at: "2026-06-15T00:00:00.000Z",
      deviceId: dev,
    };
    const env = makeEnv({
      KV: createFakeKV({
        [`evt:${dev}:2026-06-15T01:00:00.000Z:bad1`]: "{ not json",
        [`evt:${dev}:2026-06-15T02:00:00.000Z:bad2`]: JSON.stringify({ type: "nope" }),
        [evtKey(good, "ok")]: JSON.stringify(good),
      }),
    });
    const res = await handleRequest(summaryReq(`?deviceId=${dev}`), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SummaryResponse;
    expect(body.eventCount).toBe(1);
    expect(body.events.map((e) => e.itemId)).toEqual(["ok"]);
  });

  test("isolates devices: other deviceId prefixes are excluded", async () => {
    const mine: EngagementEvent = {
      itemId: "mine",
      type: "open",
      at: "2026-06-16T00:00:00.000Z",
      deviceId: "alice",
    };
    const theirs: EngagementEvent = {
      itemId: "theirs",
      type: "open",
      at: "2026-06-16T00:00:00.000Z",
      deviceId: "alice-2", // shares a prefix-substring but NOT the "alice:" boundary
    };
    const env = makeEnv({
      KV: createFakeKV({
        [evtKey(mine, "a")]: JSON.stringify(mine),
        [evtKey(theirs, "b")]: JSON.stringify(theirs),
      }),
    });
    const res = await handleRequest(summaryReq("?deviceId=alice"), env);
    const body = (await res.json()) as SummaryResponse;
    expect(body.events.map((e) => e.itemId)).toEqual(["mine"]);
    expect(body.eventCount).toBe(1);
  });

  test("includes CORS Access-Control-Allow-Origin header on 200", async () => {
    const res = await handleRequest(summaryReq("?deviceId=any"), makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("PUT included in CORS preflight", () => {
  test("OPTIONS preflight advertises PUT alongside GET/POST", async () => {
    const res = await handleRequest(
      new Request("https://w.dev/world/ingest", { method: "OPTIONS" }),
      makeEnv(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, OPTIONS");
  });
});

describe("GET /world/latest", () => {
  test("public read requires no Authorization header", async () => {
    const events = [worldEvent({ id: "a" })];
    const env = makeEnv({
      KV: createFakeKV({
        "world:latest": JSON.stringify({ updatedAt: "2026-06-23T02:00:00.000Z", events }),
      }),
    });
    const res = await handleRequest(new Request("https://w.dev/world/latest"), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updatedAt: string; events: WorldEvent[] };
    expect(body.updatedAt).toBe("2026-06-23T02:00:00.000Z");
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.id).toBe("a");
  });

  test("returns events newest-first by time, capped at 2000", async () => {
    const events: WorldEvent[] = [];
    for (let i = 0; i < 2005; i++) {
      const time = new Date(2026, 0, 1, 0, i).toISOString();
      events.push(worldEvent({ id: `e${i}`, time }));
    }
    const env = makeEnv({
      KV: createFakeKV({
        "world:latest": JSON.stringify({ updatedAt: "2026-06-23T02:00:00.000Z", events }),
      }),
    });
    const res = await handleRequest(new Request("https://w.dev/world/latest"), env);
    const body = (await res.json()) as { updatedAt: string; events: WorldEvent[] };
    expect(body.events).toHaveLength(2000);
    const times = body.events.map((e) => e.time);
    expect([...times].sort().reverse()).toEqual(times);
    // newest of the 2005 generated events (highest minute) must be present
    expect(body.events[0]!.id).toBe("e2004");
  });

  test("empty KV yields an empty rollup, not an error", async () => {
    const res = await handleRequest(new Request("https://w.dev/world/latest"), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updatedAt: string; events: WorldEvent[] };
    expect(body.events).toEqual([]);
  });
});

describe("PUT /world/ingest", () => {
  function ingestReq(body: unknown, token?: string): Request {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    return new Request("https://w.dev/world/ingest", {
      method: "PUT",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  test("returns 503 before checking credentials when WORLD_INGEST_TOKEN is unconfigured", async () => {
    const env = makeEnv();
    const res = await handleRequest(ingestReq({ updatedAt: "x", events: [] }), env);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "WORLD_INGEST_TOKEN not configured" });
  });

  test("returns 401 when Authorization header is missing", async () => {
    const env = makeEnv({ WORLD_INGEST_TOKEN: "secret" });
    const res = await handleRequest(
      new Request("https://w.dev/world/ingest", {
        method: "PUT",
        body: JSON.stringify({ updatedAt: "2026-06-23T00:00:00.000Z", events: [] }),
      }),
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("returns 401 when Authorization token is mismatched", async () => {
    const env = makeEnv({ WORLD_INGEST_TOKEN: "secret" });
    const res = await handleRequest(
      ingestReq({ updatedAt: "2026-06-23T00:00:00.000Z", events: [] }, "wrong"),
      env,
    );
    expect(res.status).toBe(401);
  });

  test("successful authenticated PUT persists the rollup at world:latest and returns 202", async () => {
    const kv = createFakeKV();
    const env = makeEnv({ WORLD_INGEST_TOKEN: "secret", KV: kv });
    const events = [worldEvent({ id: "a" })];
    const res = await handleRequest(
      ingestReq({ updatedAt: "2026-06-23T00:00:00.000Z", events }, "secret"),
      env,
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    const stored = JSON.parse(kv.store.get("world:latest")!);
    expect(stored.updatedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(stored.events).toHaveLength(1);
    expect(stored.events[0].id).toBe("a");
  });

  test("invalid JSON returns 400 and does not overwrite a prior valid value", async () => {
    const prior = { updatedAt: "2026-06-20T00:00:00.000Z", events: [worldEvent({ id: "prior" })] };
    const kv = createFakeKV({ "world:latest": JSON.stringify(prior) });
    const env = makeEnv({ WORLD_INGEST_TOKEN: "secret", KV: kv });
    const res = await handleRequest(ingestReq("{ not json", "secret"), env);
    expect(res.status).toBe(400);
    expect(JSON.parse(kv.store.get("world:latest")!)).toEqual(prior);
  });

  test("schema-invalid rollup returns 400 and does not overwrite a prior valid value", async () => {
    const prior = { updatedAt: "2026-06-20T00:00:00.000Z", events: [worldEvent({ id: "prior" })] };
    const kv = createFakeKV({ "world:latest": JSON.stringify(prior) });
    const env = makeEnv({ WORLD_INGEST_TOKEN: "secret", KV: kv });
    const res = await handleRequest(
      ingestReq({ updatedAt: "2026-06-23T00:00:00.000Z", events: [{ id: "bad" }] }, "secret"),
      env,
    );
    expect(res.status).toBe(400);
    expect(JSON.parse(kv.store.get("world:latest")!)).toEqual(prior);
  });

  test("valid PUT canonicalizes newest-first ordering and caps at 2000 before storing", async () => {
    const kv = createFakeKV();
    const env = makeEnv({ WORLD_INGEST_TOKEN: "secret", KV: kv });
    const events: WorldEvent[] = [];
    for (let i = 0; i < 2005; i++) {
      const time = new Date(2026, 0, 1, 0, i).toISOString();
      events.push(worldEvent({ id: `e${i}`, time }));
    }
    const res = await handleRequest(
      ingestReq({ updatedAt: "2026-06-23T00:00:00.000Z", events }, "secret"),
      env,
    );
    expect(res.status).toBe(202);
    const stored = JSON.parse(kv.store.get("world:latest")!);
    expect(stored.events).toHaveLength(2000);
    expect(stored.events[0].id).toBe("e2004");
  });

  test("existing engagement-event routes still behave the same after world routes are added", async () => {
    const res = await handleRequest(new Request("https://w.dev/health"), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
