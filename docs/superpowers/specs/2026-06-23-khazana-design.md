# khazana — Design Spec (v1)

> *A personal treasury: a living, self-curating feed of the world's best signal +
> a daily-growing collection of gorgeous, interactive, AI-authored blogs — written
> in your voice, hosted free, alive on every device.*

**Status:** Approved (design) — 2026-06-23
**Owner:** Arnav (founder) + Claude (cofounder)
**Cost target:** $0 recurring. No paid APIs, no paid hosting, no machine kept on.

---

## 1. Vision & principles

khazana ("treasure") is one person's curated intelligence surface. Two halves:

1. **Curate** — pull the best of the world's signal (blogs, news, research, Reddit,
   X, company engineering blogs) into **one normalized format**, rank it to *your*
   taste, keep it always fresh and in tune with recent events.
2. **Create** — generate original, **beautiful, interactive** long-form blogs daily,
   in your writing style, grounded in that signal — plus re-render external reads in
   the same elegant style.

**Principles**

- **$0 forever.** Static site + serverless. Only always-on component is a free
  Cloudflare Worker.
- **Cloud-only automation.** Nothing depends on the founder's machine being on.
- **One format.** Everything — a Reddit thread, an arXiv paper, a Netflix eng post —
  becomes a `FeedItem`.
- **Beautiful by default.** Interactive charts/code/animation, never static
  screenshots. A shared component library makes *every* flagship blog consistent.
- **Grounded.** AI blogs cite their sources and pass a verification step.
- **Isolated modules.** Each source, each surface, each pipeline stage is a small,
  independently testable unit with a clear contract.

---

## 2. Architecture at a glance

Everything is static + serverless:

```
┌─ GitHub Actions (cron, cloud) ─────────────────────────────┐
│  ingest → normalize → cluster/dedup → score → rank         │
│  └─ free LLM (Gemini/NVIDIA) tags + summarizes bulk items  │
│  └─ Claude Code Action (YOUR subscription via OAuth token) │
│        writes daily flagship interactive blogs (MDX)       │
│  → commits JSON feed + MDX blogs → triggers site build     │
└────────────────────────────────────────────────────────────┘
        │ static build (Astro)                ▲ taste profile
        ▼                                      │
┌─ GitHub Pages (free, public) ──────┐   ┌─ Cloudflare Worker + KV ─┐
│  the site: feed + reads + workshop │──▶│ collects open/read/dwell  │
│  PWA, offline, ⌘K, search, graph   │   │ events, syncs devices     │
└────────────────────────────────────┘   └───────────────────────────┘
```

**Data lives in the repo.** Normalized feed JSON and flagship MDX are committed by
the Actions jobs; the site is a pure static build over that data. The only external
state is engagement events in Cloudflare KV.

---

## 3. Surfaces

### 3.1 The Feed (terminal side)
Live, ranked, normalized stream from all sources. Dense, fast, dark-first. Mono
labels, topic **channels**, a **trending ticker**, **⌘K command palette** for
jump/search/filter. Each card is a `FeedItem`; clustered duplicates show "N sources."

### 3.2 The Reads (editorial side)
Long-form, Pudding/Distill/NYT-graphics quality. Two kinds:
- **Flagship** — original AI-authored interactive blogs in your style (see §6).
- **External** — third-party articles rendered in khazana's reader-style (reader-mode
  normalization: same typography/theme even when the source is plain). Interactive
  elements are added when the data supports it; otherwise presented cleanly.

### 3.3 The Workshop (ideas board)
First-class board for **buildable ideas** — DIY, 3D printing, IoT/embedded, AI
projects — mined from Reddit/X/HN, tagged and saved. A maker's pinboard, not buried
feed items.

---

## 4. Sources (all free / best-effort)

Each source is an isolated module: `fetch → map to FeedItem`. Adding a source = one
small file implementing the `Source` interface.

| Source | Access | Reliability | Channels |
|---|---|---|---|
| Reddit | public JSON API | solid | ideas, news, all topics |
| Hacker News | Algolia + Firebase API | solid | tech, AI, ideas |
| RSS/Atom (news, Substack, Medium, personal blogs) | RSS | solid | all topics |
| **Company engineering blogs** (Netflix, Stripe, Cloudflare, Uber, Meta Eng, Google Research, Airbnb, Discord, Figma, Dropbox, Spotify, GitHub, AWS, LinkedIn, Notion, …) | RSS | solid | tech, data science, AI |
| arXiv + research blogs | RSS / arXiv API | solid | AI, quantum, science, DS |
| X / Twitter | **Nitter / RSS-bridge mirrors, best-effort** | flaky — degrades gracefully | live news, ideas |

**Resilience:** every source runs independently; a failing source (esp. X mirrors)
logs a warning and is skipped for that run — never breaks the pipeline.

**Channels (topics):** history, geopolitics, politics, geography, science, tech, AI,
quantum computing, data science (esp. **DS × sports** + data-strategy applications),
finance — plus Workshop idea-streams (DIY / 3D printing / IoT / embedded / AI projects).

---

## 5. The common format — `FeedItem`

The contract that makes "one format" real:

```ts
interface FeedItem {
  id: string;                 // stable hash of source + url
  source: string;             // "netflix-techblog", "r/dataisbeautiful", ...
  sourceType: 'reddit' | 'hn' | 'rss' | 'eng-blog' | 'arxiv' | 'x' | 'news';
  url: string;                // canonical original link (always preserved)
  title: string;
  author?: string;
  publishedAt: string;        // ISO
  fetchedAt: string;          // ISO
  topics: string[];           // channel tags (LLM-assigned)
  entities: string[];         // people/orgs/places (LLM-assigned)
  summary: string;            // 2-line LLM summary
  body?: string;              // normalized reader text (when fetchable)
  media: MediaRef[];          // images/video/charts
  metrics?: { score?: number; comments?: number };
  clusterId?: string;         // dedup/cluster membership
  tasteScore?: number;        // personalization rank signal
  kind: 'link' | 'discussion' | 'paper' | 'idea';
}
```

Flagship blogs are authored as **MDX** with frontmatter that maps onto the same
topic/entity vocabulary, so feed and reads share one taxonomy.

---

## 6. Flagship interactive blogs (the crown jewel)

Written daily by the **Claude Code Action on your subscription, in the cloud** —
synthesizing the day's top clusters + your taste profile, in **your writing style**
(a `STYLE.md` voice guide we author together).

### 6.1 Formats (storytelling engines)
Different topics deserve different storytelling. A blog declares its `format`:

- **Dispatch** — data-driven Pudding/Distill-style explainer. Interactive charts woven
  into prose, scroll-driven reveals. For DS, finance, science, tech, AI, quantum.
- **Chronicle** — *historical fiction storytelling*. Immersive, scene-driven,
  present-tense narrative prose that reads like a novel — but every fact is grounded
  and cited (sources in margin notes, not breaking the spell). For history,
  geopolitics, geography.
- **Field Notes** — concise synthesis / briefing. For fast-moving news clusters.

Formats are templates in the component library; adding a format = one template + a
prompt profile. (More can be added later; these three ship in v1.)

### 6.2 Interactive component library
A reusable MDX component set so *every* flagship is consistently gorgeous:
`<Chart>` (Observable Plot / D3), `<RunnableCode>` (Sandpack), `<Scrolly>`
scroll-driven steps, `<Annotation>`, `<DataTable>`, `<Map>`, `<Timeline>`,
motion via Motion/GSAP. Interactive, animated, alive — never static screenshots.

### 6.3 Grounding & verification
- Every claim links to the source `FeedItem`s it synthesized from.
- A second LLM pass fact-checks before publish (critical for history / geopolitics /
  finance). Failing claims are flagged or cut. Nothing publishes unverified.

---

## 7. Curation & taste-learning

- **Enrich at ingest:** free LLM (Gemini/NVIDIA free tier) assigns topics, entities,
  and a 2-line summary to every item.
- **Cluster + dedup:** the same story across sources collapses into one card.
- **Behavioral taste profile:** the Cloudflare Worker logs `open / read / dwell`
  events. A daily job builds a topic/entity **affinity vector** with **recency decay**
  and a **minimum-history guard** — quiet until it has enough signal, then
  **aggressively** personalizes ranking (founder's stated preference: automatic,
  aggressive, not jumpy on short history).
- **Ranking:** `tasteScore = f(affinity, recency, source quality, cluster size)`.
- **Taste dashboard:** a transparent page showing what khazana thinks you like,
  tunable. Automatic, but not a black box.

---

## 8. Behavior store — Cloudflare Worker + KV

- One tiny Worker, deployed via the **Wrangler CLI** (`wrangler deploy`), free tier,
  never sleeps. Receives engagement beacons from the static site; stores per-day
  aggregates in **KV**, keyed by an anonymous device id reconciled to one profile.
- Cross-device: laptop + phone post to the same Worker → unified taste.
- The nightly Actions job reads aggregates to recompute the taste profile.
- No PII; founder-only; CORS locked to the Pages origin.

---

## 9. Added features (high-conviction cofounder picks)

- **Full-text search** — Pagefind (static, zero backend).
- **⌘K command palette** — jump / search / filter; fits the terminal aesthetic.
- **PWA** — installable, **offline reading**, **read-later queue**.
- **Connections graph view** — related items/blogs by shared topic/entity (ties into
  the founder's love of knowledge graphs).
- **RSS-out + auto digest** — a generated daily/weekly digest page + feed so khazana
  actively informs you.
- **Spaced re-surfacing** — resurface older gems matching current interests.

---

## 10. Tech stack

- **Astro** — static output → Pages; content collections; MDX; interactive islands
  (React/Svelte) only where needed.
- **TypeScript** ingestion + pipeline scripts (run in Actions).
- **Cloudflare Worker + KV** — behavior store (Wrangler CLI).
- **GitHub Actions** — cron ingestion/curation, Claude Code Action flagship gen,
  static build + Pages deploy.
- **Interactive layer** — Observable Plot / D3, Sandpack, Motion / GSAP, scrollama.
- **Search** — Pagefind. **Hosting** — GitHub Pages (public repo).

---

## 11. Cofounder scaffolding (built first, for *us*)

- `CLAUDE.md` — architecture, conventions, pipeline map, how to add a source/format.
- `EXPLORER.md` — living **cofounder journal**: roadmap, idea backlog, decisions log,
  "what's next" — so the cofounder keeps pushing the product forward every session.
- `STYLE.md` — the founder's writing-voice guide that drives flagship generation.
- Memory files for durable project facts.

---

## 12. Scheduling (GitHub Actions cron)

- **Feed refresh + curation:** every ~2–3h (public repo = unlimited Actions minutes).
- **Taste profile recompute:** daily.
- **Flagship generation + verification:** daily (Claude Code Action).
- **Digest:** daily/weekly.
- All jobs commit results and trigger the static rebuild + Pages deploy.

---

## 13. Build order (full vision, dependency-ordered — deploy only when whole)

1. Scaffolding + `FeedItem` format + repo/CI skeleton.
2. Ingestion + normalization (Reddit, HN, RSS, eng-blogs, arXiv, X-mirror).
3. Cloudflare Worker + KV + taste-profile recompute.
4. Astro site shell — Feed / Reads / Workshop surfaces.
5. Interactive component library + the three flagship formats.
6. Curation: enrich → cluster/dedup → rank.
7. Claude flagship generation + grounding/verification.
8. Search / graph / PWA / digest / taste dashboard.
9. Actions cron wiring (ingest, curate, generate, build, deploy).
10. **Deploy** to GitHub Pages.

---

## 14. Open items to resolve during implementation

- Exact Claude Code Action subscription auth (`claude setup-token` → secret) — verify
  current mechanism at build time.
- Nitter/RSS-bridge instance selection + fallback list (volatile).
- Free-LLM provider/key setup (Gemini vs NVIDIA NIM) + rate-limit handling.
- KV schema + device-id reconciliation details.
- `STYLE.md` voice — authored interactively with the founder before first generation.
