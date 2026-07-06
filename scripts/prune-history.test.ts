import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { gatherEntries, frontmatterPublishedAt } from "./prune-history.mts";
import { selectExpired } from "../packages/core/src/retention.ts";

let root: string;
let blogDir: string;
let ledgerPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "khz-prune-"));
  blogDir = join(root, "blog");
  ledgerPath = join(root, "history.json");
  mkdirSync(blogDir, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Write a Read MDX with the given frontmatter publishedAt (omit → no field). */
function writeRead(slug: string, publishedAt?: string): void {
  const fm = publishedAt === undefined ? "" : `publishedAt: "${publishedAt}"\n`;
  writeFileSync(join(blogDir, `${slug}.mdx`), `---\ntitle: "${slug}"\n${fm}---\n\nBody.\n`);
}

/** Write a build ledger that stamps every given slug on `day` (the stateless-run bug). */
function writeLedger(day: string, slugs: string[]): void {
  writeFileSync(ledgerPath, JSON.stringify({ days: [{ day, slugs, feedItemIds: [] }] }));
}

describe("frontmatterPublishedAt", () => {
  test("extracts a quoted publishedAt from frontmatter", () => {
    expect(frontmatterPublishedAt(`---\npublishedAt: "2026-07-01T09:00:00.000Z"\n---\nx`)).toBe(
      "2026-07-01T09:00:00.000Z",
    );
  });
  test("returns '' when there is no frontmatter / no field", () => {
    expect(frontmatterPublishedAt("no frontmatter here")).toBe("");
    expect(frontmatterPublishedAt(`---\ntitle: x\n---\n`)).toBe("");
  });
});

describe("gatherEntries — frontmatter publishedAt is authoritative", () => {
  test("ages Reads by frontmatter publishedAt, IGNORING a ledger that re-stamps them as 'today'", () => {
    writeRead("published-07-01", "2026-07-01T09:00:00.000Z");
    writeRead("published-07-10", "2026-07-10T09:00:00.000Z");
    // Simulate the stateless-cloud bug: record-build-day stamps BOTH as today.
    writeLedger("2026-07-20", ["published-07-01", "published-07-10"]);

    const { entries } = gatherEntries(blogDir, ledgerPath);
    const byId = new Map(entries.map((e) => [e.id, e.day]));
    // Days come from frontmatter, NOT the "2026-07-20" ledger re-stamp.
    expect(byId.get("published-07-01")).toBe("2026-07-01T09:00:00.000Z");
    expect(byId.get("published-07-10")).toBe("2026-07-10T09:00:00.000Z");

    // The whole point: with today=2026-07-20 & RETENTION_DAYS=14, the 07-01 Read
    // is pruned and the 07-10 Read is kept — sourced from frontmatter.
    expect(selectExpired(entries, "2026-07-20", 14)).toEqual(["published-07-01"]);
  });

  test("falls back to the ledger day ONLY when a Read has no parseable publishedAt", () => {
    writeRead("no-date"); // no publishedAt field
    writeLedger("2026-07-18", ["no-date"]);
    const { entries } = gatherEntries(blogDir, ledgerPath);
    expect(entries.find((e) => e.id === "no-date")!.day).toBe("2026-07-18");
  });

  test("an undated Read with no ledger record is skipped (kept) by selectExpired, never crashes", () => {
    writeRead("orphan"); // no publishedAt, no ledger
    const { entries } = gatherEntries(blogDir, ledgerPath);
    expect(entries.find((e) => e.id === "orphan")!.day).toBe("");
    // malformed day → selectExpired skips it (keeps), even far past the window.
    expect(selectExpired(entries, "2026-12-31", 14)).toEqual([]);
  });

  test("returns an empty entry list (never throws) when the blog dir is missing", () => {
    const { entries } = gatherEntries(join(root, "does-not-exist"), ledgerPath);
    expect(entries).toEqual([]);
  });
});
