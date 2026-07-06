# khazana — Surface Sweep + Efficiency Refactor (design spec)

> Date: 2026-07-06 · Branch: `refactor/surface-sweep` · Status: approved, in build.
> Goal: heavily improve the *lackluster* surfaces (functionality + UI) and pay down cross-cutting
> efficiency debt, without regressing the already award-level surfaces (Feed / Taste / Observatory)
> or the mature design-token system.

## Context (why this, why now)

khazana is LIVE and self-sustaining (see `HANDOFF.md`). The design-token system is strong (4.5/5).
A read-only surface assessment ranked the user-facing surfaces MOST → LEAST lackluster:

1. **Workshop (2.5)** — populated build board is a plain masonry that only looks good empty.
2. **Reads index (3.5)** — tasteful but a conventional static card grid; no sort/hover/progress.
3. **Sources (4.0)** — powerful explorer dragged down by disabled placeholder controls, eager
   `client:load`, and double-shipped JSON.
4. Shell/chrome (4.5), Feed (5), Taste (5), Observatory (5) — strong; leave cores alone.

Cross-cutting efficiency debt found across the codebase:
- Channel/format **filter logic copy-pasted 4×** (Feed, Workshop, Sources, Taste) — no shared helper.
- **Read-time recomputed 2–3× per item** in the Feed build path (`readTimeFromHtml` re-parses body).
- **Eager `client:load`** on the 36k `SourcesExplorer` island + the dataset shipped twice.
- **`Shell.astro` is a 1015-line monolith** carrying inline feed-filter markup/CSS/JS.

## Non-goals (YAGNI)

- Do NOT rework Feed/Taste/Observatory cores (already 5/5).
- Do NOT add backlog features (spaced re-surfacing, RSS-out, connections graph, PWA).
- Do NOT rewrite the design-token system.
- Do NOT re-ingest data or touch the ingest/curate/generate pipelines.

## Phases

### Phase 1 — Efficiency foundation (behavior-preserving; ships invisibly)

**P1.1 Shared filter lib.** Extract the 4 filter implementations into one `apps/site/src/lib/filter/`
module: a pure, unit-tested `applyFilter(items, activeFacets)` plus a small DOM-binding helper for the
show/hide interaction. Migrate Feed, Workshop, Sources, Taste to it. Kills ~3 duplicate copies.

**P1.2 Read-time computed once.** Compute `readTime` a single time in `index.astro`'s build path and
thread the value through `FeedCard`, `registerData`, and `personalizeData` rather than re-parsing the
HTML body per consumer.

**P1.3 Sources hydration + double-ship.** `client:load` → `client:visible` on `SourcesExplorer`; ship
the dataset once (prop **or** inline `<script type="application/json">`, not both); remove the disabled
placeholder SSR controls (or make them functional pre-hydration).

**P1.4 Shell decomposition.** Extract the inline feed-filter markup/CSS/JS from `Shell.astro` into a
focused `FeedFilterBar` component. No behavior change; Shell shrinks materially.

### Phase 2 — Reads index level-up (3.5 → award-level)

Within the existing token system:
- **Per-format visual identity** on cards (beyond a badge) so formats read as distinct at a glance.
- **Hover-preview** revealing the teaser / first graf.
- **Per-card telemetry** (read-time, channel).
- **Sort** — newest / longest / by format.
- **"New since last visit"** marker via `localStorage` (reuse the existing `khz-*` client-state
  convention).
- Filter upgraded from show/hide to proper faceted state, using the Phase-1 shared lib.

### Phase 3 — Workshop level-up (2.5 → matches the rest)

- **Reimagined populated build board**: richer `BuildCard` (metadata, maker-channel identity, status)
  and **sort**, with an immersive populated state so it no longer only looks good when empty.
- **Keep** the strong sparse / ghost-slot empty state as the genuine-empty fallback.
- Filter via the Phase-1 shared lib.

### Phase 4 — Feed "for you" dead-affordance fix (small, high-value)

The "for you" toggle ships `personalizeData` for every item but stays `hidden` for most visitors.
Either surface it honestly with a "calibrating…" state, or gate the payload so affinity data that
never renders isn't shipped. Leans on P1.2's read-time work.

## Working mode & constraints (binding)

- **All code by Sonnet-5 subagents**, dispatched **one at a time** (laptop-safety: parallel local
  builds crashed the Mac twice). No concurrent heavy local work.
- **TDD** per CLAUDE.md: failing test → confirm red → implement → green. No skipping red.
- **Verify via cloud CI**: push branch, `gh run watch` (typecheck + ~1950 tests + strict site build).
  Browser-verify the two reworked surfaces sparingly, one Chrome instance, gate-bypass via
  `localStorage.setItem('khz-gate-v1','1')`.
- **$0 constraint**: no new paid deps; new runtime deps must be offline-safe.
- **Zod-first, strict TS**: `noUncheckedIndexedAccess` holds; no `any` in shared APIs.
- Merge `refactor/surface-sweep` → `main` only when the full sweep is green in CI.

## Success criteria

- Green baseline preserved: `pnpm -r typecheck` 0 errors, full test suite passing (with new filter +
  reads/workshop unit tests added), strict site build succeeds.
- One shared filter module; the 4 duplicate copies removed.
- Read-time parsed once per item in the Feed build path.
- `SourcesExplorer` hydrates on `client:visible` with the dataset shipped once.
- `Shell.astro` materially smaller; feed filter lives in `FeedFilterBar`.
- Workshop and Reads-index visibly raised toward the Feed/Taste/Observatory bar, verified in-browser.
- No regression to Feed/Taste/Observatory.
