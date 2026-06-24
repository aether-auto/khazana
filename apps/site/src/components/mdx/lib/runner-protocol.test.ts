// apps/site/src/components/mdx/lib/runner-protocol.test.ts
import { expect, test } from "vitest";
import {
  formatValue,
  formatLogArgs,
  makeRunRequest,
  parseWorkerMessage,
  type WorkerResponse,
} from "./runner-protocol.js";

test("formatValue renders primitives readably", () => {
  expect(formatValue("hi")).toBe('"hi"');
  expect(formatValue(42)).toBe("42");
  expect(formatValue(true)).toBe("true");
  expect(formatValue(null)).toBe("null");
  expect(formatValue(undefined)).toBe("undefined");
});

test("formatValue renders arrays and plain objects as compact JSON", () => {
  expect(formatValue([1, 2, 3])).toBe("[1,2,3]");
  expect(formatValue({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
});

test("formatValue handles functions and circular refs without throwing", () => {
  expect(formatValue(() => 1)).toMatch(/function|=>|ƒ/i);
  const circ: Record<string, unknown> = {};
  circ.self = circ;
  expect(() => formatValue(circ)).not.toThrow();
  expect(formatValue(circ)).toMatch(/circular|\[object/i);
});

test("formatLogArgs space-joins multiple console.log args", () => {
  expect(formatLogArgs(["x =", 42, [1, 2]])).toBe('x = 42 [1,2]');
});

test("makeRunRequest tags a run message with code + id", () => {
  const req = makeRunRequest("1+1", "abc");
  expect(req).toEqual({ kind: "run", id: "abc", code: "1+1" });
});

test("parseWorkerMessage validates well-formed responses", () => {
  const ok: WorkerResponse = { kind: "result", id: "abc", logs: ["2"], value: "2", error: null, ms: 3 };
  expect(parseWorkerMessage(ok)).toEqual(ok);
});

test("parseWorkerMessage rejects junk", () => {
  expect(() => parseWorkerMessage({ kind: "nope" })).toThrow(/message/i);
  expect(() => parseWorkerMessage(null)).toThrow(/message/i);
});
