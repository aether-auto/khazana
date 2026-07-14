# khazana

A personal, self-curating intelligence surface for one founder: it pulls the world's best signal
into one normalized feed, ranks it to the founder's taste, and writes original interactive
long-form blogs in the founder's voice — all static + serverless at $0 recurring cost.

## Vision

khazana ("treasure") is a private treasury of signal and writing that runs itself. v1 (the
**Study** face — Feed / Reads / Workshop / Observatory) is built and push-ready. Phase 2 turns
the same observatory outward at the world: **Atlas** — a measured, instrument-forward face with
a live Globe, per-country data-driven reports, a media Bias Lab, Conflict Theater pages,
government structure diagrams, and an indicator browser over everything ingested. Wildly
successful = the densest personal world-data app in existence, always fresh, never hallucinated,
still $0.

## Users

The founder (Arnav) alone, indefinitely, behind the existing site gate — but built so going
public is a repo-visibility toggle, not a rebuild (D1). License-tier enforcement, balanced
framing contracts, and attribution discipline are binding despite the private audience.

## Core value proposition

One place where the world's signal — news events, country indicators, conflict data, media bias —
is ingested continuously, normalized, provenance-labeled, and rendered as dense interactive
instruments, with zero recurring cost and zero AI prose in the world-data path.

## Business model

Not a business. Personal infrastructure. The only budget constraint is binding: $0 recurring.

## Non-goals

- No paid APIs, paid hosting, or always-on machines (Cloudflare Worker free tier is the only
  always-on component).
- No LLM anywhere in the Atlas world-data path — reports are fully deterministic, templated
  micro-copy (D4). AI prose lives only in the Study face's Reads pipeline.
- khazana never asserts truth — it surfaces measured agreement (D7). No synthesized
  "truth-o-meter".
- Atlas and the Study share design system + deploy pipeline, not data (D10).

## Technical foundation

pnpm monorepo: `@khazana/core` (zod contracts), `packages/{ingest,curate,generate,scout}`,
`apps/site` (Astro static, 351 pages), `apps/worker` (Cloudflare Worker + KV). GitHub Actions
drives all automation; GitHub Pages hosts. TypeScript strict everywhere; zod is the single
source of truth for every cross-subsystem shape. Phase 2 adds a private `khazana-world-data`
repo (data lives private, compute runs in the public repo's Actions — D2).

Authoritative phase-2 design specs: `docs/cofounder/specs/*.md` (nine 2026-07-07 documents;
`2026-07-07-atlas-founder-decisions.md` is the binding decision record — where it contradicts a
spec, it wins). v1 vision: `docs/superpowers/specs/2026-06-23-khazana-design.md`.

## Success looks like

- World Data Spine ingesting headless (fast lane running, corpus accumulating — time-gated
  asset, built first per D9).
- Two faces with a designed switch transition (D11); Atlas IA live.
- Globe, Country Reports + Indicator Browser, Bias Lab, Conflict Theaters, Government Structure
  diagrams, and all 16 Extras shipped (D3: density mandate — "put in literally everything
  reliable").
- Everything provenance-labeled, license-tiered, deterministic, $0.

## Current state

v1 built and push-ready (see `EXPLORER.md`, `HANDOFF.md`). Phase 2 (Atlas) is specced but not
built — no atlas pages exist yet. Backlog decomposition in progress via cofounder:spec.

## Key links

- Roadmap: `docs/cofounder/ROADMAP.md`
- Phase-2 specs: `docs/cofounder/specs/`
- Task backlog: `docs/cofounder/tasks.json` + `docs/cofounder/specs/tasks/`
- v1 journal: `EXPLORER.md` · Cofounder memory: `CLAUDE.md`
