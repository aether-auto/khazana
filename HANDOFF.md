# khazana — Agent Handoff

> You are taking over as **cofounder** of khazana. Read this top to bottom, then read the
> MUST-READ files in §7 and the founder memories, then do §9 "Do this first." This doc is the
> single source of truth for picking up cold.
>
> **Your next focus is finishing the REDESIGNED Reads generation workflow** — an
> **orchestrator-worker pipeline run as a Claude *routine*, 2×/day**: an **Opus orchestrator**
> that never writes, driving **Sonnet-5 subagents** (survey → writers → verifiers). The
> **ideation half is built + drilled** and the **whole pipeline is proven end-to-end** (a real
> Read shipped). What's left: formalize the **writer + verify subagent definitions**, build the
> **Opus orchestrator routine**, and **restructure the P9 workflows** so LLM work runs on Claude
> routines (not the GitHub-Actions Claude step). See §5–§6, §9.
>
> **The 2026-07-01 session** rebuilt the whole back end (P9 ingestion caching + podcast
> transcript-discovery, research-grade generation with a citation ledger, self-healing source
> verification, no-AI discovery, GitHub Actions orchestration), **redesigned Reads generation**
> as the orchestrator-worker routine above, made **YouTube a first-class source that beats
> podcasts**, **removed all TTS**, shipped the **Feed "for you" personalization**, and produced
> the **first research-grade Read** ("The Plague Wage"). All committed on `p1-foundation`
> (HEAD `83b3ffb`); 1307 tests green; typecheck clean. **A dev server is currently running on
> :4321** and the founder is reviewing the new Read.
>
> **The 2026-07-02 session** ran a founder-directed **interactive-component OVERHAUL of Reads**:
> audited the 16 existing MDX components (found the "buggy" complaint was 3 mobile CSS defects + 1
> authoring gotcha — all fixed & browser-verified, incl. un-blanking the-plague-wage's Scrolly which
> was rendering blank in prod), then **grew the authorable kit 16 → 40 components** (the two missing
> primitives Figure + Math, plus per-format knowledge-carriers: Diagram, Simulation, Stepper, Quiz,
> CodeWalkthrough, AnnotatedFigure, SmallMultiples/Distribution/Scatter/Slopegraph/RangePlot,
> CompareSlider/CastGrid/EventCascade, StateMachine/LayerStack/Checklist/GanttStrip/RouteMap +
> DataTable totals). **Every component was independently browser-verified** (360/390 × both motion
> modes + JS-off) and the contract is now **drift-locked** (a test binds CONTRACT_COMPONENTS ==
> KNOWN_COMPONENTS, killing the old "writers told 10, 16 legal" bug). **Rewrote all 5 long-form writer
> skills** to wield the FULL kit aggressively (components carry knowledge, prose wraps around them;
> ≥1 knowledge-carrying island / ~800-1000 words) at a **20-25 min length FLOOR** (field-notes exempt);
> nudged reads-survey to prefer long, component-rich topics. **Proved it E2E** with a new grounded
> primer, `how-gps-finds-you.mdx` (~6.3k words, 11 islands) — an independent adversarial fact-check
> caught & fixed 4 real errors before publish. Commits `af7f224`→`f09f382` on `p1-foundation`; **1675
> tests green**, typecheck clean, build 348 pages. Session reports: `.superpowers/sdd/{component-qa-audit,
> component-expansion-design,build-p*,integrate-p*,verify-p*,wave4-*,wave5-*}.md`. **Still open** (the
> pre-existing next-focus): formalize the writer/verify `.claude/agents` defs + build the Opus
> orchestrator routine (§5-§6, §9B); deferred components needing a new dep (Sankey, ParameterPlay,
> Model3D-glb); cosmetic: reads `<h1>` SplitText chars a few px past edge at 360 (no page scroll).

---

## 1. Who you are (persona + how to operate)

You are the founder's **cofounder/engineer** on khazana — not a passive assistant. The founder
(Arnav, a SWE who loves numbers, charts, visuals, impressive design) hired you to **build the
best possible product, proactively**.

Operating rules (stated repeatedly — honor them):
- **Subagents do ALL building. You orchestrate.** Never burn your own context writing code/tests —
  dispatch implementer subagents (+ a separate reviewer/verifier for big work), have them write
  reports to `.superpowers/sdd/*-report.md`, and you review + verify. Your context is for
  architecture and decisions.
- **NEVER use a subagent to run ingestion/data/network scripts** (ingest, yt-dlp, etc.). Run those
  YOURSELF in a **background shell** (`run_in_background`), modest limits, then read the result.
  (This session: the live yt-dlp verification was run by the orchestrator, not a subagent.)
- **Independent verification beats self-verification — always split them.** Proven this session:
  the writer self-verified and passed, but a **fresh-context** verify agent caught a real factual
  error + two misattributions. Every Read gets an independent adversarial verify pass.
- **Aggressively hunt for skills** that raise quality and **aggressively improve the app on your
  own initiative.** Don't present big option-menus — exercise judgment and execute; only ask when
  the decision is genuinely the founder's (his accounts/credentials, a big aesthetic move, a true
  constraint conflict). He has rejected AskUserQuestion menus repeatedly — show built artifacts and
  recommend, don't poll.
- **UI / feel is PARAMOUNT.** Award-level (Awwwards / Pudding / Distill / NYT-graphics),
  distinctive, alive, not "vibecoded AI-template." Dramatic but genuinely usable and readable.
- **Verify by USING it, not just checking it.** Tests + build + "0 console errors" + a static
  screenshot are NOT proof. Drive REAL interactions on a headless browser (scroll, drag, tap,
  MOBILE 390/360, both motion modes) via persona interaction-QA agents; then FIX → RE-VERIFY.
  Rebuild + restart the preview after ANY change.
- **$0 / offline / no paywall.** Static + serverless only; no paid APIs, no runtime CDN libs, no
  paywalled sources. (Free-tier accounts the founder opts into are OK behind env vars.)
- **Keep the ledger + memories updated.** `.superpowers/sdd/progress.md` survives compaction.
  Persistent founder memories: `~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/memory/`
  (`MEMORY.md` + the files — UI-feel, authoring, **operating-mode-subagents**, feed-quality-bars,
  page-by-page-roadmap, observatory-live-data, **reads-generation-orchestration** [NEW]).
- **Commit at clean milestones** with the exact co-author trailer (§12).

---

## 2. The project

**khazana** ("treasury / vault") = a personal, self-curating **treasury of the world's best
signal** + a daily-growing collection of **gorgeous, interactive, AI-authored blogs ("Reads")** in
the founder's voice.

- **Curate** — pull from hundreds of sources, normalize to ONE `FeedItem`, extract full text /
  transcripts, render on khazana itself, cluster/dedup, rank to taste.
- **Create** — generate deep, interactive, educational Reads, each **grounded in real primary
  sources** (cited, never invented — HARD rule).

**Aesthetic:** terminal × NYT-editorial. Warm near-black `#0a0a0b`, ink `#e8e6df`, amber `#ffb627`
(signal), clay `#c1554a` (editorial), hairline rules, "lines not boxes." Mono chrome + Fraunces
display + Newsreader body. Reading comfort sacred (65ch, ~18px, zero animation in prose).

**Cost model ($0):** static **Astro** on **GitHub Pages**; one free **Cloudflare Worker + KV**;
**GitHub Actions** cron for the pure pipeline; **Claude routines** (founder's subscription) for the
LLM/agentic work (Reads + Scout credibility). Full spec:
`docs/superpowers/specs/2026-06-23-khazana-design.md`.

---

## 3. Architecture (pnpm workspaces, TS strict, zod contracts)

```
packages/core      @khazana/core    — contracts (FeedItem, Source, Format, registry, vocab), plus:
                                       citation-ledger, candidate-slate (Reads ideation), candidate-source
                                       (discovery), youtube-credibility, scoring, taste-model, source-verify
packages/ingest    @khazana/ingest  — fetch→normalize→FeedItem; ON-DISK CACHING (conditional-GET/304,
                                       transcript cache, full-text cache — cache/*); transcript-DISCOVERY
                                       (podcast:transcript RSS → PodcastIndex → YouTube captions; Whisper
                                       opt-in only via ALLOW_WHISPER); YouTube meta+credibility (youtube*.ts);
                                       structured fetch-results (permanent vs transient); concurrency.ts gates
packages/curate    @khazana/curate  — enrich → cluster/dedup → HARD-GATE full-text → rank → diversity floor
packages/generate  @khazana/generate— Reads harness: select → buildBrief (full-text + research dossier +
                                       CITATION LEDGER) → validateDraft (grounds vs curated ∪ ledger) →
                                       factChecker gate (≥90% cited, ≥60% load-bearing corroborated);
                                       reads-ledger (past-reads index for novelty)
packages/scout     @khazana/scout    — source discovery (link-mining, domain-freq, OPML, YouTube channels) +
                                       evaluate/apply + self-healing prune (strike-count/status/rediscovery)
apps/site          @khazana/site     — Astro static site (the product UI)
apps/worker        @khazana/worker    — Cloudflare Worker + KV (POST /event · GET /events auth'd · GET /summary
                                       public per-device)
scripts/           — real-ingest.mts, recurate.mts, prune-history.mts, fetch-events.mts (Worker /events →
                     data/events.json), record-build-day.mts (history.json), ideation-eval.mts (freeze the
                     ideation board to a snapshot for drilling the survey agent)
.claude/agents/reads-survey.md       — the SURVEY subagent (Sonnet 5) — ideation half of the Reads workflow
.claude/skills/writers/{researcher,chronicle,dispatch,field-notes,teardown,primer,build-log}/  — writer +
                                       research-methodology SKILLS (PhD-grade; grounding = citation ledger)
.github/workflows/  — ci.yml (tests/typecheck) + pipeline.yml / feed-refresh.yml / scout-discover.yml /
                     deploy-worker.yml (P9 cron — see §6; the Claude steps need to move to routines)
docs/RUNBOOK.md     — founder secrets/accounts runbook (provisioning to go live)
.superpowers/sdd/*  — audit + build reports (gitignored, on disk)
```

**Surfaces:** `/` Feed ✅ (+ **"for you" personalization** ✅) · `/reads` ✅ + `/reads/[slug]`
(now incl. **the-plague-wage** ✅) · `/item/[id]` · `/workshop` ✅ · `/graph` (Observatory) ✅ ·
`/sources` ✅ · `/taste` (Calibration Bench) ✅. **TTS/narration REMOVED** (§4).

**Canonical vocab (`@khazana/core`):** Channels: history, geopolitics, politics, geography, science,
tech, ai, quantum, data-science, ds-sports, data-strategy, finance, ideas, diy, 3d-printing, iot,
embedded, ai-projects · SourceType: reddit, hn, rss, eng-blog, arxiv, x, news, youtube, podcast ·
FeedItem.kind: link, discussion, paper, idea, video, audio · v1 Formats: chronicle, dispatch,
field-notes, teardown, primer, build-log.

---

## 4. What the 2026-07-01 session shipped (all committed on `p1-foundation`)

Commits (newest first):
- `83b3ffb` **read: "The Plague Wage"** — first research-grade Read (E2E pipeline validation).
- `c0ca1dc` **tts: remove all narration** (Kokoro/ReadPlayer/render-audio/kokoro-js gone; Whisper kept).
- `2a3ec40` **youtube: first-class source** — $0 metadata (subs/likes/views/captions via yt-dlp),
  deterministic credibility scoring, channel discovery generator. **Live-verified** on real channels.
- `9b0fd03` **generate: Reads ideation** — survey agent, CandidateSlate schema, past-reads ledger,
  ideation-eval harness.
- `fc0068d` **ci: use Claude Sonnet 5** for reads + scout appraisal (there IS a Sonnet 5, `claude-sonnet-5`,
  launched 2026-06-30 — my/older tooling was cached before it).
- `cb2084b` **ci: P9 orchestration** — cron workflows + fetch-events + record-build-day + actions/cache + RUNBOOK.
- `0f83593` **scout: no-AI candidate generation** — link-mining, domain-frequency, OPML.
- `f513a62` **sources: self-healing verification** — strike-count, status persistence, transient/permanent,
  auto-prune, moved-feed rediscovery.
- `ff87f47` reads: ReadsFilter null-guard (unblocks astro check).
- `b310a1e` **writers: PhD-grade research methodology skills** (researcher skill + Research phase in 6 writers).
- `e0f06e5` **generate: research-grounded harness** — citation ledger, factChecker gate, full-text briefs.
- `104fbc4` **ingest: transcript-discovery getter + on-disk caching + rate-limit hardening.**
- `bf492dc` **feed: "for you" personalization** — affinity-weighted reorder on hydration, honest quality
  fallback, parity-by-construction. 37/37 real-browser QA.

Verification: **1307 tests pass** (down from 1318 only because TTS tests were removed), `pnpm -r
typecheck` clean across all 8 projects, `pnpm --filter @khazana/site build` clean (348 pages).

---

## 5. The Reads workflow (the centerpiece — orchestrator-worker Claude routine)

**Design (founder decision — memory `reads-generation-orchestration`):** a **single Claude routine,
2×/day**, is an **Opus orchestrator** that NEVER writes prose. It drives **Sonnet-5 subagents**:

```
Opus orchestrator (the routine)
├─ 1. SURVEY subagent (Sonnet 5)  ── BUILT: .claude/agents/reads-survey.md
│     reads sources + curated feed + taste + past-reads ledger → ranked CandidateSlate.
│     Scored on groundability (the GATE), novelty, taste-fit, interestingness, IMPORTANCE.
│     TWO LANES: feed-grounded synthesis + INTEREST-DRIVEN world topics (no feed seed — the thin,
│       AI-skewed feed is a SIGNAL, not a ceiling). WebSearch groundability pre-check.
│     DIVERSITY MANDATE: ≤~2/channel + a GUARANTEED evergreen anchor (history/geopolitics/geography/
│       science/ideas) every slate, because the feed would never seed those.
├─ 2. Opus CURATES the slate (editorial pick — the high-judgment step Opus owns)
├─ 3. WRITER agents (Sonnet 5, parallel)  ── PROVEN ad-hoc, NOT YET a .claude/agents def
│     full research → citation ledger → draft → self-verify, via writers/{researcher,<format>} skills
├─ 4. VERIFY agents (Sonnet 5, FRESH context)  ── PROVEN ad-hoc, NOT YET a .claude/agents def
│     adversarial fact-check vs the ledger (re-fetch sources, factChecker gate)
└─ 5. Opus FINAL QC + publish (commit passing MDX, drop the rest — quality bar gates volume)
```

**What's BUILT + committed:**
- The **survey agent** (`.claude/agents/reads-survey.md`), the **CandidateSlate schema**
  (`packages/core/src/candidate-slate.ts` — scores incl. `importance`, `origin: feed-grounded |
  interest-driven`, blended weights: groundability .30 / importance .20 / interestingness .20 /
  tasteFit .17 / novelty .13), the **past-reads ledger** (`packages/generate/src/reads-ledger.ts`),
  the **ideation eval harness** (`scripts/ideation-eval.mts`).
- The **generation harness** (citation ledger + factChecker gate + full-text briefs) and the
  **writer + researcher SKILLS**.

**What's PROVEN (end-to-end, this session):** I ran the survey agent live over the real board — it
produced a **varied, importance-weighted, evergreen-anchored slate** (9 channels across 8 ideas;
interest-driven picks the feed couldn't seed). I then ran a **Writer** (Sonnet 5) on the top
interest-driven pick and an independent **Verify** (fresh Sonnet 5). Result: **"The Plague Wage"**
(`apps/site/src/content/blog/the-plague-wage.mdx`, committed `83b3ffb`) — ~3,600 words, 13-source
ledger (9 high-tier), 100% claims cited, 0 fabrications, earned components (StatBand/Scrolly/
DataTable/Chart/Pullquote). The verify pass caught a factual error + 2 misattributions the writer
missed; all fixed. Reports: `reads-ideation-report.md`, `survey-variety-report.md`,
`read-black-death-report.md`, `verify-plague-wage-report.md`.

**What's LEFT (your next build — §9):**
1. **Formalize the writer + verify subagent definitions** (`.claude/agents/reads-writer.md`,
   `reads-verify.md`), model-pinned to `claude-sonnet-5`, wired to the writer/researcher skills +
   the factChecker gate + the right toolsets (writer: WebSearch/WebFetch/Read/Write/Edit; verify:
   WebFetch/Read). They were run ad-hoc as general-purpose agents this session — make them
   first-class like the survey agent.
2. **Build the Opus orchestrator routine** that chains survey → curate → write → verify → publish,
   and register it as a **Claude routine, 2×/day** (§6 has the rate-limit facts).

---

## 6. P9 back-end pipeline + the **routines pivot**

**Built + committed** (all local, NEVER deployed): the four subsystems (ingestion w/ caching +
transcript discovery; research-grade generation; self-healing source verification; no-AI discovery)
+ GitHub Actions workflows (`pipeline.yml` daily, `feed-refresh.yml` 3-hourly, `scout-discover.yml`
weekly, `deploy-worker.yml`) + `fetch-events.mts` + `record-build-day.mts` + actions/cache +
`docs/RUNBOOK.md`.

**THE PIVOT (founder decision):** LLM/agentic work runs on **Claude routines**, NOT the
GitHub-Actions Claude step. Why it matters (verified 2026-07-01):
- **Routines draw from your subscription pool** (not the separate $100/mo non-interactive credit that
  Agent-SDK/`claude -p`/GitHub-Actions use since 2026-06-15).
- **Max 5x limits:** **15 routine runs/day** (per account; each scheduled OR manual fire = 1 run;
  resets midnight UTC), **min 1-hour interval**. A single routine 2×/day = 2 runs — trivially inside 15.
  Runs ≠ Reads: one run can author several Reads. Token ceiling = the weekly **Sonnet** cap (reads are
  Sonnet 5) — comfortable for a few Reads/day. (Open: whether routine *token* usage debits the main
  pool vs the separate credit — confirm in-app after first runs.)
- **So restructure:** keep the **$0 code pipeline on GitHub Actions** (events → ingest → curate →
  build → deploy — no Claude); **move the generate + scout-appraise steps OUT of `pipeline.yml` into
  a Claude routine.** The Actions workflows currently invoke `claude-code-action@v1` (Sonnet 5) —
  that step is the thing to replace.

**To go live the founder must provision secrets** (`docs/RUNBOOK.md`): `CLAUDE_CODE_OAUTH_TOKEN`
(or the routine equivalent), Cloudflare token + KV namespace id (fills the `wrangler.toml`
placeholder that blocks deploy), `PUBLIC_WORKER_URL`, `EXPORT_TOKEN`, a free-LLM enrichment key
(`GEMINI_API_KEY` or NVIDIA/NIM — without it the feed loses topics). Optional: `PODCASTINDEX_API_KEY/
SECRET` (podcast transcripts work without it via the RSS tag), `REDDIT_CLIENT_ID/SECRET`,
`GROQ_API_KEY`.

---

## 7. MUST READ before doing anything (in order)
1. **`.superpowers/sdd/progress.md`** — the ledger (append your work here).
2. **This file.**
3. Founder memories (`~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/memory/`): `MEMORY.md`,
   **`reads-generation-orchestration`**, `khazana-authoring-system`, `operating-mode-subagents`,
   `ui-feel-and-animation`, `feed-quality-bars`, `khazana-page-by-page-roadmap`.
4. `docs/superpowers/specs/2026-06-23-khazana-design.md`, `CLAUDE.md`, `STYLE.md`, `docs/RUNBOOK.md`.
5. This session's reports in `.superpowers/sdd/`: the four `audit-*.md`; the build reports
   (`ingest-overhaul`, `generate-harness`, `reads-skills`, `source-verify`, `source-discovery`,
   `orchestration`, `reads-ideation`, `survey-variety`, `youtube-drill`, `tts-removal`,
   `feed-foryou`); and the Reads-workflow proof (`read-black-death-report`, `verify-plague-wage-report`).

---

## 8. How to run / verify

```bash
pnpm install
pnpm test                 # 1307 tests
pnpm -r typecheck         # clean across all 8 projects
pnpm --filter @khazana/site build     # astro build + pagefind → dist/ (348 pages)
cd apps/site && pnpm exec astro dev --port 4321 --host   # dev server (hot-reload)
#   or: astro preview (serves a production build). Kill stale first: pkill -9 -f astro
```
**A dev server IS currently running on http://localhost:4321** (started this session for the founder
to review `/reads/the-plague-wage`). `/taste` + `/graph` fall back to the build snapshot locally
(no `PUBLIC_WORKER_URL`) — expected, 0 errors.

**YouTube / yt-dlp (run YOURSELF, paced, never bulk):** no `yt-dlp` binary — use `python3 -m yt_dlp`
(v2026.06.09). `curl_cffi` 0.15.0 present → `--impersonate chrome` works; ffmpeg 8.1.2 present.
Live-verify pattern that did NOT get blocked: 3 channels, one video each, `--playlist-items 1
--impersonate chrome`, 6s apart, in a background shell (see `/tmp/yt-verify/` from this session).
`yt-dlp -J` yields `channel_follower_count`, `view_count`, `like_count`, captions — all $0.

**Re-ingest (run YOURSELF in a background shell, never via an agent):** `rm -f data/sources.json;
SOURCE_TYPES=... LIMIT=2 pnpm exec tsx scripts/real-ingest.mts`. ⚠️ DESTRUCTIVE + degrading without a
free-LLM enrichment key (strips `topics`). To re-curate after a curate-logic change without
re-fetching, use `scripts/recurate.mts`. Full-content caching now makes steady-state re-ingest cheap.

**Browser-verify:** playwright-core + system Chrome (`chromium.launch({channel:"chrome",
headless:true})`); assert 0 console errors in BOTH motion modes, at 390/360 mobile widths; drive real
pointer/scroll/tap. Rebuild + restart preview after any change.

---

## 9. Do this FIRST

> **Boot:** read §7, `pnpm install`, confirm green (`pnpm test`, typecheck, site build). The dev
> server may still be on :4321 — restart it if stale.

**(A) The founder is reviewing "The Plague Wage"** (`/reads/the-plague-wage`) — the first
research-grade Read, and the acceptance test for the writing/interaction bar. If he has feedback,
iterate the Read and/or the writer skills before scaling.

**(B) Finish the Reads workflow (§5):**
1. Author `.claude/agents/reads-writer.md` + `.claude/agents/reads-verify.md` (model `claude-sonnet-5`,
   wired to the writer/researcher skills, the factChecker gate, and the right toolsets) — formalizing
   the ad-hoc runs that already worked. Keep DRY with the skills.
2. Build the **Opus orchestrator routine**: survey → Opus-curate → parallel writers → independent
   verifiers → Opus final-QC/publish. Quality bar gates volume; writers ABORT rather than fabricate.
3. Register it as a **Claude routine, 2×/day** (§6). Drill it once end-to-end before trusting it.

**(C) Restructure the P9 workflows for routines (§6):** strip the `claude-code-action` generate +
scout-appraise steps out of `pipeline.yml`; keep the $0 code pipeline (events→ingest→curate→build→
deploy) on Actions. Then it's provisioning (RUNBOOK) → a manual `workflow_dispatch` dry-run.

**Backlog / carry-forwards (§10)** as time allows.

---

## 10. Known issues / carry-forwards (none blocking)
- **Writer/verify are not yet `.claude/agents` defs** — they were proven as ad-hoc general-purpose
  Sonnet runs (§5). Formalize them (§9B).
- **Ideation data gaps (affect scoring, not correctness):** the curate **clustering is near-atomic**
  (337 clusters / 337 items — cross-cluster synthesis is entirely the survey agent's job; consider
  improving curate clustering); **`data/taste.json` doesn't exist** until the Worker + events flow, so
  `tasteFit` runs on a sample (goes real once live); **`FeedItem.entities` are empty** feed-wide, so
  novelty/taste lean on topics (enrichment fills this).
- **YouTube live-verify done for metadata only** — a full enriched re-ingest (populating the feed with
  YouTube items + credibility) is still the P9 run. The credibility scoring + discovery are unit-tested
  + validated on 3 real channels; run the report's yt-dlp commands to validate at scale (paced!).
- **Committed `curated.json` is stale** vs the ingestion/verification/YouTube changes — it lands at the
  P9 enriched run. Local arxiv/reddit are still thin (correct per the ≥5-min rule).
- **Podcast transcripts:** now RSS `podcast:transcript` → PodcastIndex → YouTube captions; Whisper is
  opt-in (`ALLOW_WHISPER=1`) only. **Spotify is a dead end** (its Web API exposes no transcripts).
- **P9 never deployed;** `wrangler.toml` KV id is a placeholder that blocks Worker deploy (RUNBOOK).
- **The final whole-branch review + `finishing-a-development-branch`** have NOT run — do a full review
  before any merge/deploy. 13 new commits this session touch every package.

## 11. Key decisions this session
- **Reads = orchestrator-worker Claude routine, 2×/day**; Opus orchestrates + does final QC, NEVER
  writes; **ALL subagents (survey/writer incl. Chronicle flagship/verify) on Sonnet 5** — founder
  judged Sonnet 5 good enough for Chronicle, overriding the old "Opus for Chronicle" tiering.
- **Ideation must produce VARIETY + IMPORTANCE + interest-driven world topics + a guaranteed evergreen
  anchor** — the thin feed is a signal, not a ceiling.
- **YouTube > podcasts** — subs/likes/views/tone are measurable at $0 (yt-dlp); podcasts have almost no
  public engagement signal. YouTube is now a first-class, credibility-scored tier.
- **TTS removed** — not ready yet; Whisper (opt-in STT) preserved.
- **LLM work on Claude routines, not the Actions Claude step** (subscription pool; 15 runs/day on Max 5x).
- **Independent verify > self-verify** — proven; keep them separate.

## 12. Git / process
- Branch **`p1-foundation`** (no remote, never deployed), HEAD `83b3ffb`. Commit at clean milestones;
  end commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `data/feed/*.json`, `data/sources.json`, `data/scout/`, `data/taste.json`, `.superpowers/`, and
  (removed) audio are gitignored. Generated Reads MDX under `apps/site/src/content/blog/` IS committed.
- When you finish meaningful work, append to `.superpowers/sdd/progress.md` and update this HANDOFF.
