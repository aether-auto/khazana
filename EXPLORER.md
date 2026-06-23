# EXPLORER.md — khazana cofounder journal

> Living document. Update after every plan completes. Read this before every session.

---

## North Star

A personal, self-curating treasury of the world's best signal + daily AI-authored interactive
blogs — written in your voice, hosted free, alive on every device.

---

## Now

**Active plan: P1 — Foundation & Contracts**

- [x] T1: Monorepo skeleton + `@khazana/core` shell
- [x] T2: Canonical vocabularies (channels, source types, kinds, formats)
- [x] T3: `FeedItem` schema + stable id
- [x] T4: `Source` interface + registry contract
- [x] T5: `Format` contract + v1 format data
- [x] T6: Cofounder scaffolding (CLAUDE/EXPLORER/STYLE) + seed source registry
- [ ] T7: CI workflow (GitHub Actions)

---

## Roadmap

| Plan | Scope | Status |
|---|---|---|
| **P1** | Monorepo skeleton, `@khazana/core` contracts (FeedItem, Source, Format, registry), cofounder scaffolding, CI | In progress |
| **P2** | Ingestion + normalization — `packages/ingest`: Reddit, HN, RSS, eng-blogs, arXiv, X-mirror fetchers, each returning `FeedItem[]` | Pending |
| **P3** | Cloudflare Worker + KV + taste-profile recompute — `apps/worker` | Pending |
| **P4** | Astro site shell — Feed / Reads / Workshop surfaces, dark-first, terminal aesthetic, ⌘K palette, Pagefind search | Pending |
| **P5** | Interactive component library + three flagship format templates (Chronicle, Dispatch, Field Notes) | Pending |
| **P6** | Curation pipeline: enrich (free LLM) → cluster/dedup → rank → taste profile | Pending |
| **P7** | Claude flagship generation + grounding/verification (model tiering); `STYLE.md` must be filled before this plan | Pending |
| **P8** | Source Scout: registry + discovery/evaluation/prune + review surface | Pending |
| Deploy | Actions cron wiring (ingest, curate, generate, scout, build, deploy) → GitHub Pages | After P8 |

---

## Idea Backlog

### Backlog formats (plugins, pull in post-P5)

- **The Thread** — synthesize a Reddit / HN / X discussion into a structured narrative
- **Counterfactual** — what-if analysis with branching scenarios
- **Profile** — person / org / place portrait, sourced from FeedItems
- **Atlas** — map-driven geography story (pairs with Chronicle's Map component)
- **Debate** — steelmanned opposing views with a perspective toggle
- **Annotated** — interactively annotate a primary source (paper, speech, ruling)

### Backlog features

- **Spaced re-surfacing** — resurface older gems that match current interest vector (recency-decayed
  affinity score crosses a threshold again)
- **RSS-out + auto digest** — generated daily/weekly digest page + feed so khazana actively pushes
  to you, not just waits to be visited
- **Taste dashboard** — transparent page showing the affinity vector, tunable by the founder
- **Connections graph view** — related items/blogs by shared topic/entity (founders love of
  knowledge graphs made navigable)
- **PWA + offline** — installable, offline reading queue, works on phone
- **⌘K command palette** — jump / search / filter from anywhere in the site

---

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-23 | Hybrid cloud generation via Claude Action OAuth (no local machine required) | $0 recurring; runs fully in GitHub Actions using the founder's Claude subscription via OAuth token |
| 2026-06-23 | X sources via best-effort Nitter/RSS-bridge mirrors only | X API is not free; mirrors are volatile — sources that fail are skipped gracefully, never breaking the pipeline |
| 2026-06-23 | Cloudflare Worker + KV as behavior store | Free tier; globally deployed; never sleeps; fits the $0 constraint perfectly |
| 2026-06-23 | Public GitHub repo + GitHub Pages for hosting | Free static hosting, unlimited Actions minutes on public repos; Pages handles CDN |
| 2026-06-23 | Terminal × editorial aesthetic | Founder's stated visual identity: dense, dark-first, mono labels on the feed side; Pudding/NYT-graphics quality on the Reads side |
| 2026-06-23 | Six v1 formats as first-class data (Format objects), not hardcoded branches | Formats can be added as plugins; the system grows without touching pipeline code |
| 2026-06-23 | Columns + on-demand generation (not one or the other) | A Sunday Chronicle gives a publication-like heartbeat; on-demand picks handle whatever the day's signal warrants |
| 2026-06-23 | Auto-add high-confidence sources; queue borderline for one-tap review | Keeps the source set fresh without requiring founder input for every new feed |
| 2026-06-23 | Model tiering: free LLM for volume, Sonnet for work, Opus rarely | Keeps everything inside free/subscription limits; Opus reserved for Chronicle-quality prose |
| 2026-06-23 | Zod as single source of truth for all cross-subsystem types | Runtime validation + TS type inference from one schema; no hand-duplication; fails loudly on bad data |

---

## Open Questions

> From design spec §14 — resolve during implementation of the relevant plan.

1. **Claude Code Action auth** — exact mechanism for `claude setup-token` → GitHub secret.
   Verify at P7 build time; mechanism may shift between now and then.
2. **Nitter/RSS-bridge instances** — which instances to use as X mirrors, and what the fallback
   list looks like. Volatile; evaluate at P2 build time.
3. **Free LLM provider** — Gemini vs NVIDIA NIM; API key setup; rate-limit handling strategy.
   Decide at P6 build time based on current free tier availability.
4. **KV schema + device-id reconciliation** — exact key structure in Cloudflare KV; how laptop
   and phone resolve to one taste profile. Design at P3 build time.
5. **STYLE.md voice** — the founder's example paragraphs that drive flagship generation quality.
   Must be filled interactively with the founder before P7 begins.
