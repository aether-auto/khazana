# EXPLORER.md — khazana cofounder journal

> Living document. Update after every plan completes. Read this before every session.

---

## North Star

A personal, self-curating treasury of the world's best signal + daily AI-authored interactive
blogs — written in your voice, hosted free, alive on every device.

---

## Now

**v1 — PUSH-READY (2026-07-03).** The whole product is built: `@khazana/core` contracts, ingest +
curate + generate + scout packages, the Astro site (351 pages), 45 interactive components, 7 writer
formats each with a gold-standard exemplar, and 8 shipped Reads. Green baseline: **1906 tests**,
`pnpm -r typecheck` 0 errors, site build 351 pages.

**Reads generation is now a Claude routine, not an Actions step.** This session formalized the
orchestrator-worker pipeline (`.claude/agents/reads-{survey,writer,verify}.md` +
`.claude/commands/reads-run.md`: Opus orchestrates, Sonnet writes/verifies), stripped all Claude
steps out of GitHub Actions (pure-$0 code pipeline: events→ingest→curate→build→deploy), fixed the
deterministic verify gate for parallel writers (per-slug ledgers + slug-scoped `generate verify`),
and passed a go-live readiness review (verdict: GO). See `HANDOFF.md` §3 for the authoritative state.

**What's left is founder-only:** provision secrets per `docs/RUNBOOK.md` (incl. the Cloudflare KV
namespace id — the deploy blocker), push, then register the `reads-run` routine 2×/day. Then the
first Actions dry-run + first routine fire.

---

## Roadmap

| Plan | Scope | Status |
|---|---|---|
| **P1** | Monorepo skeleton, `@khazana/core` contracts (FeedItem, Source, Format, registry), cofounder scaffolding, CI | ✅ Done |
| **P2** | Ingestion + normalization — `packages/ingest`: Reddit, HN, RSS, eng-blogs, arXiv, X-mirror fetchers, each returning `FeedItem[]` | ✅ Done |
| **P3** | Cloudflare Worker + KV + taste-profile recompute — `apps/worker` | ✅ Done (deploy blocked on founder KV id) |
| **P4** | Astro site shell — Feed / Reads / Workshop surfaces, dark-first, terminal aesthetic, ⌘K palette, Pagefind search | ✅ Done |
| **P5** | Interactive component library (45 components) + flagship format templates | ✅ Done |
| **P6** | Curation pipeline: enrich (free LLM) → cluster/dedup → rank → taste profile | ✅ Done |
| **P7** | Claude flagship generation + grounding/verification (model tiering); 7 writer formats + exemplars | ✅ Done |
| **P8** | Source Scout: registry + discovery/evaluation/prune + review surface | ✅ Done |
| **P9 / v1** | Reads-as-a-routine (Opus orchestrator + Sonnet workers), $0 Actions pipeline, go-live review | ✅ Built — push-ready; awaits founder secrets + push (RUNBOOK) |

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
