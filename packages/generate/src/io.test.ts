import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { listDrafts, readCurated, readDraft, readLedger, readStyle, readTaste, writeBrief, writeReport } from "./io.js";

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

test("readLedger returns [] when missing and validates entries when present", () => {
  expect(readLedger(dir)).toEqual([]);
  mkdirSync(join(dir, "generation", "research"), { recursive: true });
  writeFileSync(
    join(dir, "generation", "research", "ledger.json"),
    JSON.stringify([
      { url: "https://academic.oup.com/mnras/1859", title: "MNRAS 1859", tier: "high", origin: "researched" },
      { url: "not-a-url", title: "bad", tier: "high", origin: "curated" },
    ]),
  );
  const ledger = readLedger(dir);
  expect(ledger).toHaveLength(1);
  expect(ledger[0]!.url).toBe("https://academic.oup.com/mnras/1859");
});

test("readLedger unions the shared ledger with per-slug ledger files", () => {
  mkdirSync(join(dir, "generation", "research"), { recursive: true });
  // legacy shared ledger
  writeFileSync(
    join(dir, "generation", "research", "ledger.json"),
    JSON.stringify([
      { url: "https://shared.example/legacy", title: "Legacy", tier: "med", origin: "curated" },
    ]),
  );
  // per-slug ledgers (parallel writers)
  writeFileSync(
    join(dir, "generation", "research", "slug-a.ledger.json"),
    JSON.stringify([
      { url: "https://a.example/one", title: "A One", tier: "high", origin: "researched" },
      { url: "bad-url", title: "dropped", tier: "high", origin: "researched" },
    ]),
  );
  writeFileSync(
    join(dir, "generation", "research", "slug-b.ledger.json"),
    JSON.stringify([
      { url: "https://b.example/two", title: "B Two", tier: "high", origin: "researched" },
    ]),
  );
  const urls = readLedger(dir).map((e) => e.url).sort();
  expect(urls).toEqual([
    "https://a.example/one",
    "https://b.example/two",
    "https://shared.example/legacy",
  ]);
});

test("readLedger returns per-slug entries even when the shared ledger is absent", () => {
  mkdirSync(join(dir, "generation", "research"), { recursive: true });
  writeFileSync(
    join(dir, "generation", "research", "only.ledger.json"),
    JSON.stringify([
      { url: "https://only.example/x", title: "Only", tier: "high", origin: "researched" },
    ]),
  );
  const ledger = readLedger(dir);
  expect(ledger).toHaveLength(1);
  expect(ledger[0]!.url).toBe("https://only.example/x");
});

test("writeReport writes generation/report.json", () => {
  const path = writeReport(dir, { ok: true, drafts: [], generatedAt: "2026-06-23T00:00:00.000Z" } as never);
  expect(path).toContain(join("generation", "report.json"));
  expect(JSON.parse(readFileSync(path, "utf8")).ok).toBe(true);
});
