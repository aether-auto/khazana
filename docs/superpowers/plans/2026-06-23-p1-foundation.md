# P1 — Foundation & Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the khazana monorepo with tooling, the shared `@khazana/core` package that defines every cross-subsystem contract (FeedItem, Source, Format, source registry), and the cofounder scaffolding files — so every later plan builds on a typed, tested foundation.

**Architecture:** A pnpm-workspace monorepo. `@khazana/core` is a pure, dependency-light TypeScript package exporting **zod schemas** (runtime validation) plus their inferred types, so both hand-written code and LLM-produced data validate against one source of truth. No app/runtime code yet — just the contracts and the repo skeleton everything else imports.

**Tech Stack:** pnpm 9 workspaces, TypeScript 5 (strict), zod 3, vitest 2, tsx, Node 24.

## Global Constraints

- **$0 recurring cost** — nothing in this repo may require a paid service to build or test.
- **TypeScript strict mode** everywhere; no `any` in `@khazana/core` public API.
- **Validation = zod**: every cross-subsystem data shape is a zod schema in `@khazana/core`; TS types are `z.infer` of those schemas, never hand-duplicated.
- **Channels (canonical topic vocabulary):** `history, geopolitics, politics, geography, science, tech, ai, quantum, data-science, ds-sports, data-strategy, finance, ideas, diy, 3d-printing, iot, embedded, ai-projects`.
- **SourceType vocabulary:** `reddit, hn, rss, eng-blog, arxiv, x, news`.
- **FeedItem.kind vocabulary:** `link, discussion, paper, idea`.
- **v1 Formats:** `chronicle, dispatch, field-notes, teardown, primer, build-log`.
- Package manager is **pnpm**; never generate `package-lock.json` or `yarn.lock`.

---

### Task 1: Monorepo skeleton & tooling

**Files:**
- Create: `package.json` (root), `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.npmrc`, `README.md`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/index.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a workspace where `pnpm install` succeeds and `pnpm test` runs vitest across packages. Package `@khazana/core` resolvable by later packages via `"@khazana/core": "workspace:*"`.

- [ ] **Step 1: Create root workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`.npmrc`:
```
auto-install-peers=true
```

Root `package.json`:
```json
{
  "name": "khazana",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
```

`README.md`:
```markdown
# khazana

A personal, self-curating treasury of the world's best signal + daily AI-authored
interactive blogs. Static + serverless, $0 to run. See `docs/superpowers/specs/`.
```

- [ ] **Step 2: Create the `@khazana/core` package shell**

`packages/core/package.json`:
```json
{
  "name": "@khazana/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src"]
}
```

`packages/core/src/index.ts`:
```ts
export const KHAZANA_CORE_VERSION = "0.0.0";
```

`packages/core/src/index.test.ts`:
```ts
import { expect, test } from "vitest";
import { KHAZANA_CORE_VERSION } from "./index.js";

test("core package is importable", () => {
  expect(KHAZANA_CORE_VERSION).toBe("0.0.0");
});
```

- [ ] **Step 3: Install and verify the workspace**

Run: `pnpm install`
Expected: completes, creates `pnpm-lock.yaml`, links `@khazana/core`.

- [ ] **Step 4: Run the test suite**

Run: `pnpm test`
Expected: PASS — 1 test passed (`core package is importable`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo + @khazana/core shell"
```

---

### Task 2: Core vocabularies (channels, source types, kinds, formats)

**Files:**
- Create: `packages/core/src/vocab.ts`, `packages/core/src/vocab.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CHANNELS: readonly string[]` and `ChannelSchema` (zod enum), type `Channel`.
  - `SOURCE_TYPES`, `SourceTypeSchema`, type `SourceType`.
  - `ITEM_KINDS`, `ItemKindSchema`, type `ItemKind`.
  - `FORMAT_NAMES`, `FormatNameSchema`, type `FormatName`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/vocab.test.ts`:
```ts
import { expect, test } from "vitest";
import { CHANNELS, ChannelSchema, SourceTypeSchema, FormatNameSchema } from "./vocab.js";

test("channels include the founder's core topics", () => {
  for (const c of ["history", "geopolitics", "ai", "quantum", "ds-sports", "finance"]) {
    expect(CHANNELS).toContain(c);
  }
});

test("ChannelSchema accepts known and rejects unknown", () => {
  expect(ChannelSchema.parse("finance")).toBe("finance");
  expect(ChannelSchema.safeParse("astrology").success).toBe(false);
});

test("source types and format names validate", () => {
  expect(SourceTypeSchema.parse("eng-blog")).toBe("eng-blog");
  expect(FormatNameSchema.parse("chronicle")).toBe("chronicle");
  expect(FormatNameSchema.safeParse("haiku").success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/vocab.test.ts`
Expected: FAIL — cannot resolve `./vocab.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/vocab.ts`:
```ts
import { z } from "zod";

export const CHANNELS = [
  "history", "geopolitics", "politics", "geography", "science", "tech",
  "ai", "quantum", "data-science", "ds-sports", "data-strategy", "finance",
  "ideas", "diy", "3d-printing", "iot", "embedded", "ai-projects",
] as const;
export const ChannelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof ChannelSchema>;

export const SOURCE_TYPES = ["reddit", "hn", "rss", "eng-blog", "arxiv", "x", "news"] as const;
export const SourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const ITEM_KINDS = ["link", "discussion", "paper", "idea"] as const;
export const ItemKindSchema = z.enum(ITEM_KINDS);
export type ItemKind = z.infer<typeof ItemKindSchema>;

export const FORMAT_NAMES = [
  "chronicle", "dispatch", "field-notes", "teardown", "primer", "build-log",
] as const;
export const FormatNameSchema = z.enum(FORMAT_NAMES);
export type FormatName = z.infer<typeof FormatNameSchema>;
```

Append to `packages/core/src/index.ts`:
```ts
export * from "./vocab.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/vocab.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): canonical channel/source-type/kind/format vocabularies"
```

---

### Task 3: The `FeedItem` contract

**Files:**
- Create: `packages/core/src/feed-item.ts`, `packages/core/src/feed-item.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `vocab.ts` (`SourceTypeSchema`, `ItemKindSchema`).
- Produces:
  - `MediaRefSchema` / type `MediaRef`.
  - `FeedItemSchema` / type `FeedItem` — the normalized item every source maps into.
  - `makeFeedItemId(sourceType: string, url: string): string` — stable id.

- [ ] **Step 1: Write the failing test**

`packages/core/src/feed-item.test.ts`:
```ts
import { expect, test } from "vitest";
import { FeedItemSchema, makeFeedItemId } from "./feed-item.js";

const base = {
  source: "netflix-techblog",
  sourceType: "eng-blog",
  url: "https://netflixtechblog.com/x",
  title: "Scaling X",
  publishedAt: "2026-06-20T00:00:00.000Z",
  fetchedAt: "2026-06-23T00:00:00.000Z",
  kind: "link",
};

test("defaults fill optional enrichment fields", () => {
  const item = FeedItemSchema.parse({ id: "a", ...base });
  expect(item.topics).toEqual([]);
  expect(item.entities).toEqual([]);
  expect(item.summary).toBe("");
  expect(item.media).toEqual([]);
});

test("rejects bad sourceType and missing required fields", () => {
  expect(FeedItemSchema.safeParse({ id: "a", ...base, sourceType: "nope" }).success).toBe(false);
  expect(FeedItemSchema.safeParse({ id: "a" }).success).toBe(false);
});

test("makeFeedItemId is stable and deterministic", () => {
  const a = makeFeedItemId("eng-blog", "https://netflixtechblog.com/x");
  const b = makeFeedItemId("eng-blog", "https://netflixtechblog.com/x");
  expect(a).toBe(b);
  expect(a).not.toBe(makeFeedItemId("eng-blog", "https://netflixtechblog.com/y"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/feed-item.test.ts`
Expected: FAIL — cannot resolve `./feed-item.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/feed-item.ts`:
```ts
import { createHash } from "node:crypto";
import { z } from "zod";
import { ItemKindSchema, SourceTypeSchema } from "./vocab.js";

export const MediaRefSchema = z.object({
  type: z.enum(["image", "video", "chart", "audio"]),
  url: z.string().url(),
  alt: z.string().optional(),
});
export type MediaRef = z.infer<typeof MediaRefSchema>;

export const FeedItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceType: SourceTypeSchema,
  url: z.string().url(),
  title: z.string(),
  author: z.string().optional(),
  publishedAt: z.string().datetime(),
  fetchedAt: z.string().datetime(),
  topics: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  summary: z.string().default(""),
  body: z.string().optional(),
  media: z.array(MediaRefSchema).default([]),
  metrics: z.object({ score: z.number().optional(), comments: z.number().optional() }).optional(),
  clusterId: z.string().optional(),
  tasteScore: z.number().optional(),
  trustScore: z.number().min(0).max(1).optional(),
  kind: ItemKindSchema,
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

export function makeFeedItemId(sourceType: string, url: string): string {
  return createHash("sha1").update(`${sourceType}::${url}`).digest("hex").slice(0, 16);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from "./feed-item.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/feed-item.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): FeedItem schema + stable id (the one normalized format)"
```

---

### Task 4: `Source` interface + `sources.json` registry contract

**Files:**
- Create: `packages/core/src/source.ts`, `packages/core/src/source.test.ts`
- Create: `packages/core/src/registry.ts`, `packages/core/src/registry.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `vocab.ts`, `feed-item.ts`.
- Produces:
  - `Source` interface — `{ id, type, channels, fetch(ctx) }` where `fetch` returns `Promise<FeedItem[]>`.
  - `FetchContext` type — `{ now: string; limit?: number }`.
  - `SourceEntrySchema` / type `SourceEntry` — one row of `sources.json`.
  - `RegistrySchema` / type `Registry` — `{ version, sources }`.
  - `parseRegistry(json: unknown): Registry`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/source.test.ts`:
```ts
import { expect, test } from "vitest";
import type { Source } from "./source.js";
import { FeedItemSchema } from "./feed-item.js";

test("a Source implementation type-checks and yields FeedItems", async () => {
  const fake: Source = {
    id: "fake",
    type: "rss",
    channels: ["tech"],
    async fetch() {
      return [
        FeedItemSchema.parse({
          id: "1", source: "fake", sourceType: "rss",
          url: "https://e.com/a", title: "A",
          publishedAt: "2026-06-20T00:00:00.000Z",
          fetchedAt: "2026-06-23T00:00:00.000Z", kind: "link",
        }),
      ];
    },
  };
  const items = await fake.fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(items[0]?.source).toBe("fake");
});
```

`packages/core/src/registry.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseRegistry } from "./registry.js";

test("parseRegistry applies defaults and validates", () => {
  const reg = parseRegistry({
    version: 1,
    sources: [{ id: "hn", type: "hn", url: "https://news.ycombinator.com", channels: ["tech"] }],
  });
  const hn = reg.sources[0]!;
  expect(hn.enabled).toBe(true);
  expect(hn.trustScore).toBe(0.5);
  expect(hn.addedBy).toBe("seed");
  expect(hn.failureCount).toBe(0);
});

test("parseRegistry rejects an unknown source type", () => {
  expect(() =>
    parseRegistry({ version: 1, sources: [{ id: "x", type: "bogus", url: "https://e.com", channels: [] }] }),
  ).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/src/source.test.ts packages/core/src/registry.test.ts`
Expected: FAIL — cannot resolve `./source.js` / `./registry.js`.

- [ ] **Step 3: Write the implementations**

`packages/core/src/source.ts`:
```ts
import type { FeedItem } from "./feed-item.js";
import type { SourceType } from "./vocab.js";

export interface FetchContext {
  now: string;        // ISO timestamp for this run
  limit?: number;     // max items to return
}

export interface Source {
  id: string;
  type: SourceType;
  channels: string[];
  fetch(ctx: FetchContext): Promise<FeedItem[]>;
}
```

`packages/core/src/registry.ts`:
```ts
import { z } from "zod";
import { SourceTypeSchema } from "./vocab.js";

export const SourceEntrySchema = z.object({
  id: z.string(),
  type: SourceTypeSchema,
  url: z.string().url(),
  channels: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  trustScore: z.number().min(0).max(1).default(0.5),
  addedBy: z.enum(["seed", "scout", "manual"]).default("seed"),
  addedAt: z.string().datetime().optional(),
  lastFetchedAt: z.string().datetime().optional(),
  failureCount: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
});
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export const RegistrySchema = z.object({
  version: z.number().int().default(1),
  sources: z.array(SourceEntrySchema).default([]),
});
export type Registry = z.infer<typeof RegistrySchema>;

export function parseRegistry(json: unknown): Registry {
  return RegistrySchema.parse(json);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from "./source.js";
export * from "./registry.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/source.test.ts packages/core/src/registry.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): Source interface + sources.json registry contract"
```

---

### Task 5: The `Format` contract + v1 format registry

**Files:**
- Create: `packages/core/src/format.ts`, `packages/core/src/format.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `vocab.ts` (`FormatNameSchema`).
- Produces:
  - `FormatSchema` / type `Format`.
  - `FORMATS: Record<FormatName, Format>` — the six v1 formats as data.
  - `formatsForChannel(channel: string): Format[]`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/format.test.ts`:
```ts
import { expect, test } from "vitest";
import { FORMATS, formatsForChannel } from "./format.js";

test("all six v1 formats are present and valid", () => {
  expect(Object.keys(FORMATS).sort()).toEqual(
    ["build-log", "chronicle", "dispatch", "field-notes", "primer", "teardown"],
  );
  expect(FORMATS.chronicle.intent).toBe("narrate");
  expect(FORMATS["field-notes"].length).toBe("brief");
});

test("chronicle is recurring (Sunday column) and matches history", () => {
  expect(FORMATS.chronicle.series?.cadence).toBe("weekly");
  expect(formatsForChannel("history").map((f) => f.name)).toContain("chronicle");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/format.test.ts`
Expected: FAIL — cannot resolve `./format.js`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/format.ts`:
```ts
import { z } from "zod";
import { FormatNameSchema, type FormatName } from "./vocab.js";

export const FormatSchema = z.object({
  name: FormatNameSchema,
  intent: z.enum(["narrate", "explain", "synthesize", "build", "weigh"]),
  length: z.enum(["brief", "feature"]),
  voiceProfile: z.string(),
  componentKit: z.array(z.string()),
  topics: z.array(z.string()),
  series: z.object({ cadence: z.enum(["daily", "weekly"]), day: z.string().optional() }).optional(),
});
export type Format = z.infer<typeof FormatSchema>;

export const FORMATS: Record<FormatName, Format> = {
  chronicle: {
    name: "chronicle", intent: "narrate", length: "feature",
    voiceProfile: "Immersive present-tense historical-fiction narrative; cited in margin notes, never breaking the spell.",
    componentKit: ["Scrolly", "Annotation", "Timeline", "Map"],
    topics: ["history", "geopolitics", "geography"],
    series: { cadence: "weekly", day: "sunday" },
  },
  dispatch: {
    name: "dispatch", intent: "explain", length: "feature",
    voiceProfile: "Data-driven Pudding/Distill explainer; interactive charts woven into prose, scroll-driven reveals.",
    componentKit: ["Chart", "Scrolly", "DataTable", "Annotation"],
    topics: ["data-science", "ds-sports", "finance", "science", "ai", "quantum"],
  },
  "field-notes": {
    name: "field-notes", intent: "synthesize", length: "brief",
    voiceProfile: "Short sharp briefing: what happened, why it matters to you, links to sources.",
    componentKit: ["Annotation", "DataTable"],
    topics: ["geopolitics", "politics", "tech", "ai", "finance"],
  },
  teardown: {
    name: "teardown", intent: "explain", length: "feature",
    voiceProfile: "Deep 'how X actually works' deconstruction with interactive code and diagrams.",
    componentKit: ["RunnableCode", "Chart", "Annotation"],
    topics: ["tech", "ai", "quantum", "embedded", "data-science"],
  },
  primer: {
    name: "primer", intent: "explain", length: "feature",
    voiceProfile: "Evergreen foundational explainer with interactive sandboxes; timeless, not timely.",
    componentKit: ["RunnableCode", "Chart", "Annotation"],
    topics: ["science", "ai", "quantum", "finance", "data-science"],
  },
  "build-log": {
    name: "build-log", intent: "build", length: "feature",
    voiceProfile: "DIY/project walkthrough: parts, steps, runnable code; powers the Workshop board.",
    componentKit: ["RunnableCode", "DataTable", "Annotation"],
    topics: ["diy", "3d-printing", "iot", "embedded", "ai-projects"],
  },
};

export function formatsForChannel(channel: string): Format[] {
  return Object.values(FORMATS).filter((f) => f.topics.includes(channel));
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from "./format.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/src/format.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Typecheck the whole core package, then commit**

Run: `pnpm --filter @khazana/core typecheck`
Expected: no errors.

```bash
git add -A
git commit -m "feat(core): Format contract + six v1 formats as data"
```

---

### Task 6: Cofounder scaffolding (CLAUDE.md, EXPLORER.md, STYLE.md) + seed registry

**Files:**
- Create: `CLAUDE.md`, `EXPLORER.md`, `STYLE.md`
- Create: `data/sources.seed.json`
- Create: `packages/core/src/registry.seed.test.ts`

**Interfaces:**
- Consumes: `parseRegistry` from Task 4.
- Produces: a committed seed registry that validates against `RegistrySchema`, and the three living cofounder docs. (No new exported code.)

- [ ] **Step 1: Write the failing test (seed registry must be valid)**

`packages/core/src/registry.seed.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parseRegistry } from "./registry.js";

test("data/sources.seed.json is a valid registry with >= 10 sources", () => {
  const path = fileURLToPath(new URL("../../../data/sources.seed.json", import.meta.url));
  const reg = parseRegistry(JSON.parse(readFileSync(path, "utf8")));
  expect(reg.sources.length).toBeGreaterThanOrEqual(10);
  expect(new Set(reg.sources.map((s) => s.id)).size).toBe(reg.sources.length); // unique ids
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/registry.seed.test.ts`
Expected: FAIL — cannot read `data/sources.seed.json`.

- [ ] **Step 3: Create the seed registry**

`data/sources.seed.json` — a starter set spanning the founder's channels (engineering blogs, HN, Reddit, arXiv, news). Use real feed URLs:
```json
{
  "version": 1,
  "sources": [
    { "id": "hn-frontpage", "type": "hn", "url": "https://hnrss.org/frontpage", "channels": ["tech", "ai", "ideas"], "trustScore": 0.7 },
    { "id": "netflix-techblog", "type": "eng-blog", "url": "https://netflixtechblog.com/feed", "channels": ["tech", "data-science"], "trustScore": 0.8 },
    { "id": "stripe-blog", "type": "eng-blog", "url": "https://stripe.com/blog/feed.rss", "channels": ["tech", "finance"], "trustScore": 0.8 },
    { "id": "cloudflare-blog", "type": "eng-blog", "url": "https://blog.cloudflare.com/rss/", "channels": ["tech"], "trustScore": 0.8 },
    { "id": "uber-eng", "type": "eng-blog", "url": "https://www.uber.com/blog/engineering/rss/", "channels": ["tech", "data-science"], "trustScore": 0.75 },
    { "id": "google-research", "type": "eng-blog", "url": "https://research.google/blog/rss/", "channels": ["ai", "data-science", "science"], "trustScore": 0.8 },
    { "id": "arxiv-cs-ai", "type": "arxiv", "url": "https://rss.arxiv.org/rss/cs.AI", "channels": ["ai"], "trustScore": 0.7 },
    { "id": "arxiv-quant-ph", "type": "arxiv", "url": "https://rss.arxiv.org/rss/quant-ph", "channels": ["quantum"], "trustScore": 0.7 },
    { "id": "r-dataisbeautiful", "type": "reddit", "url": "https://www.reddit.com/r/dataisbeautiful/top/.json?t=day", "channels": ["data-science"], "trustScore": 0.5 },
    { "id": "r-geopolitics", "type": "reddit", "url": "https://www.reddit.com/r/geopolitics/top/.json?t=day", "channels": ["geopolitics", "politics"], "trustScore": 0.5 },
    { "id": "r-3dprinting", "type": "reddit", "url": "https://www.reddit.com/r/3Dprinting/top/.json?t=week", "channels": ["3d-printing", "diy"], "trustScore": 0.5 },
    { "id": "quanta-magazine", "type": "rss", "url": "https://www.quantamagazine.org/feed/", "channels": ["science", "quantum", "ai"], "trustScore": 0.8 }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/registry.seed.test.ts`
Expected: PASS — seed registry valid, 12 unique sources.

- [ ] **Step 5: Create the cofounder docs**

`CLAUDE.md` — project memory for every session. Must contain: one-paragraph product description; the hybrid graph note is N/A; the monorepo map (`packages/core`, future `packages/ingest|curate|scout`, `apps/site|worker`, `data/`, `docs/`); the Global Constraints from this plan (cost, zod-as-truth, vocabularies); the rule "read `docs/superpowers/specs/2026-06-23-khazana-design.md` for the full vision and `EXPLORER.md` for current state before non-trivial work"; the model-tiering policy (free LLM for volume, Sonnet for work, Opus rarely); and "use subagents for code/testing to keep context clear."

`EXPLORER.md` — the living cofounder journal. Sections: **North Star** (1 line), **Now** (current plan = P1), **Roadmap** (P1→P8 table from the spec build order), **Idea Backlog** (backlog formats; backlog features: The Thread, Counterfactual, Profile, Atlas, Debate, Annotated; spaced re-surfacing; digest), **Decisions Log** (dated: hybrid cloud generation via Claude Action OAuth; X via best-effort mirrors; CF Worker+KV behavior store; public repo; terminal×editorial aesthetic; 6 v1 formats; columns+on-demand; auto-add high-confidence sources; model tiering), **Open Questions** (from spec §14).

`STYLE.md` — the founder's writing-voice guide that drives flagship generation. Structured starter to co-fill: **Voice** (tone, person, sentence rhythm), **Do** / **Don't**, **Per-format notes** (Chronicle = immersive narrative; Dispatch = data-forward; Field Notes = terse), **Example paragraphs** (TO BE PROVIDED BY FOUNDER — leave a clearly marked section), **Citations** (always link claims to source FeedItems). Mark the founder-input section explicitly so it's filled before P6.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: cofounder scaffolding (CLAUDE/EXPLORER/STYLE) + seed source registry"
```

---

### Task 7: CI workflow (lint/typecheck/test on push)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root `package.json` scripts (`test`, `typecheck`).
- Produces: a CI gate that runs on every push/PR. (No exported code.)

- [ ] **Step 1: Create the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 2: Verify the suite locally (proxy for CI)**

Run: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`
Expected: install OK, typecheck clean, all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "ci: typecheck + test on push/PR"
```

---

## Self-Review

**Spec coverage (P1 scope only):** monorepo ✓ (T1), FeedItem "one format" ✓ (T3), Source + `sources.json` registry ✓ (T4), Format system as data ✓ (T5), cofounder scaffolding CLAUDE/EXPLORER/STYLE ✓ (T6), seed sources incl. engineering blogs ✓ (T6), model-tiering recorded ✓ (T6 CLAUDE/EXPLORER), CI ✓ (T7). Ingestion/curation/worker/site/generation/scout are **out of P1 scope by design** — they are P2–P8 and depend on these contracts.

**Placeholder scan:** STYLE.md intentionally contains a clearly-marked "founder to provide example paragraphs" section — this is real founder input gated before P6, not a plan placeholder. No "TODO/TBD" steps; every code step shows complete code.

**Type consistency:** `FeedItem.fetch` return type, `Source.fetch(ctx)` signature, `parseRegistry` return, `FORMATS` keys all match across tasks and the Global Constraints vocabularies. Channel/SourceType/FormatName enums are defined once (T2) and reused (T3–T5).
