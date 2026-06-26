# khazana — Agent Handoff

> You are taking over as **cofounder** of khazana. Read this top to bottom, then
> read the MUST-READ files in §5, then do §8 "Do this first." This doc is the
> single source of truth for picking up cold. **Your next focus is the WORKSHOP page.**

---

## 1. Who you are (persona + how to operate)

You are the founder's **cofounder/engineer** on khazana — not a passive assistant.
The founder (Arnav, a SWE who loves numbers, charts, visuals, and impressive
design) hired you to **build the best possible product, proactively**.

Operating rules (the founder has stated these repeatedly — honor them):
- **Subagents do ALL building. You orchestrate.** Never burn your own context
  writing code/tests — dispatch implementer subagents (+ a separate reviewer for
  big work), have them write reports to `.superpowers/sdd/*-report.md`, and you
  review + verify. Your context is for architecture and decisions.
- **NEVER use a subagent to run ingestion/data scripts.** Run those yourself in a
  **background shell** (`run_in_background`), modest limits, then read the result.
- **Aggressively hunt for skills** that raise quality (frontend-design,
  brainstorming, huggingface-skills, context7, etc.) and **aggressively improve the
  app on your own initiative.** Don't present big option-menus ("which track?") —
  exercise judgment and execute; only ask when the decision is genuinely the
  founder's (his accounts/credentials, a big aesthetic move, or a true constraint
  conflict). He has rejected AskUserQuestion menus twice — show built artifacts and
  recommend, don't poll.
- **UI / feel is PARAMOUNT.** Award-level (Awwwards / Pudding / Distill / NYT-
  graphics), distinctive, *alive*, not "vibecoded AI-template." Dramatic but
  genuinely usable and comfortable to read.
- **Verify in a REAL BROWSER, always.** Tests + `astro build` passing is NOT proof.
  Load actual pages headless (see §6), assert **0 console errors in BOTH motion
  modes**, and LOOK at screenshots. **After ANY code change, rebuild + restart the
  preview** or the founder sees a stale page (this bit us — he thought the redesign
  wasn't done when it was just an unrebuilt preview).
- **$0 / offline / no paywall.** Static + serverless only; no paid APIs, no runtime
  CDN libs, no paywalled sources, no paywall-bypass tooling. (Free-tier accounts the
  founder opts into — e.g. Groq for transcription — are OK behind env vars.)
- **Keep the ledger updated** (`.superpowers/sdd/progress.md`) — it survives context
  compaction; it is your memory. Persistent founder memories live at
  `~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/memory/` (read
  `MEMORY.md` + the files — UI-feel, authoring rules, **operating-mode-subagents**,
  **feed-quality-bars**, **khazana-page-by-page-roadmap**).

---

## 2. The project

**khazana** ("treasury / vault" in Hindi/Urdu) = a personal, self-curating
**treasury of the world's best signal** + a daily-growing collection of **gorgeous,
interactive, AI-authored blogs ("Reads")** in the founder's voice.

Two halves:
- **Curate** — pull from hundreds of sources, normalize to ONE format (`FeedItem`),
  extract/transcribe **full text**, render it **on khazana itself** (reader-mode),
  cluster/dedup, rank to taste.
- **Create** — generate deep, interactive, educational Reads, each **grounded in
  real existing source article(s)** (cited, never invented).

**Aesthetic:** terminal × NYT-editorial. Warm near-black `#0a0a0b`, ink `#e8e6df`,
**amber `#ffb627`** (signal), **clay `#c1554a`** (editorial), hairline rules, "lines
not boxes". Mono chrome (JetBrains/SF Mono) + Fraunces display + Newsreader body.
Reading comfort sacred (65ch, ~18px Newsreader, zero animation in prose). Logo =
amber gem ("Book-Gem", `brand/khazana-mark-book-gem.svg`).

**Cost model ($0):** static **Astro** site on **GitHub Pages**; one free **Cloudflare
Worker + KV**; **GitHub Actions** cron runs the pipeline; the **Claude Code GitHub
Action on the founder's subscription** is the AI author + web Scout. Free Whisper
(transformers.js) for podcast transcription.

Full vision spec: `docs/superpowers/specs/2026-06-23-khazana-design.md`.

---

## 3. Architecture (pnpm workspaces, TS strict, zod contracts)

```
packages/core      @khazana/core    — contracts: FeedItem, Source, Format, registry, vocab (zod = source of truth)
packages/ingest    @khazana/ingest  — fetch → normalize → FeedItem; full-text extraction; podcast Whisper transcripts; YouTube transcripts (proxy/Actions); bounded-parallel + per-host rate limiting (concurrency.ts)
packages/curate    @khazana/curate  — enrich → cluster/dedup → rank (read-time-peak-15 heavy + <5min reject) → diversity floor
packages/generate  @khazana/generate— assignment → grounded brief → validate draft (AI-author harness)
packages/scout     @khazana/scout   — source discovery/eval/prune
apps/site          @khazana/site    — Astro static site (the product UI)
apps/worker        @khazana/worker  — Cloudflare Worker + KV behavior store
.claude/skills/writers/*            — per-format writer SKILLS
data/sources.seed.json              — source registry (682 sources, tracked). data/sources.json = live cache (gitignored; DELETE it to pick up new seed sources)
data/feed/{raw,curated}.json        — GENERATED (gitignored; produced by ingest+curate)
scripts/real-ingest.mts             — the ingest runner (see §6)
docs/superpowers/{specs,plans}/     — spec + per-phase plans
.superpowers/sdd/progress.md        — THE LEDGER (read first)
.superpowers/sdd/*-report.md        — each subagent's report (gitignored, on disk)
```

Surfaces: `/` Feed · `/reads` + `/reads/[slug]` · `/item/[id]` (in-app reader) ·
**`/workshop`** (maker idea-board — YOUR NEXT TASK) · `/graph` · `/taste` · `/sources`.

### Canonical vocab (single source of truth in `@khazana/core`)
**Channels:** history, geopolitics, politics, geography, science, tech, ai, quantum,
data-science, ds-sports, data-strategy, finance, ideas, diy, 3d-printing, iot,
embedded, ai-projects · **SourceType:** reddit, hn, rss, eng-blog, arxiv, x, news,
youtube, podcast · **FeedItem.kind:** link, discussion, paper, idea, video, audio.

---

## 4. Current state (branch `p1-foundation`, never deployed, no git remote)

**P0 fixes + P1 Feed deep pass are DONE, committed, browser-verified (0 console
errors both motion modes, 540 tests, typecheck clean).** Recent commits:
- `66c2e40` P0 fixes (flagship title break, nav-leak sanitizer, reading-time, 7-min featured gate)
- `92ccea7` Feed: Watch/Listen media rails + shorts/junk filter + one-per-source
- `710fba7` Feed: hierarchical filter, treasury logo, read-time scoring, podcast Whisper transcripts, +232 sources
- `553e6a1` ingest: YouTube-for-Actions layered fetcher + bounded-parallel rate-limited ingest

**What the Feed now is (the model for quality/feel — match it on Workshop):**
- Bento (top 30 by score, ≥7-min gate) → **▶ WATCH** + **◉ LISTEN** rails → "browse
  by topic" **category rows** → the firehose register. Header = **hierarchical
  tabbed filter** (`all · world · science · data · make` group tabs → sub-channel
  chips) that live-filters every section via the `khz:channelchange` event. Cards
  redesigned with apparent stats (source-type, read-time, channel, source link).
- **Quality bars (HARD — memory `feed-quality-bars`):** read-time is the dominant
  score (Gaussian peak @ 15 min, `W_READTIME=3`); **anything < 5-min rendered read is
  auto-REJECTED**; **featured (bento) requires ≥7-min** rendered read; transcripts
  must be REAL (not summaries).

**Real data (local):** careful re-ingest → **328 curated items, all full-text, ZERO
under 5 min, avg read 14.8 min**. Types: rss 194, eng-blog 42, podcast 62, news 30.
arXiv/Reddit/HN dropped out (abstracts/snippets < 5 min — correct per the rule).

**Transcript reality (IMPORTANT):**
- **Podcasts: working locally, quality being fixed.** Whisper via
  `@huggingface/transformers` (whisper-tiny ONNX, pure Node) + **ffmpeg** on the audio
  enclosure → transcript → read-time (`packages/ingest/src/whisper.ts`). ⚠️ whisper-
  **tiny** hallucinates repetition loops (e.g. a phrase repeated 100×) and transcribes
  **ads** verbatim → currently unreadable. A `podcast-quality` agent is/was fixing
  this: repetition-suppression decoding + drop degenerate chunks, **whisper-base**
  default, ad/sponsor-block stripping + repetition collapse in sanitize, prefer real
  published transcripts, and an OPTIONAL **Groq** tier (free Whisper-large-v3 behind
  `GROQ_API_KEY`) the founder may enable. **Check `.superpowers/sdd/phase1-podcast-
  quality-report.md` and re-ingest before trusting podcast bodies.**
- **YouTube: deferred to GitHub Actions** (real captions = clean, no ads/hallucination).
  This machine's IP is hard-blocked (`api/timedtext` 429) and the public Invidious/
  Piped proxies are dead/blocked at egress (mid-2026). Code is layered + correct:
  Invidious/Piped → direct watch-page → yt-dlp, with the direct+yt-dlp tiers gated by
  `ALLOW_DIRECT_YOUTUBE=1` (OFF locally so we never hit YouTube directly; the P9
  Actions workflow sets it + `pip install yt-dlp`). **Locally the WATCH rail is empty
  — by design.**
- **Sources: 682** (rss 283, youtube 208, news 46, podcast 45, arxiv 43, eng-blog 36,
  reddit 17, hn 4), all zod-valid.

**History worth knowing:** a WebGL "constellation" hero was built and **REJECTED**
("looks shit") and removed — don't bring it back. Effect-stacking gets rejected; a
strong concept + real interactivity wins. Keep the "Observatory/first light" identity.

**Nothing is running** except possibly a preview on `:4321` (restart per §6).

---

## 5. MUST READ before doing anything (in order)
1. **`.superpowers/sdd/progress.md`** — THE LEDGER. Full chronology + every decision.
2. **This file.**
3. Founder memories: `~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/memory/`
   (`MEMORY.md`, `ui-feel-and-animation`, `khazana-authoring-system`,
   `operating-mode-subagents`, `feed-quality-bars`, `khazana-page-by-page-roadmap`).
4. `docs/superpowers/specs/2026-06-23-khazana-design.md` (vision), `CLAUDE.md`, `STYLE.md`.
5. Recent reports in `.superpowers/sdd/phase1-*.md` (feed-layout, scoring, transcripts,
   podcast-transcripts, podcast-quality, header, ingest-actions-concurrency).

---

## 6. How to run / verify

```bash
pnpm install                                 # includes @huggingface/transformers + onnxruntime (podcast Whisper)
pnpm test                                    # 540 tests
pnpm -r typecheck
pnpm --filter @khazana/site build
cd apps/site && pnpm exec astro preview --port 4321   # ONE preview; kill stale ones first: pkill -9 -f astro
```
**Browser verify harness:** `playwright-core` at `/tmp/khz-shot`; system Chrome via
`chromium.launch({ channel: "chrome", headless: true })`. Load each page, collect
`console`(error)+`pageerror`, scroll, screenshot fullPage, assert **0 errors in BOTH**
`reducedMotion:'no-preference'` and `'reduce'`. (Headless can't load YouTube
thumbnails → grey; fine.) **Rebuild + restart the preview after any code change.**

**Re-ingest (run YOURSELF in a background shell, never via an agent):**
```bash
rm -f data/sources.json     # so the 682-source seed is used (not the stale cache)
# CAREFUL, non-youtube (youtube is Actions-only locally), modest limit:
SOURCE_TYPES=rss,news,podcast,arxiv,eng-blog,reddit,hn LIMIT=2 \
  pnpm exec tsx scripts/real-ingest.mts
# Writes data/feed/{raw,curated}.json. ~60-80 min (podcast Whisper is the bottleneck, ~40s/episode at whisper-tiny).
# Knobs (concurrency.ts / whisper.ts): INGEST_CONCURRENCY=6, PER_HOST_MAX_CONCURRENT=2,
#   PER_HOST_MIN_GAP_MS=200, WHISPER_CONCURRENCY=1, WHISPER_MODEL, WHISPER_MAX_AUDIO_BYTES=25MB,
#   optional GROQ_API_KEY (hosted transcription), ALLOW_DIRECT_YOUTUBE=1 (+pip install yt-dlp) in Actions.
```
`real-ingest.mts` `writeFeed` **OVERWRITES** `raw.json` — a targeted SOURCE_TYPES run
replaces everything, it does NOT merge. Do ONE good full run, not incremental.

---

## 7. Known issues / carry-forwards (none blocking)
- **Workshop is EMPTY on local data** (see §8) — its content (maker channels + ideas)
  is YouTube/Reddit-heavy → Actions-only or short → dropped. This is the core
  challenge of the Workshop task.
- **Podcast transcript QUALITY** — whisper-tiny hallucination + ads; being fixed (see
  §4). Re-ingest after the fix lands.
- **WATCH rail empty locally** (YouTube → Actions only). By design.
- **arXiv/Reddit/HN excluded from the feed** by the <5-min reject. Want papers? →
  "full-text the arXiv PDF" task later.
- **122 feeds failed** in the last ingest (dead feeds from the aggressive 682-source
  expansion) — Scout (P8) should prune these.
- Graph nodes still open external `item.url`, not the in-app `/item/[id]`.
- P9 (orchestration/deploy) not started — everything is local, never deployed.

---

## 8. Do this FIRST — the WORKSHOP page (`/workshop`)

1. **Boot:** read §5, `pnpm install`, build + preview, and **look at the live site** —
   especially `/workshop`, plus `/` (the Feed, your quality bar).
2. **Workshop's purpose** (spec + founder): a **maker's idea-board** — "things worth
   building" mined from the feed: **DIY, 3D-printing, IoT, embedded, AI-projects**,
   sourced from Reddit + YouTube + maker blogs. A distinctive, *alive*, browsable
   pinboard of buildable ideas — not a generic card grid.
3. **Current state:** `apps/site/src/pages/workshop.astro` is a minimal masonry of
   `IdeaCard`s via `selectIdeas(all)` (`feed.ts`: items with `kind==="idea"` OR a maker
   channel). **On local data it renders EMPTY** — 0 idea/maker items survive (maker
   sources are YouTube/Reddit = Actions-only, or their text is < 5 min).
4. **The real challenge is data + design together:**
   - **Populate it.** Add more maker **TEXT/RSS** sources that produce real ≥5-min reads
     locally (Hackaday, Adafruit/SparkFun blogs, Make:, Hackster, EEVblog/3D-printing
     blogs, arXiv cs.RO/eess, "Show HN") via a source-research subagent → temp file →
     you merge into the seed → re-ingest yourself. And/or design how YouTube/Reddit
     maker content (Actions) slots in. A `kind:"idea"` concept may need a curate/
     generate step to synthesize buildable ideas from clusters — think it through.
   - **Design a distinctive maker board** (feel paramount): buildable-idea cards with
     the right stats (difficulty? parts? source? est. build time?), browsable by maker
     channel, and a *beautiful, intentional* empty/sparse state for when local data is
     thin (don't ship a sad "no ideas yet").
   - Apply the same quality bars + aesthetic as the Feed.
5. **Process:** subagents for the build (apps/site UI; source-research → seed merge);
   `frontend-design` + `brainstorming` skills; re-ingest YOURSELF in a background shell;
   verify in a real browser; commit at a clean milestone; update the ledger.

**Roadmap order (memory `khazana-page-by-page-roadmap`):** Feed ✅ → **Workshop** →
Graph → Sources → Taste → Feed (final/personalization pass) → **Publish + full ingest (P9)**.

---

## 9. Idea backlog (cofounder — propose + build)
- Workshop: the build above; plus "build difficulty"/"parts list" extraction, saved/
  queued builds, a "weekend build" highlight.
- Wire YouTube/Reddit maker content once Actions runs (P9 sets `ALLOW_DIRECT_YOUTUBE`).
- Graph → wire nodes to in-app `/item/[id]`; make it visually compelling.
- Taste: the personalization/affinity layer + "why am I seeing this" transparency (the
  Feed's "for you" bento ordering was deliberately left a stub pending this — quality
  scoring lives in the Feed, personal/taste scoring belongs to the Taste page).
- Generate more real Reads (only 1 flagship exists; each grounded in real sources).
- Podcast transcripts: if the founder enables a free **Groq** account, wire Groq
  Whisper-large-v3 as primary (local Whisper as $0 fallback).
- P9: GitHub Actions cron (ingest→curate→generate→scout→build→deploy) + CF Worker +
  Pages + the Claude Code Action; a copy-paste account runbook for the founder.

---

## 10. Git / process notes
- Branch: **`p1-foundation`** (no remote, never deployed). Commit at clean milestones;
  end commit messages with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `data/feed/*.json` and `data/sources.json` are gitignored (regenerated). `.superpowers/`
  reports are on-disk only.
- The final whole-branch review + `finishing-a-development-branch` step have NOT run —
  do a full review before any merge/deploy.
- When you finish meaningful work, append to `.superpowers/sdd/progress.md`.
