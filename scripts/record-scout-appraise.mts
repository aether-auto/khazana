// scripts/record-scout-appraise.mts
//
// Per-run telemetry ledger for the Scout appraisal routine
// (.claude/commands/scout-appraise.md). The routine fires unattended twice a week;
// without a record of what each run actually did, "zero approved" is indistinguishable
// from "the routine never fired at all." This script appends ONE JSONL line per run to
// a COMMITTED ledger so that ambiguity goes away, mirroring record-reads-run.mts.
//
// Ledger: data/scout-appraise-log.jsonl (committed).
//
// Usage (from repo root), either shape works:
//   pnpm exec tsx scripts/record-scout-appraise.mts \
//     --json '{"candidates":12,"approved":3,"queued":4,"rejected":5,"notes":"two dead domains"}'
//
//   pnpm exec tsx scripts/record-scout-appraise.mts \
//     --candidates 12 --approved 3 --queued 4 --rejected 5 --notes "two dead domains"
//
// Fields recorded:
//   ts          ISO timestamp, stamped at append time (not settable by the caller)
//   candidates  number — size of the candidate-brief.md judged this run
//   approved    number — verdicts with decision=="approve"
//   queued      number — verdicts with decision=="queue"
//   rejected    number — verdicts with decision=="reject"
//   notes       optional free-text, e.g. "empty brief: nothing to judge"
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const DEFAULT_LEDGER_PATH = join(repoRoot, "data", "scout-appraise-log.jsonl");

export interface RunRecordInput {
  candidates: number;
  approved: number;
  queued: number;
  rejected: number;
  notes?: string;
}

export interface RunRecord {
  ts: string;
  candidates: number;
  approved: number;
  queued: number;
  rejected: number;
  notes?: string;
}

/** Build the persisted record: validates + normalizes input, stamps `ts` at call time. */
export function buildRunRecord(input: Partial<RunRecordInput>, now: Date = new Date()): RunRecord {
  const candidates = Number(input.candidates);
  const approved = Number(input.approved);
  const queued = Number(input.queued);
  const rejected = Number(input.rejected);
  if (
    !Number.isFinite(candidates) ||
    !Number.isFinite(approved) ||
    !Number.isFinite(queued) ||
    !Number.isFinite(rejected)
  ) {
    throw new Error(
      `record-scout-appraise: candidates/approved/queued/rejected must be numbers (got ${JSON.stringify(input)})`,
    );
  }
  const record: RunRecord = { ts: now.toISOString(), candidates, approved, queued, rejected };
  if (typeof input.notes === "string" && input.notes.trim()) record.notes = input.notes.trim();
  return record;
}

/** Serialize one record as a single JSONL line (JSON + exactly one trailing newline). */
export function serializeRunRecord(record: RunRecord): string {
  return JSON.stringify(record) + "\n";
}

/**
 * Append one line to the ledger. Creates the file (and parent dir) if missing;
 * NEVER truncates or rewrites existing lines — always additive.
 */
export function appendRunRecord(path: string, record: RunRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, serializeRunRecord(record), "utf8");
}

/** Parse CLI argv into a RunRecordInput. Supports a single `--json '<blob>'` OR individual flags. */
export function parseArgs(argv: string[]): Partial<RunRecordInput> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith("--")) {
        flags.set(key, value);
        i++;
      } else {
        flags.set(key, "true");
      }
    }
  }

  if (flags.has("json")) {
    try {
      return JSON.parse(flags.get("json")!) as Partial<RunRecordInput>;
    } catch (err) {
      throw new Error(`record-scout-appraise: --json is not valid JSON: ${(err as Error).message}`);
    }
  }

  const input: Partial<RunRecordInput> = {};
  if (flags.has("candidates")) input.candidates = Number(flags.get("candidates"));
  if (flags.has("approved")) input.approved = Number(flags.get("approved"));
  if (flags.has("queued")) input.queued = Number(flags.get("queued"));
  if (flags.has("rejected")) input.rejected = Number(flags.get("rejected"));
  if (flags.has("notes")) input.notes = flags.get("notes");
  return input;
}

function main(): void {
  const input = parseArgs(process.argv.slice(2));
  const record = buildRunRecord(input);
  appendRunRecord(DEFAULT_LEDGER_PATH, record);
  console.log(
    `[record-scout-appraise] ${record.ts}: candidates=${record.candidates} approved=${record.approved} ` +
      `queued=${record.queued} rejected=${record.rejected} → ${DEFAULT_LEDGER_PATH}`,
  );
}

// Only run when invoked directly (so tests can import the pure helpers without appending).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
