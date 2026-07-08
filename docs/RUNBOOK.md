# khazana operations runbook

The copy-paste founder guide to standing up khazana's automation from scratch:
provision accounts + secrets, deploy the Worker, enable Pages, and run the
pipeline. Everything here is **$0 / free-tier**. Follow the sections top to
bottom the first time; after that, use it as a reference.

> Automation lives in four workflows (`.github/workflows/`):
> `pipeline.yml` (daily), `feed-refresh.yml` (every 3h), `scout-discover.yml`
> (weekly), `deploy-worker.yml` (on `apps/worker/**` push). `ci.yml` stays as the
> PR test gate. All four are also **manually runnable** from the Actions tab
> (they declare `workflow_dispatch`).

---

## 0. One-time repo setup

1. **Make the repo public.** Free unlimited Actions minutes + GitHub Pages both
   require (or are effectively gated to) a public repo.
   `Settings → General → Danger Zone → Change visibility → Public`.
2. **Enable GitHub Pages with the Actions source.**
   `Settings → Pages → Build and deployment → Source: GitHub Actions`.
   (Do NOT pick "Deploy from a branch" — the pipeline uploads an artifact via
   `actions/deploy-pages`.)
3. **Allow Actions to push commits.**
   `Settings → Actions → General → Workflow permissions → Read and write
   permissions`. (The daily pipeline commits generated MDX back; the workflows
   also request `contents: write` explicitly.)

### How to add a repo secret or variable

- **Secret:** `Settings → Secrets and variables → Actions → Secrets tab →
  New repository secret`. Name + value, Add.
- **Variable** (non-secret, e.g. a public URL): same page, **Variables tab →
  New repository variable**.

Set names EXACTLY as written below (they are referenced verbatim in the YAML).

---

## 1. Secrets & variables checklist

| Name | Kind | Required? | Used by |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | **Yes** (worker deploy) | `deploy-worker.yml` |
| `CLOUDFLARE_ACCOUNT_ID` | secret | **Yes** (worker deploy) | `deploy-worker.yml` |
| `EXPORT_TOKEN` | secret | **Yes** (events fetch) | Worker + `fetch-events.mts` |
| `GEMINI_API_KEY` | secret | Strongly recommended | curate enrichment (topics/tags) |
| `PODCASTINDEX_API_KEY` | secret | Recommended (podcasts) | podcast discovery source |
| `PODCASTINDEX_API_SECRET` | secret | Recommended (podcasts) | podcast discovery source |
| `GROQ_API_KEY` | secret | Optional | fast Whisper transcription fallback |
| `REDDIT_CLIENT_ID` | secret | Optional | Reddit source OAuth |
| `REDDIT_CLIENT_SECRET` | secret | Optional | Reddit source OAuth |
| `PUBLIC_WORKER_URL` | **variable** | **Yes** (after Worker deploy) | site build + events fetch |
| `PUBLIC_SITE_URL` | **variable** | Recommended | canonical site URL in build |
| `PUBLIC_BASE_PATH` | **variable** | If project Pages | Astro base path |

> **No Claude token anywhere.** The Actions pipeline is a pure-$0 CODE pipeline
> (events → ingest → curate → build → deploy) with **no Claude steps**, so it needs
> no Claude auth. Reads are authored by a **scheduled Claude routine** (see
> "Registering the Reads routine" below) that runs under your **logged-in Claude
> subscription** — GitHub never touches Claude, so there is **no
> `CLAUDE_CODE_OAUTH_TOKEN` and no `claude setup-token`** to manage. (A token would
> only be needed to run Claude *inside CI*, which this design deliberately avoids.)

Each secret's exact creation steps follow.

---

### Registering the Reads routine (authors the Reads)

Reads are **not** authored in GitHub Actions. They're authored by a **Claude
routine** you register in the Claude app: an **Opus orchestrator** (`reads-run`)
that runs on your **Claude Pro/Max subscription pool** (no API billing) and
commits finished MDX to `apps/site/src/content/blog/` + pushes. The daily
pipeline prunes old Reads; `feed-refresh.yml` (every 3h) rebuilds and redeploys,
so newly-committed Reads go live within ~3h.

1. Make sure Claude Code is logged in to your subscription (`claude -p "hello"`
   works). That logged-in session is the only auth the routine uses — no token.
2. Register a **scheduled routine that runs the `reads-run` orchestrator twice
   daily** (min 1-hour interval; 2×/day is well inside the subscription-pool
   routine limits). The orchestrator definition lives at
   `.claude/commands/reads-run.md` — it drives survey → curate → parallel writers →
   independent verifiers → publish, gating on the verify pass before anything is
   committed, then commits the MDX and pushes.

> The routine runs on your subscription, so keep that subscription active. It
> authors and pushes MDX on its own cadence — Actions only builds/deploys what's
> committed.

---

### `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — Worker deploy

1. Sign in at <https://dash.cloudflare.com> (free account).
2. **Account ID:** on the dashboard right sidebar (or any Workers page). Copy it
   → repo secret **`CLOUDFLARE_ACCOUNT_ID`**.
3. **API token:** `My Profile → API Tokens → Create Token →`
   use the **"Edit Cloudflare Workers"** template (grants Workers Scripts + KV
   edit). Create, copy the token → repo secret **`CLOUDFLARE_API_TOKEN`**.

---

### Cloudflare Worker + KV namespace (fills the deploy blocker)

`apps/worker/wrangler.toml` ships with a **placeholder KV id**
(`REPLACE_WITH_KV_NAMESPACE_ID`) — `wrangler deploy` fails until it is real.

From the repo root, authenticated wrangler (needs the two Cloudflare secrets in
your shell env, or run `wrangler login` locally):

```bash
# 1. create the KV namespace (prints an id)
pnpm --filter @khazana/worker exec wrangler kv namespace create KV

# 2. paste the printed id into apps/worker/wrangler.toml, replacing
#    REPLACE_WITH_KV_NAMESPACE_ID, then commit that change.

# 3. set the Worker's EXPORT_TOKEN secret (choose a strong random value;
#    use the SAME value for the EXPORT_TOKEN repo secret in the next section):
pnpm --filter @khazana/worker exec wrangler secret put EXPORT_TOKEN

# 4. first deploy (or let deploy-worker.yml do it on push to apps/worker/**):
#    NOTE: `run deploy` — `pnpm deploy` is a built-in pnpm command; the explicit
#    `run` is required to invoke the package's deploy script.
pnpm --filter @khazana/worker run deploy
```

After the first Pages deploy, lock the Worker's CORS: set `ALLOWED_ORIGIN` in
`wrangler.toml` from `"*"` to your Pages origin, and redeploy.

---

### `EXPORT_TOKEN` — reads behavior events from the Worker

A shared secret guarding `GET /events`. **The same value** must be set in two
places:

1. On the Worker: `wrangler secret put EXPORT_TOKEN` (done in the step above).
2. As the repo secret **`EXPORT_TOKEN`** (used by `scripts/fetch-events.mts`).

If unset, the events fetch is fail-soft: it writes an empty `data/events.json`
and the pipeline continues (the feed just has no engagement signal yet).

---

### `GEMINI_API_KEY` — free-LLM feed enrichment (recommended)

Without it the feed still ingests and ranks, but **loses per-item topics/tags**
(enrichment is a graceful no-op when the key is absent).

1. Go to <https://aistudio.google.com/apikey> (free tier).
2. Create an API key, copy it → repo secret **`GEMINI_API_KEY`**.

(Alternative free tier: NVIDIA NIM — if you use it, adapt the enrichment client
env accordingly.)

---

### `PODCASTINDEX_API_KEY` + `PODCASTINDEX_API_SECRET` — podcast discovery

1. Register a free developer account at <https://api.podcastindex.org>.
2. It issues an API **key** and **secret** → repo secrets
   **`PODCASTINDEX_API_KEY`** and **`PODCASTINDEX_API_SECRET`**.

Optional — omit to skip the podcast source.

---

### `GROQ_API_KEY` — fast Whisper transcription (optional)

Speeds up podcast/audio transcription via Groq's free Whisper endpoint; falls
back to local transformers Whisper if unset.

1. Sign up at <https://console.groq.com> (free).
2. Create an API key → repo secret **`GROQ_API_KEY`**.

---

### `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` — Reddit source (optional)

1. Go to <https://www.reddit.com/prefs/apps> → **create another app…**.
2. Choose **script** type; the client id is under the app name, the secret is
   the `secret` field.
3. Add as repo secrets **`REDDIT_CLIENT_ID`** and **`REDDIT_CLIENT_SECRET`**.

Optional — omit to skip Reddit ingestion.

---

### `PUBLIC_WORKER_URL` (+ `PUBLIC_SITE_URL`, `PUBLIC_BASE_PATH`) — build vars

Non-secret repo **variables**. `PUBLIC_WORKER_URL` is baked into the static
bundle at build time and used by the events fetch.

1. After the Worker deploys, copy its URL (e.g.
   `https://khazana-events.<your-subdomain>.workers.dev`).
2. Add repo **variable** **`PUBLIC_WORKER_URL`** = that origin.
3. **`PUBLIC_SITE_URL`** = your Pages URL (e.g.
   `https://<user>.github.io/<repo>` for a project site, or
   `https://<user>.github.io` for a user site).
4. **`PUBLIC_BASE_PATH`**: set to `/<repo>/` only for a **project** Pages site;
   leave unset (defaults to `/`) for a user/organization site or custom domain.

---

## 2. First-run sequence (do this in order)

1. **Complete §0** (public repo, Pages source = Actions, write permissions).
2. **Add the required secrets** (§1): `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `EXPORT_TOKEN`, and the recommended `GEMINI_API_KEY`.
   (No Claude token needed in Actions — Reads come from the routine; see step 8.)
3. **Create the KV namespace, fill `wrangler.toml`, set the Worker
   `EXPORT_TOKEN`, and deploy the Worker** (§ "Cloudflare Worker + KV").
   Verify: `curl https://<worker-origin>/health` → `{"ok":true}` (or similar
   200). `curl -H "Authorization: Bearer $EXPORT_TOKEN" <worker-origin>/events`
   → a JSON array (empty is fine).
4. **Set `PUBLIC_WORKER_URL`** (and `PUBLIC_SITE_URL` / `PUBLIC_BASE_PATH`) as
   repo variables from the deployed Worker + Pages URLs (§ build vars).
5. **Run the pipeline manually:** `Actions → pipeline → Run workflow`
   (`workflow_dispatch`). It's a pure-$0 code pipeline — events → ingest+curate →
   record build day → prune → build → deploy, **no author step**. Watch the run:
   - `Fetch engagement events` should log a count (or the fail-soft empty note).
   - `Ingest + curate` refreshes the feed data.
   - `Deploy to GitHub Pages` publishes the site.
   The site ships with the Reads already committed in `apps/site/src/content/blog/`.
6. **Confirm the site is live** at `PUBLIC_SITE_URL`, then **lock the Worker
   CORS** (`ALLOWED_ORIGIN` = Pages origin) and redeploy the Worker.
7. **Let the crons take over.** `pipeline.yml` runs daily (06:00 UTC),
   `feed-refresh.yml` every 3h, `scout-discover.yml` weekly (Mon 05:00 UTC).
   Adjust the `cron:` lines to taste.
8. **Register the Reads routine** (§ "Registering the Reads routine"): the
   `reads-run` Opus orchestrator, 2×/day, on your subscription. It authors NEW
   Reads on its own cadence and commits+pushes the MDX; `feed-refresh.yml` picks
   them up and they go live within ~3h — independent of the daily pipeline.

---

## 3. Everyday operations

- **Trigger any workflow by hand:** Actions tab → pick the workflow → Run
  workflow. `pipeline` accepts an optional `limit` input (per-source item cap).
- **Change source registry:** edit `data/sources.seed.json` (validated by
  `RegistrySchema`) or let `scout-discover.yml` grow it weekly.
- **Retention:** the pipeline keeps `RETENTION_DAYS` (currently 14, set in
  `pipeline.yml`'s job env) days of Reads; older ones are pruned and the
  removal is committed back.
- **Reads cadence:** new Reads come from the Claude routine (2×/day), not the
  pipeline. It commits MDX; `feed-refresh.yml` publishes it within ~3h.
- **Costs stay $0:** public-repo Actions minutes are free; Pages + Worker + KV
  are free tier; the Reads routine runs on your Claude subscription (not Actions);
  enrichment/transcription use free LLM tiers.

---

## 4. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Worker deploy fails with a KV error | `wrangler.toml` still has the placeholder id | Run the KV create step, paste the real id, commit |
| `GET /events` returns 503 | `EXPORT_TOKEN` not set on the Worker | `wrangler secret put EXPORT_TOKEN` |
| Events always empty in the feed | `PUBLIC_WORKER_URL` or `EXPORT_TOKEN` repo secret missing | Set both; the fetch is fail-soft so the run won't error, just no signal |
| Feed has no topics/tags | `GEMINI_API_KEY` unset | Add the key (enrichment is a no-op without it) |
| No new Reads appearing | Reads routine not firing / not authenticated | Check the routine in the Claude app; confirm your subscription is active (`claude -p "hello"`); the routine commits MDX that `feed-refresh.yml` publishes within ~3h |
| Pages deploy 404 / wrong base | `PUBLIC_BASE_PATH` mismatch for a project site | Set `PUBLIC_BASE_PATH=/<repo>/` (project) or unset (user site) |
| Daily commit retriggers CI | missing skip tag | The commit uses `[skip ci]`; ensure CI honors it |
