import { z } from "zod";
import {
  EngagementEventSchema,
  eventWeight,
  gateState,
  WorldEventSchema,
  type EngagementEvent,
  type WorldEvent,
} from "@khazana/core";
import type { Env } from "./env.js";

const MS_PER_DAY = 86_400_000;
/** Cap the per-device event payload so the response stays small for static clients. */
const MAX_SUMMARY_EVENTS = 2000;
/** Cap the mirrored world-event rollup so the KV value + response stay small. */
const MAX_WORLD_EVENTS = 2000;
/** The single, fixed KV key the world-event mirror lives under. No history is kept. */
const WORLD_LATEST_KEY = "world:latest";

const WorldRollupSchema = z.object({
  updatedAt: z.string().datetime(),
  events: z.array(WorldEventSchema),
});
type WorldRollup = z.infer<typeof WorldRollupSchema>;

/** Sort newest-first by parsed event time (not lexicographic — ISO strings with
 *  mixed fractional-second precision don't sort correctly as plain strings)
 *  and cap at MAX_WORLD_EVENTS. */
function canonicalizeWorldEvents(events: WorldEvent[]): WorldEvent[] {
  const sorted = [...events].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return sorted.slice(0, MAX_WORLD_EVENTS);
}

export function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env) },
  });
}

async function handleEvent(req: Request, env: Env): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400, env);
  }
  const parsed = EngagementEventSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid event" }, 400, env);
  }
  const ev = parsed.data;
  const key = `evt:${ev.deviceId ?? "anon"}:${ev.at}:${crypto.randomUUID()}`;
  await env.KV.put(key, JSON.stringify(ev));
  return json({ ok: true }, 202, env);
}

async function handleEvents(req: Request, env: Env): Promise<Response> {
  // Fail-secure: export requires EXPORT_TOKEN to be configured.
  if (!env.EXPORT_TOKEN) {
    return json({ error: "EXPORT_TOKEN not configured" }, 503, env);
  }
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${env.EXPORT_TOKEN}`) {
    return json({ error: "unauthorized" }, 401, env);
  }
  const since = new URL(req.url).searchParams.get("since");
  const { keys } = await env.KV.list({ prefix: "evt:" });
  const events: EngagementEvent[] = [];
  for (const { name } of keys) {
    const value = await env.KV.get(name);
    if (!value) continue;
    let candidate: unknown;
    try {
      candidate = JSON.parse(value);
    } catch {
      continue;
    }
    const parsed = EngagementEventSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (since && parsed.data.at < since) continue;
    events.push(parsed.data);
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return json(events, 200, env);
}

/**
 * Public, read-only per-device engagement summary. The Worker stores only raw
 * events (no feed), so it returns the device's events + simple counts/gates and
 * lets the static client compute topic/format affinity by joining to feed
 * metadata it ships. Never throws on bad data: malformed rows are skipped and an
 * unknown device yields an empty, not-ready summary (still 200).
 */
async function handleSummary(req: Request, env: Env): Promise<Response> {
  const deviceId = new URL(req.url).searchParams.get("deviceId");
  if (!deviceId) {
    return json({ error: "deviceId required" }, 400, env);
  }

  const { keys } = await env.KV.list({ prefix: `evt:${deviceId}:` });
  const events: EngagementEvent[] = [];
  for (const { name } of keys) {
    const value = await env.KV.get(name);
    if (!value) continue;
    let candidate: unknown;
    try {
      candidate = JSON.parse(value);
    } catch {
      continue;
    }
    const parsed = EngagementEventSchema.safeParse(candidate);
    if (!parsed.success) continue;
    events.push(parsed.data);
  }

  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const eventCount = events.length;
  const firstAt = eventCount > 0 ? events[0]!.at : null;
  const lastAt = eventCount > 0 ? events[eventCount - 1]!.at : null;
  const spanDays =
    eventCount >= 2 && firstAt && lastAt
      ? (Date.parse(lastAt) - Date.parse(firstAt)) / MS_PER_DAY
      : 0;

  // Per-UTC-date summed engagement weight, sorted ascending by date.
  const dailyWeights = new Map<string, number>();
  for (const ev of events) {
    const date = ev.at.slice(0, 10);
    dailyWeights.set(date, (dailyWeights.get(date) ?? 0) + eventWeight(ev));
  }
  const daily = [...dailyWeights.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, weight]) => ({ date, weight }));

  const gate = gateState(eventCount, spanDays);

  // Keep the latest events when over the cap (events are already sorted asc).
  const cappedEvents =
    events.length > MAX_SUMMARY_EVENTS ? events.slice(-MAX_SUMMARY_EVENTS) : events;

  return json(
    {
      deviceId,
      eventCount,
      firstAt,
      lastAt,
      spanDays,
      ready: gate.ready,
      gates: { minEvents: gate.minEvents, minDays: gate.minDays },
      daily,
      events: cappedEvents,
    },
    200,
    env,
  );
}

/**
 * Public, read-only mirror of the private-repo world-event rollup. Reads the
 * single fixed `world:latest` key; never lists or exposes anything else.
 */
async function handleWorldLatest(env: Env): Promise<Response> {
  const value = await env.KV.get(WORLD_LATEST_KEY);
  if (!value) {
    return json({ updatedAt: new Date(0).toISOString(), events: [] }, 200, env);
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return json({ updatedAt: new Date(0).toISOString(), events: [] }, 200, env);
  }
  const parsed = WorldRollupSchema.safeParse(candidate);
  if (!parsed.success) {
    return json({ updatedAt: new Date(0).toISOString(), events: [] }, 200, env);
  }
  const rollup: WorldRollup = parsed.data;
  return json(
    { updatedAt: rollup.updatedAt, events: canonicalizeWorldEvents(rollup.events) },
    200,
    env,
  );
}

/**
 * Fast-lane Action-only write path. Never a browser-write endpoint: requires
 * the exact `WORLD_INGEST_TOKEN` bearer credential, fails secure (503) before
 * ever comparing credentials (401) if the secret is unconfigured, and leaves
 * the previously stored rollup untouched on any invalid payload (400).
 */
async function handleWorldIngest(req: Request, env: Env): Promise<Response> {
  if (!env.WORLD_INGEST_TOKEN) {
    return json({ error: "WORLD_INGEST_TOKEN not configured" }, 503, env);
  }
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${env.WORLD_INGEST_TOKEN}`) {
    return json({ error: "unauthorized" }, 401, env);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400, env);
  }
  const parsed = WorldRollupSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid world event rollup" }, 400, env);
  }

  const rollup = parsed.data;
  const canonical: WorldRollup = {
    updatedAt: rollup.updatedAt,
    events: canonicalizeWorldEvents(rollup.events),
  };
  await env.KV.put(WORLD_LATEST_KEY, JSON.stringify(canonical));
  return json({ ok: true }, 202, env);
}

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  const method = req.method;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(env) });
  }
  if (method === "GET" && pathname === "/health") {
    return json({ ok: true }, 200, env);
  }
  if (method === "POST" && pathname === "/event") {
    return handleEvent(req, env);
  }
  if (method === "GET" && pathname === "/events") {
    return handleEvents(req, env);
  }
  if (method === "GET" && pathname === "/summary") {
    return handleSummary(req, env);
  }
  if (method === "GET" && pathname === "/world/latest") {
    return handleWorldLatest(env);
  }
  if (method === "PUT" && pathname === "/world/ingest") {
    return handleWorldIngest(req, env);
  }
  return json({ error: "not found" }, 404, env);
}
