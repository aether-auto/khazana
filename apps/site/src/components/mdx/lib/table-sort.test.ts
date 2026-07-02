// apps/site/src/components/mdx/lib/table-sort.test.ts
import { expect, test } from "vitest";
import { sortRows, filterRows, sumColumn, type Column, type Row } from "./table-sort.js";

const columns: Column[] = [
  { key: "name", label: "Name", type: "string" },
  { key: "score", label: "Score", type: "number" },
];
const rows: Row[] = [
  { name: "Borges", score: 8 },
  { name: "Calvino", score: 12 },
  { name: "Adler", score: 8 },
];

test("numeric sort ascending then descending", () => {
  expect(sortRows(rows, "score", "asc").map((r) => r.score)).toEqual([8, 8, 12]);
  expect(sortRows(rows, "score", "desc").map((r) => r.score)).toEqual([12, 8, 8]);
});

test("string sort is locale, case-insensitive, stable on ties", () => {
  const asc = sortRows(rows, "name", "asc").map((r) => r.name);
  expect(asc).toEqual(["Adler", "Borges", "Calvino"]);
});

test("sort is stable: equal keys keep original order", () => {
  const asc = sortRows(rows, "score", "asc");
  // both score=8: Borges came before Adler in input
  const eights = asc.filter((r) => r.score === 8).map((r) => r.name);
  expect(eights).toEqual(["Borges", "Adler"]);
});

test("does not mutate the input array", () => {
  const copy = [...rows];
  sortRows(rows, "score", "desc");
  expect(rows).toEqual(copy);
});

test("filter matches any string/number cell, case-insensitive, trimmed", () => {
  expect(filterRows(rows, columns, "  cal ").map((r) => r.name)).toEqual(["Calvino"]);
  expect(filterRows(rows, columns, "8").map((r) => r.name)).toEqual(["Borges", "Adler"]);
});

test("empty query returns all rows unchanged", () => {
  expect(filterRows(rows, columns, "")).toHaveLength(3);
  expect(filterRows(rows, columns, "   ")).toHaveLength(3);
});

test("no match returns empty", () => {
  expect(filterRows(rows, columns, "zzz")).toHaveLength(0);
});

test("sumColumn sums numeric cells for a summable footer", () => {
  expect(sumColumn(rows, "score")).toBe(28); // 8 + 12 + 8
});

test("sumColumn coerces numeric strings and skips non-numeric/empty/null", () => {
  const bom: Row[] = [
    { part: "Pi 5", cost: 80 },
    { part: "NVMe HAT", cost: "18" }, // numeric string counts
    { part: "Freebie", cost: "n/a" }, // non-numeric skipped
    { part: "Missing", cost: null }, // null skipped
    { part: "Blank", cost: "" }, // empty skipped
  ];
  expect(sumColumn(bom, "cost")).toBe(98); // 80 + 18
});

test("sumColumn of an empty set or unknown key is 0", () => {
  expect(sumColumn([], "score")).toBe(0);
  expect(sumColumn(rows, "nope")).toBe(0);
});
