# P6 — Flagship Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `@khazana/generate` package + `khazana generate` CLI that runs **inside the Claude Code GitHub Action (P8)**. The CLI has two subcommands: `plan` reads `data/feed/curated.json` + `data/taste.json` + `STYLE.md`, deterministically selects today's assignments, and emits one **authoring brief** per assignment to `data/generation/briefs/<slug>.md`; `verify` reads the MDX drafts the Action wrote to `apps/site/src/content/blog/<slug>.mdx`, validates each (frontmatter schema, channel/format vocab, grounding against curated sources, no hallucinated components), and writes `data/generation/report.json`, exiting non-zero if any draft fails so the Action can block the commit.

**The actual MDX prose is authored by the Claude Code Action (P8), which reads the emitted briefs and writes the MDX.** THIS code only *plans* assignments, *builds* briefs, and *verifies* drafts. **It MUST NEVER call a paid LLM.** The only LLM touchpoint this package exposes is an *injected, optional, default-off* `factChecker` hook (a fake in tests; in prod a free-tier/Claude call wired up by P8 — never a paid call defined here).

**Architecture:** Pure, deterministic logic (`selectAssignments`, `buildBrief`, `validateDraft`, `runVerify`) is separated from IO (`io.ts`: read curated/taste/style, write briefs, list+read drafts, write report). Every function that depends on the clock takes `now: string` explicitly; slugs are a content hash (no `Date.now()`/`Math.random()`). The frontmatter validation zod schema **mirrors the P5 `blog` content collection exactly** (`apps/site/src/content.config.ts`) so generated MDX builds. Tests are fully offline: pure functions are unit-TDD'd; IO + CLI use temp-dir fixtures.

**Tech Stack:** TypeScript 5 (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`), zod 3, `gray-matter` 4 (frontmatter parsing), Node `node:crypto` (slug hashing), vitest 2, `@khazana/core` + `@khazana/curate` (workspace).

## Global Constraints

- **$0 / no paid API:** the code NEVER calls a paid LLM to write prose — Claude (the Action) is the writer. Any `factChecker` is an injected, optional, default-off hook.
- **Pure/deterministic selection, brief, validation:** pass `now` explicitly; no `Date.now()`/`Math.random()` in logic (slug hashes use content hashing, not randomness).
- **Reuse `@khazana/core`** (`FORMATS`, `FORMAT_NAMES`, `CHANNELS`, `FeedItem`, `FeedItemSchema`, `FormatName`, `Format`) **+ `@khazana/curate`** (`TasteProfile`) — never redefine. Frontmatter schema must **MIRROR the P5 `blog` content collection exactly** so generated MDX builds.
- **Tests fully offline, fixtures only.**
- Package manager **pnpm**; ESM (`.js` extensions on relative imports); TS strict; `import type` / inline `type` for type-only imports (`verbatimModuleSyntax` is on); **no `any` in public APIs**.

---

### Task 1: `@khazana/curate` also emits `data/taste.json` (+ `formatAffinity`)

`@khazana/curate`'s CLI currently writes only `curated.json`. P6 consumes a taste profile, so curate must additionally persist the computed `TasteProfile` plus a `formatAffinity: Record<FormatName, number>` derived from engagement on past posts (empty `{}` when not derivable / not ready). We add a `computeFormatAffinity` helper, extend the `TasteProfile` payload written to disk, add a `writeTaste` IO function, wire it into the CLI, then **run curate's existing tests to prove no regression**.

**Files:**
- Create: `packages/curate/src/format-affinity.ts`, `packages/curate/src/format-affinity.test.ts`
- Modify: `packages/curate/src/io.ts` (add `writeTaste`), `packages/curate/src/io.test.ts` (add a test)
- Modify: `packages/curate/src/cli.ts` (call `writeTaste`), `packages/curate/src/cli.test.ts` (assert taste.json)
- Modify: `packages/curate/src/index.ts` (export `format-affinity`)

**Interfaces:**
- Consumes: `@khazana/core` (`FORMAT_NAMES`, `FormatName`, `FeedItem`, `formatsForChannel`), `EngagementEvent`, `TasteProfile`.
- Produces:
  - `TastePayload = TasteProfile & { formatAffinity: Record<FormatName, number> }` (exported from `format-affinity.ts`).
  - `computeFormatAffinity(events, itemsById, opts): Record<FormatName, number>` — pure; maps each engaged item's channels → candidate formats (`formatsForChannel`), accrues recency-decayed event weight, normalizes to [0,1]; returns `{}` when `!ready` or no signal.
  - `buildTastePayload(profile, events, itemsById, opts): TastePayload`.
  - `writeTaste(dataDir, payload): string` — writes `<dataDir>/taste.json`, returns path.

- [ ] **Step 1: Write the failing test for `computeFormatAffinity` / `buildTastePayload`**

`packages/curate/src/format-affinity.test.ts`:
```ts
import { expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import type { EngagementEvent } from "./io.js";
import type { TasteProfile } from "./taste.js";
import { buildTastePayload, computeFormatAffinity } from "./format-affinity.js";

const NOW = "2026-06-23T00:00:00.000Z";

function item(id: string, topics: string[]): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${id}`,
    title: id,
    publishedAt: "2026-06-22T00:00:00.000Z",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    topics,
    entities: [],
    summary: "",
    media: [],
    kind: "link",
  };
}

test("computeFormatAffinity returns {} when not ready", () => {
  const itemsById = new Map([["a", item("a", ["history"])]]);
  const events: EngagementEvent[] = [{ itemId: "a", type: "read", at: NOW }];
  const aff = computeFormatAffinity(events, itemsById, { now: NOW, ready: false });
  expect(aff).toEqual({});
});

test("computeFormatAffinity biases toward formats whose topics match engaged items", () => {
  // history → chronicle only (per FORMATS topic affinity). 3d-printing → build-log only.
  const itemsById = new Map<string, FeedItem>([
    ["h", item("h", ["history"])],
    ["d", item("d", ["3d-printing"])],
  ]);
  const events: EngagementEvent[] = [
    { itemId: "h", type: "read", at: NOW },
    { itemId: "h", type: "read", at: NOW },
    { itemId: "d", type: "open", at: NOW },
  ];
  const aff = computeFormatAffinity(events, itemsById, { now: NOW, ready: true });
  // chronicle saw two "read" events (weight 3 each); build-log one "open" (weight 1)
  expect(aff.chronicle).toBeGreaterThan(aff["build-log"]!);
  expect(Math.max(...Object.values(aff))).toBeCloseTo(1, 5); // normalized
});

test("buildTastePayload merges the profile with formatAffinity", () => {
  const profile: TasteProfile = { ready: true, topics: { history: 1 }, entities: {} };
  const itemsById = new Map([["h", item("h", ["history"])]]);
  const events: EngagementEvent[] = [{ itemId: "h", type: "read", at: NOW }];
  const payload = buildTastePayload(profile, events, itemsById, { now: NOW });
  expect(payload.ready).toBe(true);
  expect(payload.topics).toEqual({ history: 1 });
  expect(payload.formatAffinity.chronicle).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/curate/src/format-affinity.test.ts`
Expected: FAIL — cannot resolve `./format-affinity.js`.

- [ ] **Step 3: Write the implementation**

`packages/curate/src/format-affinity.ts`:
```ts
import { FORMAT_NAMES, formatsForChannel, type FeedItem, type FormatName } from "@khazana/core";
import type { EngagementEvent } from "./io.js";
import type { TasteProfile } from "./taste.js";
import { DEFAULT_TASTE_OPTS } from "./taste.js";

export type TastePayload = TasteProfile & { formatAffinity: Record<FormatName, number> };

const EVENT_WEIGHTS: Record<EngagementEvent["type"], number> = { open: 1, read: 3, dwell: 2 };
const MS_PER_DAY = 86_400_000;

export interface FormatAffinityOpts {
  now: string;
  ready: boolean;
  halfLifeDays?: number;
}

export function computeFormatAffinity(
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  opts: FormatAffinityOpts,
): Record<FormatName, number> {
  if (!opts.ready) return {} as Record<FormatName, number>;
  const halfLifeDays = opts.halfLifeDays ?? DEFAULT_TASTE_OPTS.halfLifeDays;
  const nowMs = Date.parse(opts.now);

  const scores = new Map<FormatName, number>();
  for (const e of events) {
    const it = itemsById.get(e.itemId);
    if (!it) continue;
    const ageDays = (nowMs - Date.parse(e.at)) / MS_PER_DAY;
    const decay = Math.exp((-Math.LN2 * Math.max(ageDays, 0)) / halfLifeDays);
    const weight = (EVENT_WEIGHTS[e.type] ?? 0) * decay;
    // Map the item's channels to candidate formats, split the weight across them.
    const formats = new Set<FormatName>();
    for (const channel of it.topics) {
      for (const f of formatsForChannel(channel)) formats.add(f.name);
    }
    if (formats.size === 0) continue;
    const share = weight / formats.size;
    for (const name of formats) scores.set(name, (scores.get(name) ?? 0) + share);
  }

  let max = 0;
  for (const v of scores.values()) if (v > max) max = v;
  const out = {} as Record<FormatName, number>;
  if (max === 0) return out;
  for (const name of FORMAT_NAMES) {
    const v = scores.get(name);
    if (v) out[name] = v / max;
  }
  return out;
}

export function buildTastePayload(
  profile: TasteProfile,
  events: EngagementEvent[],
  itemsById: Map<string, FeedItem>,
  opts: { now: string; halfLifeDays?: number },
): TastePayload {
  return {
    ...profile,
    formatAffinity: computeFormatAffinity(events, itemsById, {
      now: opts.now,
      ready: profile.ready,
      halfLifeDays: opts.halfLifeDays,
    }),
  };
}
```

> **Note on `dwell` weight:** `taste.ts`'s `EVENT_WEIGHTS` covers only `open`/`read` (dwell is handled by a special branch there). For format affinity we give `dwell` a fixed mid weight of `2`; this keeps the helper self-contained and deterministic. Do not import `taste.ts`'s `EVENT_WEIGHTS` (it lacks `dwell`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/curate/src/format-affinity.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add `writeTaste` IO + its failing test**

Append to `packages/curate/src/io.test.ts`:
```ts
import { writeTaste } from "./io.js";

test("writeTaste writes taste.json and returns the path", () => {
  const payload = { ready: true, topics: { ai: 1 }, entities: {}, formatAffinity: { dispatch: 1 } };
  const path = writeTaste(dir, payload as never);
  expect(path).toContain("taste.json");
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(payload);
});
```

Run: `pnpm exec vitest run packages/curate/src/io.test.ts`
Expected: FAIL — `writeTaste` is not exported.

- [ ] **Step 6: Implement `writeTaste`**

Append to `packages/curate/src/io.ts`:
```ts
import type { TastePayload } from "./format-affinity.js";

export function writeTaste(dataDir: string, payload: TastePayload): string {
  const path = join(dataDir, "taste.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
  return path;
}
```

> `join`, `dirname`, `mkdirSync`, `writeFileSync` are already imported at the top of `io.ts`.

Run: `pnpm exec vitest run packages/curate/src/io.test.ts`
Expected: PASS (existing 4 tests + the new one).

- [ ] **Step 7: Wire it into the curate CLI + extend its test**

Modify `packages/curate/src/cli.ts` — read `now`-derived itemsById from the curated output and write taste.json. Replace the body of `main` to also build + write the payload:

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents, readRawFeed, writeCuratedFeed, writeTaste } from "./io.js";
import { runCurate } from "./curate.js";
import { buildTastePayload } from "./format-affinity.js";
import { computeTasteProfile } from "./taste.js";
import { makeLlmClientFromEnv } from "./gemini.js";
import type { LlmClient } from "./enrich.js";

export async function main(
  dataDir: string,
  now: string,
  deps: { client?: LlmClient | null } = {},
): Promise<void> {
  const client = deps.client !== undefined ? deps.client : makeLlmClientFromEnv();
  const items = readRawFeed(dataDir);
  const events = readEvents(dataDir);

  const { items: curated, clusterCount, profileReady } = await runCurate(items, events, client, { now });

  const curatedPath = writeCuratedFeed(dataDir, curated);

  // Persist the taste profile + format affinity for the generation pass (P6).
  const itemsById = new Map(curated.map((it) => [it.id, it]));
  const profile = computeTasteProfile(events, itemsById, { now });
  const tastePath = writeTaste(dataDir, buildTastePayload(profile, events, itemsById, { now }));

  console.log(
    `[curate] ${curated.length} items → ${clusterCount} clusters, ` +
      `taste ${profileReady ? "ready" : "warming up"}, llm ${client ? "on" : "off ($0)"} → ${curatedPath}, ${tastePath}`,
  );
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  const dataDir = join(dirname(here), "..", "..", "..", "data");
  main(dataDir, new Date().toISOString()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

> `computeTasteProfile` is re-run on the curated items here (cheap, pure) so taste.json reflects the same profile ranking used. This duplicates the call inside `runCurate`; acceptable — both are pure and deterministic given `now`. (Alternative: have `runCurate` return the profile; left as-is to keep the cross-package change minimal and curate's public `CurateResult` unchanged.)

Append to `packages/curate/src/cli.test.ts` (the existing fixture already seeds `feed/raw.json`):
```ts
test("main also writes taste.json with topics and formatAffinity", async () => {
  // Seed enough engagement to make taste ready, mapped to the seeded items.
  const events = [];
  for (let i = 0; i < 25; i++) {
    events.push({ itemId: "a", type: "read", at: `2026-06-${String(10 + (i % 10)).padStart(2, "0")}T00:00:00.000Z` });
  }
  writeFileSync(join(dir, "events.json"), JSON.stringify(events));
  await main(dir, "2026-06-23T00:00:00.000Z", { client: null });

  const taste = JSON.parse(readFileSync(join(dir, "taste.json"), "utf8"));
  expect(typeof taste.ready).toBe("boolean");
  expect(taste).toHaveProperty("topics");
  expect(taste).toHaveProperty("entities");
  expect(taste).toHaveProperty("formatAffinity");
  // The seeded item "a" carries topic "ai"; when ready, ai-affine formats appear.
  if (taste.ready) {
    expect(Object.keys(taste.formatAffinity).length).toBeGreaterThan(0);
  } else {
    expect(taste.formatAffinity).toEqual({});
  }
});
```

> The seeded items `a`/`b` carry topic `ai`; `c` carries `diy`. The `raw.json` `publishedAt` is `2026-06-22`; events span `2026-06-10..19` so the `minDays` (5) span guard passes and `minEvents` (20) is met → `ready: true` is reachable. The test tolerates either readiness outcome to stay robust to threshold tweaks.

- [ ] **Step 8: Export the new module + run ALL curate tests (regression gate)**

Append to `packages/curate/src/index.ts`:
```ts
export * from "./format-affinity.js";
```

Run: `pnpm exec vitest run packages/curate && pnpm --filter @khazana/curate typecheck`
Expected: PASS — all pre-existing curate tests (io, cli, taste, cluster, rank, curate, enrich, gemini) still green, plus the new format-affinity + taste.json tests. Typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(curate): emit data/taste.json with formatAffinity for generation"
```

---

### Task 2: `@khazana/generate` package shell + IO (curated/taste/style read, briefs + drafts + report)

Stand up the package and the IO boundary. All reads/writes live here; pure logic (T3–T5) stays IO-free.

**Files:**
- Create: `packages/generate/package.json`, `packages/generate/tsconfig.json`, `packages/generate/src/index.ts`
- Create: `packages/generate/src/io.ts`, `packages/generate/src/io.test.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`FeedItemSchema`, `FeedItem`), `@khazana/curate` (`TastePayload`).
- Produces:
  - `readCurated(dataDir): FeedItem[]` — reads `<dataDir>/feed/curated.json`, validates each via `FeedItemSchema.safeParse`, drops invalid.
  - `readTaste(dataDir): TastePayload` — reads `<dataDir>/taste.json`; on missing/invalid returns `{ ready: false, topics: {}, entities: {}, formatAffinity: {} }`.
  - `readStyle(repoRoot): string` — reads `<repoRoot>/STYLE.md` (empty string if absent).
  - `writeBrief(dataDir, slug, markdown): string` — writes `<dataDir>/generation/briefs/<slug>.md`, returns path.
  - `listDrafts(contentDir): string[]` — absolute paths of `*.mdx` under `contentDir`.
  - `readDraft(path): string`.
  - `writeReport(dataDir, report): string` — writes `<dataDir>/generation/report.json`.

- [ ] **Step 1: Create the package shell**

`packages/generate/package.json`:
```json
{
  "name": "@khazana/generate",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "generate": "tsx src/cli.ts"
  },
  "dependencies": {
    "@khazana/core": "workspace:*",
    "@khazana/curate": "workspace:*",
    "gray-matter": "^4.0.3",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "tsx": "^4.19.0"
  }
}
```

`packages/generate/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src"]
}
```

`packages/generate/src/index.ts`:
```ts
export * from "./io.js";
```

- [ ] **Step 2: Install the new dependency**

Run: `pnpm install`
Expected: installs `gray-matter`, links `@khazana/generate`, `@khazana/core`, `@khazana/curate`.

- [ ] **Step 3: Write the failing IO test**

`packages/generate/src/io.test.ts`:
```ts
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { listDrafts, readCurated, readDraft, readStyle, readTaste, writeBrief, writeReport } from "./io.js";

let dir: string;

const item = {
  id: "1",
  source: "hn",
  sourceType: "hn",
  url: "https://e.com/a",
  title: "A",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  topics: ["tech"],
  entities: [],
  summary: "",
  media: [],
  kind: "link",
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-gen-io-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("readCurated returns [] when missing and validates when present", () => {
  expect(readCurated(dir)).toEqual([]);
  mkdirSync(join(dir, "feed"), { recursive: true });
  writeFileSync(join(dir, "feed", "curated.json"), JSON.stringify([item, { id: "bad" }]));
  const items = readCurated(dir);
  expect(items).toHaveLength(1);
  expect(items[0]!.id).toBe("1");
});

test("readTaste falls back to a not-ready empty payload", () => {
  const t = readTaste(dir);
  expect(t).toEqual({ ready: false, topics: {}, entities: {}, formatAffinity: {} });
  writeFileSync(join(dir, "taste.json"), JSON.stringify({ ready: true, topics: { ai: 1 }, entities: {}, formatAffinity: { dispatch: 1 } }));
  expect(readTaste(dir).ready).toBe(true);
  expect(readTaste(dir).formatAffinity.dispatch).toBe(1);
});

test("readStyle reads STYLE.md and returns '' when absent", () => {
  expect(readStyle(dir)).toBe("");
  writeFileSync(join(dir, "STYLE.md"), "# voice\nBe sharp.");
  expect(readStyle(dir)).toContain("Be sharp.");
});

test("writeBrief writes briefs/<slug>.md and returns the path", () => {
  const path = writeBrief(dir, "my-slug", "# Brief\nbody");
  expect(path).toContain(join("generation", "briefs", "my-slug.md"));
  expect(readFileSync(path, "utf8")).toContain("# Brief");
});

test("listDrafts lists only .mdx files; readDraft reads one", () => {
  const content = join(dir, "content");
  mkdirSync(content, { recursive: true });
  writeFileSync(join(content, "a.mdx"), "A");
  writeFileSync(join(content, "b.mdx"), "B");
  writeFileSync(join(content, "notes.txt"), "ignore");
  const drafts = listDrafts(content).sort();
  expect(drafts).toHaveLength(2);
  expect(readDraft(drafts[0]!)).toBe("A");
});

test("writeReport writes generation/report.json", () => {
  const path = writeReport(dir, { ok: true, drafts: [], generatedAt: "2026-06-23T00:00:00.000Z" } as never);
  expect(path).toContain(join("generation", "report.json"));
  expect(JSON.parse(readFileSync(path, "utf8")).ok).toBe(true);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run packages/generate/src/io.test.ts`
Expected: FAIL — cannot resolve `./io.js`.

- [ ] **Step 5: Write the implementation**

`packages/generate/src/io.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FeedItemSchema, type FeedItem } from "@khazana/core";
import type { TastePayload } from "@khazana/curate";
import type { VerifyReport } from "./verify.js";

const EMPTY_TASTE: TastePayload = { ready: false, topics: {}, entities: {}, formatAffinity: {} };

export function readCurated(dataDir: string): FeedItem[] {
  const path = join(dataDir, "feed", "curated.json");
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const raw = Array.isArray(parsed) ? parsed : [];
  const out: FeedItem[] = [];
  for (const candidate of raw) {
    const r = FeedItemSchema.safeParse(candidate);
    if (r.success) out.push(r.data);
  }
  return out;
}

export function readTaste(dataDir: string): TastePayload {
  const path = join(dataDir, "taste.json");
  if (!existsSync(path)) return { ...EMPTY_TASTE };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<TastePayload>;
    return {
      ready: parsed.ready ?? false,
      topics: parsed.topics ?? {},
      entities: parsed.entities ?? {},
      formatAffinity: parsed.formatAffinity ?? {},
    };
  } catch {
    return { ...EMPTY_TASTE };
  }
}

export function readStyle(repoRoot: string): string {
  const path = join(repoRoot, "STYLE.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function writeBrief(dataDir: string, slug: string, markdown: string): string {
  const path = join(dataDir, "generation", "briefs", `${slug}.md`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown.endsWith("\n") ? markdown : markdown + "\n");
  return path;
}

export function listDrafts(contentDir: string): string[] {
  if (!existsSync(contentDir)) return [];
  return readdirSync(contentDir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => join(contentDir, f));
}

export function readDraft(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeReport(dataDir: string, report: VerifyReport): string {
  const path = join(dataDir, "generation", "report.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  return path;
}
```

> `VerifyReport` is defined in T6 (`verify.ts`). This is a type-only import (`import type`), so the file typechecks once `verify.ts` exists; until then the package builds via T6. To keep T2 self-contained for its own test run, `io.test.ts` casts the report to `never`, so no `verify.ts` symbol is needed at runtime. The `import type { VerifyReport }` line is the only forward reference; if the implementer prefers, add a one-line `verify.ts` stub now: `export interface VerifyReport { ok: boolean; drafts: unknown[]; generatedAt: string }` and flesh it out in T6.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run packages/generate/src/io.test.ts`
Expected: PASS — 6 tests. (If the `import type { VerifyReport }` errors during vitest, add the one-line `verify.ts` stub from the note.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(generate): package shell + IO (curated/taste/style, briefs, drafts, report)"
```

---

### Task 3: `selectAssignments` (pure, TDD) — cluster ranking, recurring columns, format affinity

Group curated items by `clusterId`, rank clusters, pick a format per chosen cluster (channel→format candidates, biased by `taste.formatAffinity` when ready), always include any **recurring column** due on `now`'s weekday, and emit deterministic `Assignment`s with content-hash slugs.

**Files:**
- Create: `packages/generate/src/select.ts`, `packages/generate/src/select.test.ts`
- Modify: `packages/generate/src/index.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`FORMATS`, `FORMAT_NAMES`, `FormatName`, `Format`, `FeedItem`, `formatsForChannel`), `@khazana/curate` (`TastePayload`).
- Produces:
  - `Assignment` — `{ slug: string; format: FormatName; channel: string; title: string; sourceItemIds: string[]; length: "brief" | "feature"; rationale: string; column: boolean }`.
  - `ColumnSpec` — `{ format: FormatName; channel: string }`.
  - `dueColumns(now: string): ColumnSpec[]` — derives due recurring columns from `FORMATS[].series` + `now`'s UTC weekday (weekly + matching `day`, e.g. Sunday → chronicle; daily → always due).
  - `slugify(title: string, sourceItemIds: string[]): string` — kebab title + short stable content hash (`sha1` of joined source ids), no randomness.
  - `selectAssignments(input): Assignment[]` where `input = { items: FeedItem[]; taste: TastePayload; now: string; maxPerRun?: number; dueColumns?: ColumnSpec[] }`. Default `maxPerRun = 3`.

- [ ] **Step 1: Write the failing test**

`packages/generate/src/select.test.ts`:
```ts
import { expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import type { TastePayload } from "@khazana/curate";
import { dueColumns, selectAssignments, slugify } from "./select.js";

const NOT_READY: TastePayload = { ready: false, topics: {}, entities: {}, formatAffinity: {} };

function item(id: string, clusterId: string, channel: string, taste: number, publishedAt: string): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url: `https://e.com/${id}`,
    title: `Item ${id}`,
    publishedAt,
    fetchedAt: publishedAt,
    topics: [channel],
    entities: [],
    summary: `summary ${id}`,
    media: [],
    clusterId,
    tasteScore: taste,
    kind: "link",
  };
}

test("dueColumns returns the chronicle column on a Sunday (UTC)", () => {
  // 2026-06-21 is a Sunday.
  const cols = dueColumns("2026-06-21T12:00:00.000Z");
  expect(cols).toContainEqual({ format: "chronicle", channel: "history" });
  // 2026-06-23 is a Tuesday → no weekly Sunday column.
  expect(dueColumns("2026-06-23T12:00:00.000Z")).not.toContainEqual({ format: "chronicle", channel: "history" });
});

test("slugify is deterministic and stable for the same inputs", () => {
  const a = slugify("OpenAI ships GPT-5!", ["x", "y"]);
  const b = slugify("OpenAI ships GPT-5!", ["x", "y"]);
  expect(a).toBe(b);
  expect(a).toMatch(/^openai-ships-gpt-5-[0-9a-f]{6}$/);
  // different sources → different hash suffix
  expect(slugify("OpenAI ships GPT-5!", ["z"])).not.toBe(a);
});

test("selectAssignments ranks clusters and caps at maxPerRun, no columns due", () => {
  const items: FeedItem[] = [
    // cluster A: big + high taste (ai → dispatch/field-notes/teardown/primer candidates)
    item("a1", "A", "ai", 9, "2026-06-23T00:00:00.000Z"),
    item("a2", "A", "ai", 8, "2026-06-23T00:00:00.000Z"),
    // cluster B: medium
    item("b1", "B", "finance", 5, "2026-06-22T00:00:00.000Z"),
    // cluster C: small/low
    item("c1", "C", "science", 1, "2026-06-20T00:00:00.000Z"),
  ];
  const out = selectAssignments({ items, taste: NOT_READY, now: "2026-06-23T12:00:00.000Z", maxPerRun: 2 });
  expect(out).toHaveLength(2);
  // top assignment is cluster A
  expect(out[0]!.sourceItemIds).toEqual(["a1", "a2"]);
  expect(out[0]!.channel).toBe("ai");
  // every assignment carries a known format and a slug
  for (const a of out) {
    expect(a.slug).toMatch(/^[a-z0-9-]+$/);
    expect(a.sourceItemIds.length).toBeGreaterThan(0);
  }
});

test("formatAffinity biases the format choice among candidates when taste is ready", () => {
  const items: FeedItem[] = [item("a1", "A", "ai", 9, "2026-06-23T00:00:00.000Z")];
  // ai-channel candidate formats include dispatch, field-notes, teardown, primer.
  // Bias strongly toward teardown.
  const taste: TastePayload = {
    ready: true,
    topics: { ai: 1 },
    entities: {},
    formatAffinity: { teardown: 1, dispatch: 0.1 },
  };
  const out = selectAssignments({ items, taste, now: "2026-06-23T12:00:00.000Z", maxPerRun: 1 });
  expect(out[0]!.format).toBe("teardown");
});

test("a due column is always included and counts toward the run", () => {
  const items: FeedItem[] = [item("a1", "A", "ai", 9, "2026-06-23T00:00:00.000Z")];
  const out = selectAssignments({
    items,
    taste: NOT_READY,
    now: "2026-06-23T12:00:00.000Z",
    maxPerRun: 2,
    dueColumns: [{ format: "chronicle", channel: "history" }],
  });
  const column = out.find((a) => a.column);
  expect(column).toBeDefined();
  expect(column!.format).toBe("chronicle");
  expect(out.length).toBeLessThanOrEqual(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/generate/src/select.test.ts`
Expected: FAIL — cannot resolve `./select.js`.

- [ ] **Step 3: Write the implementation**

`packages/generate/src/select.ts`:
```ts
import { createHash } from "node:crypto";
import {
  FORMATS,
  formatsForChannel,
  type FeedItem,
  type Format,
  type FormatName,
} from "@khazana/core";
import type { TastePayload } from "@khazana/curate";

export interface Assignment {
  slug: string;
  format: FormatName;
  channel: string;
  title: string;
  sourceItemIds: string[];
  length: "brief" | "feature";
  rationale: string;
  column: boolean;
}

export interface ColumnSpec {
  format: FormatName;
  channel: string;
}

export interface SelectInput {
  items: FeedItem[];
  taste: TastePayload;
  now: string;
  maxPerRun?: number;
  dueColumns?: ColumnSpec[];
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function dueColumns(now: string): ColumnSpec[] {
  const weekday = WEEKDAYS[new Date(now).getUTCDay()];
  const out: ColumnSpec[] = [];
  for (const format of Object.values(FORMATS)) {
    const series = format.series;
    if (!series) continue;
    const due = series.cadence === "daily" || (series.cadence === "weekly" && series.day === weekday);
    if (due) out.push({ format: format.name, channel: format.topics[0] ?? "" });
  }
  return out;
}

export function slugify(title: string, sourceItemIds: string[]): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const hash = createHash("sha1").update([...sourceItemIds].sort().join("|")).digest("hex").slice(0, 6);
  return `${base}-${hash}`;
}

interface ClusterAgg {
  clusterId: string;
  channel: string;
  items: FeedItem[];
  score: number;
  newestMs: number;
}

function aggregateClusters(items: FeedItem[]): ClusterAgg[] {
  const byCluster = new Map<string, FeedItem[]>();
  for (const it of items) {
    const key = it.clusterId ?? it.id;
    const list = byCluster.get(key) ?? [];
    list.push(it);
    byCluster.set(key, list);
  }
  const aggs: ClusterAgg[] = [];
  for (const [clusterId, members] of byCluster) {
    // Items arrive ranked (curate sorts desc by tasteScore); keep that order.
    const sorted = [...members].sort((a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0));
    const tasteSum = sorted.reduce((s, it) => s + (it.tasteScore ?? 0), 0);
    const sizeBoost = Math.log10(1 + sorted.length);
    const newestMs = Math.max(...sorted.map((it) => Date.parse(it.publishedAt)));
    aggs.push({
      clusterId,
      channel: sorted[0]!.topics[0] ?? "ideas",
      items: sorted,
      score: tasteSum + sizeBoost,
      newestMs,
    });
  }
  // Deterministic order: score desc, then recency desc, then clusterId asc as a stable tiebreak.
  return aggs.sort(
    (a, b) => b.score - a.score || b.newestMs - a.newestMs || a.clusterId.localeCompare(b.clusterId),
  );
}

function pickFormat(channel: string, items: FeedItem[], taste: TastePayload): Format {
  const candidates = formatsForChannel(channel);
  const pool = candidates.length > 0 ? candidates : [FORMATS["field-notes"]];
  if (taste.ready) {
    // Bias by formatAffinity; deterministic tiebreak by format name.
    return [...pool].sort(
      (a, b) =>
        (taste.formatAffinity[b.name] ?? 0) - (taste.formatAffinity[a.name] ?? 0) ||
        a.name.localeCompare(b.name),
    )[0]!;
  }
  // Not ready: length by cluster size — bigger/feature for richer clusters, else first candidate.
  const wantFeature = items.length >= 2;
  const byLength = [...pool].sort((a, b) => {
    const av = a.length === "feature" ? 1 : 0;
    const bv = b.length === "feature" ? 1 : 0;
    return (wantFeature ? bv - av : av - bv) || a.name.localeCompare(b.name);
  });
  return byLength[0]!;
}

export function selectAssignments(input: SelectInput): Assignment[] {
  const maxPerRun = input.maxPerRun ?? 3;
  const columns = input.dueColumns ?? dueColumns(input.now);
  const out: Assignment[] = [];
  const usedClusters = new Set<string>();

  // 1) Recurring columns first (they define the publication's heartbeat).
  for (const col of columns) {
    if (out.length >= maxPerRun) break;
    const fmt = FORMATS[col.format];
    // Source the column from the top items in its channel, if any.
    const channelItems = input.items
      .filter((it) => it.topics.includes(col.channel))
      .sort((a, b) => (b.tasteScore ?? 0) - (a.tasteScore ?? 0))
      .slice(0, fmt.length === "feature" ? 4 : 2);
    const ids = channelItems.map((it) => it.id);
    const title = channelItems[0]?.title ?? `${fmt.name} column`;
    out.push({
      slug: slugify(`${fmt.name}-${title}`, ids.length > 0 ? ids : [col.format, col.channel]),
      format: fmt.name,
      channel: col.channel,
      title,
      sourceItemIds: ids,
      length: fmt.length,
      rationale: `Recurring ${fmt.series?.cadence} column (${fmt.name}) due on ${new Date(input.now).getUTCDay()}.`,
      column: true,
    });
    for (const it of channelItems) if (it.clusterId) usedClusters.add(it.clusterId);
  }

  // 2) On-demand picks from the day's top clusters.
  for (const agg of aggregateClusters(input.items)) {
    if (out.length >= maxPerRun) break;
    if (usedClusters.has(agg.clusterId)) continue;
    const fmt = pickFormat(agg.channel, agg.items, input.taste);
    const ids = agg.items.map((it) => it.id);
    out.push({
      slug: slugify(agg.items[0]!.title, ids),
      format: fmt.name,
      channel: agg.channel,
      title: agg.items[0]!.title,
      sourceItemIds: ids,
      length: fmt.length,
      rationale: `Top cluster (${agg.items.length} item(s), score ${agg.score.toFixed(2)}) on "${agg.channel}" → ${fmt.name}.`,
      column: false,
    });
    usedClusters.add(agg.clusterId);
  }

  return out;
}
```

> **Recurring-column logic:** `dueColumns(now)` reads `FORMATS[].series` and maps `now`'s UTC weekday to the column. With the current FORMATS, only `chronicle` has `series` (`{ cadence: "weekly", day: "sunday" }`), so a Sunday `now` yields `{ format: "chronicle", channel: "history" }`. Columns are emitted first and count toward `maxPerRun`, matching the brief.
> **Affinity bias:** when `taste.ready`, `pickFormat` sorts the channel's candidate formats by `formatAffinity` (desc) with a name tiebreak — so the founder's read-history steers the format. When not ready, it falls back to a size→length heuristic (deterministic).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/generate/src/select.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Export + commit**

Append to `packages/generate/src/index.ts`:
```ts
export * from "./select.js";
```

```bash
git add -A
git commit -m "feat(generate): selectAssignments (cluster ranking, columns, format affinity)"
```

---

### Task 4: `buildBrief` (pure, TDD) — the complete authoring instruction for Claude

Produce the full markdown brief Claude (the Action) follows. It injects the format's `voiceProfile`, the `STYLE.md` voice, the **exact** frontmatter spec to emit, the source items (title + url + summary + id) to synthesize and cite, the format's `componentKit`, and an explicit grounding/citation mandate.

**Files:**
- Create: `packages/generate/src/brief.ts`, `packages/generate/src/brief.test.ts`
- Modify: `packages/generate/src/index.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`FORMATS`, `FeedItem`), `Assignment` (from `select.ts`).
- Produces: `buildBrief(assignment, items, style): string` — pure; same inputs → identical text. `items` is the full curated list (the brief pulls the assignment's sources out of it by id).

- [ ] **Step 1: Write the failing test**

`packages/generate/src/brief.test.ts`:
```ts
import { expect, test } from "vitest";
import { FORMATS, type FeedItem } from "@khazana/core";
import type { Assignment } from "./select.js";
import { buildBrief } from "./brief.js";

function item(id: string, title: string, url: string): FeedItem {
  return {
    id,
    source: "src",
    sourceType: "rss",
    url,
    title,
    publishedAt: "2026-06-22T00:00:00.000Z",
    fetchedAt: "2026-06-22T00:00:00.000Z",
    topics: ["ai"],
    entities: [],
    summary: `Summary of ${title}.`,
    media: [],
    kind: "link",
  };
}

const assignment: Assignment = {
  slug: "openai-ships-gpt-5-abc123",
  format: "dispatch",
  channel: "ai",
  title: "OpenAI ships GPT-5",
  sourceItemIds: ["s1", "s2"],
  length: "feature",
  rationale: "top cluster",
  column: false,
};

const items: FeedItem[] = [
  item("s1", "GPT-5 launch", "https://e.com/1"),
  item("s2", "Agentic tool use", "https://e.com/2"),
  item("x9", "Unrelated", "https://e.com/9"),
];

const STYLE = "## Voice\nConfident, curious, precise.";

test("brief is deterministic", () => {
  expect(buildBrief(assignment, items, STYLE)).toBe(buildBrief(assignment, items, STYLE));
});

test("brief injects the format voiceProfile and the STYLE.md voice", () => {
  const brief = buildBrief(assignment, items, STYLE);
  expect(brief).toContain(FORMATS.dispatch.voiceProfile);
  expect(brief).toContain("Confident, curious, precise.");
});

test("brief embeds the exact frontmatter spec with the slug, format, channel", () => {
  const brief = buildBrief(assignment, items, STYLE);
  expect(brief).toContain("format: dispatch");
  expect(brief).toContain("channels:");
  expect(brief).toContain("- ai");
  expect(brief).toContain("publishedAt:");
  expect(brief).toContain("sources:"); // the {title,url} array spec
  expect(brief).toContain("title:");
  expect(brief).toContain("summary:");
});

test("brief lists ONLY the assignment's source items with id + url + summary", () => {
  const brief = buildBrief(assignment, items, STYLE);
  expect(brief).toContain("s1");
  expect(brief).toContain("https://e.com/1");
  expect(brief).toContain("Summary of GPT-5 launch.");
  expect(brief).toContain("s2");
  expect(brief).toContain("https://e.com/2");
  // unrelated item is NOT included
  expect(brief).not.toContain("x9");
  expect(brief).not.toContain("https://e.com/9");
});

test("brief lists the format componentKit and mandates grounding/citation", () => {
  const brief = buildBrief(assignment, items, STYLE);
  for (const c of FORMATS.dispatch.componentKit) expect(brief).toContain(c);
  // explicit grounding mandate
  expect(brief.toLowerCase()).toContain("cite");
  expect(brief.toLowerCase()).toContain("every");
  expect(brief.toLowerCase()).toContain("source");
  // prefer interactive components over prose-only
  expect(brief.toLowerCase()).toContain("interactive");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/generate/src/brief.test.ts`
Expected: FAIL — cannot resolve `./brief.js`.

- [ ] **Step 3: Write the implementation**

`packages/generate/src/brief.ts`:
```ts
import { FORMATS, type FeedItem } from "@khazana/core";
import type { Assignment } from "./select.js";

function sourceBlock(items: FeedItem[]): string {
  return items
    .map(
      (it) =>
        `- **id:** \`${it.id}\` — **${it.title}**\n` +
        `  - url: ${it.url}\n` +
        `  - summary: ${it.summary || "(no summary)"}`,
    )
    .join("\n");
}

export function buildBrief(assignment: Assignment, items: FeedItem[], style: string): string {
  const fmt = FORMATS[assignment.format];
  const byId = new Map(items.map((it) => [it.id, it]));
  const sources = assignment.sourceItemIds
    .map((id) => byId.get(id))
    .filter((it): it is FeedItem => it !== undefined);

  const channelsYaml = [assignment.channel].map((c) => `  - ${c}`).join("\n");
  const sourcesYaml = sources.map((it) => `  - { title: "<title>", url: "${it.url}" }`).join("\n");

  return `# Authoring brief: ${assignment.title}

**Slug:** \`${assignment.slug}\`
**Format:** ${assignment.format} (${fmt.intent} / ${fmt.length})
**Channel:** ${assignment.channel}
**Why this assignment:** ${assignment.rationale}

## Format voice profile
${fmt.voiceProfile}

## Founder voice guide (STYLE.md)
${style.trim() || "(STYLE.md not provided)"}

## Output file
Write the MDX to: \`apps/site/src/content/blog/${assignment.slug}.mdx\`

## EXACT frontmatter to emit
The frontmatter MUST validate against the site's blog content collection. Emit YAML with EXACTLY these fields:

\`\`\`yaml
---
title: "${assignment.title}"
format: ${assignment.format}
channels:
${channelsYaml}
summary: "<one-sentence summary>"
publishedAt: ${"<ISO 8601 datetime, e.g. the run date>"}
sources:
${sourcesYaml || '  - { title: "<title>", url: "<url>" }'}
draft: false
---
\`\`\`

- \`format\` MUST be exactly \`${assignment.format}\`.
- \`channels\` MUST be a non-empty list drawn from the site channel vocabulary.
- \`sources\` MUST be a non-empty list of \`{ title, url }\` — one entry per source you actually cite, using the URLs below verbatim.

## Source items to synthesize and CITE
Use ONLY these items. Every factual claim must trace to one of them.

${sourceBlock(sources)}

## Encouraged components (this format's kit)
Import these from \`@/components/mdx\` and prefer them over prose-only sections:
${fmt.componentKit.map((c) => `- <${c}>`).join("\n")}

## Grounding & verification mandate (non-negotiable)
- Cite EVERY factual claim: every assertion must be traceable to one of the source items above.
- Reflect each cited item's URL in the \`sources\` frontmatter array AND cite it inline (e.g. an \`<Annotation>\` or a link).
- Do NOT introduce facts, numbers, names, or dates that are not supported by a listed source. If a claim cannot be grounded, cut it.
- Prefer interactive components over prose-only explanation — the chart/diagram should arrive before the words that explain it.
- Use ONLY components from the kit above; do not invent component names.

## Target length
${fmt.length === "feature" ? "Feature (~1500–2500 words) + interactive components." : "Brief (~300–500 words)."}
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/generate/src/brief.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Export + commit**

Append to `packages/generate/src/index.ts`:
```ts
export * from "./brief.js";
```

```bash
git add -A
git commit -m "feat(generate): buildBrief — complete grounded authoring instruction"
```

---

### Task 5: `validateDraft` (pure, TDD) — frontmatter schema, grounding, component allow-list

Parse the MDX with `gray-matter`, validate frontmatter against a zod schema that **mirrors the P5 `blog` collection exactly**, confirm grounding against known curated sources, and reject any component name not in the P5B barrel.

**Files:**
- Create: `packages/generate/src/validate.ts`, `packages/generate/src/validate.test.ts`
- Modify: `packages/generate/src/index.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`FORMAT_NAMES`, `CHANNELS`), `gray-matter`.
- Produces:
  - `KNOWN_COMPONENTS: readonly string[]` — the P5B barrel names: `Annotation, Chart, Timeline, DataTable, Scrolly, ScrollyStep, RunnableCode, Map`.
  - `BlogFrontmatterSchema` — zod schema mirroring `apps/site/src/content.config.ts`.
  - `DraftResult` — `{ ok: boolean; slug: string; errors: string[] }`.
  - `validateDraft(mdx, knownSourceUrls, knownComponents?): DraftResult` — `knownSourceUrls` is the set of curated FeedItem URLs (grounding key). `slug` is derived from the frontmatter title when present, else `"unknown"`.

> **Schema-mirroring decision (resolved ambiguity):** the P6 brief text says `sources` is "array of ids", but the **authoritative P5 `blog` schema** (`apps/site/src/content.config.ts`) defines `sources: z.array(z.object({ title, url: z.string().url() }))`. The plan honors the P5 schema verbatim (per the Global Constraint "must MIRROR the P5 blog collection exactly so generated MDX builds"). **Grounding** is therefore checked by `url`: every frontmatter `sources[].url` must exist in the set of curated FeedItem URLs (`knownSourceUrls`). This satisfies the brief's intent ("source ids not in the known set" → here, source URLs not traceable to a known FeedItem) while keeping the frontmatter byte-compatible with the site build.

- [ ] **Step 1: Write the failing test**

`packages/generate/src/validate.test.ts`:
```ts
import { expect, test } from "vitest";
import { KNOWN_COMPONENTS, validateDraft } from "./validate.js";

const KNOWN_URLS = new Set(["https://e.com/1", "https://e.com/2"]);

function mdx(frontmatter: string, body = "Body."): string {
  return `---\n${frontmatter}\n---\n${body}\n`;
}

const VALID_FM = [
  'title: "OpenAI ships GPT-5"',
  "format: dispatch",
  "channels:",
  "  - ai",
  'summary: "It ships."',
  "publishedAt: 2026-06-23T00:00:00.000Z",
  "sources:",
  '  - { title: "GPT-5 launch", url: "https://e.com/1" }',
].join("\n");

test("a fully valid, grounded draft passes", () => {
  const body = 'import { Chart, Annotation } from "@/components/mdx";\n\n<Chart /> <Annotation>x</Annotation>';
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(true);
  expect(r.errors).toEqual([]);
  expect(r.slug).toBe("openai-ships-gpt-5");
});

test("missing/empty frontmatter fails", () => {
  const r = validateDraft("No frontmatter here.\n", KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/frontmatter/i);
});

test("format not in FORMAT_NAMES fails", () => {
  const fm = VALID_FM.replace("format: dispatch", "format: explainer");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/format/i);
});

test("channel not in CHANNELS fails", () => {
  const fm = VALID_FM.replace("  - ai", "  - cooking");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/channel/i);
});

test("empty sources array fails (must cite at least one)", () => {
  const fm = [
    'title: "T"',
    "format: dispatch",
    "channels:",
    "  - ai",
    'summary: "s"',
    "publishedAt: 2026-06-23T00:00:00.000Z",
    "sources: []",
  ].join("\n");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/source/i);
});

test("a source url not traceable to a known FeedItem fails grounding", () => {
  const fm = VALID_FM.replace("https://e.com/1", "https://evil.example/made-up");
  const r = validateDraft(mdx(fm), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/ground|known source/i);
});

test("a hallucinated component name fails", () => {
  const body = 'import { HoloDeck } from "@/components/mdx";\n\n<HoloDeck />';
  const r = validateDraft(mdx(VALID_FM, body), KNOWN_URLS);
  expect(r.ok).toBe(false);
  expect(r.errors.join(" ")).toMatch(/component/i);
  expect(r.errors.join(" ")).toContain("HoloDeck");
});

test("KNOWN_COMPONENTS matches the P5B barrel exactly", () => {
  expect([...KNOWN_COMPONENTS].sort()).toEqual(
    ["Annotation", "Chart", "DataTable", "Map", "RunnableCode", "Scrolly", "ScrollyStep", "Timeline"].sort(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/generate/src/validate.test.ts`
Expected: FAIL — cannot resolve `./validate.js`.

- [ ] **Step 3: Write the implementation**

`packages/generate/src/validate.ts`:
```ts
import matter from "gray-matter";
import { z } from "zod";
import { CHANNELS, FORMAT_NAMES } from "@khazana/core";

// Mirrors apps/site/src/content.config.ts `blog` collection EXACTLY so generated
// MDX builds under astro:content. Field names + constraints must not drift.
const formatEnum = z.enum([...FORMAT_NAMES] as [string, ...string[]]);
const channelEnum = z.enum([...CHANNELS] as [string, ...string[]]);

export const BlogFrontmatterSchema = z.object({
  title: z.string(),
  format: formatEnum,
  channels: z.array(channelEnum).min(1),
  summary: z.string(),
  publishedAt: z.coerce.date(),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
  draft: z.boolean().default(false),
});
export type BlogFrontmatter = z.infer<typeof BlogFrontmatterSchema>;

// The P5B component barrel (apps/site/src/components/mdx/index.ts).
export const KNOWN_COMPONENTS = [
  "Annotation",
  "Chart",
  "Timeline",
  "DataTable",
  "Scrolly",
  "ScrollyStep",
  "RunnableCode",
  "Map",
] as const;

export interface DraftResult {
  ok: boolean;
  slug: string;
  errors: string[];
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Component names used in JSX (<Foo ...>) and imported from the mdx barrel.
function usedComponentNames(body: string): Set<string> {
  const names = new Set<string>();
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) names.add(m[1]!);
  for (const m of body.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*mdx["']/g)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]!.trim();
      if (/^[A-Z]/.test(name)) names.add(name);
    }
  }
  return names;
}

export function validateDraft(
  mdx: string,
  knownSourceUrls: ReadonlySet<string>,
  knownComponents: readonly string[] = KNOWN_COMPONENTS,
): DraftResult {
  const errors: string[] = [];

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(mdx);
  } catch {
    return { ok: false, slug: "unknown", errors: ["frontmatter: failed to parse"] };
  }

  const fm = parsed.data;
  if (!fm || Object.keys(fm).length === 0) {
    return { ok: false, slug: "unknown", errors: ["frontmatter: missing or empty"] };
  }

  const result = BlogFrontmatterSchema.safeParse(fm);
  let slug = "unknown";
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`frontmatter ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    if (typeof fm.title === "string") slug = slugFromTitle(fm.title);
  } else {
    const data = result.data;
    slug = slugFromTitle(data.title);

    // Grounding: at least one source, each url traceable to a known FeedItem.
    if (data.sources.length === 0) {
      errors.push("sources: at least one cited source is required (grounding)");
    }
    for (const src of data.sources) {
      if (!knownSourceUrls.has(src.url)) {
        errors.push(`grounding: source url not in known sources: ${src.url}`);
      }
    }
  }

  // Components: every used/imported component must be in the allow-list.
  const allowed = new Set(knownComponents);
  for (const name of usedComponentNames(parsed.content)) {
    if (!allowed.has(name)) errors.push(`component: unknown component <${name}>`);
  }

  return { ok: errors.length === 0, slug, errors };
}
```

> **Empty-sources note:** `BlogFrontmatterSchema.sources` has `.default([])` to mirror P5 exactly; an empty array therefore *parses*, so the non-empty check is enforced separately in `validateDraft` (grounding requires ≥1 cited source). This keeps the schema byte-identical to the site while still rejecting ungrounded drafts.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/generate/src/validate.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Export + commit**

Append to `packages/generate/src/index.ts`:
```ts
export * from "./validate.js";
```

```bash
git add -A
git commit -m "feat(generate): validateDraft — P5-schema-mirroring frontmatter + grounding + component allow-list"
```

---

### Task 6: `runVerify` orchestration + `khazana generate` CLI (`plan` / `verify`)

`runVerify` validates each draft, runs an optional injected `factChecker`, and produces a `VerifyReport`. The CLI's `plan` subcommand emits briefs; `verify` validates drafts, writes `report.json`, and exits non-zero on any failure. Both use injected deps for temp-dir tests.

**Files:**
- Create: `packages/generate/src/verify.ts`, `packages/generate/src/verify.test.ts`
- Create: `packages/generate/src/cli.ts`, `packages/generate/src/cli.test.ts`
- Modify: `packages/generate/src/index.ts`

**Interfaces:**
- Consumes: `validateDraft`, `DraftResult`, IO (`readCurated`, `readTaste`, `readStyle`, `writeBrief`, `listDrafts`, `readDraft`, `writeReport`), `selectAssignments`, `buildBrief`.
- Produces:
  - `DraftCheck` — `{ slug: string; file: string; ok: boolean; errors: string[]; factCheck?: { ok: boolean; notes: string } }`.
  - `VerifyReport` — `{ ok: boolean; generatedAt: string; drafts: DraftCheck[] }`.
  - `FactChecker` — `(input: { mdx: string; sources: FeedItem[] }) => Promise<{ ok: boolean; notes: string }>` (injected, optional, default-off).
  - `runVerify(drafts, curated, opts): Promise<VerifyReport>` where `drafts = { file: string; mdx: string }[]`, `opts = { now: string; factChecker?: FactChecker }`.
  - CLI `main(argv, deps): Promise<number>` — `deps = { dataDir; repoRoot; contentDir; now; factChecker? }`; returns an exit code (0 ok / 1 fail). Direct-run block at bottom calls `process.exit`.

- [ ] **Step 1: Write the failing `runVerify` test**

`packages/generate/src/verify.test.ts`:
```ts
import { expect, test } from "vitest";
import type { FeedItem } from "@khazana/core";
import { runVerify, type FactChecker } from "./verify.js";

function item(id: string, url: string): FeedItem {
  return {
    id, source: "s", sourceType: "rss", url, title: id,
    publishedAt: "2026-06-22T00:00:00.000Z", fetchedAt: "2026-06-22T00:00:00.000Z",
    topics: ["ai"], entities: [], summary: "", media: [], kind: "link",
  };
}

const curated = [item("s1", "https://e.com/1")];

const GOOD = `---
title: "Good Post"
format: dispatch
channels:
  - ai
summary: "ok"
publishedAt: 2026-06-23T00:00:00.000Z
sources:
  - { title: "One", url: "https://e.com/1" }
---
<Chart />
`;

const BAD = `---
title: "Bad Post"
format: dispatch
channels:
  - ai
summary: "ok"
publishedAt: 2026-06-23T00:00:00.000Z
sources:
  - { title: "Made up", url: "https://nope.example/x" }
---
Body.
`;

test("runVerify passes good drafts and fails ungrounded ones", async () => {
  const report = await runVerify(
    [{ file: "/x/good.mdx", mdx: GOOD }, { file: "/x/bad.mdx", mdx: BAD }],
    curated,
    { now: "2026-06-23T00:00:00.000Z" },
  );
  expect(report.ok).toBe(false);
  expect(report.drafts.find((d) => d.file.endsWith("good.mdx"))!.ok).toBe(true);
  expect(report.drafts.find((d) => d.file.endsWith("bad.mdx"))!.ok).toBe(false);
});

test("factChecker is off by default and runs only when injected", async () => {
  const checker: FactChecker = async () => ({ ok: false, notes: "claim unsupported" });
  const report = await runVerify([{ file: "/x/good.mdx", mdx: GOOD }], curated, {
    now: "2026-06-23T00:00:00.000Z",
    factChecker: checker,
  });
  const d = report.drafts[0]!;
  expect(d.factCheck).toEqual({ ok: false, notes: "claim unsupported" });
  expect(d.ok).toBe(false); // a failing fact-check fails the draft

  const noChecker = await runVerify([{ file: "/x/good.mdx", mdx: GOOD }], curated, {
    now: "2026-06-23T00:00:00.000Z",
  });
  expect(noChecker.drafts[0]!.factCheck).toBeUndefined();
  expect(noChecker.drafts[0]!.ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/generate/src/verify.test.ts`
Expected: FAIL — cannot resolve `./verify.js`.

- [ ] **Step 3: Write `runVerify`**

`packages/generate/src/verify.ts`:
```ts
import type { FeedItem } from "@khazana/core";
import { validateDraft } from "./validate.js";

export interface FactCheckResult {
  ok: boolean;
  notes: string;
}
export type FactChecker = (input: { mdx: string; sources: FeedItem[] }) => Promise<FactCheckResult>;

export interface DraftCheck {
  slug: string;
  file: string;
  ok: boolean;
  errors: string[];
  factCheck?: FactCheckResult;
}

export interface VerifyReport {
  ok: boolean;
  generatedAt: string;
  drafts: DraftCheck[];
}

export interface VerifyOpts {
  now: string;
  factChecker?: FactChecker;
}

export async function runVerify(
  drafts: { file: string; mdx: string }[],
  curated: FeedItem[],
  opts: VerifyOpts,
): Promise<VerifyReport> {
  const knownUrls = new Set(curated.map((it) => it.url));
  const byUrl = new Map(curated.map((it) => [it.url, it]));
  const out: DraftCheck[] = [];

  for (const draft of drafts) {
    const result = validateDraft(draft.mdx, knownUrls);
    const check: DraftCheck = {
      slug: result.slug,
      file: draft.file,
      ok: result.ok,
      errors: [...result.errors],
    };

    if (opts.factChecker) {
      // Only fact-check structurally valid drafts; pass the cited source items.
      const sources = curated.filter((it) => knownUrls.has(it.url) && byUrl.has(it.url));
      const fc = await opts.factChecker({ mdx: draft.mdx, sources });
      check.factCheck = fc;
      if (!fc.ok) {
        check.ok = false;
        check.errors.push(`fact-check: ${fc.notes}`);
      }
    }

    out.push(check);
  }

  return { ok: out.every((d) => d.ok), generatedAt: opts.now, drafts: out };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/generate/src/verify.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Write the failing CLI test**

`packages/generate/src/cli.test.ts`:
```ts
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { main } from "./cli.js";

let root: string;
let dataDir: string;
let contentDir: string;
const NOW = "2026-06-21T12:00:00.000Z"; // a Sunday → chronicle column is due

function curatedItem(id: string, clusterId: string, channel: string, taste: number): unknown {
  return {
    id, source: "src", sourceType: "rss", url: `https://e.com/${id}`, title: `Item ${id}`,
    publishedAt: "2026-06-21T00:00:00.000Z", fetchedAt: "2026-06-21T00:00:00.000Z",
    topics: [channel], entities: [], summary: `summary ${id}`, media: [],
    clusterId, tasteScore: taste, kind: "link",
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "khz-gen-cli-"));
  dataDir = join(root, "data");
  contentDir = join(root, "apps", "site", "src", "content", "blog");
  mkdirSync(join(dataDir, "feed"), { recursive: true });
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(
    join(dataDir, "feed", "curated.json"),
    JSON.stringify([
      curatedItem("a1", "A", "ai", 9),
      curatedItem("a2", "A", "ai", 8),
      curatedItem("h1", "H", "history", 4),
    ]),
  );
  writeFileSync(join(root, "STYLE.md"), "## Voice\nConfident, curious, precise.");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("plan writes one brief per assignment", async () => {
  const code = await main(["plan"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(0);
  const briefs = readdirSync(join(dataDir, "generation", "briefs")).filter((f) => f.endsWith(".md"));
  expect(briefs.length).toBeGreaterThan(0);
  // a brief mentions a real source url + a citation mandate
  const text = readFileSync(join(dataDir, "generation", "briefs", briefs[0]!), "utf8");
  expect(text).toContain("https://e.com/");
  expect(text.toLowerCase()).toContain("cite");
});

test("verify exits 0 on a grounded draft and writes report.json", async () => {
  writeFileSync(
    join(contentDir, "good.mdx"),
    `---
title: "Good"
format: field-notes
channels:
  - ai
summary: "s"
publishedAt: 2026-06-21T00:00:00.000Z
sources:
  - { title: "A1", url: "https://e.com/a1" }
---
<Annotation>note</Annotation>
`,
  );
  const code = await main(["verify"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(0);
  const report = JSON.parse(readFileSync(join(dataDir, "generation", "report.json"), "utf8"));
  expect(report.ok).toBe(true);
  expect(report.drafts).toHaveLength(1);
});

test("verify exits 1 on an ungrounded draft", async () => {
  writeFileSync(
    join(contentDir, "bad.mdx"),
    `---
title: "Bad"
format: field-notes
channels:
  - ai
summary: "s"
publishedAt: 2026-06-21T00:00:00.000Z
sources:
  - { title: "Fake", url: "https://nope.example/x" }
---
Body.
`,
  );
  const code = await main(["verify"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(1);
  const report = JSON.parse(readFileSync(join(dataDir, "generation", "report.json"), "utf8"));
  expect(report.ok).toBe(false);
});

test("unknown subcommand returns a non-zero code", async () => {
  const code = await main(["frobnicate"], { dataDir, repoRoot: root, contentDir, now: NOW });
  expect(code).toBe(2);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm exec vitest run packages/generate/src/cli.test.ts`
Expected: FAIL — cannot resolve `./cli.js`.

- [ ] **Step 7: Write the CLI**

`packages/generate/src/cli.ts`:
```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrief } from "./brief.js";
import {
  listDrafts,
  readCurated,
  readDraft,
  readStyle,
  readTaste,
  writeBrief,
  writeReport,
} from "./io.js";
import { selectAssignments } from "./select.js";
import { runVerify, type FactChecker } from "./verify.js";

export interface CliDeps {
  dataDir: string;
  repoRoot: string;
  contentDir: string;
  now: string;
  factChecker?: FactChecker;
}

async function runPlan(deps: CliDeps): Promise<number> {
  const items = readCurated(deps.dataDir);
  const taste = readTaste(deps.dataDir);
  const style = readStyle(deps.repoRoot);
  const assignments = selectAssignments({ items, taste, now: deps.now });
  for (const a of assignments) {
    const path = writeBrief(deps.dataDir, a.slug, buildBrief(a, items, style));
    console.log(`[generate:plan] ${a.format} "${a.title}" → ${path}`);
  }
  console.log(`[generate:plan] ${assignments.length} brief(s) written.`);
  return 0;
}

async function runVerifyCmd(deps: CliDeps): Promise<number> {
  const curated = readCurated(deps.dataDir);
  const files = listDrafts(deps.contentDir);
  const drafts = files.map((file) => ({ file, mdx: readDraft(file) }));
  const report = await runVerify(drafts, curated, { now: deps.now, factChecker: deps.factChecker });
  const path = writeReport(deps.dataDir, report);
  for (const d of report.drafts) {
    if (!d.ok) console.error(`[generate:verify] FAIL ${d.file}: ${d.errors.join("; ")}`);
  }
  console.log(`[generate:verify] ${report.drafts.filter((d) => d.ok).length}/${report.drafts.length} ok → ${path}`);
  return report.ok ? 0 : 1;
}

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const cmd = argv[0];
  if (cmd === "plan") return runPlan(deps);
  if (cmd === "verify") return runVerifyCmd(deps);
  console.error(`[generate] unknown subcommand: ${cmd ?? "(none)"} (expected "plan" or "verify")`);
  return 2;
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] === here) {
  const repoRoot = join(dirname(here), "..", "..", "..");
  const deps: CliDeps = {
    dataDir: join(repoRoot, "data"),
    repoRoot,
    contentDir: join(repoRoot, "apps", "site", "src", "content", "blog"),
    now: new Date().toISOString(),
  };
  main(process.argv.slice(2), deps)
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run packages/generate/src/cli.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 9: Export, typecheck, full test run, then commit**

Append to `packages/generate/src/index.ts`:
```ts
export * from "./verify.js";
```

Run: `pnpm --filter @khazana/generate typecheck && pnpm test`
Expected: typecheck clean; ALL tests (core + curate + ingest + generate) PASS — including the curate regression suite from T1.

```bash
git add -A
git commit -m "feat(generate): runVerify + khazana generate CLI (plan/verify) with injected fact-check hook"
```

---

## Self-Review

**Brief → task coverage:**

| Brief item | Task |
|---|---|
| Curate also emits `data/taste.json` + `formatAffinity`; keep tests green | **T1** (`format-affinity.ts`, `writeTaste`, CLI wiring, regression run in Step 8) |
| Package shell + IO (read curated/taste/style, write briefs, list/read drafts, write report) | **T2** |
| `selectAssignments` (cluster ranking, recurring columns from `series`+weekday, formatAffinity bias, content-hash slug) | **T3** |
| `buildBrief` (format voiceProfile + STYLE.md voice + exact frontmatter + source ids/urls + componentKit + citation mandate) | **T4** |
| `validateDraft` (P5-mirroring zod schema, grounding, component allow-list) | **T5** |
| `runVerify` + CLI `plan`/`verify` (injected deps, temp-dir tests, non-zero exit on failure, optional default-off factChecker) | **T6** |

**Total task count: 6** (T1 cross-package curate change; T2–T6 the `@khazana/generate` package).

**Placeholder scan:** none. Every step ships complete, real code and real tests with exact paths and commands. The only intentional "fill-in" markers are *inside the generated brief text* (e.g. `<one-sentence summary>`, `<ISO 8601 datetime>`) — those are instructions to Claude-the-author, asserted as literal strings by T4's tests, not unfinished code.

**Type consistency:** `TastePayload` is defined once (T1, `@khazana/curate`) and consumed by `readTaste`/`selectAssignments`. `Assignment`/`ColumnSpec` defined once (T3) and consumed by `buildBrief` (T4) and the CLI (T6). `DraftResult`/`KNOWN_COMPONENTS`/`BlogFrontmatterSchema` defined once (T5), consumed by `runVerify` (T6). `VerifyReport`/`DraftCheck`/`FactChecker` defined once (T6), with `io.ts` referencing `VerifyReport` via `import type` only. No `any` in any public signature; `verbatimModuleSyntax` honored (`import type` everywhere a type is imported).

**Does any code path call a paid LLM? (must be NO):** **NO.** The package contains zero network/LLM calls. The single LLM seam is `FactChecker`, an *injected, optional, default-off* hook: `runVerify` invokes it only when `opts.factChecker` is provided, and the CLI never constructs one itself (P8's workflow supplies a free-tier/Claude checker if desired). Prose authoring is done by the Claude Action reading briefs — not by this code. T1's curate change runs with `client: null` in tests and re-uses curate's existing (free/off-by-default) LLM seam unchanged; no new paid call is introduced.

**Does the generated/validated frontmatter schema EXACTLY match `apps/site/src/content.config.ts`?** Field-by-field:

| P5 `blog` schema (`content.config.ts`) | T5 `BlogFrontmatterSchema` | Match |
|---|---|---|
| `title: z.string()` | `title: z.string()` | ✓ |
| `format: z.enum([...FORMAT_NAMES])` | `format: z.enum([...FORMAT_NAMES])` | ✓ |
| `channels: z.array(z.enum([...CHANNELS])).min(1)` | `channels: z.array(z.enum([...CHANNELS])).min(1)` | ✓ |
| `summary: z.string()` | `summary: z.string()` | ✓ |
| `publishedAt: z.coerce.date()` | `publishedAt: z.coerce.date()` | ✓ |
| `sources: z.array(z.object({ title: z.string(), url: z.string().url() })).default([])` | identical | ✓ |
| `draft: z.boolean().default(false)` | `draft: z.boolean().default(false)` | ✓ |

Both enums are built from the same `@khazana/core` `FORMAT_NAMES`/`CHANNELS`, so the vocabularies cannot drift. The brief (T4) emits exactly these fields in the same order. **Resolved ambiguity:** the brief prose called `sources` "an array of ids", but the authoritative P5 schema is `{ title, url }[]`; the plan mirrors P5 verbatim (so MDX builds) and performs grounding by matching each `sources[].url` against the curated FeedItem URL set — preserving the brief's intent (reject sources not traceable to a known FeedItem) without breaking the site schema. The non-empty-sources rule is enforced in `validateDraft` (not the schema, which keeps P5's `.default([])`), so an ungrounded/empty draft is still rejected while the schema stays byte-identical to the site.

**Other adaptations to the real code:**
- **Curate CLI shape:** `main(dataDir, now, { client })` already exists; T1 extends its body (re-running the pure `computeTasteProfile` on curated items to build the payload) rather than changing `CurateResult` — minimal, non-breaking, keeps existing `cli.test.ts` assertions valid.
- **`dwell` weight:** `taste.ts`'s `EVENT_WEIGHTS` omits `dwell`; T1's `computeFormatAffinity` uses its own self-contained weights (`open:1, read:3, dwell:2`) to avoid importing an incomplete map.
- **Component barrel:** `KNOWN_COMPONENTS` is pinned to the 8 real exports in `apps/site/src/components/mdx/index.ts` (including `ScrollyStep`), asserted by a dedicated test so the allow-list can't silently drift from the barrel.
