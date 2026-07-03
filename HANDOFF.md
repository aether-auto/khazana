# khazana — Agent Handoff

> You are taking over as **cofounder/engineer** on khazana. This handoff is deliberately
> **forward-looking**: it covers **what is LEFT to do** — the pre-existing open threads. The record
> of what's already built lives in `.superpowers/sdd/progress.md` (append-only ledger) and the git
> history. Read §1 (orient) + the MUST-READs, then work §3 "What's left."
>
> **The one-line state:** the product's *authoring + rendering surface is built and proven*
> (45 interactive MDX components, 7 writer formats each with a gold-standard exemplar, a research-
> grade grounded-generation pipeline, 8 real Reads shipped locally). **Nothing is deployed.** What
> remains is **operationalizing generation as a Claude routine, restructuring the P9 cloud pipeline
> around it, and going live** — plus a full-branch review before any merge.

---

## 1. Orient (cold-start essentials)

**khazana** = a personal, self-curating **treasury of the world's best signal** (Curate) + a daily-
growing collection of **gorgeous, interactive, grounded AI-authored blogs ("Reads")** in the
founder's voice (Create). **$0 recurring**, static + serverless only. Aesthetic: terminal ×
NYT-editorial; reading comfort sacred; UI/feel is paramount (award-level, alive, not "AI-template").

- **Branch:** `main` on remote **`aether-auto/khazana`** (public; created 2026-07-03; was
  `p1-foundation` locally before the go-live push). CI is green on `main`; Pages is set to the Actions
  source; site URL is **https://aether-auto.github.io/khazana/**. Commit at clean milestones; end
  messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Green baseline:** `pnpm test` (~1900 tests), `pnpm -r typecheck` (0 errors), `pnpm --filter
  @khazana/site build` (351 pages) all pass. Keep them green.
- **Monorepo:** `packages/{core,ingest,curate,generate,scout}` + `apps/{site,worker}`. `core` holds
  all zod contracts + vocab (Channels, SourceType, FeedItem.kind, **Formats** — now 7 incl.
  `theater`). Full architecture map + run commands: the design spec below and `CLAUDE.md`.
- **Operating rules (honor them):** subagents do ALL building (never burn your context on code/tests
  — orchestrate + decide); **run ingestion/network scripts YOURSELF** in a background shell, never via
  a subagent; **independent verify beats self-verify — always split them** (proven repeatedly: fresh-
  context fact-checkers catch real errors self-verification misses); verify UI by USING it (headless
  browser, MOBILE 360/390, both motion modes), not just tests+build; aggressively find skills + improve
  proactively; don't present big option-menus — exercise judgment, show built artifacts, recommend.

## 2. MUST-READ before doing anything
1. **`.superpowers/sdd/progress.md`** — the ledger (what's built; append your work here).
2. **This file** (§3 is the job).
3. Founder memories (`~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/memory/`): `MEMORY.md`
   + `reads-generation-orchestration`, `khazana-authoring-system`, `reads-length-and-components`,
   `operating-mode-subagents`, `ui-feel-and-animation`, `feed-quality-bars`, `observatory-live-data`.
4. `docs/superpowers/specs/2026-06-23-khazana-design.md` (authoritative vision + architecture),
   `CLAUDE.md`, `STYLE.md`, **`docs/RUNBOOK.md`** (the go-live secrets runbook).

---

## 3. What's LEFT (the job, in priority order)

> **STATUS (updated 2026-07-03):** A, B, and D are **DONE** (this session). The repo is
> **push-ready and GO for the first Actions run** (go-live review verdict: GO). The only remaining
> work is the **founder's `docs/RUNBOOK.md` provisioning + push** (§C) and then the **first routine
> fire** (§A3) — neither can be done for you (they need your Cloudflare/GitHub/Claude accounts).

### A. Reads generation workflow — the centerpiece ✅ BUILT + DRILLED
The design (founder decision — memory `reads-generation-orchestration`): a **single Claude routine,
2×/day**, an **Opus orchestrator** that NEVER writes prose; it drives **Sonnet subagents**
(survey → curate-pick → parallel writers → independent verifiers → publish).

1. ✅ **Writer + verify subagents formalized** — `.claude/agents/reads-writer.md` (Sonnet; wired to
   `writers/<format>` + `writers/researcher`, studies the gold-standard exemplars, ABORTS rather than
   fabricate) and `.claude/agents/reads-verify.md` (fresh-context adversarial fact-check vs the
   citation ledger + `factChecker` gates + the high-stakes rule).
2. ✅ **Opus orchestrator built** — `.claude/commands/reads-run.md` chains survey → Opus-curate →
   parallel writers → independent verify → Opus final-QC → scoped deterministic backstop → commit.
   **Drilled:** the ideation context bundle builds on the real board (150/337 items, 337 clusters,
   682 sources, taste ready), and a live `reads-survey` run returned a diverse, groundable, novel
   5-slate (both lanes + evergreen anchor; top-3 groundability confirmed against real primaries).
   *A full content-producing end-to-end (author one real new Read) was deferred to the first live
   routine fire — the plumbing is de-risked structurally + by unit tests, not yet by a full authored
   Read.* **Gate fix landed:** the deterministic backstop now uses **per-slug ledgers**
   (`data/generation/research/<slug>.ledger.json`, so parallel writers don't clobber) and
   **slug-scoped `generate verify <slug>`** (never re-litigates already-published Reads). +5 tests.
3. ⏳ **Register it as a Claude routine, 2×/day** — **founder step** (see `docs/RUNBOOK.md` →
   "Registering the Reads routine"). Facts (verified 2026-07-01): routines draw from the
   **subscription pool**; Max-5x limits = **15 routine runs/day**, **min 1-hour interval**. (Open:
   confirm in-app after the first runs whether routine *token* usage debits the main pool.)

### B. Restructure the cloud pipeline around routines ✅ DONE
- ✅ Stripped the `claude-code-action` steps out of **`pipeline.yml`** (author/plan/verify) and
  **`scout-discover.yml`** (appraise). The `$0` code pipeline stays on Actions: events → ingest →
  curate → record → prune → commit → build → deploy (no Claude). No `CLAUDE_CODE_OAUTH_TOKEN` in
  Actions anymore. `scout apply` verified to degrade gracefully with no appraisal.json (auto-adds
  nothing, prune/repair only). Reads authored by the routine go live via **`feed-refresh.yml` (3h)**.

### C. Go live — ⏳ FOUNDER STEP (provision secrets, then dry-run)
Nothing is deployed. Provisioning is in **`docs/RUNBOOK.md`** (updated this session). Required Actions
secrets: **`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` + the real KV namespace id** (the **deploy
blocker**: `apps/worker/wrangler.toml:13` is `id = "REPLACE_WITH_KV_NAMESPACE_ID"` — `wrangler deploy`
fails until it's a real id — inherently a founder step, needs your Cloudflare account), `EXPORT_TOKEN`,
and the recommended free-LLM key **`GEMINI_API_KEY`** (without it the feed loses `topics`). Variables:
`PUBLIC_WORKER_URL`, `PUBLIC_SITE_URL`. Optional: `PODCASTINDEX_API_KEY/SECRET`,
`REDDIT_CLIENT_ID/SECRET`, `GROQ_API_KEY`. `CLAUDE_CODE_OAUTH_TOKEN` is **no longer an Actions secret**
— it's only for registering the Reads routine (§A3). Then: a manual `workflow_dispatch` **dry-run** of
the pipeline, and a first routine fire.

### D. Full-branch review ✅ DONE (go-live-scoped)
A focused **go-live readiness review** ran over the new + changed surface (workflows, RUNBOOK, the
`@khazana/generate` gate change, the routine defs) across correctness / `$0`-offline / a11y-mobile:
**verdict GO**. The one SHOULD-FIX it found (verify agent calling the *unscoped* `generate verify`) is
**fixed**. Note: a line-by-line re-review of all ~19 prior component commits was **not** repeated —
they are test-covered (1906 tests green) + build-green; the review focused on the unreviewed new work.
`finishing-a-development-branch` (merge/PR decision) is still the founder's call post-deploy.

---

## 4. Carry-forwards / known issues (none blocking §3)
- **Data gaps (affect scoring, not correctness):** curate **clustering is near-atomic** (~337
  clusters / 337 items — cross-cluster synthesis is the survey agent's job; consider improving curate
  clustering); **`data/taste.json` doesn't exist** until the Worker + events flow (so `tasteFit` runs
  on a sample — real once live); **`FeedItem.entities` are empty feed-wide** (novelty/taste lean on
  topics; the free-LLM enrichment key fills this).
- **Ingestion:** committed `curated.json` is **stale** vs the caching/verification/YouTube changes —
  it lands at the first enriched P9 run. YouTube live-verify was **metadata-only**; a full enriched
  re-ingest (populating the feed with YouTube items + credibility) is the P9 run. Podcast transcripts:
  RSS `podcast:transcript` → PodcastIndex → YouTube captions; Whisper is opt-in (`ALLOW_WHISPER=1`);
  **Spotify is a dead end** (no public transcripts). ⚠️ Re-ingest is DESTRUCTIVE + degrades without the
  free-LLM key — run it YOURSELF in a background shell, never via a subagent.
- **Cosmetic (found in QA, not fixed):** the Reads `<h1>` GSAP SplitText chars sit a few px past the
  edge at 360px in no-preference motion mode (does **not** widen the page — `docScrollW == innerW`);
  the site-shell `.ticker-track`/`.navrail` overflow their box but are clipped (no page scroll). Both
  are polish items for a UI pass, not blockers.
- **Component regression harness:** the `_qa-*.mdx` browser-QA fixtures were removed in cleanup
  (`886a68a`). Automated unit + SSR tests cover component logic + non-blank fallbacks; to re-run a
  full-kit *browser* QA after future component changes, recreate a kitchen-sink draft read (the
  `_assets/_demo/` images + `model-demo.glb` are still committed for this).

## 5. How to run / verify
```bash
pnpm install
pnpm test                              # ~1900 tests
pnpm -r typecheck                      # 0 errors across all projects
pnpm --filter @khazana/site build      # astro + pagefind → dist/ (351 pages)
cd apps/site && pnpm exec astro dev --port 4321 --host   # dev; or `astro preview` a prod build
```
Browser-verify with playwright-core + system Chrome (`chromium.launch({channel:"chrome",
headless:true})`); judge the **production build** (dev-server HMR console noise is a known false
positive); assert 0 console errors + no page overflow at 360/390 in **both** motion modes + JS-off.
`/taste` + `/graph` fall back to the build snapshot locally (no `PUBLIC_WORKER_URL`) — expected.

## 6. Git / process
- Branch **`main`** (remote `aether-auto/khazana`, public). Commit at clean milestones with the
  co-author trailer (§1). Append meaningful work to `.superpowers/sdd/progress.md` and keep this
  HANDOFF's §3 current as items close.
- Gitignored (local-only): `data/feed/*.json`, `data/sources.json`, `data/scout/`, `data/taste.json`,
  `.superpowers/` (all sdd reports + qa screenshots). Generated Reads MDX under
  `apps/site/src/content/blog/` **is** committed. Package manager is **pnpm** (never generate
  `package-lock.json`/`yarn.lock`). New runtime deps must be `$0`/offline-safe (only `d3-sankey` was
  added recently).
