# P5C — Site Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **BEFORE you touch any visual task (the `CommandPalette` island T2, the `/graph` island T3, the `/taste` page T4):** invoke the `frontend-design` skill (Skill tool) and re-read the existing locked design system in `apps/site/src/styles/tokens.css` + the P5/P5B plans. The aesthetic — **terminal × editorial** — *is the product*. Generic AI-template output (Inter on white, purple gradients, evenly-distributed timid palettes, library-default widgets) is a FAILURE of this plan even if it builds. A ⌘K palette that looks like a generic Spotlight clone, a force graph with rainbow nodes and a blue d3 default, or taste bars in Bootstrap blue are FAILURES. Style every new surface with the **existing P5 CSS variables** — do not invent a palette, do not redefine tokens. Amber `--accent` for blog/Reads, clay `--editorial` for items/format accents, hairline `--rule` dividers, mono chrome.

**Goal:** Fill the four interactive seams P5/P5B deliberately left open in `apps/site`: (1) **Pagefind** build-time full-text search over the built HTML (local assets, no CDN); (2) a site-wide **⌘K `CommandPalette`** React island — static nav/channel commands + live Pagefind content results, a proper accessible modal; (3) a **`/graph`** connections page — a deterministic `buildGraph` model + a `d3-force` island linking curated FeedItems and flagship blog posts by shared topics/entities; (4) a **`/taste`** dashboard reading `data/taste.json` (with a committed `data/taste.sample.json` fallback) rendering topic / entity / format affinities as bars. Plus Shell nav links to `/graph` and `/taste`. Everything builds with **NO** `data/taste.json`, **NO** `data/feed/curated.json`, and **NO** `PUBLIC_WORKER_URL`, and does not regress P5/P5B (existing tests + build stay green).

**Architecture:** Same split P5B established. **Pure helpers** live in `src/lib/` (search) and `src/components/<feature>/lib/` (graph, taste) — deterministic, offline, injected inputs, unit-tested under strict TDD (failing test → run/FAIL → implement → run/PASS → commit): the Pagefind result→item mapper, the ⌘K command matcher/ranker, `buildGraph(items, posts, opts)`, and the taste load-with-fallback + top-N/bar-normalization selectors. **React islands** (`.tsx`) import those helpers and render; islands are not unit-tested — their tasks are *write complete real code → verify with `pnpm --filter @khazana/site build` (every island SSRs a static fallback) + `pnpm --filter @khazana/site exec astro check` (0 errors) → commit*. The site reuses `@khazana/core` (`CHANNELS`, `FeedItem`, `FORMAT_NAMES`/`FORMATS`) and the P5 tokens — never redefined — and the P5B React + `d3` setup (both already in `apps/site/package.json`). Pagefind is wired as a `postbuild` step (`pagefind --site dist`) that indexes `dist/`'s HTML into `dist/pagefind/`, served locally from the site; the runtime loads `/pagefind/pagefind.js` dynamically and degrades gracefully when the index is absent (dev / pre-build).

**Tech Stack:** Astro 5 (`output: "static"`), `@astrojs/react` + React 19 (P5B), `d3` 7 (P5B), Pagefind (new devDep, build-time CLI only — no runtime npm import), TypeScript 5 (strict, ESM, `verbatimModuleSyntax`), vitest 2, zod (via `@khazana/core`). No new runtime UI framework. System/self-hostable fonts only ($0). No external fonts/tiles/APIs.

---

## Global Constraints

*(Copied verbatim from the P5C brief — treat as hard gates.)*

- **$0 / offline:** Pagefind assets are local (served from the site, not a CDN); no external fonts/tiles/APIs; build works with NO `data/taste.json` (sample fallback), NO `data/feed/curated.json` (existing P5 sample fallback), NO PUBLIC_WORKER_URL.
- **Reuse `@khazana/core`** (CHANNELS, FeedItem, FORMATS) + existing P5 tokens + P5B React/d3 setup; never redefine. Don't regress P5/P5B (existing tests + build stay green).
- **Accessibility:** ⌘K is a proper modal dialog (focus trap, Escape, aria, focus restore); graph/search keyboard-usable; prefers-reduced-motion honored.
- **Every island SSRs a static fallback; pure helpers TDD'd offline/deterministic. pnpm; ESM; TS strict; no `any` in public props.**

**Additional encoded decisions (from brief + repo facts):**

- **Pagefind is a CLI-only devDep.** It is invoked as a `postbuild` script (`pagefind --site dist`); it is **never** imported via npm at runtime. The browser loads the generated bundle dynamically with `await import(/* @vite-ignore */ "/pagefind/pagefind.js")` (resolved against `import.meta.env.BASE_URL` for GitHub-Pages base paths). So the pure result-mapper is TDD'd against a **fixture** Pagefind result object — no real Pagefind in tests, no network.
- **Dev fallback (resolved ambiguity).** Pagefind only exists after a full `astro build` + `pagefind --site dist`. In `astro dev` (and any build before the postbuild ran) `/pagefind/pagefind.js` is absent. The search wrapper MUST catch the failed dynamic import and return a sentinel `{ available: false }` so the palette shows a calm "search index not built yet — run a full build" note instead of crashing or spamming the console. This is the only graceful-degradation path; encode it explicitly.
- **`data/taste.json` is gitignored** (it lives next to `data/feed/`, which `.gitignore` excludes; the curate writer in `packages/curate/src/io.ts` emits `data/taste.json`). The dashboard loader MUST fall back to a committed `data/taste.sample.json`. `data/` root is NOT fully ignored (only `data/feed/` and `data/sources.json` are), so `data/taste.sample.json` is committed at the repo `data/` root and read via a small path helper analogous to `src/lib/data.ts`.
- **Taste payload shape (mirror exactly, do NOT redefine in core).** From `packages/curate/src/taste.ts` + `format-affinity.ts`: `TastePayload = { ready: boolean; topics: Record<string, number>; entities: Record<string, number>; formatAffinity: Partial<Record<FormatName, number>> }`. All numeric values are already **0..1 normalized** (max-normalized at curate time). When `ready:false`, `topics`/`entities`/`formatAffinity` are `{}`. The dashboard declares its own local `TastePayload` interface in `src/lib/taste.ts` (the curate package is a pipeline dep, not a site dep — do **not** add `@khazana/curate` to the site). `FormatName` comes from `@khazana/core`.
- **Graph nodes = curated FeedItems (via existing `loadCurated`) + flagship blog posts (via `getCollection("blog")`).** Item node id = `FeedItem.id`; post node id = `post.id` (the slug). Edges link nodes that share ≥ `minShared` (default 2) topics **or** entities. For posts, the topic set is `post.data.channels`; posts have no entities. Determinism: stable id ordering, stable edge ordering (sort by `[source, target]`), no `Math.random` in the model. The d3-force **simulation** seeds node positions deterministically (a fixed radial/phyllotaxis layout by node index) so the SSR fallback and first paint are reproducible; the force tick only relaxes from that seed.
- **ESM rule (repo-wide, `verbatimModuleSyntax` on):** relative imports between `.ts` helper modules use `.js` extensions; `import type` / inline `type` for type-only imports. `.tsx` island imports of sibling `.ts` helpers also use `.js` (same TS resolver). Bare specifiers (`d3`) need no extension. When unsure, run `astro check`.
- **`vitest.config.ts` already globs `apps/**/*.test.ts`** — new `src/lib/*.test.ts` and `src/components/**/lib/*.test.ts` are picked up by root `pnpm test`. **No config change needed.**
- **Verify commands (use these exact forms):** tests `pnpm test` (root vitest) or `pnpm vitest run <path>` for a focused file; build `pnpm --filter @khazana/site build`; type-check `pnpm --filter @khazana/site exec astro check`. Pagefind postbuild runs automatically as part of `pnpm --filter @khazana/site build` once wired (T1).
- **Channel-nav drift guard (do NOT break it).** `Shell.astro` throws at build time if any `CHANNELS` entry is missing from `channelGroups`. `/graph` and `/taste` are **section links** (like feed/reads/workshop), added to the `nav` array and the `active` union — they are NOT channels and must NOT be added to `channelGroups`. The drift guard stays exactly as-is.

---

## Existing seams & repo facts (read before starting)

- **`apps/site/src/layouts/Shell.astro`** — the layout used by every page. Contains: the `active?: "feed" | "reads" | "workshop"` prop + `nav` array (lines ~38-42); the disabled `⌘K` hint button `.cmdk` (lines ~76-79, `disabled`, `aria-label="Command palette (coming soon)"`); the palette-mount + Pagefind seam comment (line ~108, `<!-- SEAM (P5B): ⌘K palette mount + Pagefind search index load go here. -->`); the build-time channel drift guard (lines ~33-35). T2 wires the `.cmdk` button + mounts the island here; T4 adds the two nav links.
- **`apps/site/src/styles/tokens.css`** — authoritative palette + scale. Dark default; light under `prefers-color-scheme: light`. Use `--bg`, `--bg-raised`, `--bg-inset`, `--ink`, `--ink-dim`, `--ink-faint`, `--rule`, `--rule-bright`, `--accent` (amber), `--accent-dim`, `--editorial` (clay), `--editorial-dim`, `--good` (sage), `--focus`; `--font-mono`/`--font-read`/`--font-sans`; `--t-*` type scale; `--s-*` spacing; `--r-sm`/`--r-md`, `--hair`, `--maxw`. **Never redefine these.**
- **`apps/site/src/lib/data.ts`** — `dataDir()` returns the absolute path to `data/feed`. Add a sibling `tasteDataDir()` (or reuse a `repoDataDir()`) for `data/taste.json` / `data/taste.sample.json` at the `data/` root (one level up from `data/feed`).
- **`apps/site/src/lib/feed.ts`** — `loadCurated(dataDir): FeedItem[]` (prefers `curated.json`, falls back to `curated.sample.json`, validates each with `FeedItemSchema`, drops invalid). Reuse it for graph item nodes. Pattern to mirror for the taste loader (fallback + validate + never crash the build).
- **React-island pattern (P5B):** `apps/site/src/components/mdx/Chart.tsx`, `Map.tsx` — `.tsx` default-export component, `useEffect`/`useMemo`/`useState`, imports pure helpers from `./lib/*.js`, renders an SSR fallback (visible pre-hydration) plus a host the live render replaces. d3 is imported as a bare specifier. Match this exactly for the graph island.
- **Pure-helper TDD pattern (P5B):** `apps/site/src/components/mdx/lib/table-sort.ts` + `table-sort.test.ts` — small, deterministic, non-mutating, `.js` relative imports, vitest `expect`/`test`. Match this for all P5C helpers.
- **Astro island mount:** islands mount in `.astro`/`.mdx` with an explicit `client:*` directive (P5B uses `client:load`/`client:visible`). The palette must be available immediately site-wide, so mount it `client:idle` in `Shell.astro` (loads after first paint without blocking) — it renders nothing visible until opened.
- **`@khazana/core`:** `CHANNELS` (18 channels, `as const` tuple), `FeedItem`/`FeedItemSchema`, `FORMAT_NAMES`/`FORMATS`, `FormatName`. Import types with `import type`.
- **Blog content:** `getCollection("blog", ({data}) => !data.draft)`; each post has `post.id` (slug), `post.data.{title, format, channels[], summary, publishedAt}`.

---

### Task 1: Pagefind wiring + `search.ts` wrapper (TDD result mapper) + postbuild

**Goal:** Add Pagefind as a build-time index (local assets, $0/offline) and a thin, injectable search wrapper whose pure result→item mapper is TDD'd offline against a fixture. No UI yet — T2 consumes this.

**Files:**
- Modify: `apps/site/package.json` (add `pagefind` devDep + `postbuild` script + make `build` run it)
- Create: `apps/site/src/lib/search.ts` (wrapper + pure mapper)
- Create: `apps/site/src/lib/search.test.ts` (TDD the mapper)

**Interfaces:**
- Consumes: nothing at module scope (the Pagefind loader is injected so tests stay offline).
- Produces: `mapPagefindResult(raw): SearchResult` (pure), `loadPagefind(opts?): Promise<PagefindApi | null>` (dynamic import + graceful null), `search(api, query): Promise<SearchResult[]>` (orchestration). `SearchResult = { url: string; title: string; excerpt: string }`.

- [ ] **Step 1: Add the Pagefind devDep + postbuild wiring**

In `apps/site/package.json`, add to `devDependencies`: `"pagefind": "^1.1.0"`. Change `scripts` so the index is built after every site build (and document the dev caveat):

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build && pnpm run postbuild",
  "postbuild": "pagefind --site dist",
  "preview": "astro preview",
  "typecheck": "astro check"
}
```

Then install at the repo root: `pnpm install`.

Expected: `pnpm install` succeeds; `pnpm --filter @khazana/site build` runs `astro build` then `pagefind --site dist`, emitting `dist/pagefind/pagefind.js` + index chunks. Confirm: `ls apps/site/dist/pagefind/pagefind.js` exists after a build. (Pagefind indexes the SSR'd HTML the site already produces — no content changes needed.)

> Note: `pagefind --site dist` with no matching content still exits 0 and emits the runtime; the index is just small. The build never fails for lack of content.

- [ ] **Step 2: Write the failing mapper test**

`apps/site/src/lib/search.test.ts`:

```ts
import { expect, test } from "vitest";
import { mapPagefindResult, type RawPagefindResult } from "./search.js";

// Fixture shaped like a resolved Pagefind `result.data()` payload.
const fixture: RawPagefindResult = {
  url: "/khazana/reads/the-week-in-silicon/",
  meta: { title: "The Week in Silicon" },
  excerpt: "Inference at the <mark>edge</mark> is getting cheap.",
};

test("maps url/title/excerpt straight through", () => {
  expect(mapPagefindResult(fixture)).toEqual({
    url: "/khazana/reads/the-week-in-silicon/",
    title: "The Week in Silicon",
    excerpt: "Inference at the <mark>edge</mark> is getting cheap.",
  });
});

test("falls back to url-derived title when meta.title is missing", () => {
  const r = mapPagefindResult({ url: "/khazana/workshop/", meta: {}, excerpt: "" });
  expect(r.title).toBe("workshop");
});

test("uses '/' page title 'home' and tolerates trailing slash", () => {
  expect(mapPagefindResult({ url: "/khazana/", meta: {}, excerpt: "" }).title).toBe("home");
});

test("strips a trailing slash and base when deriving a title from a deep url", () => {
  const r = mapPagefindResult({ url: "/reads/the-shape-of-a-hash/", meta: {}, excerpt: "x" });
  expect(r.title).toBe("the-shape-of-a-hash");
});

test("never throws and yields strings on a malformed result", () => {
  const r = mapPagefindResult({ url: "", meta: undefined, excerpt: undefined } as unknown as RawPagefindResult);
  expect(typeof r.title).toBe("string");
  expect(typeof r.excerpt).toBe("string");
  expect(typeof r.url).toBe("string");
});
```

Run: `pnpm vitest run apps/site/src/lib/search.test.ts`
Expected: FAIL — cannot resolve `./search.js`.

- [ ] **Step 3: Implement `search.ts` to PASS**

`apps/site/src/lib/search.ts`:

```ts
// Thin Pagefind wrapper. The pure `mapPagefindResult` is TDD'd offline; the
// runtime loader is injectable so tests never touch Pagefind or the network.
// Pagefind is a BUILD-TIME index (postbuild: `pagefind --site dist`). Its bundle
// only exists after a full build; in dev / pre-build the dynamic import fails and
// `loadPagefind` resolves to null so callers degrade gracefully.

export interface RawPagefindResult {
  url: string;
  meta?: { title?: string } | undefined;
  excerpt?: string | undefined;
}

export interface SearchResult {
  url: string;
  title: string;
  excerpt: string;
}

/** Derive a readable title from a URL path when Pagefind has no meta.title. */
function titleFromUrl(url: string): string {
  const path = String(url || "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, ""); // drop trailing slash(es)
  const last = path.split("/").filter(Boolean).pop();
  return last ?? "home";
}

/** Pure: Pagefind result payload → our SearchResult. Total, never throws. */
export function mapPagefindResult(raw: RawPagefindResult): SearchResult {
  const url = String(raw?.url ?? "");
  const title = raw?.meta?.title?.trim() || titleFromUrl(url);
  const excerpt = String(raw?.excerpt ?? "");
  return { url, title, excerpt };
}

// --- Runtime glue (not unit-tested; exercised by the build + manual QA) ---

export interface PagefindApi {
  search(query: string): Promise<{ results: { data(): Promise<RawPagefindResult> }[] }>;
}

export interface LoadOpts {
  /** Base path (GitHub Pages project base). Defaults to import.meta.env.BASE_URL. */
  base?: string;
  /** Injectable importer for testing/SSR; defaults to a dynamic import. */
  importer?: (specifier: string) => Promise<unknown>;
}

/**
 * Dynamically load the Pagefind bundle from the site's own /pagefind/ dir.
 * Returns null (not throws) when the index isn't built — dev or pre-postbuild.
 */
export async function loadPagefind(opts: LoadOpts = {}): Promise<PagefindApi | null> {
  const base = (opts.base ?? "/").replace(/\/$/, "");
  const specifier = `${base}/pagefind/pagefind.js`;
  const importer = opts.importer ?? ((s: string) => import(/* @vite-ignore */ s));
  try {
    const mod = (await importer(specifier)) as PagefindApi & { init?: () => Promise<void> };
    await mod.init?.();
    return mod;
  } catch {
    return null; // index not built yet — caller shows a graceful state
  }
}

/** Run a query and map results. Empty query → []. Caps to `limit`. */
export async function search(
  api: PagefindApi,
  query: string,
  limit = 8,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q === "") return [];
  const { results } = await api.search(q);
  const top = results.slice(0, limit);
  const data = await Promise.all(top.map((r) => r.data()));
  return data.map(mapPagefindResult);
}
```

Run: `pnpm vitest run apps/site/src/lib/search.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 4: Type-check + commit**

Run: `pnpm --filter @khazana/site exec astro check`
Expected: 0 errors. (The `import(/* @vite-ignore */ s)` of a runtime path is intentional; `@vite-ignore` keeps Vite from trying to resolve it at build time.)

```
git add -A && git commit -m "P5C T1: Pagefind postbuild index + search.ts wrapper (TDD result mapper)"
```

---

### Task 2: ⌘K `CommandPalette` island (TDD command matcher) + Shell wiring

**Goal:** A site-wide, accessible ⌘K command palette: static nav/channel commands (from `@khazana/core` `CHANNELS` + the section nav) ranked by a TDD'd matcher, plus live Pagefind content results. Proper modal dialog — focus trap, Escape, overlay-click, `role="dialog"`/`aria-modal`, focus restore, reduced-motion. Wires the existing disabled `.cmdk` hint into a real trigger.

**Files:**
- Create: `apps/site/src/components/cmdk/lib/commands.ts` (static command list builder + pure matcher/ranker)
- Create: `apps/site/src/components/cmdk/lib/commands.test.ts` (TDD)
- Create: `apps/site/src/components/cmdk/CommandPalette.tsx` (the island)
- Create: `apps/site/src/components/cmdk/CommandPalette.css`
- Modify: `apps/site/src/layouts/Shell.astro` (enable `.cmdk` trigger + mount the island at the seam)

**Interfaces:**
- Consumes: `@khazana/core` (`CHANNELS`), `src/lib/search.ts` (`loadPagefind`, `search`, `SearchResult`).
- Produces: `buildCommands(base): Command[]` (static, deterministic), `rankCommands(commands, query): Command[]` (pure fuzzy/substring matcher + ranker), and the `CommandPalette` island.

- [ ] **Step 1: Write the failing matcher test**

`apps/site/src/components/cmdk/lib/commands.test.ts`:

```ts
import { expect, test } from "vitest";
import { buildCommands, rankCommands } from "./commands.js";

const cmds = buildCommands("/khazana");

test("buildCommands includes the section nav and every channel", () => {
  const labels = cmds.map((c) => c.label);
  for (const section of ["feed", "reads", "workshop", "graph", "taste"]) {
    expect(labels).toContain(section);
  }
  // 5 sections + 18 channels
  expect(cmds).toHaveLength(5 + 18);
});

test("section hrefs respect the base path", () => {
  const graph = cmds.find((c) => c.label === "graph");
  expect(graph?.href).toBe("/khazana/graph");
  const ai = cmds.find((c) => c.label === "ai" && c.kind === "channel");
  expect(ai?.href).toBe("/khazana/?channel=ai");
});

test("empty query returns all commands in stable definition order", () => {
  const ranked = rankCommands(cmds, "");
  expect(ranked).toEqual(cmds);
});

test("substring match ranks a prefix above a mid-string hit", () => {
  const ranked = rankCommands(cmds, "ge");
  const labels = ranked.map((c) => c.label);
  // 'geopolitics'/'geography' (prefix) outrank 'data-strategy' (mid 'te'? no) —
  // assert prefix matches come first and a clear prefix beats a later substring.
  expect(labels.indexOf("geography")).toBeLessThan(labels.indexOf("data-strategy"));
});

test("fuzzy subsequence matches across gaps (e.g. 'dst' -> data-strategy)", () => {
  const labels = rankCommands(cmds, "dst").map((c) => c.label);
  expect(labels).toContain("data-strategy");
  expect(labels).toContain("data-science"); // also a subsequence of d..s..(no t) -> excluded
});

test("no-match query returns empty", () => {
  expect(rankCommands(cmds, "zzzqqq")).toHaveLength(0);
});

test("ranking is deterministic and stable on ties", () => {
  const a = rankCommands(cmds, "data").map((c) => c.label);
  const b = rankCommands(cmds, "data").map((c) => c.label);
  expect(a).toEqual(b);
});
```

> Implementer note: the `'dst'` test asserts `data-strategy` is present; remove the `data-science` line if your subsequence rule (must match all query chars in order) excludes it — keep the test consistent with the implemented rule. The key invariants are: prefix > substring > subsequence, stable ties, deterministic.

Run: `pnpm vitest run apps/site/src/components/cmdk/lib/commands.test.ts`
Expected: FAIL — cannot resolve `./commands.js`.

- [ ] **Step 2: Implement `commands.ts` to PASS**

`apps/site/src/components/cmdk/lib/commands.ts`:

```ts
// Pure command model + matcher for the ⌘K palette. No DOM, no network.
// Deterministic: stable definition order, stable tie-breaks.
import { CHANNELS } from "@khazana/core";

export type CommandKind = "section" | "channel";

export interface Command {
  id: string;
  label: string;
  hint: string;
  href: string;
  kind: CommandKind;
}

const SECTIONS: { label: string; hint: string; path: string }[] = [
  { label: "feed", hint: "the signal, ranked", path: "/" },
  { label: "reads", hint: "long-form, in your voice", path: "/reads" },
  { label: "workshop", hint: "things to build", path: "/workshop" },
  { label: "graph", hint: "connections", path: "/graph" },
  { label: "taste", hint: "what khazana thinks you like", path: "/taste" },
];

/** Build the static command list. `base` is the site base path (no trailing slash needed). */
export function buildCommands(base: string): Command[] {
  const root = base.replace(/\/$/, "");
  const join = (p: string) => `${root}${p === "/" ? "/" : p}`;
  const sections: Command[] = SECTIONS.map((s) => ({
    id: `section:${s.label}`,
    label: s.label,
    hint: s.hint,
    href: join(s.path),
    kind: "section",
  }));
  const channels: Command[] = CHANNELS.map((c) => ({
    id: `channel:${c}`,
    label: c,
    hint: "channel",
    href: `${root}/?channel=${c}`,
    kind: "channel",
  }));
  return [...sections, ...channels];
}

/** Match tier: lower is better. -1 = no match. */
function scoreLabel(label: string, q: string): number {
  if (q === "") return 0;
  const l = label.toLowerCase();
  const query = q.toLowerCase();
  const idx = l.indexOf(query);
  if (idx === 0) return 0; // prefix
  if (idx > 0) return 1 + idx / 100; // substring, earlier is better
  // subsequence: all query chars appear in order
  let qi = 0;
  for (let i = 0; i < l.length && qi < query.length; i++) {
    if (l[i] === query[qi]) qi++;
  }
  return qi === query.length ? 2 : -1;
}

/** Pure ranker. Empty query → all commands in definition order. No matches → []. */
export function rankCommands(commands: ReadonlyArray<Command>, query: string): Command[] {
  const q = query.trim();
  if (q === "") return [...commands];
  return commands
    .map((cmd, i) => ({ cmd, i, score: scoreLabel(cmd.label, q) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.i - b.i)) // stable tie-break
    .map((x) => x.cmd);
}
```

Run: `pnpm vitest run apps/site/src/components/cmdk/lib/commands.test.ts`
Expected: PASS. (Adjust the one annotated `'dst'` assertion to your subsequence rule before the green run — the rule above includes `data-strategy` and `data-science` both as subsequences of `dst`? `data-science` = d,a,t,a,-,s,c… contains d…s but no `t` after `s`; so it is NOT a `d,s,t` subsequence — keep the test line that excludes it. Run and confirm.)

- [ ] **Step 3: Write the `CommandPalette` island (complete real code)**

`apps/site/src/components/cmdk/CommandPalette.tsx`:

```tsx
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildCommands, rankCommands, type Command } from "./lib/commands.js";
import { loadPagefind, search, type PagefindApi, type SearchResult } from "../../lib/search.js";
import "./CommandPalette.css";

interface Props {
  /** Site base path (import.meta.env.BASE_URL from the Shell). */
  base: string;
}

type Row =
  | { type: "command"; cmd: Command }
  | { type: "result"; result: SearchResult };

const FOCUSABLE = 'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])';

export default function CommandPalette({ base }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "ok" | "unbuilt">("idle");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const apiRef = useRef<PagefindApi | null>(null);
  const listId = useId();

  const commands = useMemo(() => buildCommands(base), [base]);
  const ranked = useMemo(() => rankCommands(commands, query), [commands, query]);

  const rows: Row[] = useMemo(
    () => [
      ...ranked.map((cmd): Row => ({ type: "command", cmd })),
      ...results.map((result): Row => ({ type: "result", result })),
    ],
    [ranked, results],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
    restoreRef.current?.focus();
  }, []);

  const openPalette = useCallback(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  // Global ⌘K / Ctrl+K toggle + wire the existing Shell .cmdk hint button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open ? close() : openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    const trigger = document.querySelector<HTMLButtonElement>(".cmdk");
    const onClick = () => openPalette();
    trigger?.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      trigger?.removeEventListener("click", onClick);
    };
  }, [open, close, openPalette]);

  // Lazy-load Pagefind once, the first time the palette opens.
  useEffect(() => {
    if (!open || apiRef.current || searchState !== "idle") return;
    let cancelled = false;
    void loadPagefind({ base }).then((api) => {
      if (cancelled) return;
      apiRef.current = api;
      setSearchState(api ? "ok" : "unbuilt");
    });
    return () => {
      cancelled = true;
    };
  }, [open, base, searchState]);

  // Debounced content search as the user types.
  useEffect(() => {
    if (!open || !apiRef.current) return;
    const handle = window.setTimeout(() => {
      void search(apiRef.current as PagefindApi, query).then((r) => setResults(r));
    }, 120);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  // Focus the input on open; restore body scroll lock.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Keep the active row in range.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const go = useCallback(
    (row: Row) => {
      const href = row.type === "command" ? row.cmd.href : row.result.url;
      window.location.href = href;
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) go(row);
      return;
    }
    if (e.key === "Tab") {
      // Focus trap: keep focus inside the dialog.
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialogRef}
        className="cmdk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="cmdk-input-row">
          <span className="cmdk-prompt" aria-hidden="true">›</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="jump to a surface, channel, or search reads…"
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd className="cmdk-esc">esc</kbd>
        </div>

        <ul className="cmdk-list" id={listId} role="listbox" aria-label="Results">
          {rows.length === 0 && <li className="cmdk-empty">no matches</li>}
          {rows.map((row, i) => {
            const isActive = i === active;
            const key = row.type === "command" ? row.cmd.id : `r:${row.result.url}`;
            return (
              <li
                key={key}
                role="option"
                aria-selected={isActive}
                className={isActive ? "cmdk-row cmdk-row--active" : "cmdk-row"}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(row);
                }}
              >
                {row.type === "command" ? (
                  <>
                    <span className={`cmdk-tag cmdk-tag--${row.cmd.kind}`}>{row.cmd.kind}</span>
                    <span className="cmdk-label">{row.cmd.label}</span>
                    <span className="cmdk-hint">{row.cmd.hint}</span>
                  </>
                ) : (
                  <>
                    <span className="cmdk-tag cmdk-tag--read">read</span>
                    <span className="cmdk-label">{row.result.title}</span>
                    <span
                      className="cmdk-excerpt"
                      dangerouslySetInnerHTML={{ __html: row.result.excerpt }}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {searchState === "unbuilt" && (
          <p className="cmdk-note">
            content search index not built yet — run a full <code>build</code>. nav still works.
          </p>
        )}
      </div>
    </div>
  );
}
```

> Note on the Pagefind excerpt `dangerouslySetInnerHTML`: Pagefind returns its own `<mark>`-wrapped excerpt HTML; this is the documented way to render it. The content is the site's own indexed text (no user input), so it is safe in this static, single-author context. Do not render arbitrary remote HTML elsewhere.

- [ ] **Step 4: Style the palette with P5 tokens (invoke `frontend-design` first)**

`apps/site/src/components/cmdk/CommandPalette.css` — terminal palette: dark `--bg-raised` panel, hairline `--rule` border, mono everything, amber `--accent` active row, the `›` phosphor prompt, no rounded-pill chrome. Honor `prefers-reduced-motion` (skip the open transform/opacity transition). Complete CSS:

```css
.cmdk-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  background: color-mix(in oklab, var(--bg-inset) 72%, transparent);
  backdrop-filter: blur(3px);
}
.cmdk-dialog {
  width: min(640px, 92vw);
  max-height: 64vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-raised);
  border: var(--hair) solid var(--rule-bright);
  border-radius: var(--r-md);
  box-shadow: 0 24px 60px color-mix(in oklab, #000 55%, transparent);
  overflow: hidden;
  animation: cmdk-in 120ms ease-out;
}
@keyframes cmdk-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cmdk-dialog { animation: none; }
}
.cmdk-input-row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-bottom: var(--hair) solid var(--rule);
}
.cmdk-prompt {
  color: var(--accent);
  font-family: var(--font-mono);
}
.cmdk-input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
}
.cmdk-input::placeholder { color: var(--ink-faint); }
.cmdk-esc {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--ink-faint);
  border: var(--hair) solid var(--rule);
  border-radius: var(--r-sm);
  padding: 0 0.4em;
}
.cmdk-list {
  list-style: none;
  margin: 0;
  padding: var(--s-2) 0;
  overflow-y: auto;
}
.cmdk-row {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-4);
  cursor: pointer;
  font-size: var(--t-sm);
}
.cmdk-row--active {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
}
.cmdk-tag {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  color: var(--ink-faint);
  min-width: 4.5em;
}
.cmdk-tag--channel { color: var(--editorial); }
.cmdk-tag--read { color: var(--accent); }
.cmdk-label { color: var(--ink); font-family: var(--font-mono); }
.cmdk-hint, .cmdk-excerpt {
  color: var(--ink-dim);
  font-size: var(--t-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmdk-excerpt :global(mark) {
  background: transparent;
  color: var(--accent);
}
.cmdk-empty, .cmdk-note {
  padding: var(--s-3) var(--s-4);
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}
.cmdk-note { border-top: var(--hair) solid var(--rule); }
.cmdk-note code { color: var(--ink-dim); }
```

- [ ] **Step 5: Wire the trigger + mount the island in `Shell.astro`**

In `apps/site/src/layouts/Shell.astro`:

1. Add the import (frontmatter, with the other component imports): `import CommandPalette from "../components/cmdk/CommandPalette.tsx";`
2. Enable the hint button — remove `disabled`, change the label, keep the `⌘K` keys span:

```astro
<button class="cmdk" type="button" aria-label="Open command palette" aria-keyshortcuts="Meta+K Control+K">
  <span class="cmdk-keys">⌘K</span>
</button>
```

3. Update the `.cmdk` CSS in the Shell `<style>` block: change `cursor: not-allowed;` → `cursor: pointer;` and add a hover (`&:hover { color: var(--ink-dim); border-color: var(--rule-bright); }` — Astro scoped styles don't support `&`, so add a separate `.cmdk:hover { color: var(--ink-dim); border-color: var(--rule-bright); }` rule).
4. Replace the seam comment line `<!-- SEAM (P5B): ⌘K palette mount + Pagefind search index load go here. -->` with the island mount (right before `<Beacon />`):

```astro
<CommandPalette base={base} client:idle />
```

(`base` is already computed at the top of `Shell.astro` as `import.meta.env.BASE_URL`.)

- [ ] **Step 6: Verify + commit**

Run: `pnpm vitest run apps/site/src/components/cmdk/lib/commands.test.ts`
Expected: PASS.

Run: `pnpm --filter @khazana/site build`
Expected: build succeeds; the palette SSRs nothing visible (it returns `null` until opened — a valid "static fallback": the page is fully usable, the `.cmdk` hint + all nav links are real, no-JS users navigate normally). Confirm the island bundled: `find apps/site/dist -name "*.js" | xargs grep -l "cmdk-dialog" 2>/dev/null` lists a chunk.

Run: `pnpm --filter @khazana/site exec astro check`
Expected: 0 errors.

```
git add -A && git commit -m "P5C T2: ⌘K CommandPalette island (TDD matcher) + Shell wiring + Pagefind content search"
```

---

### Task 3: Connections graph — `buildGraph` (TDD) + `/graph` d3-force island

**Goal:** A deterministic graph model linking curated FeedItems and flagship blog posts by shared topics/entities, rendered as a `d3-force` island with a hover-highlight + click-through, SSR'd to a static node list so build + no-JS work. Amber nodes for blogs, clay for items, hairline edges.

**Files:**
- Create: `apps/site/src/components/graph/lib/build-graph.ts` (pure model)
- Create: `apps/site/src/components/graph/lib/build-graph.test.ts` (TDD)
- Create: `apps/site/src/components/graph/ConnectionsGraph.tsx` (island)
- Create: `apps/site/src/components/graph/ConnectionsGraph.css`
- Create: `apps/site/src/pages/graph.astro` (page; loads data, mounts island)

**Interfaces:**
- Consumes: `@khazana/core` (`FeedItem`), `src/lib/feed.ts` (`loadCurated`), `getCollection("blog")`.
- Produces: `buildGraph(items, posts, opts): GraphModel` (pure, deterministic) and the `/graph` page + island.

- [ ] **Step 1: Write the failing `buildGraph` test**

`apps/site/src/components/graph/lib/build-graph.test.ts`:

```ts
import { expect, test } from "vitest";
import { buildGraph, type GraphItem, type GraphPost } from "./build-graph.js";

const items: GraphItem[] = [
  { id: "i1", title: "Edge tiers", topics: ["tech", "data-science"], entities: ["Netflix"], url: "https://a" },
  { id: "i2", title: "More edge", topics: ["tech", "data-science"], entities: ["Netflix"], url: "https://b" },
  { id: "i3", title: "Lone item", topics: ["finance"], entities: [], url: "https://c" },
];
const posts: GraphPost[] = [
  { slug: "silicon", title: "The Week in Silicon", channels: ["tech", "ai"] },
];

test("creates one node per item and post with stable ids and types", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  expect(g.nodes.map((n) => n.id)).toEqual(["i1", "i2", "i3", "silicon"]);
  expect(g.nodes.find((n) => n.id === "silicon")?.type).toBe("post");
  expect(g.nodes.find((n) => n.id === "i1")?.type).toBe("item");
});

test("edges link nodes sharing >= minShared topics or entities; weight = shared count", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  // i1<->i2 share topics tech+data-science (2) AND entity Netflix -> weight 3
  const e = g.edges.find((x) => x.source === "i1" && x.target === "i2");
  expect(e?.weight).toBe(3);
  // i1<->silicon share only 'tech' (1) -> below threshold, no edge
  expect(g.edges.find((x) => x.source === "i1" && x.target === "silicon")).toBeUndefined();
  // i3 shares nothing -> isolated
  expect(g.edges.some((x) => x.source === "i3" || x.target === "i3")).toBe(false);
});

test("edges are deterministic: sorted by [source,target], source<target", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  const pairs = g.edges.map((e) => [e.source, e.target]);
  expect(pairs).toEqual([...pairs].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])));
  for (const e of g.edges) expect(e.source < e.target).toBe(true);
});

test("minShared=1 links the post via the shared 'tech' topic", () => {
  const g = buildGraph(items, posts, { minShared: 1, maxNodes: 50 });
  expect(g.edges.some((e) => e.source === "i1" && e.target === "silicon")).toBe(true);
});

test("maxNodes caps node count (keeps highest-degree nodes), edges pruned to survivors", () => {
  const g = buildGraph(items, posts, { minShared: 2, maxNodes: 2 });
  expect(g.nodes).toHaveLength(2);
  const ids = new Set(g.nodes.map((n) => n.id));
  // i1 & i2 are the connected pair -> highest degree -> kept; i3/silicon dropped
  expect(ids.has("i1") && ids.has("i2")).toBe(true);
  for (const e of g.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
});

test("is a pure function: same inputs -> deeply equal output, no input mutation", () => {
  const a = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  const b = buildGraph(items, posts, { minShared: 2, maxNodes: 50 });
  expect(a).toEqual(b);
  expect(items[0].topics).toEqual(["tech", "data-science"]);
});
```

Run: `pnpm vitest run apps/site/src/components/graph/lib/build-graph.test.ts`
Expected: FAIL — cannot resolve `./build-graph.js`.

- [ ] **Step 2: Implement `build-graph.ts` to PASS**

`apps/site/src/components/graph/lib/build-graph.ts`:

```ts
// Pure, deterministic graph model: curated items + flagship posts linked by
// shared topics/entities. No d3, no DOM, no randomness. Stable node/edge order.

export interface GraphItem {
  id: string;
  title: string;
  topics: string[];
  entities: string[];
  url: string;
}
export interface GraphPost {
  slug: string;
  title: string;
  channels: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "item" | "post";
  /** Link target: external url for items, /reads/<slug> for posts (filled by caller via href). */
  href: string;
  degree: number;
}
export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BuildGraphOpts {
  minShared?: number; // default 2
  maxNodes?: number; // default 60
  /** Base for post hrefs (e.g. "/khazana"); items use their own url. */
  base?: string;
}

interface Raw {
  id: string;
  label: string;
  type: "item" | "post";
  href: string;
  tags: Set<string>; // topics ∪ entities (items) or channels (posts)
}

export function buildGraph(
  items: ReadonlyArray<GraphItem>,
  posts: ReadonlyArray<GraphPost>,
  opts: BuildGraphOpts = {},
): GraphModel {
  const minShared = opts.minShared ?? 2;
  const maxNodes = opts.maxNodes ?? 60;
  const base = (opts.base ?? "").replace(/\/$/, "");

  const raw: Raw[] = [
    ...items.map((it): Raw => ({
      id: it.id,
      label: it.title,
      type: "item",
      href: it.url,
      tags: new Set<string>([...it.topics, ...it.entities]),
    })),
    ...posts.map((p): Raw => ({
      id: p.slug,
      label: p.title,
      type: "post",
      href: `${base}/reads/${p.slug}`,
      tags: new Set<string>(p.channels),
    })),
  ];

  // Candidate edges (i<j in raw order), keyed by sorted id pair for stability.
  const edges: GraphEdge[] = [];
  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      let shared = 0;
      for (const t of raw[i].tags) if (raw[j].tags.has(t)) shared++;
      if (shared >= minShared) {
        const [source, target] =
          raw[i].id < raw[j].id ? [raw[i].id, raw[j].id] : [raw[j].id, raw[i].id];
        edges.push({ source, target, weight: shared });
      }
    }
  }

  // Degree per node (for the maxNodes cap + render sizing).
  const degree = new Map<string, number>();
  for (const r of raw) degree.set(r.id, 0);
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // Cap: keep highest-degree nodes; tie-break by original order (stable).
  const order = new Map(raw.map((r, i) => [r.id, i]));
  let kept = raw;
  if (raw.length > maxNodes) {
    kept = [...raw]
      .sort((a, b) => {
        const da = degree.get(b.id)! - degree.get(a.id)!;
        return da !== 0 ? da : order.get(a.id)! - order.get(b.id)!;
      })
      .slice(0, maxNodes)
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!); // restore stable order
  }
  const keptIds = new Set(kept.map((r) => r.id));

  const nodes: GraphNode[] = kept.map((r) => ({
    id: r.id,
    label: r.label,
    type: r.type,
    href: r.href,
    degree: degree.get(r.id) ?? 0,
  }));

  const prunedEdges = edges
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return { nodes, edges: prunedEdges };
}
```

> The `degree` on capped nodes is the pre-cap degree; that is the intended ranking signal. If a stricter post-cap degree is wanted, recompute after pruning — not required by the tests, keep it simple.

Run: `pnpm vitest run apps/site/src/components/graph/lib/build-graph.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 3: Write the `ConnectionsGraph` island (complete real code)**

`apps/site/src/components/graph/ConnectionsGraph.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
} from "d3";
import type { GraphModel, GraphNode, GraphEdge } from "./lib/build-graph.js";
import "./ConnectionsGraph.css";

interface Props {
  model: GraphModel;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
}
interface SimEdge {
  source: SimNode;
  target: SimNode;
  weight: number;
}

const W = 920;
const H = 600;

// Deterministic phyllotaxis seed: reproducible first positions (no Math.random).
function seedPositions(nodes: GraphNode[]): SimNode[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return nodes.map((n, i) => {
    const r = 16 * Math.sqrt(i + 1);
    const a = i * golden;
    return { ...n, x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a) };
  });
}

export default function ConnectionsGraph({ model }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [positions, setPositions] = useState<SimNode[] | null>(null);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of model.nodes) m.set(n.id, new Set());
    for (const e of model.edges) {
      m.get(e.source)?.add(e.target);
      m.get(e.target)?.add(e.source);
    }
    return m;
  }, [model]);

  useEffect(() => {
    if (model.nodes.length === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const simNodes = seedPositions(model.nodes);
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simEdges: SimEdge[] = model.edges.map((e) => ({
      source: byId.get(e.source)!,
      target: byId.get(e.target)!,
      weight: e.weight,
    }));

    const sim: Simulation<SimNode, undefined> = forceSimulation(simNodes)
      .force("charge", forceManyBody().strength(-180))
      .force(
        "link",
        forceLink<SimNode, SimEdge>(simEdges)
          .id((d) => d.id)
          .distance(70)
          .strength((d) => Math.min(1, d.weight / 4)),
      )
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide(14));

    if (reduced) {
      // Compute a static layout synchronously; no animation.
      sim.stop();
      sim.tick(120);
      setPositions(simNodes.map((n) => ({ ...n })));
    } else {
      sim.on("tick", () => setPositions(simNodes.map((n) => ({ ...n }))));
    }
    return () => {
      sim.stop();
    };
  }, [model]);

  const dim = (id: string): boolean =>
    hover !== null && hover !== id && !neighbors.get(hover)?.has(id);

  const posById = useMemo(
    () => new Map((positions ?? []).map((n) => [n.id, n])),
    [positions],
  );

  return (
    <div className="cg">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="cg-svg"
        role="img"
        aria-label={`Connections graph: ${model.nodes.length} nodes, ${model.edges.length} links`}
      >
        <g className="cg-edges">
          {positions &&
            model.edges.map((e: GraphEdge, i) => {
              const s = posById.get(e.source);
              const t = posById.get(e.target);
              if (!s || !t) return null;
              const faded = hover !== null && hover !== e.source && hover !== e.target;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  className={faded ? "cg-edge cg-edge--dim" : "cg-edge"}
                  strokeWidth={Math.min(2.5, 0.6 + e.weight * 0.5)}
                />
              );
            })}
        </g>
        <g className="cg-nodes">
          {positions &&
            positions.map((n) => (
              <a
                key={n.id}
                href={n.href}
                className="cg-node-link"
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                aria-label={`${n.type === "post" ? "Read" : "Item"}: ${n.label}`}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.type === "post" ? 7 : 5}
                  className={[
                    "cg-node",
                    `cg-node--${n.type}`,
                    dim(n.id) ? "cg-node--dim" : "",
                  ].join(" ")}
                />
                {hover === n.id && (
                  <text x={n.x + 10} y={n.y + 4} className="cg-node-label">
                    {n.label}
                  </text>
                )}
              </a>
            ))}
        </g>
      </svg>

      {/* SSR / no-JS fallback: a real, navigable node list (hidden once the SVG paints). */}
      <ul className="cg-fallback" aria-label="Connections (list)">
        {model.nodes.map((n) => (
          <li key={n.id} className={`cg-fallback-item cg-fallback-item--${n.type}`}>
            <a href={n.href}>{n.label}</a>
            <span className="cg-fallback-deg">{n.degree} links</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Style the graph with P5 tokens (invoke `frontend-design` first)**

`apps/site/src/components/graph/ConnectionsGraph.css` — amber post nodes (`--accent`), clay item nodes (`--editorial`), hairline `--rule` edges, dim non-neighbors on hover. The `.cg-svg` shows on JS; the `.cg-fallback` list is the SSR/no-JS render and is hidden when the SVG has painted (the SVG is empty pre-hydration, so reveal the list when `positions` is null by default — implement with CSS: fallback visible always, SVG layered above; OR simplest: show fallback only when `.cg-svg` has no children — use a `:has` toggle). Complete CSS:

```css
.cg {
  position: relative;
  border: var(--hair) solid var(--rule);
  border-radius: var(--r-md);
  background: var(--bg-raised);
  overflow: hidden;
}
.cg-svg {
  display: block;
  width: 100%;
  height: auto;
  background:
    radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--accent) 5%, transparent), transparent 60%),
    var(--bg-inset);
}
/* When the SVG has rendered nodes, hide the static list fallback. */
.cg:has(.cg-nodes a) .cg-fallback {
  display: none;
}
.cg-edge {
  stroke: var(--rule-bright);
  stroke-opacity: 0.7;
}
.cg-edge--dim {
  stroke-opacity: 0.12;
}
.cg-node {
  cursor: pointer;
  transition: opacity 120ms ease;
}
.cg-node--post {
  fill: var(--accent);
}
.cg-node--item {
  fill: var(--editorial);
}
.cg-node--dim {
  opacity: 0.22;
}
.cg-node-link:focus-visible .cg-node {
  outline: 2px solid var(--focus);
}
.cg-node-label {
  fill: var(--ink);
  font-family: var(--font-mono);
  font-size: 11px;
  paint-order: stroke;
  stroke: var(--bg-inset);
  stroke-width: 4px;
}
@media (prefers-reduced-motion: reduce) {
  .cg-node { transition: none; }
}
/* SSR / no-JS fallback list */
.cg-fallback {
  list-style: none;
  margin: 0;
  padding: var(--s-4);
  columns: 2;
  column-gap: var(--s-6);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
}
.cg-fallback-item {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-1) 0;
  break-inside: avoid;
}
.cg-fallback-item--post a { color: var(--accent); }
.cg-fallback-item--item a { color: var(--editorial); }
.cg-fallback-deg { color: var(--ink-faint); font-size: var(--t-xs); }
@media (max-width: 640px) {
  .cg-fallback { columns: 1; }
}
```

- [ ] **Step 5: Create the `/graph` page**

`apps/site/src/pages/graph.astro`:

```astro
---
import Shell from "../layouts/Shell.astro";
import ConnectionsGraph from "../components/graph/ConnectionsGraph.tsx";
import { loadCurated, tickerTitles } from "../lib/feed.js";
import { dataDir } from "../lib/data.js";
import { buildGraph, type GraphItem, type GraphPost } from "../components/graph/lib/build-graph.js";
import { getCollection } from "astro:content";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const items = loadCurated(dataDir());
const ticker = tickerTitles(items, 8);

const posts = await getCollection("blog", ({ data }) => !data.draft);

const graphItems: GraphItem[] = items.map((it) => ({
  id: it.id,
  title: it.title,
  topics: it.topics,
  entities: it.entities,
  url: it.url,
}));
const graphPosts: GraphPost[] = posts.map((p) => ({
  slug: p.id,
  title: p.data.title,
  channels: p.data.channels,
}));

const model = buildGraph(graphItems, graphPosts, { minShared: 2, maxNodes: 60, base });
---

<Shell title="khazana — graph" active="graph" tickerTitles={ticker}>
  <header class="graph-head">
    <p class="eyebrow">graph</p>
    <h1 class="graph-h1">how the signal connects</h1>
    <p class="graph-sub">
      Curated items <span class="dot dot--item">●</span> and reads
      <span class="dot dot--post">●</span> linked where they share topics or
      entities. Hover to trace neighbors; click to open.
    </p>
  </header>

  {
    model.nodes.length === 0 ? (
      <p class="graph-empty">No items to connect yet — the graph fills in as the feed grows.</p>
    ) : (
      <ConnectionsGraph model={model} client:visible />
    )
  }
</Shell>

<style>
  .graph-head {
    margin-bottom: var(--s-5);
    max-width: var(--measure);
  }
  .graph-h1 {
    font-family: var(--font-sans);
    font-size: var(--t-2xl);
    line-height: var(--lh-tight);
    letter-spacing: -0.02em;
    margin: 0 0 var(--s-3);
    font-weight: 600;
  }
  .graph-sub {
    color: var(--ink-dim);
    font-size: var(--t-sm);
    margin: 0;
  }
  .dot {
    font-size: 0.7em;
    vertical-align: middle;
  }
  .dot--item { color: var(--editorial); }
  .dot--post { color: var(--accent); }
  .graph-empty {
    padding: var(--s-8) 0;
    color: var(--ink-faint);
    font-family: var(--font-mono);
    text-align: center;
  }
</style>
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm vitest run apps/site/src/components/graph/lib/build-graph.test.ts`
Expected: PASS — 6 tests.

Run: `pnpm --filter @khazana/site build`
Expected: build succeeds; `/graph` SSRs the `.cg-fallback` node list (real `<a>` links, no JS needed). Confirm: `grep -c "cg-fallback-item" apps/site/dist/graph/index.html` > 0.

Run: `pnpm --filter @khazana/site exec astro check`
Expected: 0 errors.

```
git add -A && git commit -m "P5C T3: connections graph — buildGraph (TDD) + /graph d3-force island"
```

---

### Task 4: Taste dashboard — load+topN (TDD) + `/taste` page + Shell nav links

**Goal:** A `/taste` page reading `data/taste.json` (committed `data/taste.sample.json` fallback) that renders topic / entity / format affinities as horizontal bars, handles the `ready:false` "still learning" state, and adds `/graph` + `/taste` section links to the Shell nav (without touching the channel drift guard). Pure loader + top-N/bar selectors TDD'd.

**Files:**
- Create: `data/taste.sample.json` (committed fallback — repo `data/` root)
- Create: `apps/site/src/lib/taste.ts` (local `TastePayload` type + load-with-fallback + topN/bar selectors)
- Create: `apps/site/src/lib/taste.test.ts` (TDD selectors; load tested via injected dir)
- Modify: `apps/site/src/lib/data.ts` (add `repoDataDir()` for the `data/` root)
- Create: `apps/site/src/pages/taste.astro` (page + bars)
- Modify: `apps/site/src/layouts/Shell.astro` (add `/graph` + `/taste` nav links; widen `active` union)

**Interfaces:**
- Consumes: `@khazana/core` (`FORMAT_NAMES`, `FormatName`), `node:fs`/`node:path`.
- Produces: `loadTaste(dir): TastePayload`, `topN(map, n): Bar[]`, `formatBars(affinity): Bar[]`, and the `/taste` page + Shell links.

- [ ] **Step 1: Commit the sample taste payload**

`data/taste.sample.json` (mirrors the curate `TastePayload` shape exactly; `ready:true`, max-normalized 0..1 values so the sample renders a full dashboard):

```json
{
  "ready": true,
  "topics": {
    "ai": 1.0,
    "tech": 0.82,
    "data-science": 0.64,
    "history": 0.48,
    "geopolitics": 0.39,
    "quantum": 0.27,
    "finance": 0.21,
    "science": 0.18
  },
  "entities": {
    "OpenAI": 1.0,
    "Netflix": 0.71,
    "NVIDIA": 0.66,
    "Envoy": 0.4,
    "Leningrad": 0.33,
    "ECB": 0.22
  },
  "formatAffinity": {
    "dispatch": 1.0,
    "teardown": 0.78,
    "primer": 0.55,
    "field-notes": 0.41,
    "chronicle": 0.3,
    "build-log": 0.19
  }
}
```

- [ ] **Step 2: Add the `repoDataDir()` path helper**

In `apps/site/src/lib/data.ts`, add (next to `dataDir()`):

```ts
/** Absolute path to the repo `data/` root (parent of `data/feed`). */
export function repoDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/site/src/lib
  return join(here, "..", "..", "..", "..", "data");
}
```

- [ ] **Step 3: Write the failing taste test**

`apps/site/src/lib/taste.test.ts`:

```ts
import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTaste, topN, formatBars, type TastePayload } from "./taste.js";

const sample: TastePayload = {
  ready: true,
  topics: { ai: 1, tech: 0.8, finance: 0.2 },
  entities: { OpenAI: 1, ECB: 0.3 },
  formatAffinity: { dispatch: 1, teardown: 0.5 },
};

test("topN returns the n highest, sorted desc, as label/value bars", () => {
  const bars = topN(sample.topics, 2);
  expect(bars).toEqual([
    { label: "ai", value: 1 },
    { label: "tech", value: 0.8 },
  ]);
});

test("topN is deterministic and stable on equal values (label asc tiebreak)", () => {
  const bars = topN({ b: 0.5, a: 0.5, c: 0.9 }, 3);
  expect(bars.map((x) => x.label)).toEqual(["c", "a", "b"]);
});

test("topN on an empty map returns []", () => {
  expect(topN({}, 5)).toEqual([]);
});

test("formatBars preserves FORMAT_NAMES order, drops absent formats", () => {
  const bars = formatBars(sample.formatAffinity);
  // dispatch & teardown present; order follows FORMAT_NAMES (chronicle..build-log)
  expect(bars.map((b) => b.label)).toEqual(["dispatch", "teardown"]);
  expect(bars[0].value).toBe(1);
});

test("loadTaste prefers taste.json over taste.sample.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "taste-"));
  writeFileSync(join(dir, "taste.sample.json"), JSON.stringify({ ...sample, ready: false }));
  writeFileSync(join(dir, "taste.json"), JSON.stringify(sample));
  expect(loadTaste(dir).ready).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("loadTaste falls back to the sample when taste.json is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "taste-"));
  writeFileSync(join(dir, "taste.sample.json"), JSON.stringify(sample));
  expect(loadTaste(dir).ready).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test("loadTaste returns a safe not-ready payload when nothing exists or json is malformed", () => {
  const dir = mkdtempSync(join(tmpdir(), "taste-"));
  expect(loadTaste(dir)).toEqual({ ready: false, topics: {}, entities: {}, formatAffinity: {} });
  writeFileSync(join(dir, "taste.json"), "{ not json");
  expect(loadTaste(dir).ready).toBe(false);
  rmSync(dir, { recursive: true, force: true });
});
```

Run: `pnpm vitest run apps/site/src/lib/taste.test.ts`
Expected: FAIL — cannot resolve `./taste.js`.

- [ ] **Step 4: Implement `taste.ts` to PASS**

`apps/site/src/lib/taste.ts`:

```ts
// Taste dashboard data layer. Mirrors the curate TastePayload shape (see
// packages/curate/src/format-affinity.ts) WITHOUT depending on @khazana/curate
// (a pipeline package, not a site dep). Loads data/taste.json, falling back to
// the committed data/taste.sample.json; never crashes the build.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FORMAT_NAMES, type FormatName } from "@khazana/core";

export interface TastePayload {
  ready: boolean;
  topics: Record<string, number>;
  entities: Record<string, number>;
  formatAffinity: Partial<Record<FormatName, number>>;
}

export interface Bar {
  label: string;
  value: number;
}

const EMPTY: TastePayload = { ready: false, topics: {}, entities: {}, formatAffinity: {} };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numberMap(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "number") out[k] = val;
  return out;
}

/** Load taste.json, fall back to taste.sample.json, else a safe not-ready payload. */
export function loadTaste(dir: string): TastePayload {
  const main = join(dir, "taste.json");
  const sample = join(dir, "taste.sample.json");
  const path = existsSync(main) ? main : sample;
  if (!existsSync(path)) return { ...EMPTY };
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(raw)) return { ...EMPTY };
    return {
      ready: raw.ready === true,
      topics: numberMap(raw.topics),
      entities: numberMap(raw.entities),
      formatAffinity: numberMap(raw.formatAffinity) as Partial<Record<FormatName, number>>,
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Top-n entries of an affinity map as bars, value desc, label asc on ties. */
export function topN(map: Record<string, number>, n: number): Bar[] {
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => (b.value !== a.value ? b.value - a.value : a.label.localeCompare(b.label)))
    .slice(0, n);
}

/** Format affinities as bars in canonical FORMAT_NAMES order, omitting absent formats. */
export function formatBars(affinity: Partial<Record<FormatName, number>>): Bar[] {
  const out: Bar[] = [];
  for (const name of FORMAT_NAMES) {
    const v = affinity[name];
    if (typeof v === "number") out.push({ label: name, value: v });
  }
  return out;
}
```

Run: `pnpm vitest run apps/site/src/lib/taste.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Create the `/taste` page (complete real code)**

`apps/site/src/pages/taste.astro`:

```astro
---
import Shell from "../layouts/Shell.astro";
import { loadTaste, topN, formatBars } from "../lib/taste.js";
import { repoDataDir } from "../lib/data.js";
import { FORMATS } from "@khazana/core";

const taste = loadTaste(repoDataDir());
const topics = topN(taste.topics, 10);
const entities = topN(taste.entities, 10);
const formats = formatBars(taste.formatAffinity);

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmtName = (label: string) =>
  label in FORMATS ? FORMATS[label as keyof typeof FORMATS].name : label;
---

<Shell title="khazana — taste" active="taste">
  <header class="taste-head">
    <p class="eyebrow">taste</p>
    <h1 class="taste-h1">what khazana thinks you like</h1>
    <p class="taste-sub">
      A transparent read on your reading — topics and entities you return to, and
      the formats you spend time in. Computed locally from your engagement; nothing
      leaves your device.
    </p>
  </header>

  {
    !taste.ready ? (
      <section class="taste-learning">
        <p class="taste-learning-h">still learning</p>
        <p class="taste-learning-b">
          khazana needs more reading history before it can model your taste. Open a
          few reads and come back — affinities appear once there's enough signal.
        </p>
      </section>
    ) : (
      <div class="taste-cols">
        <section class="taste-block" aria-labelledby="t-topics">
          <h2 id="t-topics" class="taste-block-h">topic affinity</h2>
          {topics.length === 0 ? (
            <p class="taste-none">no topic signal yet</p>
          ) : (
            <ul class="bars">
              {topics.map((b) => (
                <li class="bar-row">
                  <span class="bar-label">{b.label}</span>
                  <span class="bar-track">
                    <span class="bar-fill bar-fill--topic" style={`width:${pct(b.value)}`} />
                  </span>
                  <span class="bar-val">{pct(b.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section class="taste-block" aria-labelledby="t-entities">
          <h2 id="t-entities" class="taste-block-h">entity affinity</h2>
          {entities.length === 0 ? (
            <p class="taste-none">no entity signal yet</p>
          ) : (
            <ul class="bars">
              {entities.map((b) => (
                <li class="bar-row">
                  <span class="bar-label">{b.label}</span>
                  <span class="bar-track">
                    <span class="bar-fill bar-fill--entity" style={`width:${pct(b.value)}`} />
                  </span>
                  <span class="bar-val">{pct(b.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section class="taste-block taste-block--wide" aria-labelledby="t-formats">
          <h2 id="t-formats" class="taste-block-h">how you like to read</h2>
          {formats.length === 0 ? (
            <p class="taste-none">no format signal yet</p>
          ) : (
            <ul class="bars">
              {formats.map((b) => (
                <li class="bar-row">
                  <span class="bar-label">{fmtName(b.label)}</span>
                  <span class="bar-track">
                    <span class="bar-fill bar-fill--format" style={`width:${pct(b.value)}`} />
                  </span>
                  <span class="bar-val">{pct(b.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  }
</Shell>

<style>
  .taste-head {
    margin-bottom: var(--s-6);
    max-width: var(--measure);
  }
  .taste-h1 {
    font-family: var(--font-sans);
    font-size: var(--t-2xl);
    line-height: var(--lh-tight);
    letter-spacing: -0.02em;
    margin: 0 0 var(--s-3);
    font-weight: 600;
  }
  .taste-sub {
    color: var(--ink-dim);
    font-size: var(--t-sm);
    margin: 0;
  }
  .taste-learning {
    border: var(--hair) solid var(--rule);
    border-left: 2px solid var(--accent);
    border-radius: var(--r-md);
    background: var(--bg-raised);
    padding: var(--s-5);
    max-width: var(--measure);
  }
  .taste-learning-h {
    font-family: var(--font-mono);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--t-xs);
    margin: 0 0 var(--s-2);
  }
  .taste-learning-b {
    color: var(--ink-dim);
    margin: 0;
    font-size: var(--t-sm);
  }
  .taste-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-6) var(--s-8);
  }
  .taste-block--wide {
    grid-column: 1 / -1;
  }
  .taste-block-h {
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-faint);
    margin: 0 0 var(--s-4);
    padding-bottom: var(--s-2);
    border-bottom: var(--hair) solid var(--rule);
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }
  .bar-row {
    display: grid;
    grid-template-columns: 9rem 1fr 2.5rem;
    align-items: center;
    gap: var(--s-3);
    font-family: var(--font-mono);
    font-size: var(--t-sm);
  }
  .bar-label {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track {
    height: 0.5rem;
    background: var(--bg-inset);
    border: var(--hair) solid var(--rule);
    border-radius: var(--r-sm);
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
  }
  .bar-fill--topic { background: var(--accent); }
  .bar-fill--entity { background: var(--editorial); }
  .bar-fill--format { background: var(--good); }
  .bar-val {
    color: var(--ink-faint);
    font-size: var(--t-xs);
    text-align: right;
  }
  .taste-none {
    color: var(--ink-faint);
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    margin: 0;
  }
  @media (max-width: 640px) {
    .taste-cols { grid-template-columns: 1fr; }
    .bar-row { grid-template-columns: 7rem 1fr 2.5rem; }
  }
</style>
```

- [ ] **Step 6: Add `/graph` + `/taste` nav links to the Shell (drift guard untouched)**

In `apps/site/src/layouts/Shell.astro`:

1. Widen the `active` prop type and the `nav` array type:

```ts
interface Props {
  title: string;
  description?: string;
  active?: "feed" | "reads" | "workshop" | "graph" | "taste";
  tickerTitles?: string[];
}
```

```ts
const nav: { id: "feed" | "reads" | "workshop" | "graph" | "taste"; label: string; href: string }[] = [
  { id: "feed", label: "feed", href: withBase("/") },
  { id: "reads", label: "reads", href: withBase("/reads") },
  { id: "workshop", label: "workshop", href: withBase("/workshop") },
  { id: "graph", label: "graph", href: withBase("/graph") },
  { id: "taste", label: "taste", href: withBase("/taste") },
];
```

Do **NOT** touch `channelGroups` or the drift-guard block (lines ~32-35) — `/graph` and `/taste` are section links, not channels. The existing `nav.map(...)` render loop and `.nav` CSS handle the two new links with no other change.

- [ ] **Step 7: Verify + commit**

Run: `pnpm vitest run apps/site/src/lib/taste.test.ts`
Expected: PASS — 7 tests.

Run: `pnpm --filter @khazana/site build`
Expected: build succeeds; `/taste` renders the sample dashboard (the committed `data/taste.sample.json` is the fallback since `data/taste.json` is gitignored/absent in CI). Confirm: `grep -c "bar-fill" apps/site/dist/taste/index.html` > 0. The Shell now shows feed/reads/workshop/graph/taste links on every page.

Run: `pnpm --filter @khazana/site exec astro check`
Expected: 0 errors.

```
git add -A && git commit -m "P5C T4: taste dashboard — load+topN (TDD) + /taste page + Shell nav links"
```

---

### Task 5: Full build + check + $0/offline audit + regression

**Goal:** Prove the whole P5C feature set holds the global gates: all tests green, `astro check` clean, a full build (incl. Pagefind postbuild) succeeds, the $0/offline audit passes (Pagefind local, no CDN), and the build still works with NO `data/taste.json`, NO `data/feed/curated.json`, NO `PUBLIC_WORKER_URL`. No P5/P5B regressions.

**Files:** none created — this is a verification + audit task.

- [ ] **Step 1: Full test suite (no regressions)**

Run: `pnpm test`
Expected: ALL tests pass — the P5C helper tests (`search`, `commands`, `build-graph`, `taste`) plus every pre-existing `packages/**` and `apps/**` test. Zero failures.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @khazana/site exec astro check`
Expected: 0 errors, 0 warnings introduced by P5C.

- [ ] **Step 3: Clean offline build with NO generated data + NO worker URL**

Ensure no generated data is present (CI condition): `data/feed/curated.json` and `data/taste.json` must NOT exist (both are gitignored; confirm with `ls data/feed/curated.json data/taste.json 2>/dev/null` → not found). Unset the worker URL:

Run: `env -u PUBLIC_WORKER_URL pnpm --filter @khazana/site build`
Expected: build succeeds end-to-end (`astro build` then `pagefind --site dist`). The feed uses `curated.sample.json`, `/taste` uses `taste.sample.json`, `/graph` builds from the sample feed + real blog posts, the beacon no-ops without a worker URL.

- [ ] **Step 4: $0 / offline audit (Pagefind local, no CDN)**

Run these and confirm each expectation:

- `ls apps/site/dist/pagefind/pagefind.js` → exists (the search runtime is served from the site, NOT a CDN).
- `grep -rEl "unpkg|jsdelivr|cdn\\.|fonts\\.googleapis|cloudflare|pagefind\\.app" apps/site/dist` → **no matches** (no external search/font/tile/asset CDNs anywhere in the built output). If any pre-existing P5/P5B match appears, confirm it is unrelated to P5C; P5C adds none.
- `grep -rn "https://" apps/site/dist/pagefind/*.js 2>/dev/null | grep -vE "schema|w3\\.org|example" || echo "no external hosts in pagefind runtime"` → Pagefind's own bundle references no remote host for index loading.
- Search index path is base-relative: confirm `loadPagefind` builds `${base}/pagefind/pagefind.js` (so GitHub Pages project base works) — re-read `src/lib/search.ts`.
- No external fonts/tiles/APIs introduced: `grep -rn "fonts\\.|tile\\.|maps\\.|api\\." apps/site/src/components/cmdk apps/site/src/components/graph apps/site/src/pages/graph.astro apps/site/src/pages/taste.astro` → none.

- [ ] **Step 5: Accessibility + SSR-fallback spot-checks**

- ⌘K modal: `grep -n "aria-modal\|role=\"dialog\"\|aria-label=\"Command palette\"" apps/site/src/components/cmdk/CommandPalette.tsx` → present; manual: open with ⌘K, Tab cycles within the dialog, Escape closes and focus returns to the `.cmdk` button, overlay-click closes.
- Graph SSR fallback: `grep -c "cg-fallback-item" apps/site/dist/graph/index.html` > 0 (no-JS users get a navigable node list).
- Taste no-JS: `/taste` is pure Astro/CSS (no island) — `grep -c "bar-fill" apps/site/dist/taste/index.html` > 0 with no client script required.
- Reduced motion: `grep -rn "prefers-reduced-motion" apps/site/src/components/cmdk/CommandPalette.css apps/site/src/components/graph/ConnectionsGraph.tsx apps/site/src/components/graph/ConnectionsGraph.css` → honored in palette animation + graph simulation + node transitions.

- [ ] **Step 6: Final commit**

If Steps 1–5 all pass with no code changes needed, there is nothing to commit (T1–T4 already committed). If an audit fix was required, commit it:

```
git add -A && git commit -m "P5C T5: full build + astro check + \$0/offline audit + a11y/SSR-fallback verification"
```

---

## Self-Review

**Brief → task coverage.** Every hard decision in the P5C brief maps to a task:
- §1 Pagefind (devDep, `postbuild: pagefind --site dist`, local assets, dynamic `/pagefind/pagefind.js` load, graceful "not built" dev state, TDD'd result mapper against a fixture) → **T1**.
- §2 ⌘K command palette (React island in Shell, Cmd/Ctrl+K + wired `.cmdk` hint, Escape/overlay close, focus trap + `role="dialog"`/`aria-modal` + focus restore, reduced-motion, static nav/CHANNELS commands + live Pagefind results, up/down/enter nav, TDD'd matcher + result mapper) → **T2**.
- §3 connections graph (`/graph`, deterministic `buildGraph(items, posts, opts)` with stable ids/order + `minShared` default 2 + edge weight = shared count + `maxNodes` cap, d3-force island with deterministic seed, hover-highlight neighbors, click-through, SSR node-list fallback, amber blog / clay item / hairline edges) → **T3**.
- §4 taste dashboard (`/taste` reading `data/taste.json` + committed `data/taste.sample.json` fallback, `ready` state, topic/entity/format affinities as bars, `ready:false` "still learning" state, TDD'd load+topN, P5 tokens, Shell `/graph`+`/taste` nav links respecting the drift guard) → **T4**.
- Final audit/regression → **T5**.

**Placeholder scan.** No `TODO`, no `// ...`, no stubbed bodies, no "implementer fills in" gaps. Every `.ts`/`.tsx`/`.astro`/`.css`/`.json` file is given complete real code. The two TDD annotations (the `'dst'` subsequence assertion in T2; the post-cap degree note in T3) are clarifying notes on already-complete code, not placeholders.

**Type consistency.** No `any` in public props: `CommandPalette` props `{ base: string }`; `ConnectionsGraph` props `{ model: GraphModel }`; all helper signatures fully typed. Reuses `@khazana/core` (`CHANNELS`, `FeedItem`, `FORMAT_NAMES`, `FormatName`) and never redefines vocab. The site declares its own local `TastePayload` (mirroring curate's shape, with a comment pointing at the source of truth) rather than importing the pipeline package — the only deliberate type duplication, justified because `@khazana/curate` is not a site dependency. ESM `.js` relative imports + `import type` throughout (matches `verbatimModuleSyntax`). The malformed-input branches in `mapPagefindResult` and `loadTaste` use a single narrowed `unknown` cast each, not blanket `any`.

**$0/offline audit (Pagefind assets local, no CDN).** Pagefind is a build-time CLI devDep only; its runtime is emitted to `dist/pagefind/` and served from the site, loaded via a base-relative dynamic import — **never a CDN**. T5 Step 4 greps the built output for `unpkg|jsdelivr|cdn.|fonts.googleapis|pagefind.app` and asserts no matches. No external fonts (system stacks only), no tiles, no runtime APIs. The graph uses bundled `d3` (P5B dep) with no remote data; the taste page is pure Astro/CSS. The search wrapper's loader is injectable so tests run fully offline against a fixture.

**Build works with no taste.json / curated.json / PUBLIC_WORKER_URL.** T5 Step 3 runs `env -u PUBLIC_WORKER_URL pnpm --filter @khazana/site build` with no generated data present: feed → `curated.sample.json` (existing P5 fallback, untouched); `/taste` → committed `data/taste.sample.json` (new, `ready:true` so the dashboard is fully exercised); `loadTaste` returns a safe `ready:false` payload even if both files vanish; `/graph` builds from the sample feed + real blog posts (and renders an empty-state message at zero nodes); the beacon no-ops without a worker URL. Pagefind's postbuild exits 0 regardless of content volume. No P5/P5B file is modified except `Shell.astro` (additive: palette mount + two nav links + enabling the existing `.cmdk` hint), and the channel drift guard is left exactly as-is.
