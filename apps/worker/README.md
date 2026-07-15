# @khazana/worker — behavior store (Cloudflare Worker + KV)

A tiny Worker that collects engagement beacons from the static site and exports
them for the curate pipeline. The only always-on piece of khazana; runs on the
Cloudflare Workers + KV **free tier**. Deployed with one CLI tool: Wrangler.

## Routes

- `OPTIONS *` → `204` (CORS preflight).
- `POST /event` → validates the body against `EngagementEventSchema` from
  `@khazana/core`; stores it in KV under `evt:<deviceId|anon>:<at>:<uuid>`;
  returns `202`. Invalid bodies → `400`.
- `GET /events[?since=<ISO>]` → returns stored `EngagementEvent[]` sorted by `at`
  ascending. Requires `Authorization: Bearer <EXPORT_TOKEN>`; returns `503` until
  `EXPORT_TOKEN` is set (run `wrangler secret put EXPORT_TOKEN`). The nightly
  GitHub Action fetches this and writes `data/events.json` for curate.
- `GET /health` → `200 { ok: true }`.
- `GET /world/latest` → public, no authorization required. Returns the mirrored
  `{ updatedAt: string, events: WorldEvent[] }` rollup from KV key
  `world:latest`, capped at 2,000 events and sorted newest-first by
  `WorldEvent.time`. This is a read-only enhancement for the Atlas Globe over
  its committed static fallback; it never accepts client writes.
- `PUT /world/ingest` → Action-only write path, never a browser-write endpoint.
  Requires `Authorization: Bearer <WORLD_INGEST_TOKEN>`; returns `503` until
  `WORLD_INGEST_TOKEN` is set (run
  `pnpm dlx wrangler secret put WORLD_INGEST_TOKEN`), then `401` for a missing
  or mismatched token. Validates the body against the canonical `WorldEvent`
  contract from `@khazana/core`; invalid JSON or an invalid rollup returns
  `400` and leaves the previously stored `world:latest` value untouched. A
  valid payload is canonicalized (capped at 2,000, sorted newest-first) and
  stored only under `world:latest`, returning `202`. This is the
  `world-refresh.yml` Action's mirror step after it commits the full rollup to
  the private `khazana-world-data` repository — the Worker never holds full
  event history.

## One-time setup (founder runs these)

A free Cloudflare account is required. From `apps/worker/`:

1. Create the KV namespace and copy the printed id into `wrangler.toml`
   (`[[kv_namespaces]]` → `id`):
   ```bash
   pnpm dlx wrangler kv namespace create KV
   ```
2. Set the export token secret (used by the nightly Action to fetch `/events`):
   ```bash
   pnpm dlx wrangler secret put EXPORT_TOKEN
   ```
2a. Set the world-ingest token secret (used only by the `world-refresh.yml`
   Action to write `PUT /world/ingest`; never given to the browser client):
   ```bash
   pnpm dlx wrangler secret put WORLD_INGEST_TOKEN
   ```
3. Deploy:
   ```bash
   pnpm dlx wrangler deploy
   ```

After P5 is deployed, edit `[vars] ALLOWED_ORIGIN` in `wrangler.toml` to the
Cloudflare Pages origin and re-run `pnpm dlx wrangler deploy` to lock CORS down.

## Local development

```bash
pnpm dlx wrangler dev
```

KV + Workers free tiers are ample for single-founder usage; there is no
recurring cost and no deploy happens in CI.
