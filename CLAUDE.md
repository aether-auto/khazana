# CLAUDE.md — khazana cofounder memory

> Read this at the start of every session. Read `docs/superpowers/specs/2026-06-23-khazana-design.md`
> for the full vision and `EXPLORER.md` for current state before any non-trivial work.

---

## What is khazana?

khazana ("treasure") is a personal, self-curating intelligence surface with two halves:

1. **Curate** — pull the world's best signal (engineering blogs, arXiv, HN, Reddit, news, X) into
   one normalized format (`FeedItem`), rank it to the founder's taste, keep it always fresh.
2. **Create** — generate original, beautiful, interactive long-form blogs daily in the founder's
   writing style, grounded in that curated signal. Plus re-render external reads in the same
   elegant style.

Everything is **static + serverless**, $0 recurring cost. The only always-on component is a free
Cloudflare Worker (behavior store). GitHub Actions drives all automation in the cloud; no machine
needs to be on.

---

## Monorepo map

```
khazana/
├── packages/
│   ├── core/           # @khazana/core — all cross-subsystem contracts (zod schemas + types)
│   ├── ingest/         # (P2) source fetchers, one file per source, all returning FeedItem[]
│   ├── curate/         # (P3/P6) enrich → cluster/dedup → rank pipeline
│   └── scout/          # (P8) Source Scout: discover / evaluate / prune sources
├── apps/
│   ├── site/           # (P4) Astro static site — Feed / Reads / Workshop surfaces
│   └── worker/         # (P3) Cloudflare Worker + KV behavior store
├── data/
│   ├── sources.seed.json   # starter source registry (validated by RegistrySchema)
│   ├── sources.json        # live source registry (Scout writes here; gitignore large)
│   └── feed/               # normalized FeedItem JSON (committed by Actions)
├── docs/
│   └── superpowers/
│       ├── specs/          # design spec (authoritative)
│       └── plans/          # per-plan implementation plans (P1..P8)
├── .github/workflows/      # CI + cron jobs
├── CLAUDE.md               # this file
├── EXPLORER.md             # living cofounder journal
└── STYLE.md                # founder writing-voice guide (drives flagship generation)
```

Future packages as the roadmap advances: `packages/ingest`, `packages/curate`, `packages/scout`.
Future apps: `apps/site` (Astro), `apps/worker` (Cloudflare Worker).

---

## Global constraints (binding for every plan)

- **$0 recurring cost.** No paid APIs, no paid hosting, no always-on machines. Static site +
  serverless only. If a dependency requires payment, find the free-tier alternative or cut it.
- **Validation = zod.** Every cross-subsystem data shape lives in `@khazana/core` as a zod schema.
  TypeScript types are `z.infer<typeof Schema>`, never hand-duplicated. No `any` in the core public
  API.
- **TypeScript strict mode** everywhere — `strict: true`, `noUncheckedIndexedAccess: true`.
- **One format.** Everything — Reddit thread, arXiv paper, Netflix eng post — maps to `FeedItem`.
- **Package manager is pnpm.** Never generate `package-lock.json` or `yarn.lock`.

### Canonical vocabularies (single source of truth in `@khazana/core`)

**Channels:** `history, geopolitics, politics, geography, science, tech, ai, quantum, data-science,
ds-sports, data-strategy, finance, ideas, diy, 3d-printing, iot, embedded, ai-projects`

**SourceType:** `reddit, hn, rss, eng-blog, arxiv, x, news`

**FeedItem.kind:** `link, discussion, paper, idea`

**v1 Formats:** `chronicle, dispatch, field-notes, teardown, primer, build-log`

**LicenseTier:** `redistribute-raw-ok, derived-only`

**IndicatorField:** `macro, governance, corruption, wellbeing, procurement, fiscal, elections, conflict`

**WorldEventCategory:** `conflict, diplomacy, politics, economy, disaster, society, science-tech`

**EventSeverity:** `low, medium, high, critical`

**ReferenceRater:** `allsides, adfontes, mbfc`

**CadenceLane:** `fast, medium, slow`

**SystemType:** `parliamentary, presidential, semi-presidential, constitutional-monarchy,
absolute-monarchy, one-party, military-junta, directorial, provisional, other`

**GovBranch:** `executive, legislative, judicial, electoral, other`

**GovTier:** `national, state, local`

**InstitutionKind:** `head-of-state, head-of-government, cabinet, chamber, apex-court,
constitutional-court, election-authority, subnational-executive, subnational-legislature, other`

**PowerRelation:** `appoints, dismisses, confirms, dissolves, vetoes, reviews, elects, confidence`

**SelectionMethod:** `direct-election, indirect-election, hereditary, appointment, ex-officio,
legislature-elected, mixed, other`

**TheaterStatus:** `proposed, active, dormant, archived`

**GeometryStatus:** `licensed, fallback, link-out-only`

**TheaterMetricKind:** `casualties, displacement, fires, nightlights, media-attention,
commodity-impact`

**EngagementKind:** `battle, strike, siege, advance, incident`

---

## Model-tiering policy

| Tier | Used for | Cost |
|---|---|---|
| **Free LLM** (Gemini / NVIDIA NIM free tier) | High-volume per-item enrichment: tag, summarize, entity extraction | $0 |
| **Claude Sonnet 5** (subscription) | ALL blog copywriting, every format including Chronicle (survey → write → verify); Source Scout credibility reasoning; the fact-check/verification passes | subscription, default tier |
| **Claude Opus** (subscription) | The Reads-run **orchestrator's own** curation/QC judgement only (`reads-run` picking the slate, judging verdicts) — never per-format prose. Used sparingly. | subscription, used rarely |

Rule of thumb: **free LLM for volume, Sonnet 5 for every format's writing and verification, Opus only for the orchestrator's own curation/QC judgement.**

---

## How to add a source

1. Add a new entry to `data/sources.json` (or `data/sources.seed.json` for the seed set) matching
   `SourceEntrySchema` from `@khazana/core`.
2. Create a new fetcher in `packages/ingest/src/sources/<id>.ts` implementing the `Source`
   interface from `@khazana/core` — one file, one `fetch(ctx)` that returns `FeedItem[]`.
3. Register it in the ingest index. Run `pnpm test` to verify.

## How to add a format

1. Add the format name to `FORMAT_NAMES` in `packages/core/src/vocab.ts`.
2. Add a `Format` object to `FORMATS` in `packages/core/src/format.ts`.
3. Write a corresponding MDX template under `apps/site/src/formats/<name>/`.
4. Tests in `packages/core/src/format.test.ts` will catch missing entries automatically.

---

## Agentic work rules

- **Use subagents for code/testing work** to keep this session's context clear for architecture
  and decision-making. Writing code directly here burns the main context fast.
- **Read `EXPLORER.md` before starting any session.** It has the current plan, what's done, what's
  open, and the idea backlog — so we never re-derive state we already know.
- **Commit after every task.** Each plan task has an exact commit message — use it verbatim.
- **Tests first.** Write the failing test, confirm it fails, then implement, confirm it passes.
  Never skip the red step.
- **No placeholders in committed code.** If a section genuinely awaits founder input (like
  `STYLE.md` example paragraphs), mark it explicitly; everything else must be real content.
