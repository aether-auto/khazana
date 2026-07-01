/**
 * Fetch the engagement-events export from the Cloudflare Worker into
 * `data/events.json` — the one input the curate pipeline reads for behavior
 * signal (`packages/curate/src/io.ts:26` → `readEvents`) but which nothing
 * produced before P9. This is the orchestration glue the audit flagged as a
 * blocker (`.superpowers/sdd/audit-orchestration.md` §B).
 *
 * Contract with the Worker (`apps/worker/src/handler.ts:45` `handleEvents`):
 *   GET  $PUBLIC_WORKER_URL/events           (optional ?since=ISO)
 *   Header: Authorization: Bearer $EXPORT_TOKEN
 *   200 → JSON array of EngagementEvent
 *   503 → EXPORT_TOKEN not configured on the Worker
 *   401 → bad/absent bearer
 *
 * FAIL-SOFT BY DESIGN: the daily pipeline must not break before the Worker is
 * deployed or a token provisioned. If PUBLIC_WORKER_URL or EXPORT_TOKEN is
 * absent, or the fetch fails for any reason, we write `[]` and exit 0 so curate
 * simply gets empty engagement (it still ranks + clusters). Only genuinely
 * malformed payloads are dropped item-by-item; a valid-but-empty export is
 * indistinguishable from "no signal yet", which is fine.
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/fetch-events.mts
 *
 * Environment:
 *   PUBLIC_WORKER_URL   Worker origin, e.g. https://khazana-events.<sub>.workers.dev
 *   EXPORT_TOKEN        shared secret (same value set via `wrangler secret put`)
 *   EVENTS_SINCE        optional ISO cutoff → forwarded as ?since=
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Import from the package SOURCE by relative path (not the "@khazana/core"
// specifier) — root-level scripts run via `tsx` can't resolve the workspace
// package name, so this matches real-ingest.mts / recurate.mts convention.
import { EngagementEventSchema, type EngagementEvent } from "../packages/core/src/index.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
// curate reads exactly this path (packages/curate/src/io.ts:26 → data/events.json).
const eventsPath = join(repoRoot, "data", "events.json");

/**
 * Pure transform: keep only entries that parse as an EngagementEvent, drop the
 * rest. Accepts any parsed JSON value; a non-array yields []. This is the only
 * logic worth unit-testing — everything else is network/FS IO.
 */
export function toValidEvents(parsed: unknown): EngagementEvent[] {
  if (!Array.isArray(parsed)) return [];
  const out: EngagementEvent[] = [];
  for (const candidate of parsed) {
    const res = EngagementEventSchema.safeParse(candidate);
    if (res.success) out.push(res.data);
  }
  return out;
}

/** Serialize events to the on-disk shape curate expects (pretty JSON + trailing NL). */
export function serializeEvents(events: EngagementEvent[]): string {
  return JSON.stringify(events, null, 2) + "\n";
}

/** Write `events` to `path`, creating parent dirs. Never throws on a missing dir. */
function writeEvents(path: string, events: EngagementEvent[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeEvents(events), "utf8");
}

async function main(): Promise<void> {
  const base = process.env.PUBLIC_WORKER_URL?.trim();
  const token = process.env.EXPORT_TOKEN?.trim();
  const since = process.env.EVENTS_SINCE?.trim();

  // Pre-flight: no Worker / no token ⇒ write empty and continue (fail-soft).
  if (!base || !token) {
    const why = !base ? "PUBLIC_WORKER_URL unset" : "EXPORT_TOKEN unset";
    console.warn(`[fetch-events] ${why} — writing empty data/events.json and continuing.`);
    writeEvents(eventsPath, []);
    return;
  }

  const url = new URL("/events", base);
  if (since) url.searchParams.set("since", since);

  let events: EngagementEvent[] = [];
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.warn(
        `[fetch-events] Worker returned ${res.status} ${res.statusText} — writing empty events and continuing.`,
      );
      writeEvents(eventsPath, []);
      return;
    }
    const parsed: unknown = await res.json();
    events = toValidEvents(parsed);
  } catch (err) {
    console.warn(
      `[fetch-events] fetch failed (${(err as Error).message}) — writing empty events and continuing.`,
    );
    writeEvents(eventsPath, []);
    return;
  }

  writeEvents(eventsPath, events);
  console.log(`[fetch-events] wrote ${eventsPath} — ${events.length} event(s) from ${url.origin}.`);
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  main().catch((err) => {
    // Even a truly unexpected failure must not break the pipeline: best-effort
    // empty file, then exit 0.
    console.warn(`[fetch-events] unexpected error (${(err as Error).message}) — writing empty events.`);
    try {
      writeEvents(eventsPath, []);
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
}
