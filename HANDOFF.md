# khazana — Agent Handoff

> You are taking over as **cofounder/engineer** on khazana. This handoff is **forward-looking** —
> it captures current live state + what's worth doing next. The full build record lives in
> `.superpowers/sdd/progress.md` (append-only) and git history. Read §1 (orient) + the MUST-READs,
> then §3 (what's open) and §4 (carry-forwards).
>
> **The one-line state (2026-07-07):** khazana is **LIVE, deployed, and self-sustaining** on `main`.
> Public site behind a password gate, Cloudflare Worker/KV live, all crons + the twice-daily Reads
> routine running on their own. The pipeline is **self-healing** — a single bad Read can no longer
> stop the daily fresh data. What remains is **monitoring, tuning, and enhancement**, not go-live.
> This session's pipeline hardening, YouTube-ingestion restore, and a mid-session undici crash fix
> are all **done and verified end-to-end** (green `feed-refresh` CI + a real local pipeline run that
> produced 8 grounded YouTube items) on branch **`improve/feed-reads-components`** as **PR #3 to
> `main`** — the only open item is founder merge (§3 item 1).

**Latest session (2026-07-08) — Atlas plan v2: founder interview → 8-spec family.** A deep
founder interview produced a **binding decision record**
(`docs/superpowers/specs/2026-07-07-atlas-founder-decisions.md`, D1–D12) that supersedes the
original five Atlas specs wherever they conflict: **private world-data repo** (`khazana-world-data`;
ingest compute stays in the public repo, pushes via token), **maximal density mandate** ("put in
literally everything" — all 16 Extras greenlit, GeM/CPPP scraper pulled forward), the Ledger
re-conceived as a data-driven **Country Report** plus a new **Indicator Browser** (zero AI prose
anywhere in the world-data path), event card = spectrum-diverse top-N + **corroborated core**, a
full **war mode**, and **two faces with a designed switch transition** (D11). A 5-agent research
sweep (dossiers under `.superpowers/research/atlas/`, gitignored) verified access/format/license
for every newly named source. All five 07-07 specs amended in place, and three NEW specs written:
**Conflict Theaters** (spec 6 — curated theater registry, `geometryStatus` license posture;
DeepState/ISW front-line geometry is PERMISSION-PENDING with a Wikipedia CC BY-SA fallback),
**Government Structure** (spec 7 — data-driven PowerFlow diagrams; the country-onboarding
mechanism), **Two Faces** (spec 8 — study/atlas atmospheres via server-stamped `data-face`,
cross-document view-transition switch). The Atlas family is now **specs 1–8**, all on
`improve/feed-reads-components` (PR #3). Founder model policy for agent work: **Sonnet 5
subagents, Opus only for complex work** (D12). Next Atlas steps: implementation planning
(writing-plans) after PR #3 merges, and the DeepState/ISW permission emails (founder action,
tracked in spec 6).

**Prior session (2026-07-07) — pipeline hardening, YouTube restore, Atlas plan.** One Opus
orchestrator + serialized Sonnet-5 subagents across four workstreams, all committed to
`improve/feed-reads-components` (PR #3, unmerged):
- **WS1 pipeline reliability (done, committed).** Confirmed the zero-publish root cause: the Reads
  routine runs in a fresh clone where gitignored `data/feed/curated.json` is absent, so
  `loadCurated`/`readCurated` returned `[]` and the feed-grounded ideation lane was dead every run —
  now falls back to committed `data/feed/archive.json` (verified `150` of `281` feed items vs the
  old `0`) (`9d1b514`). Also: bare `generate verify` now requires `--all` for whole-corpus scope, so
  it can't un-publish a live Read off an empty slate (`ba70592`); rebase+retry added on all three
  commit-back paths (`pipeline.yml`, `scout-discover.yml`, `reads-run.md`) so push races can't
  silently drop a Read (`48b7013`); per-run telemetry ledger `data/reads-run-log.jsonl` (`ca66a81`);
  failure-notifier tracking issues on `pipeline.yml`/`feed-refresh.yml` (`c7f5e00`); non-blocking
  quarantine-escalation issues (`8539fe6`); headless-permission ops note (`db281e1`); P2 doc
  corrections incl. RETENTION_DAYS 14 + verify-gate description (`65658fd`).
- **Known-issues cleanup (done, committed) — all fixed.** `isReprobeEligible` absent-status bug
  fixed — legacy entries with a missing `status` field are now correctly treated as re-probe-eligible
  (`9d3c306`). Source-health reconcile + committed persistence wired into `real-ingest.mts`
  (`3c9e390`) — **auto-disable is now LIVE**: 3 consecutive PERMANENT failures (404/410/DNS/
  not-a-feed — never transient 429/5xx/timeout) disables a source; 7-day bounded re-probe; persisted
  via a committed `data/source-health.json` (committed by `pipeline.yml` daily; `feed-refresh.yml`
  reads it but doesn't commit, so disable latency is ~3 days, by design). Groq-absence one-time
  warning added so the Whisper tier-1 fallback gap is visible instead of silent (`b91a602`). Stale
  local `data/sources.json` (disconnected from production) removed — gitignored, no commit.
- **WS2 YouTube transcripts (done, CI-verified).** CI was installing yt-dlp as a bare binary with no
  JS runtime → silent degraded mode since yt-dlp 2025.11.12. Fixed via
  `pip install "yt-dlp[default,curl-cffi]"` + Deno + `YT_DLP_IMPERSONATE=1` in both workflows;
  confirmed green on a live `feed-refresh` dispatch (`975a2a2`).
- **WS2b YouTube discovery (done — RESOLVED & VERIFIED end-to-end) — the real "no YouTube data"
  bug.** Root-caused: the `videos.xml?channel_id=` Atom endpoint now 404s for ~90-95% of channels;
  `archive.json` had 0/281 youtube items, because all 208 youtube sources were discovered via the
  generic RSS fetcher against that dead endpoint (`build-source.ts`). Fixed by routing youtube
  discovery through the now-healthy yt-dlp path instead: new
  `packages/ingest/src/youtube-discovery.ts` + a youtube branch in `build-source.ts`, gated by
  `isDirectYouTubeEnabled() && isYtDlpAvailable()`, paced through the shared yt-dlp gate, RSS
  fallback preserved (`7d2dccf`). **VERIFIED** two ways: a green `feed-refresh` CI run (722/722
  sources, no crash) AND a local end-to-end run of the real `runIngest → enrichContent → runCurate`
  pipeline that produced 8 real YouTube `FeedItem`s (with fetched transcripts) surviving into curated
  output, 0 dropped.
- **WS2c undici crash fix (done, committed) — a latent bug the discovery fix exposed.** ~1000 new
  YouTube items woke a previously-dormant fetch-heavy transcript fallback chain (watch-page + proxy
  undici fetches); the sustained burst tripped Node's built-in undici HTTP-parser `AssertionError`,
  an UNCAUGHT async throw that crashed the entire ingest process (all 720 sources lost). Fixed two
  ways: (a) yt-dlp is now the EXCLUSIVE transcript tier in CI (no fetch fallthrough) + discovery cut
  to 3/channel (`644db4d`); (b) a crash backstop (`scripts/lib/crash-backstop.mts` + an `onPreEnrich`
  hook in `ingest.ts`) that snapshots the collected feed before the crash-prone enrich phase and
  salvages it (writes partial-but-fresh, exits 0) on any uncaught undici assert instead of nuking the
  run (`44de905`). Verified by the green re-run above.
- **WS3 UI (done, committed).** Perf quick-wins — critical-font preload, LiveSignal hydration fix,
  worker preconnect, content-visibility on the feed tail (`1940bde`). Plus **First Light**: a
  ~4.7KB OGL point-field masthead hero seeded from real channel counts, browser-verified, hard-gated
  for reduced-motion/low-power with a static fallback; extracted shared `gl-gates.ts` (`b64ea33`).
- **WS4 Atlas plan (done — planning deliverable, no code).** Five committed specs under
  `docs/superpowers/specs/2026-07-07-*`: world-data-spine (zod schemas w/ parse-time license
  enforcement + first-class provenance/uncertainty), atlas-globe (cobe), atlas-bias-lab (computed
  scores + attribution-only rater overlay), atlas-government-ledger (52 keys → 200+ records/country,
  balanced-not-accusatory, India-deep), atlas-extras (16 features, 3 waves) (`072e63d`).
  **Superseded in part by the 2026-07-08 Atlas plan v2** (see Latest session above): all five
  amended in place + decision record + three new specs (6–8).

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

1. **Merge PR #3 (`improve/feed-reads-components` → `main`) — the only open item (added
   2026-07-07).** The pipeline-hardening, YouTube-restore (discovery fix + undici crash backstop),
   UI, and Atlas-plan work above is all committed on the branch, opened as PR #3, and fully verified
   end-to-end (green `feed-refresh` CI + a real local pipeline run producing 8 grounded YouTube
   items). Nothing left to confirm — just awaiting founder merge.
2. **Reads routine volume/tuning.** The routine authored 2 Reads one day, 1 the next — valid
   (quality gates volume) but the founder may want more consistent volume or steering. It's a
   **prompt tweak** to `.claude/commands/reads-run.md` / the survey rubric — do on request.
3. **Feed archive fills forward.** `data/feed/archive.json` was seeded day-0 with 177 items spanning
   only ~6 days (all the current snapshot reaches — sources don't serve 2-week-old items). It grows
   to the full rolling 2 weeks as the **daily pipeline** merges each day. Nothing to do; just know
   it's not instantly 14 days deep.
4. **BC-date elapsed-gap cosmetic.** The Timeline's "+X" gap plate is approximate for **BC** reads
   (Cannae) when a step crosses a year boundary (shows e.g. "+2 YR" for ~6 months) — BC years are
   stored as positive ISO years. CE reads are exact. A real fix needs BC-aware date parsing (negative
   years) in the reads/parse layer — a contained but non-trivial change.
5. **Midway's *second* timeline** ("Pacific War after Midway") is authored slightly out of
   chronological order (a 1943 entry before a Dec-1942 one). The Timeline now honors authored order,
   so it renders as written — reorder the events in the MDX if strict chronology is wanted.
6. **Idea backlog** (EXPLORER.md): spaced re-surfacing of archived gems, RSS-out/digest, taste
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
- **`GROQ_API_KEY` is still empty in CI** — Whisper tier-1 (Groq) transcript fallback is inactive;
  transcription falls straight to local ONNX Whisper (or, since this session, straight to yt-dlp's
  own captions in CI). Works, just slower/less capable than intended. The prior silent-degradation
  gap is fixed (one-time warning now logs it, `b91a602`); set the secret if faster/better YouTube
  transcripts are wanted. See "Known-issues cleanup" above for what was fixed this session
  (`isReprobeEligible`, auto-disable wiring, stale local `data/sources.json`).

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
- **In flight (2026-07-08):** `improve/feed-reads-components`, opened as **PR #3 to `main`**, carries
  the 07-07 pipeline hardening (WS1), YouTube-transcript + YouTube-discovery restore + undici
  crash backstop (WS2/WS2b/WS2c), UI perf + First Light hero (WS3), and the **full Atlas plan v2**
  — the founder decision record, the five amended specs, and the three new specs (Conflict
  Theaters, Government Structure, Two Faces) — all done and verified end-to-end. Awaiting founder
  merge — see §3 item 1. Rebase before starting further branch work if `main` has moved.
- **Committed:** Reads MDX under `apps/site/src/content/blog/`, and now **`data/feed/archive.json`**
  (the rolling feed archive — a gitignore exception; `curated.json`/`raw.json` stay ignored).
- Gitignored (local/ephemeral): `data/feed/*` (except archive.json), `data/sources.json`,
  `data/scout/`, `data/generation/`, `apps/site/.quarantine/`, `.superpowers/`. Package manager is
  **pnpm**. New runtime deps must be `$0`/offline-safe.
- **Secrets/vars are all provisioned** in the repo (Cloudflare, EXPORT_TOKEN, GEMINI, PUBLIC_* vars,
  gate hash). `CLAUDE_CODE_OAUTH_TOKEN` is NOT an Actions secret — the routine runs on the
  subscription. See `docs/RUNBOOK.md`.
