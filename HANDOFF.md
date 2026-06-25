# khazana — Agent Handoff

> You are taking over as **cofounder** of khazana. Read this top to bottom, then
> read the MUST-READ files in §5, then do §8 "Do this first." This doc is the
> single source of truth for picking up cold.

---

## 1. Who you are (persona + how to operate)

You are the founder's **cofounder/engineer** on khazana — not a passive assistant.
The founder (Arnav, a SWE who loves numbers, charts, visuals, and impressive
design) hired you to **build the best possible product, proactively**.

Operating rules (the founder has stated these repeatedly — honor them):
- **Never procrastinate, never defer.** "Implement everything now." Don't say
  "next step / later" — do it in this push. If sequencing is needed, do the
  steps back-to-back, don't punt.
- **UI / feel is PARAMOUNT.** The bar is award-level (Awwwards / The Pudding /
  Distill / NYT-graphics), distinctive, *alive*, not "vibecoded AI-template."
  Dramatic but still genuinely usable and comfortable to read.
- **Verify in a REAL BROWSER, always.** Tests + `astro build` passing is NOT
  proof. Load the actual pages headless (see §6), check **0 console errors** in
  BOTH motion modes, and LOOK at screenshots. This caught a Metal GLSL crash,
  blank figures, hidden cards, and marginalia overflow that green tests missed.
- **Use subagents** to keep your own context clean (dispatch implementer + a
  separate reviewer; have them write reports to `.superpowers/sdd/*.md`).
- **Measure performance, don't assume.** The founder explicitly said don't
  self-censor animation over *assumed* cost — build it, profile it (60fps, DOM
  node count, long-tasks), keep what holds up.
- **$0 / offline / no paywall.** No paid APIs, no runtime CDN, no paywalled
  sources, **no paywall-bypass tooling** (archive.today/12ft/etc. are off-limits
  by founder+your decision — lean on the abundance of free full-text sources).
- **Token cost is not the constraint — quality is.** Research aggressively, use
  the best free libraries/skills, don't settle.
- **Keep the ledger updated** (`.superpowers/sdd/progress.md`) as you work — it
  survives context compaction; it is your memory.
- Persistent founder memories live at
  `~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/memory/` (read
  `MEMORY.md` + the files) — UI-feel and authoring rules are there.

---

## 2. The project

**khazana** ("treasure / treasury / vault" in Hindi/Urdu) = a personal,
self-curating **treasury of the world's best signal** + a daily-growing
collection of **gorgeous, interactive, AI-authored blogs ("Reads")** in the
founder's voice.

Two halves:
- **Curate** — pull from hundreds of sources (blogs, eng-blogs, news, arXiv,
  Reddit, Substack, YouTube, podcasts…), normalize everything to ONE format
  (`FeedItem`), extract full text, render it **on khazana itself** (reader-mode,
  not link-outs), cluster/dedup, and rank to the founder's taste.
- **Create** — generate deep, genuinely educational (~12–15 min), data-rich,
  *interactive* blog posts that **teach a concept**, each **grounded in real
  existing source article(s)** (verifiable, cited — never invented), written by
  specialized per-format writer skills.

**Aesthetic identity:** terminal × NYT-editorial. Warm near-black ground
(`#0a0a0b`), ink `#e8e6df`, **amber `#ffb627`** (signal/instrument accent),
**clay `#c1554a`** (editorial accent), hairline rules. Two type voices: **mono**
(JetBrains/SF Mono — instrument/chrome) and **Fraunces** display + **Newsreader**
body (editorial reading). "Lines, not boxes." Reading comfort is sacred (65ch,
~18px Newsreader, warm-grey body, zero animation inside prose columns).

**Cost model ($0):** static **Astro** site on **GitHub Pages**; a single free
**Cloudflare Worker + KV** for behavior/taste; **GitHub Actions** cron runs the
pipeline; the **Claude Code GitHub Action authenticated with the founder's Claude
subscription** (via `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`) is the AI
author + the web-capable Source Scout — **no API cost, machine never on**. Free
LLMs (Gemini/NVIDIA) optional for bulk enrich (pipeline runs fine with NO key).

Full vision spec: `docs/superpowers/specs/2026-06-23-khazana-design.md`.

---

## 3. Architecture (monorepo, pnpm workspaces, TypeScript strict, zod contracts)

```
packages/core      @khazana/core    — contracts: FeedItem, Source, Format, registry, vocab (zod = source of truth)
packages/ingest    @khazana/ingest  — fetch sources → normalize → FeedItem; full-text extraction chain; YouTube/podcast transcripts; resilient
packages/curate    @khazana/curate  — enrich (free LLM, $0 no-key path) → cluster/dedup → taste profile → rank (W_FULLTEXT)
packages/generate  @khazana/generate— pick assignments → build grounded brief → validate draft (the AI-author harness; Claude writes via the Action)
packages/scout     @khazana/scout   — nightly source discovery/eval/auto-add/queue/prune (Claude does web search; code is deterministic harness)
apps/site          @khazana/site    — Astro static site (the product UI)
apps/worker        @khazana/worker  — Cloudflare Worker + KV behavior store + browser beacon client
.claude/skills/writers/*            — per-format writer SKILLS (chronicle/dispatch/teardown/primer/field-notes/build-log)
data/sources.seed.json              — the source registry (383 sources, tracked)
data/feed/curated.json              — GENERATED real feed (gitignored; produced by ingest+curate)
scripts/real-ingest.mts             — one-off real ingestion runner (LIMIT=N pnpm exec tsx scripts/real-ingest.mts)
brand/                              — logo: khazana-logo.json + mark.svg + lockup.svg
docs/superpowers/{specs,plans}/     — the design spec + per-phase implementation plans
.superpowers/sdd/progress.md        — THE LEDGER (durable chronology + every decision)
.superpowers/research/*.md          — research dossiers (motion, 3d, design, dataviz, writers, art-direction)
.superpowers/sdd/*-report.md        — each subagent's detailed report (gitignored, on disk)
```

Surfaces (pages): `/` Feed, `/reads` + `/reads/[slug]` (flagship MDX), `/item/[id]`
(in-app reader for feed articles), `/workshop` (ideas board), `/graph`
(connections), `/taste` (affinity dashboard), `/sources` (registry by category).

---

## 4. Current state (branch `p1-foundation`, never deployed, no git remote yet)

**Done + reviewed (the whole functional product exists and runs locally):**
- P1–P7 all built and independently code-reviewed (see ledger). ~359 tests pass.
- **Real data is live locally:** 383 sources → **861 real items** ingested,
  **742 full-text (86%)** rendered ON khazana; link-only items ranked below
  full-text. `data/feed/curated.json` is on disk (gitignored).
- **Feed redesigned for performance:** featured **bento (top 10)** + paginated
  **card/list toggle** (default list, localStorage), load-more 40/batch. Feed
  DOM nodes 1,722→50, glass 862→11, 0ms long-tasks on scroll.
- **Sources:** 383, paywall-free, balanced-ish across 18 channels, incl. ~69
  YouTube channels, 19 podcasts, academic war/history/geopolitics (War on the
  Rocks, Lawfare, CSIS, JSTOR, Kings and Generals, Hardcore History…).
- **Extraction:** multi-method fallback chain (inline RSS content → browser-UA
  Readability → @extractus/article-extractor → AMP → JSON-LD/meta → optional
  headless OFF by default). $0, no paywall bypass.
- **Brand:** minimalist **gem logo** (amber gem whose girdle = a terminal line)
  — `brand/khazana-logo.json` + SVGs + new favicon. Blinking cursor removed
  (wordmark + favicon).
- **Writer skills** exist; **1 real flagship Read** written + grounded: "The
  Arithmetic of Ruin" (Kelly Criterion, cited to Kelly 1956 + Thorp 2006), with
  a custom interactive KellyChart.

**History worth knowing (so you don't repeat it):**
- A v2 art-direction concept "**The Observatory**" was built — incl. a WebGL
  **constellation hero** ("First Light"). The founder **REJECTED the
  constellation** ("looks shit, doesn't move") — it's been **removed**; the hero
  is now a compact editorial masthead. The OGL shader also caused a Metal crash
  that froze the whole site (fixed). Don't bring the constellation back unless
  asked; DO keep the "Observatory" *identity* (instrument×artifact, semantic
  amber/clay) where it still applies — but treat `art-direction.md` as partly
  superseded.
- Earlier "polished" passes were rejected as "dry / vibecoded." The lesson: a
  strong *concept* + real load-bearing interactivity beats effect-stacking.

**Nothing is running right now.** A preview server may be up at
`http://localhost:4321` (restart per §6 if not).

---

## 5. MUST READ before doing anything (in order)

1. **`.superpowers/sdd/progress.md`** — THE LEDGER. Full chronology, every
   decision, every known issue. Most important file.
2. **This file** (`HANDOFF.md`).
3. **`docs/superpowers/specs/2026-06-23-khazana-design.md`** — the product vision/spec.
4. **`CLAUDE.md`**, **`EXPLORER.md`** (cofounder journal), **`STYLE.md`** (founder
   voice for AI writing — note: example paragraphs still need the founder).
5. Founder memories: `~/.claude/projects/-Users-arnavmarda-Desktop-Dev-khazana/memory/`
   (`MEMORY.md`, `ui-feel-and-animation.md`, `khazana-authoring-system.md`).
6. `.superpowers/research/art-direction.md` (concept; constellation parts dead) +
   `.superpowers/research/{motion,threed,design-patterns,dataviz,writers}.md`.
7. Skim `docs/superpowers/plans/` for how each layer was built.

---

## 6. How to run / verify

```bash
pnpm install
pnpm test                                   # full suite (~359 tests)
pnpm -r typecheck
pnpm --filter @khazana/site build           # static build (uses real curated.json if present, else empty-state)
cd apps/site && pnpm exec astro preview --port 4321   # then open http://localhost:4321
# Regenerate REAL feed data (slow; pulls live + extracts full text):
LIMIT=4 pnpm exec tsx scripts/real-ingest.mts
#   NOTE: it loads data/sources.json if present, ELSE data/sources.seed.json.
#   Delete a stale data/sources.json to pick up new seed sources.
```

**In-browser verification harness (USE THIS — don't trust tests alone):**
- `playwright-core` is installed in `/tmp/khz-shot`; system Google Chrome works
  via `chromium.launch({ channel: "chrome", headless: true })` (no download).
- Pattern: load each page, collect `console`(error) + `pageerror`, scroll
  top→bottom, screenshot fullPage, assert **0 errors in BOTH** `reducedMotion:
  'no-preference'` and `'reduce'`. Screenshots go to `screenshots/` (gitignored).
- You CAN record walkthrough videos (Playwright `recordVideo`) — but they're slow;
  prefer giving the founder the live `localhost` URL to click. (ffmpeg for
  webm→mp4 isn't available; webm opens in Chrome.)

---

## 7. Known issues / nits (none blocking; good "first wins")

- **Extraction nav-leak:** some sites' nav/menu leaks as a link-list at the top
  of the extracted article (Readability imperfection) — tighten the sanitizer.
- **~14% summary-only** (119/861): sites that block/JS-render. Enabling the
  headless fallback (`extract: { headless: true }`) would recover more.
- **Stray non-English item** (a Spanish NASA feed) — add an English filter or
  drop that feed.
- **YouTube transcript hit-rate is modest** (timedtext rate-limits).
- **Graph nodes** still open external `item.url`, not the in-app `/item/[id]`.
- **Category balance** still tech/AI-heavy at the head (niche tails are smaller).
- `data/feed/curated.json` is gitignored (regenerate via ingest; P9 Action will
  generate on deploy). `.superpowers/` reports are on-disk only (gitignored).

---

## 8. Do this FIRST, then build off it

1. **Boot:** read §5, `pnpm install`, build + `astro preview`, and **look at the
   live site in a browser** (feed, an `/item` reader, `/reads/the-arithmetic-of-ruin`,
   `/sources`). Form your own opinion of the feel.
2. **Confirm direction with the founder** briefly (feel is paramount; don't
   guess on big aesthetic moves). Then **knock out the §7 nits** (they're quick
   credibility wins): extraction sanitizer, English filter, graph→/item links,
   maybe enable headless extraction.
3. **Then the big remaining build — P9: Orchestration & Deploy** (this is what
   makes khazana actually *live + self-updating + free*; it needs the founder's
   accounts):
   - GitHub Actions cron: `ingest → curate → generate → scout → build → deploy`.
   - **Claude Code Action on the founder's subscription** (`claude setup-token`
     → `CLAUDE_CODE_OAUTH_TOKEN` repo secret) as the AI author + Scout (web).
   - Wire the **Sonnet fact-checker** (already a hook in `packages/generate`
     `verify.ts`) — scope it to the draft's cited sources (noted in ledger).
   - Deploy the **Cloudflare Worker** (`wrangler deploy`, set `EXPORT_TOKEN`
     secret — it's fail-secure) + wire `PUBLIC_WORKER_URL` for the beacon.
   - GitHub Pages deploy (public repo). Hand the founder a copy-paste runbook for
     the account steps (GitHub repo, CF account, the OAuth token, optional Gemini key).
4. **Generate more real Reads** via the writer skills (only 1 exists). Each MUST
   be grounded in real source article(s) (hard rule — see memory).
5. **Close the taste loop:** wire Worker beacon events → `data/taste.json` →
   ranking (currently profileReady=false; min-history guard). Then the feed
   personalizes (founder wants aggressive learning with a real history floor).

---

## 9. Idea backlog (cofounder — propose + build these)

- **Header logo:** wire the gem mark into the header beside the wordmark (founder
  asked if I wanted to — get their nod).
- A signature **moving** visual for the masthead done *right* (the founder is open
  to it — but the constellation failed; design something profiled + tasteful, not
  effect-stacking).
- **Workshop** as a real maker's idea-board (DIY/3D-printing/IoT/embedded/AI from
  Reddit/YouTube), and **Connections graph** wired to in-app reader.
- **Digest** (daily/weekly auto page + RSS-out), **spaced re-surfacing** of older
  gems, **command-palette** deepening.
- Backlog writer formats (The Thread, Counterfactual, Profile, Atlas, Debate,
  Annotated) — they're plugins; add when generation is flowing.
- Tighten **category balance** + keep the **Source Scout** growing/pruning sources.
- Per-format **recurring columns** (Sunday Chronicle, weekly Ledger).

---

## 10. Git / process notes
- Branch: **`p1-foundation`** (all work is here; no remote, never deployed).
- The build was executed with the **superpowers subagent-driven-development**
  flow (implementer + reviewer subagents per task). The **final whole-branch
  review** and `finishing-a-development-branch` step have NOT been run — do a
  full review before merge/deploy.
- Commit when the founder asks or at clean milestones; end commit messages with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- When you finish meaningful work, append a line to `.superpowers/sdd/progress.md`.
