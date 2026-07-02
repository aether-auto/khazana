// apps/site/src/components/mdx/lib/code-walkthrough.test.ts
import { expect, test } from "vitest";
import {
  splitLines,
  countLines,
  normalizeStep,
  normalizeSteps,
  stepIndex,
  lineInStep,
} from "./code-walkthrough.js";

const CODE = `function add(a, b) {
  return a + b;
}
`;

test("splitLines drops the single trailing newline's empty line", () => {
  expect(splitLines(CODE)).toEqual(["function add(a, b) {", "  return a + b;", "}"]);
  expect(countLines(CODE)).toBe(3);
});

test("splitLines handles CRLF and a code block with no trailing newline", () => {
  expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
  expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  expect(splitLines("")).toEqual([""]);
});

test("normalizeStep clamps out-of-range lines into 1..lineCount", () => {
  expect(normalizeStep({ lines: [0, 99], note: "x" }, 3)).toEqual({ start: 1, end: 3, note: "x" });
  expect(normalizeStep({ lines: [2, 2], note: "y" }, 3)).toEqual({ start: 2, end: 2, note: "y" });
});

test("normalizeStep swaps an inverted range instead of throwing", () => {
  expect(normalizeStep({ lines: [3, 1], note: "z" }, 3)).toEqual({ start: 1, end: 3, note: "z" });
});

test("normalizeStep truncates fractional line numbers", () => {
  expect(normalizeStep({ lines: [1.9, 2.9], note: "f" }, 5)).toEqual({ start: 1, end: 2, note: "f" });
});

test("normalizeSteps maps all steps", () => {
  const out = normalizeSteps(
    [
      { lines: [1, 1], note: "a" },
      { lines: [2, 3], note: "b" },
    ],
    3,
  );
  expect(out).toHaveLength(2);
  expect(out[1]).toEqual({ start: 2, end: 3, note: "b" });
});

test("stepIndex clamps with no wraparound", () => {
  expect(stepIndex(0, -1, 4)).toBe(0); // prev at start stays
  expect(stepIndex(3, +1, 4)).toBe(3); // next at end stays
  expect(stepIndex(1, +1, 4)).toBe(2);
  expect(stepIndex(2, -1, 4)).toBe(1);
  expect(stepIndex(0, +1, 0)).toBe(0); // empty guard
});

test("lineInStep is inclusive of both bounds", () => {
  const step = { start: 2, end: 4, note: "" };
  expect(lineInStep(1, step)).toBe(false);
  expect(lineInStep(2, step)).toBe(true);
  expect(lineInStep(4, step)).toBe(true);
  expect(lineInStep(5, step)).toBe(false);
});
