import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parseAppraisals,
  parseCandidateSources,
  parseRegistry,
  RegistrySchema,
  type Appraisal,
  type CandidateSource,
  type EngagementEvent,
  type FeedItem,
  type Registry,
  type SourceType,
} from "@khazana/core";

export interface Candidate {
  url: string;
  title: string;
  channels: string[];
  type?: SourceType;
  claimedTrust?: number;
  rationale?: string;
  /** A feed URL already known to the generator/appraiser; skips re-autodiscovery. */
  feedUrl?: string;
}

export interface PendingEntry {
  candidate: Candidate;
  feedUrl: string | null;
  trust: number;
  reason: string;
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  return path;
}

export function loadRegistry(dataDir: string): Registry {
  const main = join(dataDir, "sources.json");
  const seed = join(dataDir, "sources.seed.json");
  const path = existsSync(main) ? main : seed;
  return parseRegistry(JSON.parse(readFileSync(path, "utf8")));
}

export function loadCurated(dataDir: string): FeedItem[] {
  return readJson<FeedItem[]>(join(dataDir, "feed", "curated.json"), []);
}

export function loadEvents(dataDir: string): EngagementEvent[] {
  return readJson<EngagementEvent[]>(join(dataDir, "events.json"), []);
}

export function loadCandidates(dataDir: string): Candidate[] {
  return readJson<Candidate[]>(join(dataDir, "scout", "candidates.json"), []);
}

/** Raw generated candidates awaiting appraisal (the pending queue). */
export function loadPendingCandidates(dataDir: string): CandidateSource[] {
  const path = join(dataDir, "sources.pending.json");
  if (!existsSync(path)) return [];
  return parseCandidateSources(JSON.parse(readFileSync(path, "utf8")));
}

export function writePendingCandidates(dataDir: string, candidates: CandidateSource[]): string {
  return writeJson(join(dataDir, "sources.pending.json"), candidates);
}

/** The cloud appraiser's verdicts (Sonnet, written in CI). Absent ⇒ []. */
export function loadAppraisals(dataDir: string): Appraisal[] {
  const path = join(dataDir, "scout", "appraisal.json");
  if (!existsSync(path)) return [];
  return parseAppraisals(JSON.parse(readFileSync(path, "utf8")));
}

export function loadCuratedRaw(dataDir: string): FeedItem[] {
  return readJson<FeedItem[]>(join(dataDir, "feed", "raw.json"), []);
}

export function writeCandidateBrief(dataDir: string, markdown: string): string {
  const path = join(dataDir, "scout", "candidate-brief.md");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown);
  return path;
}

export function saveRegistry(dataDir: string, registry: Registry): void {
  const path = join(dataDir, "sources.json");
  writeFileSync(path, JSON.stringify(RegistrySchema.parse(registry), null, 2) + "\n");
}

export function writeBrief(dataDir: string, markdown: string): string {
  const path = join(dataDir, "scout", "brief.md");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown);
  return path;
}

/**
 * Post-appraisal borderline queue ("queue for one-tap review"). Distinct from
 * the pre-appraisal generation queue (`sources.pending.json`, written by
 * `writePendingCandidates`): these entries already carry an appraised trust and
 * a discovered feed, they just landed below the auto-add threshold.
 */
export function writePending(dataDir: string, pending: PendingEntry[]): string {
  return writeJson(join(dataDir, "scout", "review.json"), pending);
}

export function writeReport(dataDir: string, report: unknown): string {
  return writeJson(join(dataDir, "scout", "report.json"), report);
}
