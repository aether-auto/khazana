# P2 — Ingestion & Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `@khazana/ingest` package + `khazana ingest` CLI that loads the source registry, fetches every enabled source, normalizes each into the `FeedItem` format from `@khazana/core`, isolates per-source failures, dedupes, and writes `data/feed/raw.json`.

**Architecture:** Pure parse/normalize functions (fed raw text/JSON) are separated from network I/O so tests run fully offline against fixtures. A `FetchFn` dependency is injected everywhere; the default wraps global `fetch`. Most sources are RSS/Atom (rss, eng-blog, arxiv, news, hn-via-hnrss, x-via-nitter); Reddit uses its JSON listing API. A dispatcher (`buildSource`) picks the parser by `SourceType`.

**Tech Stack:** TypeScript 5 (strict), `rss-parser` 3, Node 24 global `fetch`, vitest 2, `@khazana/core` (workspace).

## Global Constraints

- **$0 recurring cost**; no paid APIs. Tests must NOT hit the network — use fixtures + injected `FetchFn`.
- **One format:** every source maps to `FeedItem` (validated via `FeedItemSchema.safeParse`; invalid items are dropped, never crash the run).
- **Resilience:** one source failing (esp. flaky X mirrors) must NOT break the run — isolate per-source, record the failure, continue.
- **Validation = zod** from `@khazana/core`; never redefine `FeedItem`/`SourceEntry` shapes locally.
- **At ingest:** `topics` is seeded from the source's `channels`; `summary`/`entities` stay empty (LLM fills them in P3). `fetchedAt` = the run's `now`. `id` = `makeFeedItemId(sourceType, url)`.
- **kind mapping:** `arxiv → paper`, `reddit → discussion`, everything else → `link`.
- Package manager **pnpm**; ESM (`.js` extensions on relative imports); `import type` / inline `type` for type-only imports (verbatimModuleSyntax is on).

---

### Task 1: `@khazana/ingest` package shell + registry I/O

**Files:**
- Create: `packages/ingest/package.json`, `packages/ingest/tsconfig.json`, `packages/ingest/src/index.ts`
- Create: `packages/ingest/src/registry-io.ts`, `packages/ingest/src/registry-io.test.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`parseRegistry`, `RegistrySchema`, `Registry`, `FeedItem`).
- Produces:
  - `loadRegistry(dataDir: string): Registry` — reads `<dataDir>/sources.json`, falling back to `<dataDir>/sources.seed.json`.
  - `saveRegistry(dataDir: string, registry: Registry): void` — writes `<dataDir>/sources.json`.
  - `writeFeed(dataDir: string, items: FeedItem[]): string` — writes `<dataDir>/feed/raw.json`, returns the path.

- [ ] **Step 1: Create the package shell**

`packages/ingest/package.json`:
```json
{
  "name": "@khazana/ingest",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "ingest": "tsx src/cli.ts"
  },
  "dependencies": {
    "@khazana/core": "workspace:*",
    "rss-parser": "^3.13.0"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "tsx": "^4.19.0"
  }
}
```

`packages/ingest/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src" },
  "include": ["src"]
}
```

`packages/ingest/src/index.ts`:
```ts
export * from "./registry-io.js";
```

- [ ] **Step 2: Install the new dependency**

Run: `pnpm install`
Expected: installs `rss-parser`, links `@khazana/ingest`.

- [ ] **Step 3: Write the failing test**

`packages/ingest/src/registry-io.test.ts`:
```ts
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { loadRegistry, saveRegistry, writeFeed } from "./registry-io.js";

let dir: string;
const seed = {
  version: 1,
  sources: [{ id: "hn", type: "hn", url: "https://hnrss.org/frontpage", channels: ["tech"] }],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-"));
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify(seed));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("loadRegistry falls back to seed and applies defaults", () => {
  const reg = loadRegistry(dir);
  expect(reg.sources[0]!.id).toBe("hn");
  expect(reg.sources[0]!.enabled).toBe(true);
});

test("saveRegistry then loadRegistry prefers sources.json", () => {
  const reg = loadRegistry(dir);
  reg.sources[0]!.failureCount = 3;
  saveRegistry(dir, reg);
  expect(loadRegistry(dir).sources[0]!.failureCount).toBe(3);
});

test("writeFeed writes the items array and returns the path", () => {
  const item = {
    id: "1", source: "hn", sourceType: "hn", url: "https://e.com/a", title: "A",
    publishedAt: "2026-06-20T00:00:00.000Z", fetchedAt: "2026-06-23T00:00:00.000Z",
    topics: [], entities: [], summary: "", media: [], kind: "link",
  } as const;
  const path = writeFeed(dir, [item as never]);
  expect(path).toContain(join("feed", "raw.json"));
  expect(JSON.parse(readFileSync(path, "utf8"))).toHaveLength(1);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingest/src/registry-io.test.ts`
Expected: FAIL — cannot resolve `./registry-io.js`.

- [ ] **Step 5: Write the implementation**

`packages/ingest/src/registry-io.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseRegistry, RegistrySchema, type FeedItem, type Registry } from "@khazana/core";

export function loadRegistry(dataDir: string): Registry {
  const main = join(dataDir, "sources.json");
  const seed = join(dataDir, "sources.seed.json");
  const path = existsSync(main) ? main : seed;
  return parseRegistry(JSON.parse(readFileSync(path, "utf8")));
}

export function saveRegistry(dataDir: string, registry: Registry): void {
  const path = join(dataDir, "sources.json");
  writeFileSync(path, JSON.stringify(RegistrySchema.parse(registry), null, 2) + "\n");
}

export function writeFeed(dataDir: string, items: FeedItem[]): string {
  const path = join(dataDir, "feed", "raw.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(items, null, 2) + "\n");
  return path;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingest/src/registry-io.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ingest): package shell + registry/feed I/O"
```

---

### Task 2: RSS/Atom parser → FeedItem

**Files:**
- Create: `packages/ingest/src/fetchers/rss.ts`, `packages/ingest/src/fetchers/rss.test.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`makeFeedItemId`, `FeedItemSchema`, `FeedItem`, `SourceEntry`).
- Produces: `parseRssFeed(xml: string, entry: SourceEntry, now: string): Promise<FeedItem[]>`.

- [ ] **Step 1: Write the failing test**

`packages/ingest/src/fetchers/rss.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseRssFeed } from "./rss.js";
import type { SourceEntry } from "@khazana/core";

const entry: SourceEntry = {
  id: "netflix-techblog", type: "eng-blog",
  url: "https://netflixtechblog.com/feed", channels: ["tech", "data-science"],
  enabled: true, trustScore: 0.8, addedBy: "seed", failureCount: 0,
};

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Netflix Tech</title>
  <item>
    <title>Scaling the Edge</title>
    <link>https://netflixtechblog.com/scaling-edge</link>
    <pubDate>Sat, 20 Jun 2026 10:00:00 GMT</pubDate>
    <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Jane Eng</dc:creator>
    <description>How we scaled the edge tier.</description>
  </item>
  <item><title>No Link Item</title></item>
</channel></rss>`;

test("parses valid RSS items into FeedItems and seeds topics from channels", async () => {
  const items = await parseRssFeed(RSS, entry, "2026-06-23T00:00:00.000Z");
  expect(items).toHaveLength(1); // the no-link item is dropped
  const it = items[0]!;
  expect(it.title).toBe("Scaling the Edge");
  expect(it.url).toBe("https://netflixtechblog.com/scaling-edge");
  expect(it.sourceType).toBe("eng-blog");
  expect(it.topics).toEqual(["tech", "data-science"]);
  expect(it.author).toBe("Jane Eng");
  expect(it.publishedAt).toBe("2026-06-20T10:00:00.000Z");
  expect(it.fetchedAt).toBe("2026-06-23T00:00:00.000Z");
  expect(it.kind).toBe("link");
  expect(it.summary).toBe("");
});

test("arxiv entries are mapped to kind=paper", async () => {
  const arxiv: SourceEntry = { ...entry, id: "arxiv-cs-ai", type: "arxiv", channels: ["ai"] };
  const items = await parseRssFeed(RSS, arxiv, "2026-06-23T00:00:00.000Z");
  expect(items[0]!.kind).toBe("paper");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingest/src/fetchers/rss.test.ts`
Expected: FAIL — cannot resolve `./rss.js`.

- [ ] **Step 3: Write the implementation**

`packages/ingest/src/fetchers/rss.ts`:
```ts
import Parser from "rss-parser";
import { FeedItemSchema, makeFeedItemId, type FeedItem, type SourceEntry } from "@khazana/core";

const parser = new Parser();

function toIso(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const t = Date.parse(value);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

export async function parseRssFeed(xml: string, entry: SourceEntry, now: string): Promise<FeedItem[]> {
  const feed = await parser.parseString(xml);
  const kind = entry.type === "arxiv" ? "paper" : "link";
  const out: FeedItem[] = [];
  for (const it of feed.items ?? []) {
    const url = it.link?.trim();
    if (!url || !it.title) continue;
    const parsed = FeedItemSchema.safeParse({
      id: makeFeedItemId(entry.type, url),
      source: entry.id,
      sourceType: entry.type,
      url,
      title: it.title.trim(),
      author: it.creator ?? (it as { author?: string }).author,
      publishedAt: toIso(it.isoDate ?? it.pubDate, now),
      fetchedAt: now,
      topics: entry.channels,
      entities: [],
      summary: "",
      body: it.contentSnippet ?? it.content,
      media: [],
      trustScore: entry.trustScore,
      kind,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingest/src/fetchers/rss.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingest): RSS/Atom parser → FeedItem"
```

---

### Task 3: Reddit JSON listing parser → FeedItem

**Files:**
- Create: `packages/ingest/src/fetchers/reddit.ts`, `packages/ingest/src/fetchers/reddit.test.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`makeFeedItemId`, `FeedItemSchema`, `FeedItem`, `SourceEntry`).
- Produces: `parseRedditListing(json: unknown, entry: SourceEntry, now: string): FeedItem[]`.

- [ ] **Step 1: Write the failing test**

`packages/ingest/src/fetchers/reddit.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseRedditListing } from "./reddit.js";
import type { SourceEntry } from "@khazana/core";

const entry: SourceEntry = {
  id: "r-dataisbeautiful", type: "reddit",
  url: "https://www.reddit.com/r/dataisbeautiful/top/.json?t=day", channels: ["data-science"],
  enabled: true, trustScore: 0.5, addedBy: "seed", failureCount: 0,
};

const LISTING = {
  data: {
    children: [
      { data: {
          title: "[OC] World GDP over time", permalink: "/r/dataisbeautiful/comments/abc/oc/",
          url: "https://i.redd.it/x.png", author: "viz_guy", created_utc: 1750000000,
          num_comments: 42, score: 1200, selftext: "", thumbnail: "https://b.thumbs.redditmedia.com/t.jpg",
      } },
      { data: { title: "no permalink" } },
    ],
  },
};

test("parses reddit children into discussion FeedItems with canonical permalink url", () => {
  const items = parseRedditListing(LISTING, entry, "2026-06-23T00:00:00.000Z");
  expect(items).toHaveLength(1);
  const it = items[0]!;
  expect(it.kind).toBe("discussion");
  expect(it.url).toBe("https://www.reddit.com/r/dataisbeautiful/comments/abc/oc/");
  expect(it.author).toBe("viz_guy");
  expect(it.metrics).toEqual({ score: 1200, comments: 42 });
  expect(it.media[0]).toEqual({ type: "image", url: "https://b.thumbs.redditmedia.com/t.jpg" });
  expect(it.topics).toEqual(["data-science"]);
});

test("drops children without title or permalink", () => {
  expect(parseRedditListing({ data: { children: [{ data: {} }] } }, entry, "2026-06-23T00:00:00.000Z")).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingest/src/fetchers/reddit.test.ts`
Expected: FAIL — cannot resolve `./reddit.js`.

- [ ] **Step 3: Write the implementation**

`packages/ingest/src/fetchers/reddit.ts`:
```ts
import { FeedItemSchema, makeFeedItemId, type FeedItem, type MediaRef, type SourceEntry } from "@khazana/core";

interface RedditChild {
  data?: {
    title?: string; permalink?: string; author?: string;
    created_utc?: number; num_comments?: number; score?: number;
    selftext?: string; thumbnail?: string;
  };
}
interface RedditListing { data?: { children?: RedditChild[] } }

export function parseRedditListing(json: unknown, entry: SourceEntry, now: string): FeedItem[] {
  const children = (json as RedditListing).data?.children ?? [];
  const out: FeedItem[] = [];
  for (const c of children) {
    const d = c.data;
    if (!d?.title || !d.permalink) continue;
    const url = `https://www.reddit.com${d.permalink}`;
    const media: MediaRef[] =
      d.thumbnail && /^https?:\/\//.test(d.thumbnail) ? [{ type: "image", url: d.thumbnail }] : [];
    const parsed = FeedItemSchema.safeParse({
      id: makeFeedItemId(entry.type, url),
      source: entry.id,
      sourceType: entry.type,
      url,
      title: d.title.trim(),
      author: d.author,
      publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : now,
      fetchedAt: now,
      topics: entry.channels,
      entities: [],
      summary: "",
      body: d.selftext || undefined,
      media,
      metrics: { score: d.score, comments: d.num_comments },
      trustScore: entry.trustScore,
      kind: "discussion",
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingest/src/fetchers/reddit.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingest): Reddit JSON listing parser → FeedItem"
```

---

### Task 4: `buildSource` dispatcher + injectable fetch

**Files:**
- Create: `packages/ingest/src/fetchers/build-source.ts`, `packages/ingest/src/fetchers/build-source.test.ts`
- Modify: `packages/ingest/src/index.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`Source`, `SourceEntry`, `FetchContext`, `FeedItem`), `parseRssFeed`, `parseRedditListing`.
- Produces:
  - `FetchResult` interface — `{ ok, status, text(), json() }`.
  - `FetchFn` type — `(url, init?) => Promise<FetchResult>`.
  - `defaultFetch: FetchFn` — wraps global `fetch`.
  - `buildSource(entry: SourceEntry, fetchFn?: FetchFn): Source` — Source whose `fetch(ctx)` fetches + parses, respecting `ctx.limit`, throwing on non-OK HTTP.

- [ ] **Step 1: Write the failing test**

`packages/ingest/src/fetchers/build-source.test.ts`:
```ts
import { expect, test } from "vitest";
import { buildSource, type FetchFn, type FetchResult } from "./build-source.js";
import type { SourceEntry } from "@khazana/core";

const ok = (body: { text?: string; json?: unknown }): FetchResult => ({
  ok: true, status: 200,
  text: async () => body.text ?? "",
  json: async () => body.json ?? {},
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>One</title><link>https://e.com/1</link></item>
  <item><title>Two</title><link>https://e.com/2</link></item>
</channel></rss>`;

const rssEntry: SourceEntry = {
  id: "blog", type: "rss", url: "https://e.com/feed", channels: ["tech"],
  enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0,
};

test("buildSource fetches, parses RSS, and respects ctx.limit", async () => {
  const fetchFn: FetchFn = async () => ok({ text: RSS });
  const items = await buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z", limit: 1 });
  expect(items).toHaveLength(1);
  expect(items[0]!.title).toBe("One");
});

test("buildSource sends a User-Agent for reddit and parses JSON", async () => {
  let sentUA: string | undefined;
  const fetchFn: FetchFn = async (_url, init) => {
    sentUA = init?.headers?.["User-Agent"];
    return ok({ json: { data: { children: [{ data: { title: "T", permalink: "/r/x/c/" } }] } } });
  };
  const reddit: SourceEntry = { ...rssEntry, id: "r-x", type: "reddit", url: "https://www.reddit.com/r/x/.json" };
  const items = await buildSource(reddit, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" });
  expect(sentUA).toContain("khazana");
  expect(items[0]!.kind).toBe("discussion");
});

test("buildSource throws on non-OK HTTP", async () => {
  const fetchFn: FetchFn = async () => ({ ok: false, status: 503, text: async () => "", json: async () => ({}) });
  await expect(buildSource(rssEntry, fetchFn).fetch({ now: "2026-06-23T00:00:00.000Z" })).rejects.toThrow("503");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingest/src/fetchers/build-source.test.ts`
Expected: FAIL — cannot resolve `./build-source.js`.

- [ ] **Step 3: Write the implementation**

`packages/ingest/src/fetchers/build-source.ts`:
```ts
import type { FeedItem, FetchContext, Source, SourceEntry } from "@khazana/core";
import { parseRedditListing } from "./reddit.js";
import { parseRssFeed } from "./rss.js";

export interface FetchResult {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchResult>;

export const defaultFetch: FetchFn = async (url, init) => {
  const res = await fetch(url, { headers: init?.headers });
  return { ok: res.ok, status: res.status, text: () => res.text(), json: () => res.json() };
};

const USER_AGENT = "khazana/0.1 (+https://github.com/khazana)";

export function buildSource(entry: SourceEntry, fetchFn: FetchFn = defaultFetch): Source {
  return {
    id: entry.id,
    type: entry.type,
    channels: entry.channels,
    async fetch(ctx: FetchContext): Promise<FeedItem[]> {
      const headers = entry.type === "reddit" ? { "User-Agent": USER_AGENT } : {};
      const res = await fetchFn(entry.url, { headers });
      if (!res.ok) throw new Error(`${entry.id}: HTTP ${res.status}`);
      const items =
        entry.type === "reddit"
          ? parseRedditListing(await res.json(), entry, ctx.now)
          : await parseRssFeed(await res.text(), entry, ctx.now);
      return ctx.limit ? items.slice(0, ctx.limit) : items;
    },
  };
}
```

Append to `packages/ingest/src/index.ts`:
```ts
export * from "./fetchers/build-source.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingest/src/fetchers/build-source.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingest): buildSource dispatcher with injectable fetch"
```

---

### Task 5: `runIngest` orchestration (error isolation + dedupe)

**Files:**
- Create: `packages/ingest/src/ingest.ts`, `packages/ingest/src/ingest.test.ts`
- Modify: `packages/ingest/src/index.ts`

**Interfaces:**
- Consumes: `@khazana/core` (`Registry`, `FeedItem`), `buildSource`, `defaultFetch`, `FetchFn`.
- Produces:
  - `SourceResult` — `{ id: string; ok: boolean; count: number; error?: string }`.
  - `IngestResult` — `{ items: FeedItem[]; results: SourceResult[] }`.
  - `runIngest(registry, opts): Promise<IngestResult>` where `opts = { now: string; fetchFn?: FetchFn; limitPerSource?: number }`. Skips disabled sources; isolates per-source errors; dedupes items by `id`.

- [ ] **Step 1: Write the failing test**

`packages/ingest/src/ingest.test.ts`:
```ts
import { expect, test } from "vitest";
import { runIngest } from "./ingest.js";
import type { FetchFn } from "./fetchers/build-source.js";
import type { Registry } from "@khazana/core";

const RSS = (n: string, link: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><item><title>${n}</title><link>${link}</link></item></channel></rss>`;

const registry: Registry = {
  version: 1,
  sources: [
    { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    { id: "flaky", type: "rss", url: "https://b.com/feed", channels: ["ai"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    { id: "off", type: "rss", url: "https://c.com/feed", channels: ["finance"], enabled: false, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
  ],
};

test("one source failing does not break the run; results are recorded", async () => {
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("b.com")) throw new Error("network down");
    return { ok: true, status: 200, text: async () => RSS("Hello", "https://a.com/1"), json: async () => ({}) };
  };
  const { items, results } = await runIngest(registry, { now: "2026-06-23T00:00:00.000Z", fetchFn });
  expect(items).toHaveLength(1);
  expect(results.find((r) => r.id === "good")!.ok).toBe(true);
  expect(results.find((r) => r.id === "flaky")!.ok).toBe(false);
  expect(results.find((r) => r.id === "off")).toBeUndefined(); // disabled is skipped
});

test("items duplicated across sources are deduped by id", async () => {
  const dup: Registry = {
    version: 1,
    sources: [
      { id: "s1", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
      { id: "s2", type: "rss", url: "https://a.com/feed", channels: ["tech"], enabled: true, trustScore: 0.6, addedBy: "seed", failureCount: 0 },
    ],
  };
  const fetchFn: FetchFn = async () => ({ ok: true, status: 200, text: async () => RSS("Same", "https://same.com/1"), json: async () => ({}) });
  const { items } = await runIngest(dup, { now: "2026-06-23T00:00:00.000Z", fetchFn });
  expect(items).toHaveLength(1); // same sourceType+url → same id → deduped
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingest/src/ingest.test.ts`
Expected: FAIL — cannot resolve `./ingest.js`.

- [ ] **Step 3: Write the implementation**

`packages/ingest/src/ingest.ts`:
```ts
import type { FeedItem, Registry } from "@khazana/core";
import { buildSource, defaultFetch, type FetchFn } from "./fetchers/build-source.js";

export interface SourceResult {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
}
export interface IngestResult {
  items: FeedItem[];
  results: SourceResult[];
}

export async function runIngest(
  registry: Registry,
  opts: { now: string; fetchFn?: FetchFn; limitPerSource?: number },
): Promise<IngestResult> {
  const fetchFn = opts.fetchFn ?? defaultFetch;
  const results: SourceResult[] = [];
  const all: FeedItem[] = [];
  for (const entry of registry.sources) {
    if (!entry.enabled) continue;
    try {
      const items = await buildSource(entry, fetchFn).fetch({ now: opts.now, limit: opts.limitPerSource });
      all.push(...items);
      results.push({ id: entry.id, ok: true, count: items.length });
    } catch (err) {
      results.push({ id: entry.id, ok: false, count: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const seen = new Set<string>();
  const items = all.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  return { items, results };
}
```

Append to `packages/ingest/src/index.ts`:
```ts
export * from "./ingest.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingest/src/ingest.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingest): runIngest orchestration with error isolation + dedupe"
```

---

### Task 6: `khazana ingest` CLI (registry health + feed write)

**Files:**
- Create: `packages/ingest/src/cli.ts`, `packages/ingest/src/cli.test.ts`

**Interfaces:**
- Consumes: `loadRegistry`, `saveRegistry`, `writeFeed`, `runIngest`, `FetchFn`.
- Produces: `main(dataDir: string, now: string, fetchFn?: FetchFn): Promise<void>` — loads registry, runs ingest, updates each source's `lastFetchedAt` (on ok) / `failureCount` (increment on failure), saves registry, writes feed, logs a summary. When run directly (`tsx src/cli.ts`), uses repo `data/` and `now = new Date().toISOString()`.

- [ ] **Step 1: Write the failing test**

`packages/ingest/src/cli.test.ts`:
```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { main } from "./cli.js";
import type { FetchFn } from "./fetchers/build-source.js";

let dir: string;
const seed = {
  version: 1,
  sources: [
    { id: "good", type: "rss", url: "https://a.com/feed", channels: ["tech"] },
    { id: "bad", type: "rss", url: "https://b.com/feed", channels: ["ai"] },
  ],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-cli-"));
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify(seed));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("main writes feed and updates source health", async () => {
  const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Hi</title><link>https://a.com/1</link></item></channel></rss>`;
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("b.com")) throw new Error("down");
    return { ok: true, status: 200, text: async () => RSS, json: async () => ({}) };
  };
  await main(dir, "2026-06-23T00:00:00.000Z", fetchFn);

  const feed = JSON.parse(readFileSync(join(dir, "feed", "raw.json"), "utf8"));
  expect(feed).toHaveLength(1);

  const reg = JSON.parse(readFileSync(join(dir, "sources.json"), "utf8"));
  const good = reg.sources.find((s: { id: string }) => s.id === "good");
  const bad = reg.sources.find((s: { id: string }) => s.id === "bad");
  expect(good.lastFetchedAt).toBe("2026-06-23T00:00:00.000Z");
  expect(good.failureCount).toBe(0);
  expect(bad.failureCount).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ingest/src/cli.test.ts`
Expected: FAIL — cannot resolve `./cli.js`.

- [ ] **Step 3: Write the implementation**

`packages/ingest/src/cli.ts`:
```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, saveRegistry, writeFeed } from "./registry-io.js";
import { runIngest } from "./ingest.js";
import type { FetchFn } from "./fetchers/build-source.js";

export async function main(dataDir: string, now: string, fetchFn?: FetchFn): Promise<void> {
  const registry = loadRegistry(dataDir);
  const { items, results } = await runIngest(registry, { now, fetchFn });
  const byId = new Map(results.map((r) => [r.id, r]));
  for (const s of registry.sources) {
    const r = byId.get(s.id);
    if (!r) continue;
    if (r.ok) {
      s.lastFetchedAt = now;
      s.failureCount = 0;
    } else {
      s.failureCount += 1;
    }
  }
  saveRegistry(dataDir, registry);
  const path = writeFeed(dataDir, items);
  const okCount = results.filter((r) => r.ok).length;
  console.log(`[ingest] ${items.length} items from ${okCount}/${results.length} sources → ${path}`);
  for (const r of results.filter((r) => !r.ok)) {
    console.warn(`[ingest] FAILED ${r.id}: ${r.error}`);
  }
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ingest/src/cli.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Typecheck, full test run, then commit**

Run: `pnpm --filter @khazana/ingest typecheck && pnpm test`
Expected: typecheck clean; all tests (core + ingest) PASS.

```bash
git add -A
git commit -m "feat(ingest): khazana ingest CLI with per-source health tracking"
```

- [ ] **Step 6: Live smoke test (network — optional, allowed to be flaky)**

Run: `cd packages/ingest && pnpm ingest`
Expected: prints `[ingest] N items from K/12 sources → .../data/feed/raw.json`. Some sources may fail (that's the resilience working). Do NOT commit `data/sources.json` or `data/feed/raw.json` changes from this smoke run — revert them: `git checkout data/ 2>/dev/null || true`. (These are generated at runtime by CI later.)

---

## Self-Review

**Spec coverage (P2 scope):** all-source ingestion ✓ (RSS covers rss/eng-blog/arxiv/news/hn/x via their feeds — T2; Reddit JSON — T3); one normalized format `FeedItem` ✓ (every parser emits validated FeedItems); resilience/error isolation ✓ (T5 `runIngest`, T6 health tracking); registry-driven ✓ (T1 load/save, falls back to seed); dedupe ✓ (T5). X mirror ingestion uses the RSS path (nitter/rss-bridge emit RSS) — no separate code needed; registry just needs `type: "x"` entries with mirror URLs (added in P7 Scout / manually). Enrichment (topics/summary/entities by LLM), clustering, and ranking are **P3 scope** — intentionally excluded.

**Placeholder scan:** none — every step has complete code and exact commands. The live smoke test (T6 S6) is explicitly optional and network-dependent by design.

**Type consistency:** `FetchFn`/`FetchResult` defined once (T4), reused in T5/T6 tests and impl. `runIngest(registry, {now, fetchFn?, limitPerSource?})` signature consistent across T5 impl and T6 caller. `parseRssFeed`/`parseRedditListing` signatures match their callers in `buildSource`. `SourceEntry` literals in tests include all required fields (enabled/trustScore/addedBy/failureCount) matching the `@khazana/core` `SourceEntrySchema` output type.
