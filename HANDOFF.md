# khazana — Agent Handoff

> You are taking over as **cofounder/engineer** on khazana. This handoff is **forward-looking** —
> it captures current live state + what's worth doing next. The full build record lives in
> `.superpowers/sdd/progress.md` (append-only) and git history. Read §1 (orient) + the MUST-READs,
> then §3 (what's open) and §4 (carry-forwards).
>
> **The one-line state (2026-07-06):** khazana is **LIVE, deployed, and self-sustaining.** Public
> site behind a password gate, Cloudflare Worker/KV live, all crons + the twice-daily Reads routine
> running on their own. The pipeline is **self-healing** — a single bad Read can no longer stop the
> daily fresh data. What remains is **monitoring, tuning, and enhancement**, not go-live.

---

## 1. Orient (cold-start essentials)

**khazana** = a personal, self-curating **treasury of the world's best signal** (Curate) + a daily-
growing collection of **gorgeous, interactive, grounded AI-authored blogs ("Reads")** in the
founder's voice (Create). **$0 recurring**, static + serverless only. Aesthetic: terminal ×
NYT-editorial; reading comfort sacred; UI/feel is paramount (award-level, alive, not "AI-template").

**Live surfaces (all $0):**
- **Site:** https://aether-auto.github.io/khazana/ — GitHub Pages, deployed from Actions.
  **Password-gated** (client-side PBKDF2 gate; passphrase currently `khazana-unknown-passphrase`,
  set via the `PUBLIC_SITE_GATE_HASH` repo *variable* — change with `scripts/site-gate-hash.mts`).
- **Repo:** **`aether-auto/khazana`** (public), branch **`main`**. Commit at clean milestones; end
  messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Worker:** `https://khazana-events.aether-auto.workers.dev` (behavior store; `/health` → ok,
  `/events` guarded by `EXPORT_TOKEN`, CORS locked to the Pages origin). KV namespace id is filled
  in `apps/worker/wrangler.toml`.
- **Automation (GitHub Actions, all $0):** `feed-refresh.yml` (every 3h — ingest→curate→build→
  deploy), `pipeline.yml` (daily 06:00 UTC — +retention prune +feed-archive merge +commit),
  `scout-discover.yml` (weekly Mon), `deploy-worker.yml` (on `apps/worker/**`), `ci.yml` (push/PR —
  install→typecheck→test→**strict site build**). No Claude/LLM steps in Actions.
- **Reads routine (the daily Create engine):** a **scheduled Claude cloud routine** named
  `khazana-reads-run` (id `trig_01DKAdFFguhLG9kW4p6ERZE1`), **2×/day** (`0 11,23 * * *` UTC =
  6am/6pm America/Chicago), **Opus orchestrator** cloning the repo, running `.claude/commands/
  reads-run.md`, committing new Reads + pushing. Runs on the founder's **subscription** — NO token.
  Manage at https://claude.ai/code/routines/trig_01DKAdFFguhLG9kW4p6ERZE1 (or `/schedule`).

**Green baseline:** `pnpm -r typecheck` (0 errors), `pnpm test` (~1950 tests), the site build
(≈356 pages). CI enforces all three on every push.

**Monorepo:** `packages/{core,ingest,curate,generate,scout}` + `apps/{site,worker}`. `core` holds
all zod contracts + vocab (Channels, SourceType, FeedItem.kind, **Formats** — 7 incl. `theater`).

**Operating rules (HONOR THEM):**
- **Subagents do the building** — orchestrate + decide, don't burn context on code/tests.
- **⚠️ LAPTOP SAFETY (hard rule — memory `laptop-safety-and-cloud-verify`):** NEVER run concurrent
  heavy LOCAL work (`build`/`test`/`tsc`/headless-Chrome) — subagents' Bash runs on the founder's
  Mac too, so **dispatch heavy subagents ONE AT A TIME**, never in parallel. **Verify via cloud CI/
  feed-refresh** (push + `gh run watch` = zero Mac load), not local builds. At most one lightweight
  watcher; no retry/curl loops. Parallel local builds crashed the Mac twice.
- **Independent verify beats self-verify** — always split (fresh-context checkers catch real errors).
- **run ingestion/network scripts YOURSELF** (real-ingest is destructive + degrades without keys).
- Don't present big option-menus — exercise judgment, show built artifacts, recommend.

## 2. MUST-READ before doing anything
1. **`.superpowers/sdd/progress.md`** — the ledger (append your work here).
2. **This file.** 3. Founder memories (`~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/
   memory/MEMORY.md` + the linked files — esp. `laptop-safety-and-cloud-verify`,
   `operating-mode-subagents`, `reads-generation-orchestration`, `ui-feel-and-animation`).
4. `docs/superpowers/specs/2026-06-23-khazana-design.md`, `CLAUDE.md`, `STYLE.md`,
   **`docs/RUNBOOK.md`** (ops runbook — provisioning, all secrets/vars already set).

---

## 3. What's OPEN (no longer go-live — tuning + enhancement)

Everything from the original go-live plan (routine, cloud pipeline, review, deploy) is **DONE and
live**. Current open threads:

1. **Reads routine volume/tuning.** The routine authored 2 Reads one day, 1 the next — valid
   (quality gates volume) but the founder may want more consistent volume or steering. It's a
   **prompt tweak** to `.claude/commands/reads-run.md` / the survey rubric — do on request.
2. **Feed archive fills forward.** `data/feed/archive.json` was seeded day-0 with 177 items spanning
   only ~6 days (all the current snapshot reaches — sources don't serve 2-week-old items). It grows
   to the full rolling 2 weeks as the **daily pipeline** merges each day. Nothing to do; just know
   it's not instantly 14 days deep.
3. **BC-date elapsed-gap cosmetic.** The Timeline's "+X" gap plate is approximate for **BC** reads
   (Cannae) when a step crosses a year boundary (shows e.g. "+2 YR" for ~6 months) — BC years are
   stored as positive ISO years. CE reads are exact. A real fix needs BC-aware date parsing (negative
   years) in the reads/parse layer — a contained but non-trivial change.
4. **Midway's *second* timeline** ("Pacific War after Midway") is authored slightly out of
   chronological order (a 1943 entry before a Dec-1942 one). The Timeline now honors authored order,
   so it renders as written — reorder the events in the MDX if strict chronology is wanted.
5. **Idea backlog** (EXPLORER.md): spaced re-surfacing of archived gems, RSS-out/digest, taste
   dashboard tuning, more formats (Thread/Profile/Atlas/Debate/Annotated), PWA/offline.

## 4. Carry-forwards / known issues (none blocking)
- **Self-healing build:** `scripts/build-resilient.mts` wraps the deploy build — a Read that fails
  to render is **quarantined** (moved to `apps/site/.quarantine/`, ephemeral) and the rest ships,
  with `MAX_QUARANTINE=3` aborting LOUDLY on a systemic bug. Watch feed-refresh/pipeline run logs for
  a `::warning:: N Read(s) quarantined` — that means a committed Read is broken and needs fixing
  (its source stays in git; CI's strict build also flags it red). This is the safety net that keeps
  daily fresh data flowing.
- **Routine can ship broken Reads** — mitigated three ways now: `generate verify` MDX-lints syntax,
  the routine build-gates before commit (Stage 5 of `reads-run.md`), and the resilient build
  quarantines any that slip through. Past breakers were quotes-in-JSX-attributes and stray `{…}`
  LaTeX braces in prose (parsed as JS) and wrong component prop shapes — the writer agent now warns
  on these.
- **GitHub Pages deploy flakiness:** intermittent "Deployment failed, try again later." Mitigated:
  `deploy-pages` `error_count: 60`/`timeout: 900000`, and both build workflows share the
  `khazana-pages-deploy` concurrency group (`cancel-in-progress: false`) so runs never race the
  single deploy slot or get killed mid-publish.
- **Data gaps (affect scoring, not correctness):** curate clustering is near-atomic; `data/
  taste.json` builds from live Worker events over time; `FeedItem.entities` are sparse (topics carry
  novelty/taste). The feed archive stores teasers only (no `body`) to stay small/committable.
- **Ingestion:** feed-refresh + pipeline run with `EXTRACT=0` (full-text extraction over the whole
  registry didn't finish in the runner budget; the Feed uses the list + Gemini topics, and the Reads
  routine's researcher does its own deep web research). ⚠️ A manual full re-ingest is DESTRUCTIVE +
  degrades without `GEMINI_API_KEY` — run it YOURSELF, never via a subagent.

## 5. How to run / verify
```bash
pnpm install
pnpm -r typecheck                              # 0 errors
pnpm test                                      # ~1950 tests
pnpm tsx scripts/build-resilient.mts           # resilient site build (quarantines a bad Read)
pnpm --filter @khazana/site build              # strict build (what CI runs)
```
**Prefer CLOUD verification** (per the laptop rule): `git push` then
`gh run watch <id> --repo aether-auto/khazana` (CI runs typecheck+test+strict build); dispatch a
deploy with `gh workflow run feed-refresh.yml`. Local builds only when necessary, ONE at a time.
Browser-verify sparingly (playwright-core + system Chrome, gate-bypass via
`localStorage.setItem('khz-gate-v1','1')`), one instance at a time.

## 6. Git / process
- Branch **`main`** (remote `aether-auto/khazana`, public). Append meaningful work to
  `.superpowers/sdd/progress.md`; keep this HANDOFF current.
- **Committed:** Reads MDX under `apps/site/src/content/blog/`, and now **`data/feed/archive.json`**
  (the rolling feed archive — a gitignore exception; `curated.json`/`raw.json` stay ignored).
- Gitignored (local/ephemeral): `data/feed/*` (except archive.json), `data/sources.json`,
  `data/scout/`, `data/generation/`, `apps/site/.quarantine/`, `.superpowers/`. Package manager is
  **pnpm**. New runtime deps must be `$0`/offline-safe.
- **Secrets/vars are all provisioned** in the repo (Cloudflare, EXPORT_TOKEN, GEMINI, PUBLIC_* vars,
  gate hash). `CLAUDE_CODE_OAUTH_TOKEN` is NOT an Actions secret — the routine runs on the
  subscription. See `docs/RUNBOOK.md`.
