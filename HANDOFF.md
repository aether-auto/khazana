# khazana — Agent Handoff

> You are taking over as **cofounder** of khazana. Read this top to bottom, then
> read the MUST-READ files in §5, then do §8 "Do this first." This doc is the
> single source of truth for picking up cold. **Your next focus is the GRAPH page.**
> (The Feed and the Workshop are both DONE — see §4.)

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

Surfaces: `/` Feed ✅ · `/reads` + `/reads/[slug]` · `/item/[id]` (in-app reader) ·
`/workshop` ✅ (directed maker board) · **`/graph`** (signal map — YOUR NEXT TASK) ·
`/taste` · `/sources`.

### Canonical vocab (single source of truth in `@khazana/core`)
**Channels:** history, geopolitics, politics, geography, science, tech, ai, quantum,
data-science, ds-sports, data-strategy, finance, ideas, diy, 3d-printing, iot,
embedded, ai-projects · **SourceType:** reddit, hn, rss, eng-blog, arxiv, x, news,
youtube, podcast · **FeedItem.kind:** link, discussion, paper, idea, video, audio.

---

## 4. Current state (branch `p1-foundation`, never deployed, no git remote)

**P0 fixes + P1 Feed deep pass + the WORKSHOP page are DONE, committed,
browser-verified (0 console errors both motion modes, 616 tests, typecheck
clean).** Recent commits (newest first):
- `745760d` Workshop: lower the read-time bar for maker signal (3-min two-tier floor; maker contract moved to @khazana/core)
- `d5eed3f` sources: repair 8 dead maker feeds + add 23 verified maker sources (682 → 705)
- `c9f45dc` Workshop: directed maker selector — buildable projects only, reject op-eds
- `66c2e40` P0 fixes (flagship title break, nav-leak sanitizer, reading-time, 7-min featured gate)
- `92ccea7` Feed: Watch/Listen media rails + shorts/junk filter + one-per-source
- `710fba7` Feed: hierarchical filter, treasury logo, read-time scoring, podcast Whisper transcripts, +232 sources
- `553e6a1` ingest: YouTube-for-Actions layered fetcher + bounded-parallel rate-limited ingest

**Workshop (`/workshop`) is now a directed maker board** ("the bench"): a
deterministic, $0, **source-anchored** maker scorer (`packages/core/src/maker.ts` —
`PURE_MAKER_ALLOWLIST` = `HANDS_ON_MAKER_SOURCES` ∪ `MAKER_INDUSTRY_SOURCES`,
`MAKER_EXCLUDE`, `makerScore`, `titleBuildSignal`, `isMakerCandidate`,
`MAKER_THRESHOLD=3`, `MAKER_MIN_READ_MINUTES=3`) replaced the old loose
"any maker-channel tag" filter that pulled 156 items (~116 op-eds). The bar is
lowered for maker items only (curate keeps `readTime>=5 OR (isMakerCandidate AND
readTime>=3)`); the Feed's ≥5-min bar is preserved by an explicit register floor
(`dropBelowFeedFloor`), Feed membership byte-identical 328→328. `BuildCard.astro` +
channel-filter chips + an intentional "stocking the bench" sparse state. On local
data the board is **10 genuine builds** (thin by design — see §7). The maker logic
is shared in `@khazana/core` so curate and the site enforce ONE definition.

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

**Real data (local):** careful re-ingest → 328 ≥5-min curated items, all full-text,
avg read 14.8 min (rss 194, eng-blog 42, podcast 62, news 30). A later curate-only
re-run (`scripts/recurate.mts`, no network/key) added **12 short (3–5 min) maker
items** under the new two-tier floor → **340 curated total**; the 12 shorts are
Workshop-only (the Feed register floor keeps them out). arXiv/Reddit/HN still drop
out of the Feed (abstracts/snippets < 5 min — correct per the rule).
**Re-curate vs re-ingest:** `scripts/recurate.mts` re-runs ONLY curate over the
existing `data/feed/raw.json` (which already carries enrichment topics) — fast, no
network, no LLM key, and the Feed stays intact. Use it after a curate-logic change.
Do NOT do a full local re-ingest without an enrichment key (GEMINI/NVIDIA/NIM): it
would strip `topics` from the whole feed and degrade the verified Feed.

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
- **Sources: 705** (was 682; +23 verified maker RSS sources, 8 dead maker feeds
  repaired/disabled in `d5eed3f`), all zod-valid. The new maker sources fill the
  Workshop on the next ENRICHED ingest (P9 Actions has the key + YouTube + higher
  per-source LIMIT); locally they're thin/capped (see §7).

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
5. Recent reports in `.superpowers/sdd/` — Workshop:
   `workshop-directed-selector-report.md`, `workshop-maker-floor-report.md`,
   `maker-sources-research-report.md`; plus `phase1-*.md` (feed-layout, scoring,
   transcripts, podcast-transcripts, podcast-quality, header, ingest-actions-concurrency).

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
- **Graph nodes open external `item.url`, not the in-app `/item/[id]` reader** — the
  active task; see §8. (`build-graph.ts` sets item `href: it.url`.)
- **Workshop is sparse on local data (10 builds), by design** — most maker sources
  are YouTube/Reddit (Actions-only) or were LIMIT-capped/dead; the directed selector +
  3-min floor + intentional sparse state handle it. The 23 new sources fill it on the
  enriched P9 ingest. NOT a bug. One marginal item ("3D Print Gallery Exhibition", an
  art show) slips via the `3D print` regex in `titleBuildSignal` — narrowing deferred.
- **Podcast transcript QUALITY** — whisper-tiny hallucination + ads; being fixed (see
  §4). Re-ingest after the fix lands.
- **WATCH rail empty locally** (YouTube → Actions only). By design.
- **arXiv/Reddit/HN excluded from the feed** by the <5-min reject. Want papers? →
  "full-text the arXiv PDF" task later.
- **~122 feeds failed** in the last ingest (dead feeds from the aggressive source
  expansion) — Scout (P8) should prune these.
- P9 (orchestration/deploy) not started — everything is local, never deployed.

---

## 8. Do this FIRST — the GRAPH page (`/graph`)

1. **Boot:** read §5, `pnpm install`, build + preview, and **look at the live site** —
   `/graph` first, plus `/` (the Feed, your quality bar) and `/workshop` (the model for
   a directed, distinctive surface). Restart the preview after any change (§1/§6).
2. **Graph's purpose** (spec + founder): show **how the curated signal connects** — a
   knowledge-graph of curated items ● and Reads ● linked where they share topics/
   entities. The founder loves charts/visuals/"impressive design"; this page should be
   a genuinely **compelling, alive, explorable** map (Distill/Pudding/Observable-grade),
   not a generic node blob. Reading comfort + 0 console errors in BOTH motion modes
   stays sacred.
3. **Current state (it EXISTS and works — this is a deep pass, not a from-scratch build):**
   - `apps/site/src/pages/graph.astro` (81 lines) loads curated items + blog Reads,
     builds a model via `apps/site/src/components/graph/lib/build-graph.ts`
     (`buildGraph(items, posts, {minShared:2, maxNodes:60, base})` — links nodes that
     share ≥2 topics/entities; pure, deterministic, tested in `build-graph.test.ts`),
     and renders `ConnectionsGraph.tsx` (172 lines, **React + d3-force** SVG sim:
     `forceManyBody/forceLink/forceCenter/forceCollide`, hover-to-trace-neighbors).
   - It's functional but plain, and capped at 60 nodes over 340 items.
4. **The real work (design + correctness together):**
   - **FIX: nodes must open the in-app reader.** Item nodes currently link to the
     external `it.url` (`build-graph.ts` → `href: it.url`); wire them to `/item/[id]`
     instead (Reads already go to `/reads/<slug>`). This is the one known correctness
     bug (§7) and a natural first commit.
   - **Make it compelling** (feel paramount, the founder's bar): the d3-force SVG is the
     baseline — elevate it. Consider: richer node encoding (size = degree, colour =
     channel, item ● vs Read ● clearly distinct), labels that don't overlap, smooth
     hover/focus that dims non-neighbors, click-to-focus a subgraph, a channel/entity
     filter (reuse the Feed's `khz:channelchange` pattern), and a legend. Scale past 60
     nodes gracefully (cluster/level-of-detail, or filter-driven) so 340 items are
     explorable without a hairball. Canvas/WebGL is OK if it genuinely helps perf/feel —
     but **a WebGL "constellation" hero was already built and REJECTED ("looks shit");
     effect-stacking gets rejected — a strong concept + real interactivity wins**, so
     lead with usefulness and restraint, measure perf, don't assume.
   - Match the Feed/Workshop aesthetic (terminal × editorial, amber/clay, lines-not-
     boxes) and design an intentional sparse/empty state.
5. **Process:** subagents for the build (`frontend-design` + `brainstorming` skills);
   keep `build-graph.ts` pure + TDD'd; verify in a REAL browser (0 console errors BOTH
   motion modes, LOOK at screenshots); commit at clean milestones (the `/item/[id]`
   wiring is a good first one); update the ledger (`.superpowers/sdd/progress.md`). No
   re-ingest needed for this page — it reads the existing curated.json.

**Roadmap order (memory `khazana-page-by-page-roadmap`):** Feed ✅ → Workshop ✅ →
**Graph** → Sources → Taste → Feed (final/personalization pass) → **Publish + full ingest (P9)**.

---

## 9. Idea backlog (cofounder — propose + build)
- **Graph (current task, §8): wire item nodes to in-app `/item/[id]`; make it visually
  compelling; scale past the 60-node cap; channel/entity filter + focus-a-subgraph.**
- Workshop (DONE) — follow-ups: "build difficulty"/"parts list" extraction, saved/
  queued builds, a "weekend build" highlight; narrow the `3D print` regex so art-show
  news ("3D Print Gallery") stops slipping in; wire YouTube/Reddit maker content once
  Actions runs (P9 sets `ALLOW_DIRECT_YOUTUBE`).
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
