// scripts/record-reads-run.mts
//
// Per-run telemetry ledger for the Reads generation routine
// (.claude/commands/reads-run.md). The routine fires unattended twice a day; without
// a record of what each run actually did, "published zero Reads" is indistinguishable
// from "the routine never fired at all" — a stalled/misconfigured scheduled routine
// looks identical, from the outside, to a correct, disciplined empty-slate run. This
// script appends ONE JSONL line per run to a COMMITTED ledger so that ambiguity goes
// away. The orchestrator calls it as the LAST step of EVERY run — both the
// normal-publish path and the empty-slate exit-clean path — and commits the ledger
// alongside (or instead of) the blog commit so it survives the stateless cloud run.
//
// Ledger: data/reads-run-log.jsonl (committed — deliberately NOT under the
// gitignored data/generation/ tree). One JSON object per line, newest appended last.
//
// Usage (from repo root), either shape works:
//   pnpm exec tsx scripts/record-reads-run.mts \
//     --json '{"candidates":6,"picked":2,"published":1,"dropped":[{"slug":"foo","reason":"verify failed twice"}],"notes":"chronicle reserved"}'
//
//   pnpm exec tsx scripts/record-reads-run.mts \
//     --candidates 6 --picked 2 --published 1 \
//     --dropped '[{"slug":"foo","reason":"verify failed twice"}]' \
//     --notes "chronicle reserved"
//
// Fields recorded:
//   ts          ISO timestamp, stamped at append time (not settable by the caller)
//   candidates  number — size of the surveyed CandidateSlate (Stage 1)
//   picked      number — ideas picked in Stage 2 (curate)
//   published   number — Reads actually committed+pushed this run
//   dropped     array of { slug, reason } — every picked idea that did NOT ship
//               (writer abort, verify FAIL after one repair cycle, build quarantine, ...)
//   notes       optional free-text, e.g. "empty slate: nothing cleared the bar"
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const DEFAULT_LEDGER_PATH = join(repoRoot, "data", "reads-run-log.jsonl");

export interface DroppedEntry {
  slug: string;
  reason: string;
}

export interface RunRecordInput {
  candidates: number;
  picked: number;
  published: number;
  dropped?: DroppedEntry[];
  notes?: string;
}

export interface RunRecord {
  ts: string;
  candidates: number;
  picked: number;
  published: number;
  dropped: DroppedEntry[];
  notes?: string;
}

/** Coerce + validate a raw dropped-entry array; drops anything malformed rather than throwing. */
function toDroppedEntries(raw: unknown): DroppedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DroppedEntry[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { slug?: unknown }).slug === "string" &&
      typeof (entry as { reason?: unknown }).reason === "string"
    ) {
      out.push({ slug: (entry as DroppedEntry).slug, reason: (entry as DroppedEntry).reason });
    }
  }
  return out;
}

/** Build the persisted record: validates + normalizes input, stamps `ts` at call time. */
export function buildRunRecord(input: Partial<RunRecordInput>, now: Date = new Date()): RunRecord {
  const candidates = Number(input.candidates);
  const picked = Number(input.picked);
  const published = Number(input.published);
  if (!Number.isFinite(candidates) || !Number.isFinite(picked) || !Number.isFinite(published)) {
    throw new Error(
      `record-reads-run: candidates/picked/published must be numbers (got ${JSON.stringify(input)})`,
    );
  }
  const record: RunRecord = {
    ts: now.toISOString(),
    candidates,
    picked,
    published,
    dropped: toDroppedEntries(input.dropped),
  };
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
      throw new Error(`record-reads-run: --json is not valid JSON: ${(err as Error).message}`);
    }
  }

  const input: Partial<RunRecordInput> = {};
  if (flags.has("candidates")) input.candidates = Number(flags.get("candidates"));
  if (flags.has("picked")) input.picked = Number(flags.get("picked"));
  if (flags.has("published")) input.published = Number(flags.get("published"));
  if (flags.has("dropped")) {
    try {
      input.dropped = JSON.parse(flags.get("dropped")!) as DroppedEntry[];
    } catch (err) {
      throw new Error(`record-reads-run: --dropped is not valid JSON: ${(err as Error).message}`);
    }
  }
  if (flags.has("notes")) input.notes = flags.get("notes");
  return input;
}

function main(): void {
  const input = parseArgs(process.argv.slice(2));
  const record = buildRunRecord(input);
  appendRunRecord(DEFAULT_LEDGER_PATH, record);
  console.log(
    `[record-reads-run] ${record.ts}: candidates=${record.candidates} picked=${record.picked} ` +
      `published=${record.published} dropped=${record.dropped.length} → ${DEFAULT_LEDGER_PATH}`,
  );
}

// Only run when invoked directly (so tests can import the pure helpers without appending).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
