# khazana — Agent Handoff

> You are taking over as **cofounder** of khazana. Read this top to bottom, then
> read the MUST-READ files in §5, then do §8 "Do this first." This doc is the
> single source of truth for picking up cold. **Your next focus is the TASTE page**
> (`/taste`) — and the Cloudflare Worker per-device summary endpoint that powers it.
> (Feed, Workshop, Graph→**Observatory**, and **Sources** are all DONE — see §4.)

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
`/workshop` ✅ (directed maker board) · `/graph` ✅ (the **Observatory** — analytics
dashboard, NOT the old node-graph) · `/sources` ✅ (faceted source explorer) ·
**`/taste`** (personalization/affinity surface — YOUR NEXT TASK).

### Canonical vocab (single source of truth in `@khazana/core`)
**Channels:** history, geopolitics, politics, geography, science, tech, ai, quantum,
data-science, ds-sports, data-strategy, finance, ideas, diy, 3d-printing, iot,
embedded, ai-projects · **SourceType:** reddit, hn, rss, eng-blog, arxiv, x, news,
youtube, podcast · **FeedItem.kind:** link, discussion, paper, idea, video, audio.

---

## 4. Current state (branch `p1-foundation`, never deployed, no git remote)

**DONE + committed + browser-verified (0 console errors both motion modes, 726
tests, typecheck clean): Feed, Workshop, the Observatory (`/graph`), Sources
(`/sources`), and an ingestion-robustness pass (reddit / arxiv / youtube / generic
fetcher).** Recent commits (newest first):
- `cf1f37f` ingest: fetcher robustness — browser UA, Accept headers, explicit redirects
- `c268ad4` ingest(youtube): yt-dlp transcripts with a process-level rate-limit gate
- `aca395b` Sources: lazy/windowed rendering for smoothness
- `f7c5241` ingest(reddit): .rss + browser-UA primary, generous pacing, OAuth optional
- `d8ba8b5` ingest(arxiv): full-text via ar5iv/arxiv-HTML mirrors
- `be7d65c` Sources: explain trust scores + distinguish 'deferred' from disabled
- `8e23988` Sources: replace the unreadable name-wall with a faceted source explorer
- `74b186d` / `5a02368` Observatory: replace the dead node-link /graph with a data/chart dashboard + freshness affordance
- (earlier) `745760d` Workshop maker floor · `66c2e40` P0 fixes · `710fba7` Feed deep pass · `553e6a1` ingest base

**Observatory (`/graph`) — the old d3-force node-link graph was REJECTED ("the
graph is shit") and DELETED.** Root cause was structural: it leaned on `entities`,
empty across all 340 items. Rebuilt as **THE OBSERVATORY**: a dense, scroll-through
analytics dashboard over the dimensions that ARE populated (topics co-occurrence,
tasteScore, trustScore, clusterId, read-time, sources, time). Pure TDD lib
`apps/site/src/components/observatory/lib/build-analytics.ts`; 7 sections (stat band,
treemap+chord, trust×taste scatter, read-time dist w/ 15-min peak, provenance,
streamgraph+calendar, clusters); 6 `client:visible` d3 islands. It updates at BUILD
cadence (re-runs `analyze()` over live `curated.json`/`taste.json` each deploy); a
masthead "snapshot · refreshes daily" line makes that legible. The LIVE personal/taste
layer is deferred to the Taste page's Worker endpoint (see §8 + founder memory
`observatory-live-data-decision`).

**Sources (`/sources`) — was an unreadable wall of 705 names; rebuilt as a faceted,
searchable source explorer.** Pure TDD lib
`apps/site/src/components/sources/lib/build-sources.ts` joins the registry to the
curated feed (`item.source === entry.id`) → `EnrichedSource` (live itemCount /
read-time / last-seen / produced-channels / status) + facets + health. Island
`SourcesExplorer.tsx` (`client:load`): instant search, facet chips (status · type ·
channel · provenance), sort, **lazy/windowed rows** (page 60, IntersectionObserver),
and a slide-in **per-source dossier drawer**. The dossier shows a **TRUST BASIS**
(`assessTrust()` — tier + plain-English rationale + evidenced factors), and the 208
YouTube sources read **"deferred · runs in Actions"** (a `deferred` status, cool
`--info` token) — cloud-gated, not dead. Health band surfaces the 122 failing feeds.
URL-synced (`?source=<id>` deep-link). NOTE: registry shows **682** (live
`data/sources.json` cache); the 705 seed lands on `rm data/sources.json` + re-ingest.

**Ingestion-robustness pass (the handoff's "IP hard-blocked" notes are now STALE —
verified live from this machine):** the unifying lesson is **a browser User-Agent +
proper pacing/impersonation is the unlock.**
- **reddit** — was failing because the dispatcher did `res.json()` on `.rss` URLs with
  a bot UA. Now: `.rss` (Atom via `parseRssFeed`) + a **browser UA** + generous per-host
  pacing (`REDDIT_MIN_GAP_MS`, default 4000ms) + 429 backoff; optional OAuth
  client-credentials JSON behind `REDDIT_CLIENT_ID/SECRET`. **Verified: pulls real items**
  (it's a UA+rate block, NOT an IP ban). Reddit's per-IP `.rss` budget is tight — pace it.
- **arxiv** — abstract-only feeds (<5min) → all 43 dormant. Added a full-text mirror chain
  `ar5iv.org → ar5iv.labs → arxiv.org/html` (`packages/ingest/src/arxiv-fulltext.ts`,
  wired as step-0 of the arxiv extract chain). **Verified: papers now 24–132 min** (clear
  the 5-min floor). Per-host limited; `ARXIV_HTML_MIRRORS`/`ARXIV_HOST_*` knobs.
- **youtube** — yt-dlp now extracts real captions FROM THIS IP (the watch page/endpoints
  return 200 with a browser UA; legacy timedtext is empty + InnerTube is signature-gated, so
  yt-dlp is required). Reworked `youtube.ts`: lean invocation (`--sub-langs "en,en-orig"`
  only — the broad glob caused 429s — plus `--sleep-*`, retries, optional `--impersonate
  chrome`), async `execFile`, and a **`YtDlpGate`** (concurrency 1 + min-gap
  `YT_DLP_MIN_GAP_MS` default 4000ms). yt-dlp runs FIRST (proxies are dead) when
  `ALLOW_DIRECT_YOUTUBE=1`. **Verified: 3/3 real transcripts, paced ≥4s apart.** yt-dlp is a
  pip `--user` module here → run via a `python3 -m yt_dlp` shim on PATH; `pip install
  "yt-dlp[default,curl-cffi]"` enables impersonation (curl_cffi installed locally).
- **generic fetcher** (`build-source.ts`) — now sends a browser UA + feed `Accept` header +
  explicit `redirect:"follow"` + a header-override seam. **Honest:** this is hygiene; the 122
  "failing" feeds are mostly genuinely dead / moved / mis-registered (404 / DNS / HTML-as-feed)
  → a **Scout (P8) / registry-triage** problem, NOT a fetcher one (a robust re-probe recovered ~1/12).

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
- **YouTube: NOW WORKS LOCALLY via yt-dlp** (the old "IP hard-blocked" claim is STALE —
  re-verified 2026-06-28). The watch page + endpoints return 200 with a browser UA; legacy
  timedtext is empty and InnerTube is signature-gated, so **yt-dlp is required** and it
  extracts real captions here (3/3 verified). `youtube.ts` reworked: yt-dlp FIRST (the
  Invidious/Piped proxies ARE dead) when `ALLOW_DIRECT_YOUTUBE=1`, lean
  `--sub-langs "en,en-orig"` invocation + `--sleep-*` + optional `--impersonate chrome`, and a
  `YtDlpGate` (concurrency 1 + `YT_DLP_MIN_GAP_MS` default 4000ms) so bulk runs pace politely.
  Run yt-dlp via a `python3 -m yt_dlp` shim on PATH; `pip install "yt-dlp[default,curl-cffi]"`
  for impersonation. The WATCH rail can populate locally now if you enable `ALLOW_DIRECT_YOUTUBE=1`
  + run a youtube ingest (paced) — but a full enriched re-ingest still belongs to P9.
- **Sources: 705 in the seed, 682 in the live `data/sources.json` cache.** `/sources` reads the
  live cache (so it shows 682). `rm data/sources.json` + re-ingest to pick up the full 705 seed.
  Status split (local): ~209 producing · 143 dormant (mostly arxiv/hn <5min + LIMIT-starved) ·
  208 deferred (all YouTube) · 122 failing (mostly dead/moved/mis-registered → Scout/registry).

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
5. Recent reports in `.superpowers/sdd/` (newest work first) —
   `observatory-foundation-report.md` + `observatory-chart{A,B,C}-report.md`;
   `sources-foundation-report.md`, `sources-island-report.md`,
   `sources-trust-deferred-report.md`, `sources-lazyload-report.md`;
   `reddit-fix-report.md`, `arxiv-fulltext-report.md`, `youtube-ytdlp-report.md`,
   `fetcher-robustness-report.md`; plus older Workshop `workshop-*.md` + `phase1-*.md`.

---

## 6. How to run / verify

```bash
pnpm install                                 # includes @huggingface/transformers + onnxruntime (podcast Whisper)
pnpm test                                    # 726 tests
pnpm -r typecheck
pnpm --filter @khazana/site build
cd apps/site && pnpm exec astro preview --port 4321   # ONE preview; kill stale ones first: pkill -9 -f astro
```
**Browser-verify harness scripts** live in `/tmp/khz-shot/*.mjs` (the recent ones:
`OBS-*`/`obs-final.mjs` Observatory, `src-*.mjs` Sources). **Network verify harnesses** for the
ingestion fixes (run YOURSELF, never via a subagent): `packages/ingest/scripts/verify-reddit.mts`
(`REDDIT_MIN_GAP_MS=6000 …`), `verify-arxiv.mts`, `verify-ytdlp.mts`
(`ALLOW_DIRECT_YOUTUBE=1 YT_DLP_MIN_GAP_MS=4000 YT_DLP_IMPERSONATE=1 …`, needs the yt-dlp shim).
**Browser verify harness:** `playwright-core` at `/tmp/khz-shot`; system Chrome via
`chromium.launch({ channel: "chrome", headless: true })`. Load each page, collect
`console`(error)+`pageerror`, scroll, screenshot fullPage, assert **0 errors in BOTH**
`reducedMotion:'no-preference'` and `'reduce'`. (Headless can't load YouTube
thumbnails → grey; fine.) **Rebuild + restart the preview after any code change.**

**Re-ingest (run YOURSELF in a background shell, never via an agent):**
```bash
rm -f data/sources.json     # so the 705-source seed is used (not the stale 682 cache)
SOURCE_TYPES=rss,news,podcast,arxiv,eng-blog,reddit,hn LIMIT=2 \
  pnpm exec tsx scripts/real-ingest.mts
# Writes data/feed/{raw,curated}.json. ~60-80 min (podcast Whisper is the bottleneck, ~40s/episode at whisper-tiny).
# Knobs (concurrency.ts / whisper.ts): INGEST_CONCURRENCY=6, PER_HOST_MAX_CONCURRENT=2,
#   PER_HOST_MIN_GAP_MS=200, WHISPER_CONCURRENCY=1, WHISPER_MODEL, WHISPER_MAX_AUDIO_BYTES=25MB,
#   optional GROQ_API_KEY (hosted transcription).
# NEW (rate-limit knobs — ADHERE TO THESE; the founder stressed it repeatedly):
#   REDDIT_MIN_GAP_MS (default 4000, raise to 6000+ if 429s), optional REDDIT_CLIENT_ID/SECRET (OAuth),
#   ARXIV_HOST_MIN_GAP_MS (arxiv mirrors), and for youtube: ALLOW_DIRECT_YOUTUBE=1 +
#   YT_DLP_MIN_GAP_MS (default 4000) + YT_DLP_IMPERSONATE=1 (needs curl_cffi) + the python3 -m yt_dlp shim.
```
⚠️ **A full local re-ingest is DESTRUCTIVE + degrading without an enrichment key.** `real-ingest.mts`
`writeFeed` **OVERWRITES** `raw.json` (does NOT merge), and a run WITHOUT a free-LLM key
(GEMINI/NVIDIA/NIM) strips `topics` from the whole feed → degrades the verified Feed/Observatory.
The reddit/arxiv/youtube fixes are **verified at the fetcher level** (harnesses above) but are NOT
yet reflected in the committed `curated.json` — that lands at the **P9 enriched Actions run**. To
re-curate after a curate-logic change WITHOUT re-fetching, use `scripts/recurate.mts` (no network/key).

---

## 7. Known issues / carry-forwards (none blocking)
- **The committed `curated.json` does NOT yet reflect the reddit/arxiv/youtube fetcher fixes** —
  they're verified at the fetcher level (harnesses, §6) but a feed-level re-ingest is deferred to
  the P9 enriched run (a local re-ingest without an LLM key degrades the feed — §6). So locally:
  arxiv/reddit/youtube items are still thin in `curated.json` until P9.
- **122 failing feeds = a Scout/registry problem, not a fetcher one.** Verified: a robust re-probe
  (browser UA + Accept + redirects) recovered ~1/12 — the rest are dead (404), DNS-failed, moved
  (redirect to non-feed), or mis-registered (HTML page as a feed, e.g. `linkedin-engineering`).
  **The real fix is a Scout (P8) prune/rediscover pass or a registry triage** that disables the
  confirmed-dead and corrects mis-registered URLs. Good standalone task.
- **Reddit `.rss` per-IP budget is tight** — even paced, ~3rd sub in a burst can 429. Raise
  `REDDIT_MIN_GAP_MS` (6000+) or add OAuth (`REDDIT_CLIENT_ID/SECRET`, free, founder must register
  an app at reddit.com/prefs/apps) for the 100 QPM authenticated budget.
- **Workshop sparse on local data (10 builds), by design** — fills on the enriched P9 ingest. One
  marginal item ("3D Print Gallery Exhibition") slips via the `3D print` regex in `titleBuildSignal`.
- **Podcast transcript QUALITY** — whisper-tiny hallucination + ads; see `.superpowers/sdd/phase1-
  podcast-quality-report.md`. Optional free **Groq** tier (`GROQ_API_KEY`) the founder may enable.
- **The Observatory's taste panels show curate's *quality* tasteScore, not personal affinity** — the
  LIVE personal layer is the Taste page's job (§8). Build the Worker endpoint once, hydrate both.
- P9 (orchestration/deploy) not started — everything is local, never deployed.

---

## 8. Do this FIRST — the TASTE page (`/taste`) + the live personal layer

1. **Boot:** read §5, `pnpm install`, build + preview, **look at the live site** — `/taste`
   first, plus `/graph` (the Observatory) and `/sources` (the model for a polished,
   pure-lib + island surface). Restart the preview after any change (§1/§6).
2. **Taste's purpose** (spec + founder): a transparent, tunable read on the founder's
   reading — *what he returns to, and **why he's seeing what he sees***. This is the
   personalization/affinity surface. It must feel like an instrument readout, terminal ×
   editorial, 0 console errors BOTH motion modes.
3. **Current state (thin — a real build, not a polish pass):**
   - `apps/site/src/pages/taste.astro` loads `loadTaste(repoDataDir())`
     (`apps/site/src/lib/taste.ts` → `TastePayload {ready, topics, entities, formatAffinity}`)
     and renders simple bars (topic / entity / format affinity), with a "still learning"
     empty state. **`entities` is empty across the corpus** (don't lean on it). It reads
     `taste.json` at BUILD time only.
   - The behavior loop already exists: `apps/site/src/components/Beacon.astro` →
     `navigator.sendBeacon` → Cloudflare **Worker** `POST /event` → KV; the daily curate run
     exports events (`GET /events`, auth'd by `EXPORT_TOKEN`) and recomputes `taste.json`
     (`packages/curate/src/format-affinity.ts` `buildTastePayload`). Device id:
     `apps/worker/src/client.ts` `getDeviceId()` (localStorage `khazana:deviceId`).
4. **The real work — TWO halves:**
   - **(A) Make `/taste` a genuine, transparent affinity surface.** Elevate beyond flat bars:
     topic/channel affinity with the same group-color system as the Observatory; a **"why you're
     seeing this"** explainer (mirror the Sources `assessTrust()` *trust-basis* pattern — tier +
     plain-English rationale + evidenced factors, but for taste/affinity); ideally **tunable**
     (founder can nudge weights — even if it only writes to localStorage for now). Honest empty/
     learning state. Reuse the `build-analytics`/`build-sources` house pattern: a **pure TDD lib**
     for any derived affinity + a `client:load`/`client:visible` island for interactivity.
   - **(B) The LIVE personal layer (the deferred decision — founder memory
     `observatory-live-data-decision`).** Today taste is build-cadence only. Build a **public
     per-device summary endpoint on the Worker** (`apps/worker/src/handler.ts` — add e.g.
     `GET /summary?deviceId=…` returning that device's aggregated taste/affinity/counts; the
     existing `/events` is auth-gated and unsuitable for a static client). Then **hydrate from it
     client-side on BOTH `/taste` AND the Observatory's taste panels** (taste-by-channel, "highest
     resonance", trust×taste emphasis — see `build-analytics.ts` + `graph.astro`), with the
     build-time `taste.json` as the instant SSR fallback. Build the endpoint ONCE, consume it in
     both places. Keep `$0` (free Worker + KV), CORS correct, fail-soft when the Worker/deviceId
     is absent (graceful SSR fallback, no errors).
5. **Process:** subagents do the build (foundation pure-lib + island, like Observatory/Sources;
   `frontend-design` skill); TDD the libs + Worker handler; verify in a REAL browser (0 console
   errors BOTH motion modes, LOOK at screenshots) AND test the Worker endpoint
   (`apps/worker` has `handler.test.ts` + a test-KV harness); commit at clean milestones; update
   the ledger. No destructive re-ingest needed.

**Roadmap order (memory `khazana-page-by-page-roadmap`):** Feed ✅ → Workshop ✅ → Graph ✅
(Observatory) → Sources ✅ → **Taste** → Feed (final/personalization pass) → **Publish + full
ingest (P9)**.

---

## 9. Idea backlog (cofounder — propose + build)
- **Taste (current task, §8): genuine affinity surface + "why you see this" transparency +
  the live per-device Worker `/summary` endpoint hydrating both Taste and the Observatory.**
- **Source health / Scout (P8):** prune-or-rediscover the 122 failing feeds (mostly dead/moved/
  mis-registered — §7) + fix mis-registered URLs (e.g. `linkedin-engineering` points at an HTML
  page). The `/sources` health band + `failing`/`dormant`/`deferred` statuses already surface the
  targets. High-value, self-contained.
- **Observatory follow-ups:** the taste panels currently use curate's *quality* tasteScore — swap
  to the live personal affinity once the Taste/Worker endpoint exists (§8B).
- **Feed final pass:** the "for you" bento ordering was left a stub pending personalization —
  wire it once Taste lands.
- Workshop follow-ups: "build difficulty"/"parts list" extraction; narrow the `3D print` regex.
- Generate more real Reads (only 1 flagship exists; each grounded in real sources).
- Podcast transcripts: optional free **Groq** (`GROQ_API_KEY`) as primary, local Whisper fallback.
- **P9: GitHub Actions cron** (ingest→curate→generate→scout→build→deploy) + CF Worker + Pages +
  the Claude Code Action. The ingestion fixes (reddit/arxiv/youtube — §4) need their env knobs wired
  here (`ALLOW_DIRECT_YOUTUBE=1`, `pip install "yt-dlp[default,curl-cffi]"`, the rate-limit gaps) +
  a free-LLM enrichment key. A copy-paste account runbook for the founder.

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
