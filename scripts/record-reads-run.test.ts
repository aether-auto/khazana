import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { appendRunRecord, buildRunRecord, parseArgs, serializeRunRecord } from "./record-reads-run.mts";

let root: string;
let ledgerPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "khz-reads-run-log-"));
  ledgerPath = join(root, "reads-run-log.jsonl");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("buildRunRecord", () => {
  test("normalizes numeric fields and stamps ts from the given clock", () => {
    const record = buildRunRecord(
      { candidates: 6, picked: 2, published: 1 },
      new Date("2026-07-07T06:00:00.000Z"),
    );
    expect(record.ts).toBe("2026-07-07T06:00:00.000Z");
    expect(record.candidates).toBe(6);
    expect(record.picked).toBe(2);
    expect(record.published).toBe(1);
    expect(record.dropped).toEqual([]);
    expect(record.notes).toBeUndefined();
  });

  test("keeps well-formed dropped entries, drops malformed ones", () => {
    const record = buildRunRecord({
      candidates: 3,
      picked: 2,
      published: 1,
      dropped: [
        { slug: "foo", reason: "verify failed twice" },
        { slug: "bar" }, // missing reason
        "not-an-object",
      ] as unknown as never,
    });
    expect(record.dropped).toEqual([{ slug: "foo", reason: "verify failed twice" }]);
  });

  test("includes trimmed notes only when present and non-blank", () => {
    expect(
      buildRunRecord({ candidates: 1, picked: 0, published: 0, notes: "  empty slate  " }).notes,
    ).toBe("empty slate");
    expect(
      buildRunRecord({ candidates: 1, picked: 0, published: 0, notes: "   " }).notes,
    ).toBeUndefined();
  });

  test("throws a clear error when candidates/picked/published are not numbers", () => {
    expect(() => buildRunRecord({ candidates: Number.NaN, picked: 0, published: 0 })).toThrow();
    expect(() => buildRunRecord({} as never)).toThrow();
  });
});

describe("appendRunRecord / serializeRunRecord", () => {
  test("creates the ledger file on first append", () => {
    const record = buildRunRecord({ candidates: 4, picked: 1, published: 1 });
    appendRunRecord(ledgerPath, record);
    const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ candidates: 4, picked: 1, published: 1 });
  });

  test("a second call APPENDS a second line rather than overwriting the first", () => {
    appendRunRecord(ledgerPath, buildRunRecord({ candidates: 4, picked: 1, published: 1 }));
    appendRunRecord(
      ledgerPath,
      buildRunRecord({ candidates: 5, picked: 0, published: 0, notes: "empty slate" }),
    );
    const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).candidates).toBe(4);
    expect(JSON.parse(lines[1]!).candidates).toBe(5);
    expect(JSON.parse(lines[1]!).notes).toBe("empty slate");
  });

  test("serializeRunRecord ends with exactly one trailing newline", () => {
    const line = serializeRunRecord(buildRunRecord({ candidates: 1, picked: 1, published: 1 }));
    expect(line.endsWith("\n")).toBe(true);
    expect(line.match(/\n/g)).toHaveLength(1);
  });
});

describe("parseArgs", () => {
  test("parses --json as the full record", () => {
    const input = parseArgs(["--json", '{"candidates":6,"picked":2,"published":1}']);
    expect(input).toEqual({ candidates: 6, picked: 2, published: 1 });
  });

  test("parses individual flags, including a JSON --dropped array", () => {
    const input = parseArgs([
      "--candidates",
      "6",
      "--picked",
      "2",
      "--published",
      "1",
      "--dropped",
      '[{"slug":"foo","reason":"verify failed"}]',
      "--notes",
      "chronicle reserved",
    ]);
    expect(input).toEqual({
      candidates: 6,
      picked: 2,
      published: 1,
      dropped: [{ slug: "foo", reason: "verify failed" }],
      notes: "chronicle reserved",
    });
  });

  test("throws a clear error on invalid --json", () => {
    expect(() => parseArgs(["--json", "{not valid"])).toThrow();
  });
});
