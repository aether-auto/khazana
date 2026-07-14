import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { appendRunRecord, buildRunRecord, parseArgs, serializeRunRecord } from "./record-scout-appraise.mts";

let root: string;
let ledgerPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "khz-scout-appraise-log-"));
  ledgerPath = join(root, "scout-appraise-log.jsonl");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("buildRunRecord", () => {
  test("normalizes numeric fields and stamps ts from the given clock", () => {
    const record = buildRunRecord(
      { candidates: 12, approved: 3, queued: 4, rejected: 5 },
      new Date("2026-07-14T05:10:00.000Z"),
    );
    expect(record.ts).toBe("2026-07-14T05:10:00.000Z");
    expect(record.candidates).toBe(12);
    expect(record.approved).toBe(3);
    expect(record.queued).toBe(4);
    expect(record.rejected).toBe(5);
    expect(record.notes).toBeUndefined();
  });

  test("includes trimmed notes only when present and non-blank", () => {
    expect(
      buildRunRecord({ candidates: 0, approved: 0, queued: 0, rejected: 0, notes: "  empty brief  " })
        .notes,
    ).toBe("empty brief");
    expect(
      buildRunRecord({ candidates: 0, approved: 0, queued: 0, rejected: 0, notes: "   " }).notes,
    ).toBeUndefined();
  });

  test("throws a clear error when counts are not numbers", () => {
    expect(() =>
      buildRunRecord({ candidates: Number.NaN, approved: 0, queued: 0, rejected: 0 }),
    ).toThrow();
    expect(() => buildRunRecord({} as never)).toThrow();
  });
});

describe("appendRunRecord / serializeRunRecord", () => {
  test("creates the ledger file on first append", () => {
    const record = buildRunRecord({ candidates: 12, approved: 3, queued: 4, rejected: 5 });
    appendRunRecord(ledgerPath, record);
    const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ candidates: 12, approved: 3, queued: 4, rejected: 5 });
  });

  test("a second call APPENDS a second line rather than overwriting the first", () => {
    appendRunRecord(ledgerPath, buildRunRecord({ candidates: 12, approved: 3, queued: 4, rejected: 5 }));
    appendRunRecord(
      ledgerPath,
      buildRunRecord({ candidates: 0, approved: 0, queued: 0, rejected: 0, notes: "empty brief" }),
    );
    const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).candidates).toBe(12);
    expect(JSON.parse(lines[1]!).candidates).toBe(0);
    expect(JSON.parse(lines[1]!).notes).toBe("empty brief");
  });

  test("serializeRunRecord ends with exactly one trailing newline", () => {
    const line = serializeRunRecord(buildRunRecord({ candidates: 1, approved: 1, queued: 0, rejected: 0 }));
    expect(line.endsWith("\n")).toBe(true);
    expect(line.match(/\n/g)).toHaveLength(1);
  });
});

describe("parseArgs", () => {
  test("parses --json as the full record", () => {
    const input = parseArgs(["--json", '{"candidates":12,"approved":3,"queued":4,"rejected":5}']);
    expect(input).toEqual({ candidates: 12, approved: 3, queued: 4, rejected: 5 });
  });

  test("parses individual flags", () => {
    const input = parseArgs([
      "--candidates",
      "12",
      "--approved",
      "3",
      "--queued",
      "4",
      "--rejected",
      "5",
      "--notes",
      "two dead domains",
    ]);
    expect(input).toEqual({
      candidates: 12,
      approved: 3,
      queued: 4,
      rejected: 5,
      notes: "two dead domains",
    });
  });

  test("throws a clear error on invalid --json", () => {
    expect(() => parseArgs(["--json", "{not valid"])).toThrow();
  });
});
