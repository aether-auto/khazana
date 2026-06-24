import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parseRegistry,
  RegistrySchema,
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

export function writePending(dataDir: string, pending: PendingEntry[]): string {
  return writeJson(join(dataDir, "sources.pending.json"), pending);
}

export function writeReport(dataDir: string, report: unknown): string {
  return writeJson(join(dataDir, "scout", "report.json"), report);
}
