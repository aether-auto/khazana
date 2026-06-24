import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  loadCandidates,
  loadCurated,
  loadEvents,
  loadRegistry,
  saveRegistry,
  writeBrief,
  writePending,
  writeReport,
} from "./io.js";

let dir: string;
const seed = {
  version: 1,
  sources: [{ id: "hn", type: "hn", url: "https://hnrss.org/frontpage", channels: ["tech"] }],
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "khz-scout-"));
  writeFileSync(join(dir, "sources.seed.json"), JSON.stringify(seed));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("loadRegistry falls back to seed and applies defaults", () => {
  const reg = loadRegistry(dir);
  expect(reg.sources[0]!.id).toBe("hn");
  expect(reg.sources[0]!.enabled).toBe(true);
  expect(reg.sources[0]!.failureCount).toBe(0);
});

test("loadCurated / loadEvents / loadCandidates return [] when files are absent", () => {
  expect(loadCurated(dir)).toEqual([]);
  expect(loadEvents(dir)).toEqual([]);
  expect(loadCandidates(dir)).toEqual([]);
});

test("loadCandidates reads scout/candidates.json", () => {
  mkdirSync(join(dir, "scout"), { recursive: true });
  writeFileSync(
    join(dir, "scout", "candidates.json"),
    JSON.stringify([{ url: "https://x.com", title: "X", channels: ["ai"], claimedTrust: 0.8 }]),
  );
  const cands = loadCandidates(dir);
  expect(cands).toHaveLength(1);
  expect(cands[0]!.url).toBe("https://x.com");
});

test("saveRegistry validates and round-trips", () => {
  const reg = loadRegistry(dir);
  reg.sources[0]!.failureCount = 4;
  saveRegistry(dir, reg);
  expect(loadRegistry(dir).sources[0]!.failureCount).toBe(4);
});

test("writeBrief / writePending / writeReport create files and return paths", () => {
  const bp = writeBrief(dir, "# brief\n");
  expect(bp).toContain(join("scout", "brief.md"));
  expect(readFileSync(bp, "utf8")).toContain("# brief");

  const pp = writePending(dir, [
    { candidate: { url: "https://q.com", title: "Q", channels: ["ai"] }, feedUrl: null, trust: 0.5, reason: "queue" },
  ]);
  expect(pp).toContain("sources.pending.json");
  expect(JSON.parse(readFileSync(pp, "utf8"))).toHaveLength(1);

  const rp = writeReport(dir, { added: 1 });
  expect(rp).toContain(join("scout", "report.json"));
  expect(JSON.parse(readFileSync(rp, "utf8")).added).toBe(1);
});
