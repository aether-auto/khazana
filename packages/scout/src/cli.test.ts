import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { applyMain, discoverMain } from "./cli.js";
import type { FetchFn } from "@khazana/ingest";

let dir: string;
const now = "2026-06-23T00:00:00.000Z";

const seed = {
  version: 1,
  sources: [
    { id: "qm", type: "rss", url: "https://www.quantamagazine.org/feed/", channels: ["science"], trustScore: 0.8 },
    { id: "dead", type: "rss", url: "https://dead.example.com/feed", channels: ["tech"], consecutiveFailures: 4 },
  ],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-scout-cli-"));
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify(seed));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("discoverMain writes a brief naming under-served channels", () => {
  discoverMain(dir, now);
  const brief = readFileSync(join(dir, "scout", "brief.md"), "utf8");
  expect(brief).toContain("# Source Scout — discovery brief");
  expect(brief).toContain("history"); // under-served
  expect(brief).toContain("data/scout/candidates.json");
});

test("discoverMain GENERATES candidates from curated/raw into the pending queue + candidate brief", () => {
  mkdirSync(join(dir, "feed"), { recursive: true });
  writeFileSync(
    join(dir, "feed", "curated.json"),
    JSON.stringify([
      {
        id: "c1", source: "s", sourceType: "rss", url: "https://foreignpolicy.com/x", title: "Deep Read",
        publishedAt: now, fetchedAt: now, topics: [], entities: [], summary: "", media: [], kind: "link",
        tasteScore: 4, body: `<a href="https://simonwillison.net/a">x</a>`,
      },
    ]),
  );
  writeFileSync(
    join(dir, "feed", "raw.json"),
    JSON.stringify([
      { id: "r1", source: "hn", sourceType: "hn", url: "https://simonwillison.net/b", title: "t", publishedAt: now, fetchedAt: now, topics: [], entities: [], summary: "", media: [], kind: "link" },
      { id: "r2", source: "hn", sourceType: "hn", url: "https://simonwillison.net/c", title: "t", publishedAt: now, fetchedAt: now, topics: [], entities: [], summary: "", media: [], kind: "link" },
    ]),
  );

  discoverMain(dir, now);

  const pending = JSON.parse(readFileSync(join(dir, "sources.pending.json"), "utf8"));
  expect(pending.some((c: { url: string }) => new URL(c.url).hostname === "simonwillison.net")).toBe(true);
  const cbrief = readFileSync(join(dir, "scout", "candidate-brief.md"), "utf8");
  expect(cbrief).toContain("simonwillison.net");
  expect(cbrief.toLowerCase()).toContain("credibility");
});

test("applyMain consumes an appraisal over the pending queue → auto-adds + queues", async () => {
  // pending queue (from a prior discover run)
  writeFileSync(
    join(dir, "sources.pending.json"),
    JSON.stringify([
      { url: "https://goodblog.example.com", discoveredVia: "link-mine", evidence: ["cited by A"], seenCount: 3 },
      { url: "https://maybe.example.com", discoveredVia: "domain-frequency", evidence: ["recurs"], seenCount: 2 },
    ]),
  );
  mkdirSync(join(dir, "scout"), { recursive: true });
  writeFileSync(
    join(dir, "scout", "appraisal.json"),
    JSON.stringify([
      { url: "https://goodblog.example.com", channels: ["ai"], trust: 0.9 },   // → add
      { url: "https://maybe.example.com", channels: ["tech"], trust: 0.45 },    // → queue
    ]),
  );
  const fetchFn: FetchFn = async () => ({ ok: true, status: 200, text: async () => HTML_WITH_FEED, json: async () => ({}) });

  await applyMain(dir, now, fetchFn);

  const reg = JSON.parse(readFileSync(join(dir, "sources.json"), "utf8"));
  const added = reg.sources.find((s: { addedBy?: string }) => s.addedBy === "scout");
  expect(added.url).toBe("https://goodblog.example.com/feed.xml");
  expect(added.channels).toEqual(["ai"]);

  const review = JSON.parse(readFileSync(join(dir, "scout", "review.json"), "utf8"));
  expect(review.map((p: { candidate: { url: string } }) => p.candidate.url)).toEqual(["https://maybe.example.com"]);
});

const HTML_WITH_FEED = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>`;

test("applyMain autodiscovers, adds high-trust, queues borderline, disables dead, writes outputs", async () => {
  mkdirSync(join(dir, "scout"), { recursive: true });
  writeFileSync(
    join(dir, "scout", "candidates.json"),
    JSON.stringify([
      { url: "https://goodblog.example.com", title: "Good", channels: ["ai"], claimedTrust: 0.9 },     // → add
      { url: "https://maybe.example.com", title: "Maybe", channels: ["tech"], claimedTrust: 0.45 },     // → queue
      { url: "https://www.quantamagazine.org/", title: "Dup", channels: ["science"], claimedTrust: 0.9 }, // → reject (dup)
    ]),
  );
  const fetchFn: FetchFn = async () => ({ ok: true, status: 200, text: async () => HTML_WITH_FEED, json: async () => ({}) });

  await applyMain(dir, now, fetchFn);

  const reg = JSON.parse(readFileSync(join(dir, "sources.json"), "utf8"));
  // dead source disabled (not deleted), seed sources still present
  expect(reg.sources.find((s: { id: string }) => s.id === "dead").enabled).toBe(false);
  expect(reg.sources.find((s: { id: string }) => s.id === "qm")).toBeTruthy();
  // good blog added by scout
  const added = reg.sources.find((s: { addedBy?: string }) => s.addedBy === "scout");
  expect(added.url).toBe("https://goodblog.example.com/feed.xml");
  expect(added.channels).toEqual(["ai"]);

  const review = JSON.parse(readFileSync(join(dir, "scout", "review.json"), "utf8"));
  expect(review.map((p: { candidate: { url: string } }) => p.candidate.url)).toEqual(["https://maybe.example.com"]);

  const report = JSON.parse(readFileSync(join(dir, "scout", "report.json"), "utf8"));
  expect(report.added).toHaveLength(1);
  expect(report.queued).toEqual(["https://maybe.example.com"]);
  expect(report.rejected).toEqual([{ url: "https://www.quantamagazine.org/", reason: "duplicate" }]);
  expect(report.pruned).toEqual([{ id: "dead", action: "disable", reason: "failures>=3" }]);
});
