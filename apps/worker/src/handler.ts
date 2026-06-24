import { EngagementEventSchema, type EngagementEvent } from "@khazana/core";
import type { Env } from "./env.js";

export function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  if (env.EXPORT_TOKEN) {
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${env.EXPORT_TOKEN}`) {
      return json({ error: "unauthorized" }, 401, env);
    }
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
  return json({ error: "not found" }, 404, env);
}
